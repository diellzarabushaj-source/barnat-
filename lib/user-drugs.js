'use strict';

// Personal drug entries. Every row belongs to exactly one user and is never visible
// to anyone else: the shared, official registry lives in `public.drugs` and stays
// admin-only. This module owns the personal-drug schema; `user-library.js` only
// transports it through the existing offline snapshot/sync contract.

const MAX_PERSONAL_DRUGS = 500;
const MAX_ITEM_BYTES = 32 * 1024;
const MAX_NAME_CHARS = 300;
const MAX_CLIENT_ID_CHARS = 160;

// Fixed field set with per-field limits. Unknown keys are dropped rather than
// stored, so a personal entry can never smuggle arbitrary structure into the
// database or into the registry rendering path.
const FIELDS = Object.freeze({
  activeSubstance:400,
  strength:200,
  form:200,
  manufacturer:200,
  atcCode:20,
  classification:200,
  indications:2000,
  adultDose:2000,
  pediatricDose:2000,
  contraindications:2000,
  notes:4000,
});

const FIELD_NAMES = Object.freeze(Object.keys(FIELDS));

class PersonalDrugError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.name = 'PersonalDrugError';
    this.status = status;
    this.code = code;
  }
}

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();

// A missing timestamp means "now", never the epoch: falling back to 0 would make a
// fresh entry look older than the stored row and the sync would silently drop it.
function validIso(value, fallback = nowIso()) {
  if (value === null || value === undefined || value === '') return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function timestamp(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Keeps only the known fields, trimmed to their limits, and drops empty ones so
// stored payloads stay small and predictable.
function normalizeFields(value) {
  const source = plainObject(value) ? value : {};
  const fields = {};
  for (const name of FIELD_NAMES) {
    const text = clean(source[name], FIELDS[name]);
    if (text) fields[name] = text;
  }
  return fields;
}

function assertItemSize(name, fields) {
  const size = Buffer.byteLength(JSON.stringify({ name, fields }), 'utf8');
  if (size > MAX_ITEM_BYTES) {
    throw new PersonalDrugError(413, 'Një bar personal është tepër i madh për ruajtje.', 'PERSONAL_DRUG_TOO_LARGE');
  }
}

function normalizedDrug(item) {
  const clientId = clean(item?.clientId, MAX_CLIENT_ID_CHARS);
  if (!clientId) throw new PersonalDrugError(400, 'Një bar personal nuk ka identifikues lokal.', 'PERSONAL_DRUG_ID_MISSING');
  const name = clean(item?.name, MAX_NAME_CHARS);
  if (!name) throw new PersonalDrugError(400, 'Bari personal duhet të ketë së paku emrin.', 'PERSONAL_DRUG_NAME_MISSING');
  const fields = normalizeFields(item?.fields);
  assertItemSize(name, fields);
  return { clientId, name, fields, clientUpdatedAt:validIso(item?.clientUpdatedAt) };
}

function normalizedDrugTombstone(item) {
  const clientId = clean(item?.clientId, MAX_CLIENT_ID_CHARS);
  if (!clientId) return null;
  return { clientId, deletedAt:validIso(item?.deletedAt) };
}

function mapDrug(row) {
  if (!row || row.deleted_at) return null;
  return {
    clientId:clean(row.client_id, MAX_CLIENT_ID_CHARS),
    name:clean(row.name, MAX_NAME_CHARS),
    fields:normalizeFields(row.payload),
    // Personal entries are unverified by definition; the UI must never present
    // them with the authority of the official registry.
    source:'personal',
    clientUpdatedAt:row.client_updated_at || row.updated_at || '',
    serverUpdatedAt:row.updated_at || '',
  };
}

function mapDrugTombstone(row) {
  return { clientId:clean(row.client_id, MAX_CLIENT_ID_CHARS), deletedAt:row.deleted_at };
}

function drugRecord(userId, item, now) {
  return {
    user_id:userId,
    client_id:item.clientId,
    name:item.name,
    payload:item.fields,
    client_updated_at:item.clientUpdatedAt,
    deleted_at:null,
    updated_at:now,
  };
}

// A tombstone keeps the row so other devices learn about the deletion, but clears
// the personal content instead of retaining it.
function drugTombstoneRecord(userId, item, now) {
  return {
    user_id:userId,
    client_id:item.clientId,
    name:'(fshirë)',
    payload:{},
    client_updated_at:item.deletedAt,
    deleted_at:item.deletedAt,
    updated_at:now,
  };
}

function assertWithinLimit(count) {
  if (count > MAX_PERSONAL_DRUGS) {
    throw new PersonalDrugError(
      413,
      `Biblioteka personale lejon maksimum ${MAX_PERSONAL_DRUGS} barna të shtuara nga ti.`,
      'PERSONAL_DRUG_LIMIT',
    );
  }
}

module.exports = {
  PersonalDrugError,
  FIELDS,
  FIELD_NAMES,
  MAX_PERSONAL_DRUGS,
  MAX_ITEM_BYTES,
  normalizeFields,
  normalizedDrug,
  normalizedDrugTombstone,
  mapDrug,
  mapDrugTombstone,
  drugRecord,
  drugTombstoneRecord,
  assertWithinLimit,
  _test:{ clean, validIso, timestamp, plainObject, assertItemSize },
};
