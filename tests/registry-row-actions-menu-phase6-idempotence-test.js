'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const files = [
  'registry-user-personalization.js',
  'registry-table-tools.css',
  'registry-desktop-lite.js',
  'registry-unified-table.js',
];

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const snapshot = () => Object.fromEntries(files.map(file => [file, { content:read(file), sha256:digest(read(file)) }]));

const marker = read('release-markers/registry-row-actions-menu-phase6.txt');
const chain = read('scripts/patch-registry-row-actions-menu-phase1.js');

assert.match(marker, /^registry-row-actions-menu-phase6-v1$/m);
assert.match(marker, /^double-build-idempotence-gate$/m);
assert.match(marker, /^no-duplicate-singleton-listener-css$/m);
assert.match(marker, /^frozen-mobile-v3\.3\.0$/m);
assert.match(
  chain,
  /require\('\.\/patch-registry-row-actions-menu-phase5-release-gate\.js'\);[\s\S]*?require\('\.\/patch-registry-row-actions-menu-phase6-idempotence-gate\.js'\);/,
  'Phase 6 idempotence gate must run after the final Phase 5 release/freeze gate.'
);

const before = snapshot();
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'patch-registry-row-actions-menu-phase1.js')], {
  cwd:ROOT,
  stdio:'pipe',
  env:{ ...process.env, MEDINDEX_ROW_ACTIONS_PHASE6_PROBE:'1' },
});
const after = snapshot();

for (const file of files) {
  assert.equal(
    after[file].sha256,
    before[file].sha256,
    `Row-actions patch chain must be byte-idempotent for ${file}; second execution changed generated output.`
  );
}

const personal = after['registry-user-personalization.js'].content;
const css = after['registry-table-tools.css'].content;
const desktop = after['registry-desktop-lite.js'].content;
const unified = after['registry-unified-table.js'].content;

assert.equal((personal.match(/menu\.id = 'registryRowActionsMenu'/g) || []).length, 1,
  'Double build must still leave exactly one singleton row-actions menu owner.');
assert.equal((personal.match(/tbody\.addEventListener\('click', handleTableActionsClick\)/g) || []).length, 1,
  'Double build must still leave exactly one delegated tbody click owner.');
assert.equal((css.match(/\/\* registry-row-actions-menu-phase2-v1 \*\//g) || []).length, 1,
  'Double build must not duplicate Phase 2 row-actions CSS.');
assert.equal((css.match(/\/\* registry-row-actions-menu-phase3-v1 \*\//g) || []).length, 1,
  'Double build must not duplicate Phase 3 row-actions CSS.');
assert.equal((desktop.match(/registry-row-actions-first-render-aria-v1/g) || []).length, 1,
  'Double build must not duplicate desktop first-render ARIA hardening.');
assert.equal((unified.match(/registry-row-actions-first-render-aria-v1/g) || []).length, 1,
  'Double build must not duplicate unified first-render ARIA hardening.');
assert.doesNotMatch(personal, /function favoriteButton\(/);
assert.doesNotMatch(personal, /function noteButton\(/);
assert.doesNotMatch(personal, /data-row-favorite-toggle/);
assert.doesNotMatch(personal, /data-row-note-toggle/);
assert.match(personal, /const VERSION = 'registry-user-personalization-v3\.3\.0'/,
  'Double build must preserve the frozen mobile personalization version.');

console.log('✓ Registry row actions Phase 6 passed: the complete Phase 1→5 chain is byte-idempotent across a second execution, with one singleton menu, one delegated tbody owner, no duplicated CSS/ARIA markers, no legacy star/pencil controls, and frozen mobile v3.3.0 preserved.');
