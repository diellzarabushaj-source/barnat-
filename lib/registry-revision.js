'use strict';

const { neonRequest } = require('./neon-data-api.js');
const NeonResilience = require('./neon-resilience.js');

const REVISION_CACHE_MS = 15 * 1000;
const QUERY_TIMEOUT_MS = 4000;
let cachedRevision = '';
let cachedAt = 0;
let pendingRevision = null;

const clean = value => String(value ?? '').trim();

async function requestLatestDrugRevision() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  try {
    const path = 'drugs?select=updated_at'
      + '&is_published=eq.true'
      + '&editorial_status=eq.published'
      + `&order=${encodeURIComponent('updated_at.desc')}`
      + '&limit=1';
    const { data } = await neonRequest(path, { signal:controller.signal });
    const row = Array.isArray(data) ? data[0] : null;
    return clean(row?.updated_at);
  } finally {
    clearTimeout(timer);
  }
}

async function getRegistryRevision(options = {}) {
  const now = Date.now();
  const maxAge = Number.isFinite(Number(options.maxAgeMs))
    ? Math.max(0, Number(options.maxAgeMs))
    : REVISION_CACHE_MS;

  if (!options.force && cachedRevision && now - cachedAt < maxAge) return cachedRevision;
  if (pendingRevision) return pendingRevision;

  pendingRevision = requestLatestDrugRevision()
    .then(revision => {
      if (revision) cachedRevision = revision;
      cachedAt = Date.now();
      return cachedRevision || 'unversioned';
    })
    .catch(error => {
      if (NeonResilience.isUnavailable(error)) {
        cachedRevision = cachedRevision || 'unversioned';
        cachedAt = Date.now() + NeonResilience.retryAfterSeconds(error) * 1000;
        NeonResilience.safeLog('Registry revision check paused', error);
        return cachedRevision;
      }
      cachedAt = Date.now();
      if (cachedRevision) return cachedRevision;
      console.error('Registry revision check failed:', error);
      return 'unversioned';
    })
    .finally(() => { pendingRevision = null; });

  return pendingRevision;
}

function resetRegistryRevisionCache() {
  cachedRevision = '';
  cachedAt = 0;
  pendingRevision = null;
}

module.exports = {
  REVISION_CACHE_MS,
  getRegistryRevision,
  resetRegistryRevisionCache,
  _test:{ requestLatestDrugRevision },
};
