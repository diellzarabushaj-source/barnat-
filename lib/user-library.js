'use strict';

const { neonRequest } = require('./medindex-data-api.js');
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
const CHAPTER_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function isDrugNoteKey(entityType, entityKey) {
  return entityType === 'protocol' && String(entityKey || '').startsWith(NOTE_ENTITY_PREFIX);
}

function isDrugNoteEntity(entityType, entityKey, payload) {
  return isDrugNoteKey(entityType, entityKey)
    && plainObject(payload)
    && payload.kind === 'drug-note';
}

function noteRegistryNumber(entityKey) {
  const match = /^drug-note:registry:(\d+)$/.exec(String(entityKey || ''));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function authUidFromRequest(req) {
  try {
    const auth = await import('./auth.mjs');
    const session = auth.sessionData(auth.sessionFromRequest(req));
    return auth.isSupabaseSession(session) ? clean(session.authUid, 80) : '';
  } catch {
    return '';
  }
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

async function libraryRows(userId, authUid = '') {
  const [prescriptions, favorites, drugs, notes] = await Promise.all([
    fetchRows('user_prescriptions', 'id,user_id,client_id,chapter_key,payload,client_updated_at,deleted_at,created_at,updated_at', userId),
    fetchRows('user_favorites', 'id,user_id,entity_type,entity_key,payload,client_updated_at,deleted_at,created_at,updated_at', userId),
    fetchRows('user_drugs', 'id,user_id,client_id,name,payload,client_updated_at,deleted_at,created_at,updated_at', userId),
    authUid
      ? fetchRows('user_notes', 'id,user_id,drug_id,content,client_updated_at,deleted_at,created_at,updated_at', authUid)
      : Promise.resolve([]),
  ]);
  return { prescriptions, favorites, drugs, notes };
}

async function prescriptionChapterRows() {
  const params = new URLSearchParams();
  params.set('select', 'slug,title_sq,description_sq,atc_groups,diagnosis_keywords,sort_order');
  params.set('is_active', 'eq.true');
  params.set('order', 'sort_order.asc,title_sq.asc');
  params.set('limit', '100');
  const { data } = await neonRequest(`prescription_chapters?${params.toString()}`, {
    timeoutMs:4000,
    label:'Prescription chapters',
  });
  return (Array.isArray(data) ? data : []).map(row => ({
    slug:clean(row?.slug, 64),
    title:clean(row?.title_sq, 160),
    description:clean(row?.description_sq, 400),
    atcGroups:Array.isArray(row?.atc_groups) ? row.atc_groups.map(value => clean(value, 8)).filter(Boolean) : [],
    diagnosisKeywords:Array.isArray(row?.diagnosis_keywords) ? row.diagnosis_keywords.map(value => clean(value, 80)).filter(Boolean) : [],
    sortOrder:Number(row?.sort_order) || 100,
  })).filter(row => CHAPTER_KEY_RE.test(row.slug) && row.title);
}

async function drugRegistryMapByIds(ids) {
  const unique = [...new Set((ids || []).map(value => clean(value, 80)).filter(Boolean))];
  if (!unique.length) return new Map();
  const map = new Map();
  for (const batch of chunks(unique, 100)) {
    const params = new URLSearchParams();
    params.set('select', 'id,registry_number');
    params.set('id', `in.(${batch.join(',')})`);
    params.set('limit', String(batch.length));
    const { data } = await neonRequest(`drugs?${params.toString()}`, {
      timeoutMs:5000,
      label:'Native note drug identity',
    });
    (Array.isArray(data) ? data : []).forEach(row => {
      const id = clean(row?.id, 80);
      const registryNumber = Number(row?.registry_number);
      if (id && Number.isSafeInteger(registryNumber) && registryNumber > 0) map.set(id, registryNumber);
    });
  }
  return map;
}

async function drugIdMapByRegistryNumbers(numbers) {
  const unique = [...new Set((numbers || []).map(Number).filter(value => Number.isSafeInteger(value) && value > 0))];
  if (!unique.length) return new Map();
  const map = new Map();
  for (const batch of chunks(unique, 100)) {
    const params = new URLSearchParams();
    params.set('select', 'id,registry_number');
    params.set('registry_number', `in.(${batch.join(',')})`);
    params.set('limit', String(batch.length));
    const { data } = await neonRequest(`drugs?${params.toString()}`, {
      timeoutMs:5000,
      label:'Native note registry identity',
    });
    (Array.isArray(data) ? data : []).forEach(row => {
      const id = clean(row?.id, 80);
      const registryNumber = Number(row?.registry_number);
      if (id && Number.isSafeInteger(registryNumber) && registryNumber > 0) map.set(registryNumber, id);
    });
  }
  return map;
}

function mapNativeNote(row, registryNumber) {
  if (row.deleted_at || !registryNumber) return null;
  const content = String(row.content ?? '').slice(0, MAX_NOTE_CHARS);
  if (!content.trim()) return null;
  return {
    entityType:'protocol',
    entityKey:`${NOTE_ENTITY_PREFIX}registry:${registryNumber}`,
    payload:{ kind:'drug-note', text:content },
    clientUpdatedAt:row.client_updated_at || row.updated_at || '',
    serverUpdatedAt:row.updated_at || '',
  };
}

function mapNativeNoteTombstone(row, registryNumber) {
  if (!row.deleted_at || !registryNumber) return null;
  return {
    entityType:'protocol',
    entityKey:`${NOTE_ENTITY_PREFIX}registry:${registryNumber}`,
    deletedAt:row.deleted_at,
  };
}

function mapPrescription(row, userId, errors) {
  if (row.deleted_at) return null;
  try {
    const payload = decryptJson(row.payload, prescriptionContext(userId, row.client_id));
    const chapterKey = clean(row.chapter_key || payload?.chapterKey, 64);
    if (plainObject(payload) && CHAPTER_KEY_RE.test(chapterKey)) payload.chapterKey = chapterKey;
    return {
      clientId:clean(row.client_id, 160),
      chapterKey:CHAPTER_KEY_RE.test(chapterKey) ? chapterKey : '',
      payload,
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

async function getSnapshot(user, authUid = '') {
  const [rows, prescriptionChapters] = await Promise.all([
    libraryRows(user.id, authUid),
    prescriptionChapterRows(),
  ]);
  const decryptionErrors = [];
  const prescriptions = rows.prescriptions.map(row => mapPrescription(row, user.id, decryptionErrors)).filter(Boolean);
  const nativeRegistryMap = await drugRegistryMapByIds(rows.notes.map(row => row.drug_id));
  const nativeNotes = rows.notes
    .map(row => mapNativeNote(row, nativeRegistryMap.get(clean(row.drug_id, 80))))
    .filter(Boolean);
  const nativeNoteTombstones = rows.notes
    .map(row => mapNativeNoteTombstone(row, nativeRegistryMap.get(clean(row.drug_id, 80))))
    .filter(Boolean);
  const nativeKeys = new Set([
    ...nativeNotes.map(row => row.entityKey),
    ...nativeNoteTombstones.map(row => row.entityKey),
  ]);

  const legacyFavorites = rows.favorites.map(mapFavorite).filter(Boolean);
  const favorites = [
    ...legacyFavorites.filter(row => !isDrugNoteKey(row.entityType, row.entityKey) || !nativeKeys.has(row.entityKey)),
    ...nativeNotes,
  ];
  const drugs = rows.drugs.map(PersonalDrugs.mapDrug).filter(Boolean);
  const legacyFavoriteTombstones = rows.favorites
    .filter(row => row.deleted_at)
    .map(row => ({
      entityType:clean(row.entity_type, 40) || 'drug',
      entityKey:clean(row.entity_key, 300),
      deletedAt:row.deleted_at,
    }))
    .filter(row => !isDrugNoteKey(row.entityType, row.entityKey) || !nativeKeys.has(row.entityKey));

  return {
    ok:true,
    version:1,
    user:{ id:user.id, email:user.email, role:user.role, name:user.name },
    prescriptions,
    prescriptionChapters,
    favorites,
    drugs,
    tombstones:{
      drugs:rows.drugs.filter(row => row.deleted_at).map(PersonalDrugs.mapDrugTombstone),
      prescriptions:rows.prescriptions.filter(row => row.deleted_at).map(row => ({
        clientId:clean(row.client_id, 160),
        deletedAt:row.deleted_at,
      })),
      favorites:[...legacyFavoriteTombstones, ...nativeNoteTombstones],
    },
    warnings:decryptionErrors.length ? { unreadablePrescriptions:decryptionErrors.length } : {},
    generatedAt:nowIso(),
  };
}
function normalizedPrescription(item) {
  const clientId = clean(item?.clientId || item?.payload?.id, 160);
  if (!clientId) throw new HttpError(400, 'Një recetë nuk ka identifikues lokal.');
  const payload = validatePayload(item.payload);
  const chapterKey = clean(item?.chapterKey || payload?.chapterKey || 'te-tjera', 64);
  if (!CHAPTER_KEY_RE.test(chapterKey)) throw new HttpError(400, 'Kapitulli i recetës është i pavlefshëm.');
  payload.chapterKey = chapterKey;
  return {
    clientId,
    chapterKey,
    payload,
    clientUpdatedAt:validIso(item.clientUpdatedAt || payload?.updatedAt || payload?.createdAt),
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

async function syncSnapshot(user, authUid, body) {
  const prescriptions = Array.isArray(body.prescriptions) ? body.prescriptions.map(normalizedPrescription) : [];
  const incomingFavorites = Array.isArray(body.favorites) ? body.favorites.map(normalizedFavorite) : [];
  const drugs = Array.isArray(body.drugs) ? body.drugs.map(PersonalDrugs.normalizedDrug) : [];
  const prescriptionTombstones = Array.isArray(body.tombstones?.prescriptions)
    ? body.tombstones.prescriptions.map(normalizedPrescriptionTombstone).filter(Boolean) : [];
  const incomingFavoriteTombstones = Array.isArray(body.tombstones?.favorites)
    ? body.tombstones.favorites.map(normalizedFavoriteTombstone).filter(Boolean) : [];
  const drugTombstones = Array.isArray(body.tombstones?.drugs)
    ? body.tombstones.drugs.map(PersonalDrugs.normalizedDrugTombstone).filter(Boolean) : [];

  if (prescriptions.length > MAX_PRESCRIPTIONS) throw new HttpError(413, 'Numri i recetave e tejkalon kufirin e bibliotekës.');
  if (incomingFavorites.length > MAX_FAVORITES) throw new HttpError(413, 'Numri i favoriteve/shënimeve e tejkalon kufirin e bibliotekës.');
  PersonalDrugs.assertWithinLimit(drugs.length);

  const noteCandidates = incomingFavorites.filter(item => isDrugNoteEntity(item.entityType, item.entityKey, item.payload));
  const noteTombstoneCandidates = incomingFavoriteTombstones.filter(item => isDrugNoteKey(item.entityType, item.entityKey));
  const noteRegistryNumbers = [
    ...noteCandidates.map(item => noteRegistryNumber(item.entityKey)),
    ...noteTombstoneCandidates.map(item => noteRegistryNumber(item.entityKey)),
  ].filter(Boolean);
  const noteDrugIds = authUid ? await drugIdMapByRegistryNumbers(noteRegistryNumbers) : new Map();

  const nativeNoteItems = [];
  const nativeNoteTombstones = [];
  const favorites = [];
  const favoriteTombstones = [];

  incomingFavorites.forEach(item => {
    const registryNumber = noteRegistryNumber(item.entityKey);
    const drugId = registryNumber ? noteDrugIds.get(registryNumber) : '';
    if (authUid && isDrugNoteEntity(item.entityType, item.entityKey, item.payload) && drugId) {
      nativeNoteItems.push({ item, drugId });
    } else {
      favorites.push(item);
    }
  });
  incomingFavoriteTombstones.forEach(item => {
    const registryNumber = noteRegistryNumber(item.entityKey);
    const drugId = registryNumber ? noteDrugIds.get(registryNumber) : '';
    if (authUid && isDrugNoteKey(item.entityType, item.entityKey) && drugId) {
      nativeNoteTombstones.push({ item, drugId });
    } else {
      favoriteTombstones.push(item);
    }
  });

  const existing = await libraryRows(user.id, authUid);
  const prescriptionMap = new Map(existing.prescriptions.map(row => [clean(row.client_id, 160), row]));
  const favoriteMap = new Map(existing.favorites.map(row => [`${clean(row.entity_type, 40)}|${clean(row.entity_key, 300)}`, row]));
  const drugMap = new Map(existing.drugs.map(row => [clean(row.client_id, 160), row]));
  const noteMap = new Map(existing.notes.map(row => [clean(row.drug_id, 80), row]));
  const now = nowIso();
  const prescriptionRecords = [];
  const favoriteRecords = [];
  const noteRecords = [];
  const drugRecords = [];

  prescriptions.forEach(item => {
    const current = prescriptionMap.get(item.clientId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    prescriptionRecords.push({
      user_id:user.id,
      client_id:item.clientId,
      name:null,
      diagnosis:null,
      chapter_key:item.chapterKey,
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
      chapter_key:null,
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

  nativeNoteItems.forEach(({ item, drugId }) => {
    const current = noteMap.get(drugId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    noteRecords.push({
      user_id:authUid,
      drug_id:drugId,
      content:String(item.payload?.text ?? '').slice(0, MAX_NOTE_CHARS),
      client_updated_at:item.clientUpdatedAt,
      deleted_at:null,
      updated_at:now,
    });
  });

  nativeNoteTombstones.forEach(({ item, drugId }) => {
    const current = noteMap.get(drugId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.deletedAt)) return;
    noteRecords.push({
      user_id:authUid,
      drug_id:drugId,
      content:'',
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
    upsert('user_notes', 'user_id,drug_id', noteRecords),
    upsert('user_drugs', 'user_id,client_id', drugRecords),
  ]);
  return {
    prescriptions:prescriptionRecords.length,
    favorites:favoriteRecords.length,
    notes:noteRecords.length,
    drugs:drugRecords.length,
  };
}
async function handle(req, res) {
  securityHeaders(res);
  if (!sameOrigin(req)) return res.status(403).json({ error:'Origjina e kërkesës nuk lejohet.' });
  const user = await UserStore.userFromSession(req);
  if (!user) return res.status(401).json({ error:'Kërkohet autentikim.' });
  const authUid = await authUidFromRequest(req);

  if (req.method === 'GET') return res.status(200).json(await getSnapshot(user, authUid));

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
  const applied = await syncSnapshot(user, authUid, body);
  const snapshot = await getSnapshot(user, authUid);
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
    prescriptionChapterRows,
    normalizedFavorite,
    normalizedPrescriptionTombstone,
    normalizedFavoriteTombstone,
    isDrugNoteKey,
    noteRegistryNumber,
    timestamp,
  },
};
