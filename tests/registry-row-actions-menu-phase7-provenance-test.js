'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const marker = read('release-markers/registry-row-actions-menu-phase7.txt');
const phase1Chain = read('scripts/patch-registry-row-actions-menu-phase1.js');
const phase6Gate = read('scripts/patch-registry-row-actions-menu-phase6-idempotence-gate.js');
const personal = read('registry-user-personalization.js');
const manifest = JSON.parse(read('registry-row-actions-release.json'));

assert.match(marker, /^registry-row-actions-menu-phase7-v1$/m);
assert.match(marker, /^runtime-release-provenance$/m);
assert.match(marker, /^sha256-final-assets$/m);
assert.match(marker, /^optional-deploy-commit-identity$/m);
assert.match(marker, /^frozen-mobile-v3\.3\.0$/m);

assert.match(phase1Chain, /require\('\.\/patch-registry-row-actions-menu-phase6-idempotence-gate\.js'\);/,
  'The canonical row-actions chain must reach Phase 6 before provenance handoff.');
assert.match(
  phase6Gate,
  /deterministic double-build gate passed[\s\S]*?require\('\.\/patch-registry-row-actions-menu-phase7-provenance\.js'\);/,
  'Phase 7 provenance must be generated only after Phase 6 deterministic-build validation.'
);

assert.equal(manifest.schema, 'medindex.registry.row-actions.release.v1');
assert.equal(manifest.release, 'registry-row-actions-menu-phase7-v1');
assert.ok(manifest.sourceRevision === null || /^[0-9a-f]{7,64}$/.test(manifest.sourceRevision),
  'Release provenance may expose only a public Git commit identity or null.');
assert.deepEqual(manifest.runtime, {
  personalizationVersion:'registry-user-personalization-v3.3.0',
  triggerSelector:'[data-row-actions-menu]',
  singletonMenuId:'registryRowActionsMenu',
  delegatedTableOwner:'#tbody',
  phoneOwnerQuery:'(max-width: 767px)',
});
assert.deepEqual(manifest.contracts, {
  singletonMenu:true,
  delegatedTableListener:true,
  legacyRowFavoriteNoteControls:false,
  frozenMobilePersonalization:true,
  deterministicDoubleBuild:true,
});

for (const file of [
  'registry-user-personalization.js',
  'registry-table-tools.css',
  'registry-desktop-lite.js',
  'registry-unified-table.js',
]) {
  assert.equal(manifest.assets?.[file]?.sha256, sha256(read(file)),
    `Phase 7 provenance hash must match the final generated ${file}.`);
}

assert.equal((personal.match(/menu\.id = 'registryRowActionsMenu'/g) || []).length, 1,
  'Provenance may only be published for exactly one singleton menu owner.');
assert.equal((personal.match(/tbody\.addEventListener\('click', handleTableActionsClick\)/g) || []).length, 1,
  'Provenance may only be published for exactly one delegated tbody owner.');
assert.doesNotMatch(personal, /function favoriteButton\(/);
assert.doesNotMatch(personal, /function noteButton\(/);
assert.doesNotMatch(personal, /data-row-favorite-toggle/);
assert.doesNotMatch(personal, /data-row-note-toggle/);

console.log('✓ Registry row actions Phase 7 passed: release provenance fingerprints the exact final runtime, exposes only optional public commit identity, preserves one singleton/delegated owner, excludes legacy row controls, and keeps mobile v3.3.0 frozen.');
