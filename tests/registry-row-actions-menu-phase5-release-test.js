'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const syntax = file => execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

for (const file of ['registry-user-personalization.js', 'registry-desktop-lite.js', 'registry-unified-table.js']) syntax(file);

const personal = read('registry-user-personalization.js');
const desktop = read('registry-desktop-lite.js');
const unified = read('registry-unified-table.js');
const css = read('registry-user-personalization.css');
const chain = read('scripts/patch-registry-row-actions-menu-phase1.js');
const gate = read('scripts/patch-registry-row-actions-menu-phase5-release-gate.js');
const marker = read('release-markers/registry-row-actions-menu-phase5.txt');

assert.match(marker, /^registry-row-actions-menu-phase5-v1$/m);
assert.match(marker, /^final-singleton-release-gate$/m);
assert.match(marker, /^frozen-mobile-v3\.3\.0$/m);
assert.match(marker, /^full-runtime-pagination-owner-required$/m);

assert.match(chain, /require\('\.\/patch-registry-row-actions-first-render-aria\.js'\);[\s\S]*?require\('\.\/patch-registry-row-actions-menu-phase5-release-gate\.js'\);/,
  'Phase 5 release gate must run after the final first-render ARIA hardening patch.');
assert.match(gate, /registry-row-actions-menu-phase3-test\.js/,
  'Release gate must re-run the final semantic/accessibility singleton contract.');
assert.match(gate, /full-runtime-pagination-owner-test\.js/,
  'Release gate must include the full-runtime pagination ownership invariant.');
assert.match(gate, /registry-row-actions-menu-phase5-release-test\.js/,
  'Release gate must run its exact final-output freeze test.');

assert.match(personal, /registry-row-actions-menu-phase2-v1/);
assert.match(personal, /registry-row-actions-menu-phase3-v1: accessible desktop menu hardening/);
assert.equal((personal.match(/menu\.id = 'registryRowActionsMenu'/g) || []).length, 1,
  'Exactly one singleton row-actions menu owner is allowed.');
assert.equal((personal.match(/tbody\.addEventListener\('click', handleTableActionsClick\)/g) || []).length, 1,
  'Exactly one delegated #tbody row-actions click owner is allowed.');
assert.doesNotMatch(personal, /function favoriteButton\(/);
assert.doesNotMatch(personal, /function noteButton\(/);
assert.doesNotMatch(personal, /data-row-favorite-toggle/);
assert.doesNotMatch(personal, /data-row-note-toggle/);
assert.match(personal, /data-row-menu-favorite/);
assert.match(personal, /data-row-menu-note/);
assert.match(personal, /toggleFavorite\(row, menuFavorite\)/);
assert.match(personal, /openNoteDialog\(row\)/);

assert.match(personal, /async function toggleFavorite\([\s\S]*?favoriteKeys\.(?:add|delete)\(key\)[\s\S]*?await syncMutation\('favorite', key\)/,
  'Favorite persistence must remain optimistic/local-first before network sync.');
assert.match(personal, /trigger\.setAttribute\('aria-controls', 'registryRowActionsMenu'\)/);
assert.match(personal, /\['Enter', ' ', 'ArrowDown', 'ArrowUp'\]\.includes\(event\.key\)/);
assert.match(personal, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]\.includes\(event\.key\)/);
assert.match(personal, /closeActionsMenu\(\{ restoreFocus:true \}\)/);
assert.match(personal, /const VERSION = 'registry-user-personalization-v3\.3\.0'/,
  'Phone-owner personalization runtime version is frozen at v3.3.0.');
assert.match(personal, /const PHONE_OWNER_QUERY = '\(max-width: 767px\)'/);
assert.match(personal, /function phoneLiteOwnsViewport\(\)/);

const triggerContract = /data-row-actions-menu="true"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="registryRowActionsMenu"[^>]*>⋯<\/button>/;
assert.match(desktop, /registry-row-actions-first-render-aria-v1/);
assert.match(unified, /registry-row-actions-first-render-aria-v1/);
assert.match(desktop, triggerContract,
  'Desktop canonical ⋯ must reference the singleton from first render.');
assert.match(unified, triggerContract,
  'Unified canonical ⋯ must reference the singleton from first render.');
assert.match(unified, /button\.setAttribute\('aria-controls', 'registryRowActionsMenu'\)/,
  'Unified dynamic/reconciled triggers must retain singleton ownership.');

assert.match(css, /\.registry-row-actions-menu/);
assert.match(css, /\.registry-row-more-toggle/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /@media \(max-width:767px\)[\s\S]*?\.registry-row-actions-menu[\s\S]*?display:none/,
  'Desktop row-actions menu must remain outside the frozen phone owner.');

console.log('✓ Registry row actions Phase 5 release gate passed: singleton ownership, optimistic Favorite/Note persistence, ARIA/keyboard hardening, first-render trigger ownership, frozen mobile v3.3.0, and pagination-owner dependency are locked.');
