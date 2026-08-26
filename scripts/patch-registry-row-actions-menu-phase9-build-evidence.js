'use strict';

/* Phase 9 — deterministic build evidence.
 *
 * Phase 7 fingerprints the final browser assets and Phase 8 can attest those
 * assets after deployment. Phase 9 bridges the two by writing a deterministic
 * build-evidence sidecar that binds the Phase 7 manifest to the exact release
 * gates that produced it. It does not mutate any browser/runtime asset.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'registry-row-actions-build-evidence.json');
const RELEASE_MANIFEST = 'registry-row-actions-release.json';
const PHASE = 'registry-row-actions-menu-phase9-v1';

const GATE_INPUTS = [
  'release-markers/registry-row-actions-menu-phase5.txt',
  'release-markers/registry-row-actions-menu-phase6.txt',
  'release-markers/registry-row-actions-menu-phase7.txt',
  'release-markers/registry-row-actions-menu-phase8.txt',
  'scripts/patch-registry-row-actions-menu-phase5-release-gate.js',
  'scripts/patch-registry-row-actions-menu-phase6-idempotence-gate.js',
  'scripts/patch-registry-row-actions-menu-phase7-provenance.js',
  'scripts/audit-registry-row-actions-deployment.js',
  'scripts/patch-registry-personal-final.js',
];

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const marker = read('release-markers/registry-row-actions-menu-phase9.txt');
if (!marker.includes(PHASE)) {
  throw new Error('Row actions Phase 9 requires its build-evidence release marker.');
}

const releaseRaw = read(RELEASE_MANIFEST);
const release = JSON.parse(releaseRaw);
if (release.schema !== 'medindex.registry.row-actions.release.v1'
  || release.release !== 'registry-row-actions-menu-phase7-v1') {
  throw new Error('Row actions Phase 9 requires a valid Phase 7 release manifest.');
}
if (release.runtime?.personalizationVersion !== 'registry-user-personalization-v3.3.0'
  || release.contracts?.frozenMobilePersonalization !== true
  || release.contracts?.deterministicDoubleBuild !== true) {
  throw new Error('Row actions Phase 9 refuses evidence for an unfrozen or non-deterministic runtime.');
}

for (const [file, metadata] of Object.entries(release.assets || {})) {
  if (!metadata || metadata.sha256 !== sha256(read(file))) {
    throw new Error(`Row actions Phase 9 detected final asset drift before evidence publication: ${file}`);
  }
}

const gateFingerprints = Object.fromEntries(
  GATE_INPUTS.map(file => [file, { sha256:sha256(read(file)) }])
);

const evidence = {
  schema:'medindex.registry.row-actions.build-evidence.v1',
  phase:PHASE,
  sourceRevision:release.sourceRevision ?? null,
  releaseManifest:{
    path:RELEASE_MANIFEST,
    sha256:sha256(releaseRaw),
    schema:release.schema,
    release:release.release,
  },
  runtime:release.runtime,
  contracts:{
    ...release.contracts,
    remoteDeploymentAttestationAvailable:true,
    deterministicBuildEvidence:true,
    finalEvidenceRefreshOwnerBound:true,
    browserRuntimeMutatedByPhase9:false,
  },
  assets:release.assets,
  gateFingerprints,
};

fs.writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-row-actions-menu-phase9-build-evidence-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
console.log(`Registry row actions Phase 9: deterministic build evidence written to ${path.basename(OUT)}.`);