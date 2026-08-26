'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const marker = read('release-markers/registry-row-actions-menu-phase9.txt');
const phase7 = read('scripts/patch-registry-row-actions-menu-phase7-provenance.js');
const releaseRaw = read('registry-row-actions-release.json');
const release = JSON.parse(releaseRaw);
const evidenceRaw = read('registry-row-actions-build-evidence.json');
const evidence = JSON.parse(evidenceRaw);

assert.match(marker, /^registry-row-actions-menu-phase9-v1$/m);
assert.match(marker, /^build-evidence-sidecar$/m);
assert.match(marker, /^release-manifest-digest$/m);
assert.match(marker, /^final-asset-hash-chain$/m);
assert.match(marker, /^gate-fingerprints-phase5-through-phase8$/m);
assert.match(marker, /^optional-build-commit-identity$/m);
assert.match(marker, /^no-runtime-ui-mutation$/m);
assert.match(marker, /^main-release-chain-phase1-through-phase9$/m,
  'Phase 9 is complete only when the full row-actions Phase 1→9 release chain is integrated in main.');

assert.match(
  phase7,
  /deploy-verifiable provenance written[\s\S]*?require\('\.\/patch-registry-row-actions-menu-phase9-build-evidence\.js'\);/,
  'Phase 9 build evidence must run only after Phase 7 has written and validated release provenance.'
);

assert.equal(evidence.schema, 'medindex.registry.row-actions.build-evidence.v1');
assert.equal(evidence.phase, 'registry-row-actions-menu-phase9-v1');
assert.equal(evidence.sourceRevision, release.sourceRevision ?? null);
assert.deepEqual(evidence.releaseManifest, {
  path:'registry-row-actions-release.json',
  sha256:sha256(releaseRaw),
  schema:'medindex.registry.row-actions.release.v1',
  release:'registry-row-actions-menu-phase7-v1',
});
assert.deepEqual(evidence.runtime, release.runtime,
  'Build evidence must bind to the exact Phase 7 runtime identity.');
assert.equal(evidence.contracts.singletonMenu, true);
assert.equal(evidence.contracts.delegatedTableListener, true);
assert.equal(evidence.contracts.legacyRowFavoriteNoteControls, false);
assert.equal(evidence.contracts.frozenMobilePersonalization, true);
assert.equal(evidence.contracts.deterministicDoubleBuild, true);
assert.equal(evidence.contracts.remoteDeploymentAttestationAvailable, true);
assert.equal(evidence.contracts.deterministicBuildEvidence, true);
assert.equal(evidence.contracts.browserRuntimeMutatedByPhase9, false);
assert.deepEqual(evidence.assets, release.assets,
  'Build evidence must carry the exact asset hash chain already frozen by Phase 7.');

for (const [file, metadata] of Object.entries(evidence.assets || {})) {
  assert.equal(metadata?.sha256, sha256(read(file)),
    `Phase 9 asset evidence must match the generated ${file}.`);
}

const gateInputs = [
  'release-markers/registry-row-actions-menu-phase5.txt',
  'release-markers/registry-row-actions-menu-phase6.txt',
  'release-markers/registry-row-actions-menu-phase7.txt',
  'release-markers/registry-row-actions-menu-phase8.txt',
  'scripts/patch-registry-row-actions-menu-phase5-release-gate.js',
  'scripts/patch-registry-row-actions-menu-phase6-idempotence-gate.js',
  'scripts/patch-registry-row-actions-menu-phase7-provenance.js',
  'scripts/audit-registry-row-actions-deployment.js',
];
for (const file of gateInputs) {
  assert.equal(evidence.gateFingerprints?.[file]?.sha256, sha256(read(file)),
    `Phase 9 must fingerprint release gate input ${file}.`);
}

assert.ok(evidence.sourceRevision === null || /^[0-9a-f]{7,64}$/.test(evidence.sourceRevision),
  'Build evidence may expose only a public Git commit identity or null.');
assert.doesNotMatch(evidenceRaw, /"(?:createdAt|generatedAt|timestamp)"\s*:/i,
  'Build evidence must remain deterministic and must not contain wall-clock timestamps.');

console.log('✓ Registry row actions Phase 9 passed: build evidence binds the Phase 7 manifest, final asset hashes, Phase 5–8 gate fingerprints and optional commit identity without mutating browser runtime output; the complete Phase 1→9 release chain is integrated in main.');
