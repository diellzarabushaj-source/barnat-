'use strict';

const MAX_BATCH_SIZE = 500;

function clean(value) {
  return String(value ?? '').normalize('NFC').trim();
}

function rawCanonicalKey(item) {
  if (typeof item === 'string' || typeof item === 'number') return item;
  if (!item || typeof item !== 'object') return '';
  return item.canonicalKey
    ?? item.canonical_key
    ?? item.key
    ?? item.name
    ?? item.canonicalName
    ?? item.canonical_name
    ?? '';
}

function stableKey(item) {
  return clean(rawCanonicalKey(item))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function canonicalName(item) {
  if (typeof item === 'string' || typeof item === 'number') return clean(item);
  if (!item || typeof item !== 'object') return '';
  return clean(
    item.canonicalName
    ?? item.canonical_name
    ?? item.name
    ?? item.label
    ?? item.canonicalKey
    ?? item.canonical_key
    ?? item.key
    ?? ''
  );
}

function conceptId(item) {
  if (!item || typeof item !== 'object') return null;
  const value = item.conceptId ?? item.concept_id ?? item.id ?? null;
  return value === null || value === undefined || clean(value) === '' ? null : value;
}

function compareStable(a, b) {
  if (a.canonicalKey < b.canonicalKey) return -1;
  if (a.canonicalKey > b.canonicalKey) return 1;
  const aConcept = clean(a.conceptId);
  const bConcept = clean(b.conceptId);
  if (aConcept < bConcept) return -1;
  if (aConcept > bConcept) return 1;
  return 0;
}

function normalizedLimit(limit) {
  const value = Number(limit);
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_BATCH_SIZE}`);
  }
  return value;
}

function normalizeCanonicalRows(canonicalSubstances) {
  if (!Array.isArray(canonicalSubstances)) throw new TypeError('canonicalSubstances must be an array');

  const seen = new Set();
  const rows = [];

  for (const item of canonicalSubstances) {
    const row = {
      canonicalKey:stableKey(item),
      canonicalName:canonicalName(item),
      conceptId:conceptId(item),
    };
    if (!row.canonicalKey || !row.canonicalName) continue;
    if (seen.has(row.canonicalKey)) continue;
    seen.add(row.canonicalKey);
    rows.push(row);
  }

  return rows.sort(compareStable);
}

function buildDiscoveryQueue(canonicalSubstances, alreadyCovered = [], limit = 100) {
  const take = normalizedLimit(limit);
  if (!Array.isArray(alreadyCovered)) throw new TypeError('alreadyCovered must be an array');

  const covered = new Set(alreadyCovered.map(stableKey).filter(Boolean));
  const canonical = normalizeCanonicalRows(canonicalSubstances);

  return canonical
    .filter(item => !covered.has(item.canonicalKey))
    .slice(0, take)
    .map((item,index) => ({
      ordinal:index + 1,
      ...item,
      status:'source_discovery_pending',
      preferredSourceOrder:['EMA','EMC','AEMPS_CIMA','EU_OTHER','KOSOVO','MEDIATELY_CROSSCHECK','FALLBACK'],
      publicationAllowed:false,
    }));
}

function buildDiscoveryBatch(canonicalSubstances, alreadyCovered = [], limit = 100) {
  const take = normalizedLimit(limit);
  if (!Array.isArray(alreadyCovered)) throw new TypeError('alreadyCovered must be an array');

  const canonical = normalizeCanonicalRows(canonicalSubstances);
  const coveredKeys = new Set(alreadyCovered.map(stableKey).filter(Boolean));
  const excludedCanonicalCount = canonical.filter(item => coveredKeys.has(item.canonicalKey)).length;
  const queue = canonical
    .filter(item => !coveredKeys.has(item.canonicalKey))
    .slice(0, take)
    .map((item,index) => ({
      ordinal:index + 1,
      ...item,
      status:'source_discovery_pending',
      preferredSourceOrder:['EMA','EMC','AEMPS_CIMA','EU_OTHER','KOSOVO','MEDIATELY_CROSSCHECK','FALLBACK'],
      publicationAllowed:false,
    }));

  return {
    schemaVersion:'drx-source-discovery-batch-v1',
    requestedCount:take,
    canonicalCount:canonical.length,
    coveredInputCount:coveredKeys.size,
    excludedCanonicalCount,
    uncoveredAvailableCount:canonical.length - excludedCanonicalCount,
    queuedCount:queue.length,
    complete:queue.length === take,
    publicationAllowed:false,
    queue,
  };
}

module.exports = {
  MAX_BATCH_SIZE,
  buildDiscoveryQueue,
  buildDiscoveryBatch,
  normalizeCanonicalRows,
  _test:{ clean, stableKey, canonicalName, conceptId, compareStable, normalizedLimit },
};
