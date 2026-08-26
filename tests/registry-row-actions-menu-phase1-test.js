'use strict';

// Production validation trigger: Phase 1 canonical row-actions foundation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const syntax = file => execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
const phase6Probe = process.env.MEDINDEX_ROW_ACTIONS_PHASE6_PROBE === '1';

['registry-desktop-lite.js', 'registry-unified-table.js'].forEach(syntax);

const desktop = read('registry-desktop-lite.js');
const unified = read('registry-unified-table.js');
const personal = read('registry-user-personalization.js');
const css = read('registry-user-personalization.css');

assert.match(desktop, /registry-row-actions-menu-phase1-v1/);
assert.match(desktop, /data-row-actions-menu="true"/,
  'Desktop-lite must render the canonical three-dot trigger in the initial row markup.');
assert.match(desktop, /class="drug-name-layout"/,
  'Desktop-lite trade-name markup must own a stable action layout from first render.');
assert.match(desktop, /data-drug-key="\$\{escapeHtml\(key\)\}"/,
  'The canonical trigger must carry the exact row drug key without waiting for personalization.');
assert.match(desktop, /aria-haspopup="menu"/);
assert.match(desktop, /aria-expanded="false"/);

assert.match(unified, /registry-row-actions-menu-phase1-v1/);
assert.match(unified, /function ensureCanonicalRowActions\(row\)/,
  'Unified-table reconciliation must preserve the trigger through rerenders and handoffs.');
assert.match(unified, /ensureCanonicalRowActions\(row\);/);
assert.match(unified, /host\.querySelector\('\[data-row-actions-menu\]'\)/);
assert.match(unified, /button\.dataset\.drugKey = key/);
assert.match(unified, /button\.dataset\.registryNumber = registryNumber/);

assert.match(css, /registry-row-actions-menu-phase1-v1/);
assert.match(css, /\.registry-row-more-toggle/);
assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto/,
  'Trade name must retain the available width while actions occupy only their own width.');

if (phase6Probe) {
  // Phase 6 re-enters the complete chain against the already-final output. The
  // migration-only fallback state must not be reconstructed on that second pass.
  assert.match(desktop, /aria-haspopup="menu" aria-expanded="false" aria-controls="registryRowActionsMenu"[^>]*>⋯<\/button>/,
    'Phase 6 re-entry must preserve the visible first-render singleton trigger.');
  assert.match(unified, /button\.hidden = false/,
    'Phase 6 re-entry must keep unified canonical triggers visible.');
  assert.match(unified, /button\.removeAttribute\('aria-hidden'\)/);
  assert.doesNotMatch(personal, /function favoriteButton\(/);
  assert.doesNotMatch(personal, /function noteButton\(/);
  assert.doesNotMatch(personal, /data-row-favorite-toggle/);
  assert.doesNotMatch(personal, /data-row-note-toggle/);
  assert.match(personal, /menu\.id = 'registryRowActionsMenu'/);
  assert.match(personal, /tbody\.addEventListener\('click', handleTableActionsClick\)/);
  console.log('✓ Registry row actions Phase 1 re-entry passed for Phase 6: final singleton ownership remains intact and migration fallback controls do not return.');
} else {
  assert.match(desktop, /aria-hidden="true" hidden>⋯<\/button>/,
    'Phase 1 trigger must stay hidden until Phase 2 wires the singleton menu.');
  assert.match(unified, /button\.hidden = true/,
    'Unified rows must not expose an unwired menu during the migration phase.');

  // Phase 1 is deliberately migration-safe: existing actions remain available
  // until the singleton menu in Phase 2 owns their behavior.
  assert.match(personal, /function favoriteButton\(row\)/);
  assert.match(personal, /function noteButton\(row\)/);
  assert.match(personal, /data-row-favorite-toggle/);
  assert.match(personal, /data-row-note-toggle/);
  console.log('✓ Registry row actions Phase 1 passed: the canonical row owns a stable hidden ⋯ trigger from first render and legacy Favorite/Note controls remain functional until menu cutover.');
}
