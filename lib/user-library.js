'use strict';

const { neonRequest } = require('./neon-data-api.js');
const UserStore = require('./user-store.js');
const PersonalDrugs = require('./user-drugs.js');
const { encryptJson, decryptJson } = require('./user-data-crypto.js');

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_PRESCRIPTIONS = 500;
const MAX_FAVORITES = 9000;
const MAX_ITEM_BYTES = 160 * 1024;
const MAX_NOTE_CHARS = 2000;
const PAGE_LIMIT = 10000;
const ALLOWED_ENTITY_TYPES = Object.freeze(['drug', 'lab', 'icd', 'protocol']);
const NOTE_ENTITY_PREFIX = 'drug-note:';

class HttpError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const clean = (value, max = 400) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();

function securityHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function sameOrigin(req) {
  const origin = clean(req.headers?.origin, 1000);
  if (!origin) return true;
  const host = clean(req.headers?.['x-forwarded-host'] || req.headers?.host, 1000);
  try { return Boolean(host) && new URL(origin).host === host; }
  catch { return false; }
}

function bodySize(req) {
  const declared = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declared) && declared > 0) return declared;
  try { return Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8'); }
  catch { return MAX_BODY_BYTES + 1; }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); }
    catch { throw new HttpError(400, 'Payload-i i bibliotekës nuk është JSON valid.'); }
  }
  return {};
}

function validIso(value, fallback = nowIso()) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function timestamp(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validatePayload(value) {
  if (!plainObject(value)) throw new HttpError(400, 'Receta duhet të jetë objekt i strukturuar.');
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size > MAX_ITEM_BYTES) throw new HttpError(413, 'Një recetë është tepër e madhe për ruajtje.');
  return value;
}

function isDrugNoteEntity(entityType, entityKey, payload) {
  return entityType === 'protocol'
    && String(entityKey || '').startsWith(NOTE_ENTITY_PREFIX)
    && plainObject(payload)
    && payload.kind === 'drug-note';
}

function validateFavoritePayload(entityType, entityKey, value) {
  const payload = plainObject(value) ? value : {};
  if (!isDrugNoteEntity(entityType, entityKey, payload)) return payload;
  const note = String(payload.text ?? '');
  if (note.length > MAX_NOTE_CHARS) throw new HttpError(413, `Shënimi personal lejon maksimum ${MAX_NOTE_CHARS} karaktere.`);
  return note.trim() ? { kind:'drug-note', text:note } : { kind:'drug-note', text:'' };
}

function prescriptionContext(userId, clientId) {
  return `${userId}:prescription:${clientId}`;
}

async function fetchRows(table, select, userId) {
  const { data } = await neonRequest(
    `${table}?select=${encodeURIComponent(select)}&user_id=eq.${encodeURIComponent(userId)}&limit=${PAGE_LIMIT}`
  );
  return Array.isArray(data) ? data : [];
}

async function libraryRows(userId) {
  const [prescriptions, favorites, drugs] = await Promise.all([
    fetchRows('user_prescriptions', 'id,user_id,client_id,payload,client_updated_at,deleted_at,created_at,updated_at', userId),
    fetchRows('user_favorites', 'id,user_id,entity_type,entity_key,payload,client_updated_at,deleted_at,created_at,updated_at', userId),
    fetchRows('user_drugs', 'id,user_id,client_id,name,payload,client_updated_at,deleted_at,created_at,updated_at', userId),
  ]);
  return { prescriptions, favorites, drugs };
}

function mapPrescription(row, userId, errors) {
  if (row.deleted_at) return null;
  try {
    return {
      clientId:clean(row.client_id, 160),
      payload:decryptJson(row.payload, prescriptionContext(userId, row.client_id)),
      clientUpdatedAt:row.client_updated_at || row.updated_at || '',
      serverUpdatedAt:row.updated_at || '',
    };
  } catch {
    errors.push(clean(row.client_id, 160));
    return null;
  }
}

function mapFavorite(row) {
  if (row.deleted_at) return null;
  return {
    entityType:clean(row.entity_type, 40) || 'drug',
    entityKey:clean(row.entity_key, 300),
    payload:plainObject(row.payload) ? row.payload : {},
    clientUpdatedAt:row.client_updated_at || row.updated_at || '',
    serverUpdatedAt:row.updated_at || '',
  };
}

async function getSnapshot(user) {
  const rows = await libraryRows(user.id);
  const decryptionErrors = [];
  const prescriptions = rows.prescriptions.map(row => mapPrescription(row, user.id, decryptionErrors)).filter(Boolean);
  const favorites = rows.favorites.map(mapFavorite).filter(Boolean);
  const drugs = rows.drugs.map(PersonalDrugs.mapDrug).filter(Boolean);
  return {
    ok:true,
    version:1,
    user:{ email:user.email, role:user.role, name:user.name },
    prescriptions,
    favorites,
    drugs,
    tombstones:{
      drugs:rows.drugs.filter(row => row.deleted_at).map(PersonalDrugs.mapDrugTombstone),
      prescriptions:rows.prescriptions.filter(row => row.deleted_at).map(row => ({
        clientId:clean(row.client_id, 160),
        deletedAt:row.deleted_at,
      })),
      favorites:rows.favorites.filter(row => row.deleted_at).map(row => ({
        entityType:clean(row.entity_type, 40) || 'drug',
        entityKey:clean(row.entity_key, 300),
        deletedAt:row.deleted_at,
      })),
    },
    warnings:decryptionErrors.length ? { unreadablePrescriptions:decryptionErrors.length } : {},
    generatedAt:nowIso(),
  };
}

function normalizedPrescription(item) {
  const clientId = clean(item?.clientId || item?.payload?.id, 160);
  if (!clientId) throw new HttpError(400, 'Një recetë nuk ka identifikues lokal.');
  return {
    clientId,
    payload:validatePayload(item.payload),
    clientUpdatedAt:validIso(item.clientUpdatedAt || item.payload?.updatedAt || item.payload?.createdAt),
  };
}

function normalizedFavorite(item) {
  const entityType = clean(item?.entityType || 'drug', 40);
  const entityKey = clean(item?.entityKey, 300);
  if (!ALLOWED_ENTITY_TYPES.includes(entityType) || !entityKey) {
    throw new HttpError(400, 'Një favorit ose shënim ka identifikues të pavlefshëm.');
  }
  return {
    entityType,
    entityKey,
    payload:validateFavoritePayload(entityType, entityKey, item.payload),
    clientUpdatedAt:validIso(item.clientUpdatedAt),
  };
}

function normalizedPrescriptionTombstone(item) {
  const clientId = clean(item?.clientId, 160);
  if (!clientId) return null;
  return { clientId, deletedAt:validIso(item.deletedAt) };
}

function normalizedFavoriteTombstone(item) {
  const entityType = clean(item?.entityType || 'drug', 40);
  const entityKey = clean(item?.entityKey, 300);
  if (!ALLOWED_ENTITY_TYPES.includes(entityType) || !entityKey) return null;
  return { entityType, entityKey, deletedAt:validIso(item.deletedAt) };
}

function chunks(items, size = 100) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

async function upsert(table, conflict, records) {
  for (const batch of chunks(records)) {
    if (!batch.length) continue;
    await neonRequest(`${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method:'POST',
      body:batch,
      prefer:'resolution=merge-duplicates,return=minimal',
    });
  }
}

async function syncSnapshot(user, body) {
  const prescriptions = Array.isArray(body.prescriptions) ? body.prescriptions.map(normalizedPrescription) : [];
  const favorites = Array.isArray(body.favorites) ? body.favorites.map(normalizedFavorite) : [];
  const drugs = Array.isArray(body.drugs) ? body.drugs.map(PersonalDrugs.normalizedDrug) : [];
  const prescriptionTombstones = Array.isArray(body.tombstones?.prescriptions)
    ? body.tombstones.prescriptions.map(normalizedPrescriptionTombstone).filter(Boolean) : [];
  const favoriteTombstones = Array.isArray(body.tombstones?.favorites)
    ? body.tombstones.favorites.map(normalizedFavoriteTombstone).filter(Boolean) : [];
  const drugTombstones = Array.isArray(body.tombstones?.drugs)
    ? body.tombstones.drugs.map(PersonalDrugs.normalizedDrugTombstone).filter(Boolean) : [];

  if (prescriptions.length > MAX_PRESCRIPTIONS) throw new HttpError(413, 'Numri i recetave e tejkalon kufirin e bibliotekës.');
  if (favorites.length > MAX_FAVORITES) throw new HttpError(413, 'Numri i favoriteve/shënimeve e tejkalon kufirin e bibliotekës.');
  PersonalDrugs.assertWithinLimit(drugs.length);

  const existing = await libraryRows(user.id);
  const prescriptionMap = new Map(existing.prescriptions.map(row => [clean(row.client_id, 160), row]));
  const favoriteMap = new Map(existing.favorites.map(row => [`${clean(row.entity_type, 40)}|${clean(row.entity_key, 300)}`, row]));
  const drugMap = new Map(existing.drugs.map(row => [clean(row.client_id, 160), row]));
  const now = nowIso();
  const prescriptionRecords = [];
  const favoriteRecords = [];
  const drugRecords = [];

  prescriptions.forEach(item => {
    const current = prescriptionMap.get(item.clientId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    prescriptionRecords.push({
      user_id:user.id,
      client_id:item.clientId,
      name:null,
      diagnosis:null,
      payload:encryptJson(item.payload, prescriptionContext(user.id, item.clientId)),
      client_updated_at:item.clientUpdatedAt,
      deleted_at:null,
      updated_at:now,
    });
  });

  prescriptionTombstones.forEach(item => {
    const current = prescriptionMap.get(item.clientId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.deletedAt)) return;
    prescriptionRecords.push({
      user_id:user.id,
      client_id:item.clientId,
      name:null,
      diagnosis:null,
      payload:encryptJson({}, prescriptionContext(user.id, item.clientId)),
      client_updated_at:item.deletedAt,
      deleted_at:item.deletedAt,
      updated_at:now,
    });
  });

  favorites.forEach(item => {
    const key = `${item.entityType}|${item.entityKey}`;
    const current = favoriteMap.get(key);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    favoriteRecords.push({
      user_id:user.id,
      entity_type:item.entityType,
      entity_key:item.entityKey,
      payload:item.payload,
      client_updated_at:item.clientUpdatedAt,
      deleted_at:null,
      updated_at:now,
    });
  });

  favoriteTombstones.forEach(item => {
    const key = `${item.entityType}|${item.entityKey}`;
    const current = favoriteMap.get(key);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.deletedAt)) return;
    favoriteRecords.push({
      user_id:user.id,
      entity_type:item.entityType,
      entity_key:item.entityKey,
      payload:{},
      client_updated_at:item.deletedAt,
      deleted_at:item.deletedAt,
      updated_at:now,
    });
  });

  drugs.forEach(item => {
    const current = drugMap.get(item.clientId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    drugRecords.push(PersonalDrugs.drugRecord(user.id, item, now));
  });

  drugTombstones.forEach(item => {
    const current = drugMap.get(item.clientId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.deletedAt)) return;
    drugRecords.push(PersonalDrugs.drugTombstoneRecord(user.id, item, now));
  });

  await Promise.all([
    upsert('user_prescriptions', 'user_id,client_id', prescriptionRecords),
    upsert('user_favorites', 'user_id,entity_type,entity_key', favoriteRecords),
    upsert('user_drugs', 'user_id,client_id', drugRecords),
  ]);
  return {
    prescriptions:prescriptionRecords.length,
    favorites:favoriteRecords.length,
    drugs:drugRecords.length,
  };
}

async function handle(req, res) {
  securityHeaders(res);
  if (!sameOrigin(req)) return res.status(403).json({ error:'Origjina e kërkesës nuk lejohet.' });
  const user = await UserStore.userFromSession(req);
  if (!user) return res.status(401).json({ error:'Kërkohet autentikim.' });

  if (req.method === 'GET') return res.status(200).json(await getSnapshot(user));

  if (!['POST', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ error:'Kërkohet Content-Type application/json.' });
  }
  if (bodySize(req) > MAX_BODY_BYTES) return res.status(413).json({ error:'Biblioteka është tepër e madhe për një kërkesë.' });
  const body = parseBody(req);
  if (Number(body.version || 1) !== 1) return res.status(400).json({ error:'Versioni i bibliotekës nuk mbështetet.' });
  const applied = await syncSnapshot(user, body);
  const snapshot = await getSnapshot(user);
  return res.status(200).json({ ...snapshot, applied });
}

async function route(req, res) {
  try {
    return await handle(req, res);
  } catch (error) {
    console.error('User library error:', error?.code || error?.message || error);
    const status = Number(error?.status) || (/OIDC|Data API|çelësi privat/i.test(String(error?.message || '')) ? 503 : 500);
    return res.status(status).json({
      code:error?.code || '',
      error:status >= 500 ? 'Biblioteka personale nuk u sinkronizua. Të dhënat lokale mbeten të paprekura.' : error.message,
    });
  }
}

module.exports = {
  handle:route,
  _test:{
    sameOrigin,
    validIso,
    normalizedPrescription,
    normalizedFavorite,
    normalizedPrescriptionTombstone,
    normalizedFavoriteTombstone,
    timestamp,
  },
};
