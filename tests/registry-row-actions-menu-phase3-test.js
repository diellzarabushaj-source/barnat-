'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const syntax = file => execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

syntax('registry-user-personalization.js');

const personal = read('registry-user-personalization.js');
const css = read('registry-user-personalization.css');

assert.match(personal, /registry-row-actions-menu-phase3-v1: accessible desktop menu hardening/);
assert.match(personal, /role="menuitemcheckbox" aria-checked="false"/,
  'Favorite action must use checkbox-style menu semantics.');
assert.match(personal, /favoriteAction\.setAttribute\('aria-checked', String\(favoriteActive\)\)/);
assert.match(personal, /favoriteAction\.removeAttribute\('aria-pressed'\)/);
assert.match(personal, /noteAction\.removeAttribute\('aria-pressed'\)/);
assert.match(personal, /menu\.setAttribute\('aria-label', 'Veprimet për ' \+ \(profile\.name \|\| 'barin'\)\)/,
  'Singleton menu must expose the active medicine in its accessible label.');

assert.match(personal, /function rowActionsMenuItems\(menu\)/);
assert.match(personal, /\[role="menuitem"\],\[role="menuitemcheckbox"\]/);
assert.match(personal, /function focusRowActionsMenuItem\(menu, edge = 'first'\)/);
assert.match(personal, /\['Enter', ' ', 'ArrowDown', 'ArrowUp'\]\.includes\(event\.key\)/,
  'The stable ⋯ trigger must support menu-button keyboard opening.');
assert.match(personal, /event\.key === 'ArrowUp' \? 'last' : 'first'/);
assert.match(personal, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]\.includes\(event\.key\)/,
  'Menu items must support WAI-style directional and edge navigation.');
assert.match(personal, /closeActionsMenu\(\{ restoreFocus:true \}\)/,
  'Escape/toggle close must be able to restore focus to the stable ⋯ trigger.');
assert.match(personal, /document\.addEventListener\('focusin',[\s\S]*activeActionsTrigger\?\.contains\?\.\(event\.target\)/,
  'Tab/focus leaving the singleton menu must close it without trapping focus.');

assert.match(personal, /trigger\.setAttribute\('aria-controls', 'registryRowActionsMenu'\)/,
  'Every visible ⋯ trigger must explicitly control the singleton menu.');
assert.match(personal, /activeActionsRow && !activeActionsRow\.isConnected/,
  'A rerendered-away row must not leave an orphaned menu open.');
assert.match(personal, /menu\.dataset\.placement = placement/);
assert.match(personal, /placement = 'top'/);
assert.match(personal, /Math\.max\(edge, Math\.min\(left, window\.innerWidth - width - edge\)\)/,
  'Horizontal menu placement must remain clamped to the viewport.');
assert.match(personal, /Math\.max\(edge, Math\.min\(top, window\.innerHeight - height - edge\)\)/,
  'Vertical menu placement must remain clamped to the viewport.');

assert.equal(
  (personal.match(/tbody\.addEventListener\('click', handleTableActionsClick\)/g) || []).length,
  1,
  'Phase 3 must preserve the single delegated #tbody click owner.'
);
assert.equal(
  (personal.match(/menu\.id = 'registryRowActionsMenu'/g) || []).length,
  1,
  'Phase 3 must preserve one singleton row actions menu.'
);
assert.doesNotMatch(personal, /function favoriteButton\(/);
assert.doesNotMatch(personal, /function noteButton\(/);
assert.doesNotMatch(personal, /data-row-favorite-toggle/);
assert.doesNotMatch(personal, /data-row-note-toggle/);

assert.match(personal, /const VERSION = 'registry-user-personalization-v3\.3\.0'/,
  'Phase 3 must not move the frozen mobile personalization version.');
assert.match(personal, /const PHONE_OWNER_QUERY = '\(max-width: 767px\)'/);
assert.match(personal, /function phoneLiteOwnsViewport\(\)/);
assert.match(personal, /if \(phoneLiteOwnsViewport\(\)\) return;/);

assert.match(css, /\/\* registry-row-actions-menu-phase3-v1 \*\//);
assert.match(css, /\.registry-row-actions-menu\[data-placement="bottom"\]\{transform-origin:top right\}/);
assert.match(css, /\.registry-row-actions-menu\[data-placement="top"\]\{transform-origin:bottom right\}/);
assert.match(css, /menuitemcheckbox[^\n]*aria-checked="true"/);
assert.match(css, /\.registry-row-more-toggle\[aria-expanded="true"\]/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('✓ Registry row actions Phase 3 passed: semantic menu state, keyboard navigation, focus restore, viewport clamp/flip, rerender recovery, singleton ownership and frozen mobile contract.');
