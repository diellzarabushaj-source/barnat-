'use strict';

/* Phase 7 — deploy-verifiable release provenance.
 *
 * This phase intentionally does not mutate the row-actions runtime. After
 * Phase 5 has frozen behavior and Phase 6 has proven double-build idempotence,
 * it fingerprints the final assets into a deterministic JSON sidecar that can
 * be fetched from a deployed site. On CI/Vercel it also records the public Git
 * commit identity when one is available through standard build metadata.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'registry-row-actions-release.json');
const RELEASE = 'registry-row-actions-menu-phase7-v1';
const ASSETS = [
  'registry-user-personalization.js',
  'registry-table-tools.css',
  'registry-desktop-lite.js',
  'registry-unified-table.js',
];

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const personal = read('registry-user-personalization.js');
if (!personal.includes('registry-row-actions-menu-phase3-v1')) {
  throw new Error('Row actions Phase 7 requires the final Phase 3 singleton runtime.');
}
if (!read('release-markers/registry-row-actions-menu-phase5.txt').includes('registry-row-actions-menu-phase5-v1')) {
  throw new Error('Row actions Phase 7 requires the Phase 5 release freeze marker.');
}
if (!read('release-markers/registry-row-actions-menu-phase6.txt').includes('registry-row-actions-menu-phase6-v1')) {
  throw new Error('Row actions Phase 7 requires the Phase 6 deterministic-build marker.');
}

const version = personal.match(/const VERSION = '([^']+)'/)?.[1] || '';
if (version !== 'registry-user-personalization-v3.3.0') {
  throw new Error(`Row actions Phase 7 refuses to publish an unfrozen mobile personalization version: ${version || 'missing'}.`);
}

const rawRevision = String(
  process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.COMMIT_SHA
  || ''
).trim();
const sourceRevision = /^[0-9a-f]{7,64}$/i.test(rawRevision) ? rawRevision.toLowerCase() : null;

const assets = Object.fromEntries(ASSETS.map(file => [file, { sha256:sha256(read(file)) }]));
const manifest = {
  schema:'medindex.registry.row-actions.release.v1',
  release:RELEASE,
  sourceRevision,
  runtime:{
    personalizationVersion:version,
    triggerSelector:'[data-row-actions-menu]',
    singletonMenuId:'registryRowActionsMenu',
    delegatedTableOwner:'#tbody',
    phoneOwnerQuery:'(max-width: 767px)',
  },
  contracts:{
    singletonMenu:true,
    delegatedTableListener:true,
    legacyRowFavoriteNoteControls:false,
    frozenMobilePersonalization:true,
    deterministicDoubleBuild:true,
  },
  assets,
};

fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-row-actions-menu-phase7-provenance-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
console.log(`Registry row actions Phase 7: deploy-verifiable provenance written to ${path.basename(OUT)}.`);

// Phase 9 binds this already-validated manifest to the release-gate inputs and
// emits deterministic CI/deployment evidence without changing browser assets.
require('./patch-registry-row-actions-menu-phase9-build-evidence.js');
