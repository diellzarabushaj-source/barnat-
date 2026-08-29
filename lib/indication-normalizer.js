'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CATALOG_PATH = path.join(__dirname, '..', 'data', 'drx-indication-catalog-v1.json');

function loadCatalog(filePath = DEFAULT_CATALOG_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildAliasIndex(catalog = loadCatalog()) {
  const index = new Map();
  for (const indication of catalog.indications || []) {
    const values = [indication.canonicalName, ...(indication.synonyms || [])];
    for (const value of values) {
      const key = normalizeText(value);
      if (!key) continue;
      const existing = index.get(key);
      if (existing && existing.indicationKey !== indication.indicationKey) {
        const error = new Error(`Indication alias collision: ${value}`);
        error.code = 'INDICATION_ALIAS_COLLISION';
        throw error;
      }
      index.set(key, indication);
    }
  }
  return index;
}

function resolveIndication(value, catalog = loadCatalog()) {
  const normalized = normalizeText(value);
  if (!normalized) return { matched:false, reason:'empty_indication', normalized, indication:null };
  const indication = buildAliasIndex(catalog).get(normalized) || null;
  if (!indication) return { matched:false, reason:'no_exact_alias', normalized, indication:null };
  return {
    matched:true,
    reason:'exact_alias',
    normalized,
    indication,
  };
}

function verifiedIcdCodes(indication) {
  return (Array.isArray(indication?.icd10) ? indication.icd10 : [])
    .filter(item => item && item.status === 'verified' && /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/.test(String(item.code || '')))
    .map(item => String(item.code));
}

function publicationDecision(value, catalog = loadCatalog()) {
  const resolved = resolveIndication(value, catalog);
  if (!resolved.matched) return { allowed:false, reason:resolved.reason, resolved };
  const codes = verifiedIcdCodes(resolved.indication);
  if (catalog.policy?.requireVerifiedIcdForPublication && codes.length === 0) {
    return { allowed:false, reason:'verified_icd_required', resolved, verifiedIcdCodes:[] };
  }
  return { allowed:true, reason:'indication_verified', resolved, verifiedIcdCodes:codes };
}

module.exports = {
  DEFAULT_CATALOG_PATH,
  loadCatalog,
  normalizeText,
  buildAliasIndex,
  resolveIndication,
  verifiedIcdCodes,
  publicationDecision,
};
