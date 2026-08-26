'use strict';

/* Phase 8 — remote deployment attestation.
 *
 * Given a deployed base URL and an expected Git SHA, verify that the Phase 7
 * release manifest belongs to that revision and that every live row-actions
 * asset hashes to the exact value recorded by the manifest. This is read-only
 * and intentionally accepts plain HTTP only for localhost test fixtures.
 */

const crypto = require('node:crypto');

const RELEASE = 'registry-row-actions-menu-phase7-v1';
const SCHEMA = 'medindex.registry.row-actions.release.v1';
const REQUIRED_ASSETS = [
  'registry-user-personalization.js',
  'registry-user-personalization.css',
  'registry-desktop-lite.js',
  'registry-unified-table.js',
];

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function normalizeBaseUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); }
  catch { throw new Error('Deployment attestation requires a valid base URL.'); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('Deployment attestation allows HTTPS only, except localhost test fixtures.');
  }
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function normalizeExpectedSha(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!/^[0-9a-f]{7,64}$/.test(value)) {
    throw new Error('Expected deployment SHA must be a 7–64 character hexadecimal Git revision.');
  }
  return value;
}

async function fetchBytes(url, fetchImpl) {
  const response = await fetchImpl(url, { redirect:'follow', cache:'no-store' });
  if (!response.ok) throw new Error(`Deployment attestation fetch failed (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function auditDeployment({ baseUrl, expectedSha, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Deployment attestation requires Fetch API support.');
  const base = normalizeBaseUrl(baseUrl);
  const expected = normalizeExpectedSha(expectedSha);
  const manifestUrl = new URL('registry-row-actions-release.json', base);
  const manifestBytes = await fetchBytes(manifestUrl, fetchImpl);

  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); }
  catch { throw new Error('Deployment attestation received an invalid Phase 7 release manifest.'); }

  if (manifest.schema !== SCHEMA || manifest.release !== RELEASE) {
    throw new Error('Deployment attestation found an unknown or stale row-actions release manifest.');
  }
  const deployedRevision = String(manifest.sourceRevision || '').toLowerCase();
  if (!/^[0-9a-f]{7,64}$/.test(deployedRevision)) {
    throw new Error('Deployment attestation manifest does not expose a valid build commit identity.');
  }
  if (!deployedRevision.startsWith(expected)) {
    throw new Error(`Deployment attestation commit mismatch: expected ${expected}, found ${deployedRevision}.`);
  }
  if (manifest.runtime?.personalizationVersion !== 'registry-user-personalization-v3.3.0') {
    throw new Error('Deployment attestation refused an unfrozen mobile personalization version.');
  }
  if (manifest.runtime?.singletonMenuId !== 'registryRowActionsMenu'
      || manifest.runtime?.delegatedTableOwner !== '#tbody'
      || manifest.runtime?.phoneOwnerQuery !== '(max-width: 767px)') {
    throw new Error('Deployment attestation found an unexpected row-actions ownership contract.');
  }
  if (manifest.contracts?.singletonMenu !== true
      || manifest.contracts?.delegatedTableListener !== true
      || manifest.contracts?.legacyRowFavoriteNoteControls !== false
      || manifest.contracts?.frozenMobilePersonalization !== true
      || manifest.contracts?.deterministicDoubleBuild !== true) {
    throw new Error('Deployment attestation found an incomplete Phase 7 release contract.');
  }

  const fetched = {};
  for (const file of REQUIRED_ASSETS) {
    const expectedHash = manifest.assets?.[file]?.sha256;
    if (!/^[0-9a-f]{64}$/.test(String(expectedHash || ''))) {
      throw new Error(`Deployment attestation manifest is missing a valid SHA-256 for ${file}.`);
    }
    const bytes = await fetchBytes(new URL(file, base), fetchImpl);
    const actualHash = sha256(bytes);
    if (actualHash !== expectedHash) {
      throw new Error(`Deployment attestation hash mismatch for ${file}: expected ${expectedHash}, found ${actualHash}.`);
    }
    fetched[file] = bytes;
  }

  const personal = fetched['registry-user-personalization.js'].toString('utf8');
  if ((personal.match(/menu\.id = 'registryRowActionsMenu'/g) || []).length !== 1) {
    throw new Error('Deployment attestation requires exactly one live singleton menu owner.');
  }
  if ((personal.match(/tbody\.addEventListener\('click', handleTableActionsClick\)/g) || []).length !== 1) {
    throw new Error('Deployment attestation requires exactly one live delegated tbody owner.');
  }
  if (/function favoriteButton\(|function noteButton\(|data-row-favorite-toggle|data-row-note-toggle/.test(personal)) {
    throw new Error('Deployment attestation found legacy per-row Favorite/Note controls in the live runtime.');
  }

  return {
    ok:true,
    baseUrl:base.href,
    sourceRevision:deployedRevision,
    release:manifest.release,
    assets:Object.fromEntries(REQUIRED_ASSETS.map(file => [file, manifest.assets[file].sha256])),
  };
}

async function main(argv = process.argv.slice(2)) {
  const [baseUrl, expectedSha] = argv;
  const result = await auditDeployment({ baseUrl, expectedSha });
  console.log(`✓ Registry row actions Phase 8 deployment attestation passed for ${result.sourceRevision} at ${result.baseUrl}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = { auditDeployment, normalizeBaseUrl, normalizeExpectedSha, REQUIRED_ASSETS };
