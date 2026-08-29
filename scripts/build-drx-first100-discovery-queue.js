'use strict';

function clean(value) {
  return String(value || '').trim();
}

function stableKey(item) {
  return clean(item.canonicalKey || item.key || item.name || item.canonicalName).toLowerCase();
}

function buildDiscoveryQueue(canonicalSubstances, alreadyCovered, limit = 100) {
  if (!Array.isArray(canonicalSubstances)) throw new TypeError('canonicalSubstances must be an array');
  const covered = new Set((alreadyCovered || []).map(stableKey).filter(Boolean));
  const seen = new Set();

  return canonicalSubstances
    .map(item => ({
      canonicalKey:stableKey(item),
      canonicalName:clean(item.canonicalName || item.name || item.label || item.canonicalKey || item.key),
      conceptId:item.conceptId || item.id || null,
    }))
    .filter(item => item.canonicalKey && item.canonicalName)
    .filter(item => {
      if (covered.has(item.canonicalKey) || seen.has(item.canonicalKey)) return false;
      seen.add(item.canonicalKey);
      return true;
    })
    .sort((a,b) => a.canonicalKey.localeCompare(b.canonicalKey))
    .slice(0, limit)
    .map((item,index) => ({
      ordinal:index + 1,
      ...item,
      status:'source_discovery_pending',
      preferredSourceOrder:['EMA','EMC','AEMPS_CIMA','EU_OTHER','KOSOVO','MEDIATELY_CROSSCHECK','FALLBACK'],
      publicationAllowed:false,
    }));
}

module.exports = { buildDiscoveryQueue };
