'use strict';

const UserStore = require('./user-store.js');
const UserIdentity = require('./user-identity.js');
const { neonRequest } = require('./medindex-data-api.js');

const NOTE_ENTITY_PREFIX = 'drug-note:';
const MAX_MEMBERSHIP_ROWS = 9000;
const MAX_TARGETED_DRUG_ROWS = 1000;
const DRUG_SELECT = [
  'id',
  'registry_number',
  'protocol_no',
  'pdid',
  'trade_name',
  'active_substance',
  'atc_code',
  'drug_class',
  'use_text',
  'strength',
  'pharmaceutical_form',
  'packaging',
  'marketing_authorization_holder',
  'manufacturer',
  'ma_certificate',
  'product_status',
  'wholesale_price',
  'wholesale_with_margin',
  'vat_text',
  'retail_price',
  'validity_text',
  'approved_population',
  'pediatric_dose_summary',
  'pediatric_use_status',
  'pediatric_verification_status',
].join(',');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

class PersonalRegistryError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeMembershipKey(value) {
  let key = clean(value).slice(0, 320);
  if (key.startsWith(NOTE_ENTITY_PREFIX)) key = key.slice(NOTE_ENTITY_PREFIX.length);
  return key;
}

function isLiveNote(row) {
  const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload : {};
  return clean(row?.entity_type) === 'protocol'
    && clean(row?.entity_key).startsWith(NOTE_ENTITY_PREFIX)
    && payload.kind === 'drug-note'
    && Boolean(clean(payload.text));
}

async function authUidForRequest(request) {
  try {
    const auth = await import('./auth.mjs');
    const session = auth.sessionData(auth.sessionFromRequest(request));
    return auth.isSupabaseSession(session) ? clean(session.authUid) : '';
  } catch {
    return '';
  }
}

async function membershipKeysForUser(userId, mode) {
  const params = new URLSearchParams();
  params.set('select', 'entity_type,entity_key,payload,updated_at');
  params.set('user_id', `eq.${userId}`);
  params.set('deleted_at', 'is.null');
  if (mode === 'favorites') params.set('entity_type', 'eq.drug');
  else params.set('entity_type', 'eq.protocol');
  params.set('order', 'updated_at.desc');
  params.set('limit', String(MAX_MEMBERSHIP_ROWS));

  const { data } = await neonRequest(`user_favorites?${params.toString()}`, {
    timeoutMs:5000,
    label:'Personal registry membership',
  });
  const rows = Array.isArray(data) ? data : [];
  return [...new Set(rows.flatMap(row => {
    if (mode === 'notes' && !isLiveNote(row)) return [];
    const key = normalizeMembershipKey(row.entity_key);
    return key ? [key] : [];
  }))];
}

async function nativeNoteKeysForUser(authUid) {
  if (!authUid) return [];
  const params = new URLSearchParams();
  params.set('select', 'drug_id,content,deleted_at,updated_at');
  params.set('user_id', `eq.${authUid}`);
  params.set('deleted_at', 'is.null');
  params.set('order', 'updated_at.desc');
  params.set('limit', String(MAX_MEMBERSHIP_ROWS));
  const { data } = await neonRequest(`user_notes?${params.toString()}`, {
    timeoutMs:5000,
    label:'Personal registry native notes',
  });
  const notes = (Array.isArray(data) ? data : []).filter(row => Boolean(clean(row?.content)));
  if (!notes.length) return [];

  const noteDrugIds = new Set(notes.map(row => clean(row?.drug_id)).filter(Boolean));
  const drugRows = await fetchDrugsBy('id', [...noteDrugIds]);
  return [...new Set(drugRows.flatMap(row => {
    const id = clean(row?.id);
    const registryNumber = clean(row?.registry_number);
    return id && registryNumber && noteDrugIds.has(id) ? [`registry:${registryNumber}`] : [];
  }))];
}

function lookupHints(keys) {
  const pdids = new Set();
  const registryNumbers = new Set();

  keys.forEach(original => {
    let key = normalizeMembershipKey(original);
    if (!key) return;

    let explicitDrugKey = false;
    if (key.startsWith('drug:')) {
      explicitDrugKey = true;
      key = key.slice(5);
    }
    if (key.startsWith('registry:')) {
      const registry = key.slice(9).match(/^\d+$/)?.[0];
      if (registry) registryNumbers.add(registry);
      return;
    }

    const parts = key.split('|').map(clean);
    const first = parts[0] || '';
    if (!first) return;

    // Canonical Favorites are stored as PDID|trade name|strength. PDID is a
    // string identifier: it may be short numeric (for example "300") or an
    // editorial identifier (for example "EDITOR-ORS-2026"). Never reinterpret
    // the first component of a composite key as registry_number.
    if (parts.length >= 3 || explicitDrugKey) {
      pdids.add(first);
      return;
    }

    // Older one-part numeric keys were sometimes registry numbers and sometimes
    // PDIDs, so query both targeted indexes and let exactMembershipMatch choose
    // the correct row. Text one-part keys can still be an editorial PDID.
    if (parts.length === 1) {
      pdids.add(first);
      if (/^\d+$/.test(first)) registryNumbers.add(first);
      return;
    }

    // Two-part legacy keys are ambiguous (registry|name or name|ATC). Numeric
    // prefixes remain bounded to both indexed paths; non-numeric prefixes may be
    // historical PDIDs. Exact identity validation below prevents false matches.
    pdids.add(first);
    if (/^\d+$/.test(first)) registryNumbers.add(first);
  });

  return { pdids:[...pdids], registryNumbers:[...registryNumbers] };
}

function inFilter(values) {
  return `in.(${values.join(',')})`;
}

async function fetchDrugsBy(column, values) {
  if (!values.length) return [];
  const output = [];
  for (let index = 0; index < values.length; index += 100) {
    const batch = values.slice(index, index + 100);
    const params = new URLSearchParams();
    params.set('select', DRUG_SELECT);
    params.set(column, inFilter(batch));
    params.set('is_published', 'eq.true');
    params.set('editorial_status', 'eq.published');
    params.set('order', 'registry_number.asc');
    params.set('limit', String(Math.min(MAX_TARGETED_DRUG_ROWS, Math.max(batch.length * 8, 50))));
    const { data } = await neonRequest(`drugs?${params.toString()}`, {
      timeoutMs:5000,
      label:`Personal registry ${column} lookup`,
    });
    if (Array.isArray(data)) output.push(...data);
  }
  return output;
}

function legacyCandidates(row) {
  const nr = clean(row?.registry_number);
  const pdid = clean(row?.pdid);
  const name = clean(row?.trade_name);
  const strength = clean(row?.strength);
  const atc = clean(row?.atc_code).toUpperCase();
  const key = [pdid, name, strength].join('|');
  const values = new Set();
  const add = value => { const item = clean(value); if (item) values.add(item); };
  add(key);
  add(nr);
  add(name);
  if (nr && name) add(`${nr}|${name}`);
  if (name && atc) add(`${name}|${atc}`);
  if (nr) add(`registry:${nr}`);
  if (key.replace(/\|/g, '')) add(`drug:${key}`.slice(0, 300));
  if (name || atc) add(`fallback:${name}|${atc}`.slice(0, 300));
  return values;
}

function exactMembershipMatch(row, wanted) {
  for (const candidate of legacyCandidates(row)) {
    if (wanted.has(candidate)) return true;
  }
  return false;
}

async function resolvePersonalDrugRows(request, mode) {
  const normalizedMode = mode === 'notes' ? 'notes' : 'favorites';
  const user = await UserStore.userFromSession(request);
  const storageUid = UserIdentity.storageUidFromUser(user);
  if (!storageUid) throw new PersonalRegistryError(401, 'Kërkohet autentikim.', 'AUTH_REQUIRED');

  const legacyKeys = await membershipKeysForUser(storageUid, normalizedMode);
  const authUid = normalizedMode === 'notes'
    ? (clean(user?.authUid) || await authUidForRequest(request))
    : '';
  const nativeKeys = normalizedMode === 'notes' ? await nativeNoteKeysForUser(authUid) : [];
  const keys = [...new Set([...legacyKeys, ...nativeKeys])];
  if (!keys.length) return { user, mode:normalizedMode, keys:[], rows:[] };

  const wanted = new Set(keys);
  const hints = lookupHints(keys);
  const [byPdid, byRegistry] = await Promise.all([
    fetchDrugsBy('pdid', hints.pdids),
    fetchDrugsBy('registry_number', hints.registryNumbers),
  ]);

  const unique = new Map();
  [...byPdid, ...byRegistry].forEach(row => {
    const id = clean(row?.id);
    if (id && !unique.has(id)) unique.set(id, row);
  });
  const rows = [...unique.values()].filter(row => exactMembershipMatch(row, wanted));

  return { user, mode:normalizedMode, keys, rows };
}

module.exports = {
  NOTE_ENTITY_PREFIX,
  PersonalRegistryError,
  normalizeMembershipKey,
  membershipKeysForUser,
  nativeNoteKeysForUser,
  lookupHints,
  legacyCandidates,
  exactMembershipMatch,
  resolvePersonalDrugRows,
  _test:{ DRUG_SELECT, isLiveNote },
};
