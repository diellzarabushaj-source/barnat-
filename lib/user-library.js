'use strict';

const { neonRequest, exactCount } = require('./medindex-data-api.js');
const UserStore = require('./user-store.js');
const UserIdentity = require('./user-identity.js');
const PersonalDrugs = require('./user-drugs.js');
const { encryptJson, decryptJson } = require('./user-data-crypto.js');

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_PRESCRIPTIONS = 500;
const MAX_FAVORITES = 9000;
const MAX_ITEM_BYTES = 160 * 1024;
const MAX_NOTE_CHARS = 2000;
const PAGE_LIMIT = 10000;
const ALLOWED_ENTITY_TYPES = Object.freeze(['drug', 'substance', 'variant', 'product', 'lab', 'icd', 'protocol']);
const PHASE9_NOTE_ENTITY_TYPES = Object.freeze(['substance', 'variant', 'product']);
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

function queryValue(req, key) {
  if (req?.query && req.query[key] !== undefined) return req.query[key];
  try { return new URL(req?.url || '/api/user-library', 'https://drx.local').searchParams.get(key); }
  catch { return null; }
}

async function countPrivateRows(table, userId, filters = {}) {
  if (!userId) return 0;
  const params = new URLSearchParams();
  params.set('select', 'id');
  params.set('user_id', `eq.${userId}`);
  params.set('deleted_at', 'is.null');
  params.set('limit', '1');
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
  });
  const { response } = await neonRequest(`${table}?${params.toString()}`, {
    prefer:'count=exact',
    headers:{ Range:'0-0' },
    timeoutMs:4000,
    label:'Personal library summary',
  });
  return Math.max(0, Number(exactCount(response)) || 0);
}

async function getPersonalSummary(user, authUid = '') {
  const storageUid = UserIdentity.storageUidFromUser(user);
  if (!storageUid) throw new HttpError(401, 'Identiteti i ruajtjes mungon.', 'STORAGE_ID_REQUIRED');
  const [favorites, notes] = await Promise.all([
    countPrivateRows('user_favorites', storageUid, { entity_type:'in.(product,drug)' }),
    authUid ? countPrivateRows('user_notes', authUid, { entity_type:'eq.product' }) : Promise.resolve(0),
  ]);
  return {
    ok:true,
    version:1,
    counts:{ favorites, notes },
    generatedAt:nowIso(),
  };
}

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
    fetchRows('user_favorites', 'id,user_id,drug_id,entity_type,entity_key,payload,client_updated_at,deleted_at,created_at,updated_at', userId),
    fetchRows('user_drugs', 'id,user_id,client_id,name,payload,client_updated_at,deleted_at,created_at,updated_at', userId),
    authUid
      ? fetchRows('user_notes', 'id,user_id,drug_id,entity_type,entity_key,content,client_updated_at,deleted_at,created_at,updated_at', authUid)
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

function personalProductPayload(row) {
  const id=UserIdentity.uuidOrEmpty(row?.id);
  if (!id) return null;
  const registryNumber=Number(row?.registry_number);
  return {
    drugId:id,
    tradeName:clean(row?.trade_name,300),
    label:clean(row?.trade_name,300),
    registryNumber:Number.isSafeInteger(registryNumber) && registryNumber > 0 ? registryNumber : null,
    pdid:clean(row?.pdid,80),
    activeSubstance:clean(row?.active_substance,400),
    strength:clean(row?.strength,200),
    form:clean(row?.pharmaceutical_form,200),
    atc:clean(row?.atc_code,40),
  };
}

async function personalProductMetadataByIds(ids, { activeOnly = true } = {}) {
  const unique=[...new Set((ids || []).map(value => UserIdentity.uuidOrEmpty(value)).filter(Boolean))];
  const map=new Map();
  for (const batch of chunks(unique,100)) {
    if (!batch.length) continue;
    const params=new URLSearchParams();
    params.set('select','id,registry_number,pdid,trade_name,active_substance,strength,pharmaceutical_form,atc_code');
    params.set('id',`in.(${batch.join(',')})`);
    if (activeOnly) {
      params.set('is_published','eq.true');
      params.set('editorial_status','eq.published');
    }
    params.set('limit',String(batch.length));
    const { data }=await neonRequest(`drugs?${params.toString()}`,{
      timeoutMs:5000,
      label:'Personal library product metadata',
    });
    (Array.isArray(data) ? data : []).forEach(row => {
      const payload=personalProductPayload(row);
      if (payload?.drugId) map.set(payload.drugId,payload);
    });
  }
  return map;
}

function mergePersonalProductMetadata(item, metadata) {
  if (!item || item.entityType !== 'product') return item;
  const key=UserIdentity.uuidOrEmpty(item.entityKey);
  const canonical=key ? metadata.get(key) : null;
  if (!canonical) return item;
  const existing=plainObject(item.payload) ? item.payload : {};
  return {
    ...item,
    payload:{
      ...existing,
      ...canonical,
      tradeName:canonical.tradeName || clean(existing.tradeName || existing.label || existing.name,300),
      label:canonical.tradeName || clean(existing.label || existing.tradeName || existing.name,300),
    },
  };
}

function legacyFavoritePdid(item) {
  if (!item || item.entityType !== 'drug') return '';
  const payload=plainObject(item.payload) ? item.payload : {};
  const candidate=clean(payload.pdid || String(item.entityKey || '').split('|')[0],80);
  return /^[a-zA-Z0-9._-]{1,80}$/.test(candidate) ? candidate : '';
}

async function personalProductMetadataByPdids(pdids, { activeOnly = true } = {}) {
  const unique=[...new Set((pdids || []).map(value => clean(value,80)).filter(value => /^[a-zA-Z0-9._-]{1,80}$/.test(value)))];
  const map=new Map();
  for (const batch of chunks(unique,100)) {
    if (!batch.length) continue;
    const params=new URLSearchParams();
    params.set('select','id,registry_number,pdid,trade_name,active_substance,strength,pharmaceutical_form,atc_code');
    params.set('pdid',`in.(${batch.map(value => JSON.stringify(value)).join(',')})`);
    if (activeOnly) {
      params.set('is_published','eq.true');
      params.set('editorial_status','eq.published');
    }
    params.set('limit',String(batch.length));
    const { data }=await neonRequest(`drugs?${params.toString()}`,{
      timeoutMs:5000,
      label:'Legacy favorite product metadata',
    });
    (Array.isArray(data) ? data : []).forEach(row => {
      const payload=personalProductPayload(row);
      const pdid=clean(row?.pdid,80);
      if (payload?.drugId && pdid) map.set(pdid,payload);
    });
  }
  return map;
}

function mergeLegacyFavoriteMetadata(item, metadata) {
  if (!item || item.entityType !== 'drug') return item;
  const pdid=legacyFavoritePdid(item);
  const canonical=pdid ? metadata.get(pdid) : null;
  if (!canonical) return item;
  const existing=plainObject(item.payload) ? item.payload : {};
  return {
    ...item,
    payload:{
      ...existing,
      ...canonical,
      legacyEntityKey:item.entityKey,
      tradeName:canonical.tradeName || clean(existing.tradeName || existing.label || existing.name,300),
      label:canonical.tradeName || clean(existing.label || existing.tradeName || existing.name,300),
    },
  };
}

function mergeLegacyFavoriteMetadataByDrugId(item, metadata) {
  if (!item || item.entityType !== 'drug') return item;
  const existing=plainObject(item.payload) ? item.payload : {};
  const drugId=UserIdentity.uuidOrEmpty(existing.drugId);
  const canonical=drugId ? metadata.get(drugId) : null;
  if (!canonical) return item;
  return {
    ...item,
    payload:{
      ...existing,
      ...canonical,
      legacyEntityKey:item.entityKey,
      tradeName:canonical.tradeName || clean(existing.tradeName || existing.label || existing.name,300),
      label:canonical.tradeName || clean(existing.label || existing.tradeName || existing.name,300),
    },
  };
}

function assertPersonalDrugIdentity(favorites, entityNotes) {
  const brokenFavorites=(favorites || []).filter(item => {
    if (!['product','drug'].includes(item?.entityType)) return false;
    const payload=plainObject(item?.payload) ? item.payload : {};
    return !UserIdentity.uuidOrEmpty(payload.drugId || (item.entityType === 'product' ? item.entityKey : ''))
      || !clean(payload.tradeName || payload.label || payload.name,300);
  });
  const brokenNotes=(entityNotes || []).filter(item => {
    if (item?.entityType !== 'product') return false;
    const payload=plainObject(item?.payload) ? item.payload : {};
    return !UserIdentity.uuidOrEmpty(payload.drugId || item.drugId || item.entityKey)
      || !clean(payload.tradeName || payload.label || payload.name,300);
  });
  if (brokenFavorites.length || brokenNotes.length) {
    throw new HttpError(
      503,
      'Identiteti i barit në bibliotekën personale nuk u verifikua.',
      'PERSONAL_PRODUCT_IDENTITY_UNAVAILABLE'
    );
  }
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

function normalizedEntityNote(item) {
  const entityType=clean(item?.entityType,40);
  let entityKey=clean(item?.entityKey,300);
  const content=String(item?.content ?? '').slice(0,MAX_NOTE_CHARS);
  if (!PHASE9_NOTE_ENTITY_TYPES.includes(entityType) || !entityKey) {
    throw new HttpError(400,'Shënimi Phase 9 ka identifikues të pavlefshëm.');
  }
  if (entityType === 'product') {
    const canonical=UserIdentity.uuidOrEmpty(entityKey);
    if (!canonical) throw new HttpError(400,'Shënimi duhet të lidhet me një bar kanonik.', 'INVALID_PRODUCT_ID');
    entityKey=canonical;
  }
  if (!content.trim()) throw new HttpError(400,'Shënimi Phase 9 është bosh.');
  return {
    entityType,
    entityKey,
    content,
    clientUpdatedAt:validIso(item?.clientUpdatedAt),
  };
}

function normalizedEntityNoteTombstone(item) {
  const entityType=clean(item?.entityType,40);
  let entityKey=clean(item?.entityKey,300);
  if (!PHASE9_NOTE_ENTITY_TYPES.includes(entityType) || !entityKey) return null;
  if (entityType === 'product') {
    entityKey=UserIdentity.uuidOrEmpty(entityKey);
    if (!entityKey) return null;
  }
  return { entityType,entityKey,deletedAt:validIso(item?.deletedAt) };
}

function mapEntityNote(row) {
  const entityType=clean(row?.entity_type,40);
  const entityKey=clean(row?.entity_key,300);
  if (row?.deleted_at || !PHASE9_NOTE_ENTITY_TYPES.includes(entityType) || !entityKey) return null;
  const content=String(row?.content ?? '').slice(0,MAX_NOTE_CHARS);
  if (!content.trim()) return null;
  return {
    entityType,
    entityKey,
    drugId:clean(row?.drug_id,80),
    content,
    clientUpdatedAt:row.client_updated_at || row.updated_at || '',
    serverUpdatedAt:row.updated_at || '',
  };
}

function mapEntityNoteTombstone(row) {
  const entityType=clean(row?.entity_type,40);
  const entityKey=clean(row?.entity_key,300);
  if (!row?.deleted_at || !PHASE9_NOTE_ENTITY_TYPES.includes(entityType) || !entityKey) return null;
  return { entityType,entityKey,deletedAt:row.deleted_at };
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
  const payload=plainObject(row.payload) ? { ...row.payload } : {};
  const drugId=UserIdentity.uuidOrEmpty(row?.drug_id);
  if (drugId && !payload.drugId) payload.drugId=drugId;
  return {
    entityType:clean(row.entity_type, 40) || 'drug',
    entityKey:clean(row.entity_key, 300),
    payload,
    clientUpdatedAt:row.client_updated_at || row.updated_at || '',
    serverUpdatedAt:row.updated_at || '',
  };
}

async function getSnapshot(user, authUid = '') {
  const storageUid = UserIdentity.storageUidFromUser(user);
  if (!storageUid) throw new HttpError(401, 'Identiteti i ruajtjes mungon.', 'STORAGE_ID_REQUIRED');
  const [rows, prescriptionChapters] = await Promise.all([
    libraryRows(storageUid, authUid),
    prescriptionChapterRows(),
  ]);
  const decryptionErrors = [];
  const prescriptions = rows.prescriptions.map(row => mapPrescription(row, storageUid, decryptionErrors)).filter(Boolean);
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

  let entityNotes=rows.notes.map(mapEntityNote).filter(Boolean);
  const entityNoteTombstones=rows.notes.map(mapEntityNoteTombstone).filter(Boolean);

  let legacyFavorites = rows.favorites.map(mapFavorite).filter(Boolean);
  const productIds=[
    ...legacyFavorites.filter(row => row.entityType === 'product').map(row => row.entityKey),
    ...legacyFavorites.filter(row => row.entityType === 'drug').map(row => row.payload?.drugId),
    ...entityNotes.filter(row => row.entityType === 'product').map(row => row.drugId || row.entityKey),
  ];
  let productMetadata;
  try {
    productMetadata=await personalProductMetadataByIds(productIds,{ activeOnly:false });
  } catch (error) {
    console.error('Personal product identity hydration failed:', clean(error?.message,240));
    throw new HttpError(
      503,
      'Të dhënat e barit në bibliotekën personale nuk u verifikuan.',
      'PERSONAL_PRODUCT_IDENTITY_UNAVAILABLE'
    );
  }
  legacyFavorites=legacyFavorites
    .map(item => mergePersonalProductMetadata(item,productMetadata))
    .map(item => mergeLegacyFavoriteMetadataByDrugId(item,productMetadata));
  entityNotes=entityNotes.map(item => mergePersonalProductMetadata(item,productMetadata));
  assertPersonalDrugIdentity(legacyFavorites,entityNotes);

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
    entityNotes,
    drugs,
    tombstones:{
      drugs:rows.drugs.filter(row => row.deleted_at).map(PersonalDrugs.mapDrugTombstone),
      prescriptions:rows.prescriptions.filter(row => row.deleted_at).map(row => ({
        clientId:clean(row.client_id, 160),
        deletedAt:row.deleted_at,
      })),
      favorites:[...legacyFavoriteTombstones, ...nativeNoteTombstones],
      entityNotes:entityNoteTombstones,
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
  let entityKey = clean(item?.entityKey, 300);
  if (!ALLOWED_ENTITY_TYPES.includes(entityType) || !entityKey) {
    throw new HttpError(400, 'Një favorit ose shënim ka identifikues të pavlefshëm.');
  }
  if (entityType === 'product') {
    const canonical=UserIdentity.uuidOrEmpty(entityKey);
    if (!canonical) throw new HttpError(400,'Favoriti duhet të lidhet me një bar kanonik.', 'INVALID_PRODUCT_ID');
    entityKey=canonical;
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
  let entityKey = clean(item?.entityKey, 300);
  if (!ALLOWED_ENTITY_TYPES.includes(entityType) || !entityKey) return null;
  if (entityType === 'product') {
    entityKey=UserIdentity.uuidOrEmpty(entityKey);
    if (!entityKey) return null;
  }
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
  const storageUid = UserIdentity.storageUidFromUser(user);
  if (!storageUid) throw new HttpError(401, 'Identiteti i ruajtjes mungon.', 'STORAGE_ID_REQUIRED');
  const prescriptions = Array.isArray(body.prescriptions) ? body.prescriptions.map(normalizedPrescription) : [];
  const incomingFavorites = Array.isArray(body.favorites) ? body.favorites.map(normalizedFavorite) : [];
  const incomingEntityNotes = Array.isArray(body.entityNotes) ? body.entityNotes.map(normalizedEntityNote) : [];
  const drugs = Array.isArray(body.drugs) ? body.drugs.map(PersonalDrugs.normalizedDrug) : [];
  const prescriptionTombstones = Array.isArray(body.tombstones?.prescriptions)
    ? body.tombstones.prescriptions.map(normalizedPrescriptionTombstone).filter(Boolean) : [];
  const incomingFavoriteTombstones = Array.isArray(body.tombstones?.favorites)
    ? body.tombstones.favorites.map(normalizedFavoriteTombstone).filter(Boolean) : [];
  const incomingEntityNoteTombstones = Array.isArray(body.tombstones?.entityNotes)
    ? body.tombstones.entityNotes.map(normalizedEntityNoteTombstone).filter(Boolean) : [];
  const drugTombstones = Array.isArray(body.tombstones?.drugs)
    ? body.tombstones.drugs.map(PersonalDrugs.normalizedDrugTombstone).filter(Boolean) : [];

  if (prescriptions.length > MAX_PRESCRIPTIONS) throw new HttpError(413, 'Numri i recetave e tejkalon kufirin e bibliotekës.');
  if (incomingFavorites.length > MAX_FAVORITES) throw new HttpError(413, 'Numri i favoriteve/shënimeve e tejkalon kufirin e bibliotekës.');
  if (incomingEntityNotes.length + incomingEntityNoteTombstones.length > MAX_FAVORITES) {
    throw new HttpError(413,'Numri i shënimeve Phase 9 e tejkalon kufirin e bibliotekës.');
  }
  if ((incomingEntityNotes.length || incomingEntityNoteTombstones.length) && !authUid) {
    throw new HttpError(401,'Shënimet Phase 9 kërkojnë identitet Supabase Auth.');
  }
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

  const writeProductIds=[...new Set([
    ...favorites.filter(item => item.entityType === 'product').map(item => item.entityKey),
    ...incomingEntityNotes.filter(item => item.entityType === 'product').map(item => item.entityKey),
  ])];
  const writeProductMetadata=await personalProductMetadataByIds(writeProductIds,{ activeOnly:true });
  const missingWriteProducts=writeProductIds.filter(id => !writeProductMetadata.has(id));
  if (missingWriteProducts.length) {
    throw new HttpError(
      409,
      'Bari nuk është më aktiv në regjistrin kanonik.',
      'PERSONAL_PRODUCT_NOT_ACTIVE'
    );
  }
  const canonicalFavorites=favorites.map(item => mergePersonalProductMetadata(item,writeProductMetadata));

  const existing = await libraryRows(storageUid, authUid);
  const prescriptionMap = new Map(existing.prescriptions.map(row => [clean(row.client_id, 160), row]));
  const favoriteMap = new Map(existing.favorites.map(row => [`${clean(row.entity_type, 40)}|${clean(row.entity_key, 300)}`, row]));
  const drugMap = new Map(existing.drugs.map(row => [clean(row.client_id, 160), row]));
  const noteMap = new Map(existing.notes.map(row => [
    `${clean(row.entity_type,40) || 'drug'}|${clean(row.entity_key,300) || clean(row.drug_id,80)}`,
    row,
  ]));
  const now = nowIso();
  const prescriptionRecords = [];
  const favoriteRecords = [];
  const noteRecords = [];
  const drugRecords = [];

  prescriptions.forEach(item => {
    const current = prescriptionMap.get(item.clientId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    prescriptionRecords.push({
      user_id:storageUid,
      client_id:item.clientId,
      name:null,
      diagnosis:null,
      chapter_key:item.chapterKey,
      payload:encryptJson(item.payload, prescriptionContext(storageUid, item.clientId)),
      client_updated_at:item.clientUpdatedAt,
      deleted_at:null,
      updated_at:now,
    });
  });

  prescriptionTombstones.forEach(item => {
    const current = prescriptionMap.get(item.clientId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.deletedAt)) return;
    prescriptionRecords.push({
      user_id:storageUid,
      client_id:item.clientId,
      name:null,
      diagnosis:null,
      chapter_key:null,
      payload:encryptJson({}, prescriptionContext(storageUid, item.clientId)),
      client_updated_at:item.deletedAt,
      deleted_at:item.deletedAt,
      updated_at:now,
    });
  });

  canonicalFavorites.forEach(item => {
    const key = `${item.entityType}|${item.entityKey}`;
    const current = favoriteMap.get(key);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    favoriteRecords.push({
      user_id:storageUid,
      drug_id:item.entityType === 'product'
        ? item.entityKey
        : UserIdentity.uuidOrEmpty(item?.payload?.drugId) || null,
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
      user_id:storageUid,
      drug_id:item.entityType === 'product' ? item.entityKey : null,
      entity_type:item.entityType,
      entity_key:item.entityKey,
      payload:{},
      client_updated_at:item.deletedAt,
      deleted_at:item.deletedAt,
      updated_at:now,
    });
  });

  nativeNoteItems.forEach(({ item, drugId }) => {
    const current = noteMap.get(`drug|${drugId}`);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    noteRecords.push({
      user_id:authUid,
      drug_id:drugId,
      entity_type:'drug',
      entity_key:drugId,
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
      entity_type:'drug',
      entity_key:drugId,
      content:'',
      client_updated_at:item.deletedAt,
      deleted_at:item.deletedAt,
      updated_at:now,
    });
  });

  incomingEntityNotes.forEach(item => {
    const key=`${item.entityType}|${item.entityKey}`;
    const current=noteMap.get(key);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    noteRecords.push({
      user_id:authUid,
      drug_id:item.entityType === 'product' ? item.entityKey : null,
      entity_type:item.entityType,
      entity_key:item.entityKey,
      content:item.content,
      client_updated_at:item.clientUpdatedAt,
      deleted_at:null,
      updated_at:now,
    });
  });

  incomingEntityNoteTombstones.forEach(item => {
    const key=`${item.entityType}|${item.entityKey}`;
    const current=noteMap.get(key);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.deletedAt)) return;
    noteRecords.push({
      user_id:authUid,
      drug_id:item.entityType === 'product' ? item.entityKey : null,
      entity_type:item.entityType,
      entity_key:item.entityKey,
      content:'',
      client_updated_at:item.deletedAt,
      deleted_at:item.deletedAt,
      updated_at:now,
    });
  });

    drugs.forEach(item => {
    const current = drugMap.get(item.clientId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.clientUpdatedAt)) return;
    drugRecords.push(PersonalDrugs.drugRecord(storageUid, item, now));
  });

  drugTombstones.forEach(item => {
    const current = drugMap.get(item.clientId);
    if (current && timestamp(current.client_updated_at || current.updated_at) > timestamp(item.deletedAt)) return;
    drugRecords.push(PersonalDrugs.drugTombstoneRecord(storageUid, item, now));
  });

  await Promise.all([
    upsert('user_prescriptions', 'user_id,client_id', prescriptionRecords),
    upsert('user_favorites', 'user_id,entity_type,entity_key', favoriteRecords),
    upsert('user_notes', 'user_id,entity_type,entity_key', noteRecords),
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
  const authUid = clean(user.authUid, 80) || await authUidFromRequest(req);

  if (req.method === 'GET' && queryValue(req, 'view') === 'summary') return res.status(200).json(await getPersonalSummary(user, authUid));
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
    normalizedEntityNote,
    normalizedEntityNoteTombstone,
    mapEntityNote,
    mapEntityNoteTombstone,
    isDrugNoteKey,
    noteRegistryNumber,
    timestamp,
    queryValue,
    countPrivateRows,
    getPersonalSummary,
    personalProductPayload,
    personalProductMetadataByIds,
    mergePersonalProductMetadata,
    legacyFavoritePdid,
    personalProductMetadataByPdids,
    mergeLegacyFavoriteMetadata,
    mergeLegacyFavoriteMetadataByDrugId,
    assertPersonalDrugIdentity,
  },
};
