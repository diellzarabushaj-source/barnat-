'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const runtime = read('registry-unified-table.js');
const personal = read('registry-user-personalization.js');
const tableCss = read('registry-unified-table.css');
const index = read('index.html');
const accountGuard = read('user-library-account-guard.js');
const accountCss = read('user-library-account-guard.css');

const CANONICAL_RELEASE = 'registry-canonical-main-table-v1';
const VISIBLE_CONTRACT = 'registry-personal-visible-columns-v2';

// This test intentionally runs from boot-screen-test.js, the final package-test
// entry. It therefore audits the artifacts AFTER personal-final, PR157,
// prescription-freeze, shell-coherence and offline packaging have all composed.
assert.doesNotThrow(() => new Function(runtime), 'final registry runtime must remain valid JavaScript');
assert.match(runtime, new RegExp(`const VERSION = '${CANONICAL_RELEASE}'`), 'final runtime must retain the canonical table release');
assert.match(runtime, /const currentView = \(\) => 'full';/, 'final runtime must expose only the canonical main-table view');
assert.doesNotMatch(runtime, /function\s+buildToolbar\b/, 'no later build phase may restore the alternate clinical/full toolbar builder');
assert.doesNotMatch(runtime, /Fokus klinik|Tabela e plotë/, 'no later build phase may restore alternate-view labels');
assert.doesNotMatch(runtime, /tableWrap\.before\(replacement\)/, 'no later build phase may mount a replacement registry table toolbar');
assert.match(runtime, /MEDINDEX_MAIN_TABLE_CONTRACT/, 'Favorites/Notes must still consume the captured main-table contract after all later patches');
assert.match(runtime, /contractLocked\(\) \? new Set\(mainTableContract\(\)\.keys\)/, 'personal handoff must materialize only captured main-table columns');
assert.match(runtime, /registry-personal-same-table-v1: non-destructive contract visibility/, 'final runtime must retain non-destructive same-table visibility');

assert.match(personal, new RegExp(VISIBLE_CONTRACT), 'final personalization runtime must retain visible-only column capture');
assert.match(personal, /const seen = new Set\(\);/, 'final personalization runtime must deduplicate captured columns');
assert.match(personal, /style\.display !== 'none'/, 'display:none columns must remain excluded from Favorites/Notes contracts');
assert.match(personal, /style\.visibility !== 'hidden'/, 'visibility:hidden columns must remain excluded from Favorites/Notes contracts');
assert.match(personal, /rect\.width >= 1[\s\S]*rect\.height >= 1/, 'zero-box columns must remain excluded from Favorites/Notes contracts');
assert.match(personal, /cell\.getAttribute\('aria-hidden'\) !== 'true'/, 'aria-hidden columns must remain excluded from Favorites/Notes contracts');

const canonicalGuardIndex = tableCss.lastIndexOf(`/* ${CANONICAL_RELEASE} — one visible registry table owner. */`);
assert.ok(canonicalGuardIndex >= 0, 'final table CSS must contain the canonical owner guard');
assert.ok(canonicalGuardIndex > tableCss.lastIndexOf('display:flex!important'), 'canonical hide guard must win the final CSS cascade');
const cssTail = tableCss.slice(canonicalGuardIndex).trim();
assert.match(cssTail, /#registryViewToolbar\.registry-view-toolbar-unified,[\s\S]*?#registryViewToolbar,[\s\S]*?\.registry-view-toolbar-unified[\s\S]*?display:none!important/, 'final CSS tail must force-hide every retired registry view toolbar form');
assert.ok(cssTail.endsWith('}'), 'canonical toolbar guard must remain the final table CSS rule after full build composition');

assert.match(index, /data-registry-ux-view="full"/, 'final HTML must boot the canonical table directly');
assert.doesNotMatch(index, /data-registry-ux-view="clinical"/, 'final HTML must never boot the retired clinical projection');
assert.ok(index.includes(`registry-unified-table.css?v=${CANONICAL_RELEASE}`), 'final HTML must publish the canonical CSS release');
assert.ok(index.includes(`registry-unified-table.js?v=${CANONICAL_RELEASE}`), 'final HTML must publish the canonical JS release');

const accountGuardPosition = index.indexOf('user-library-account-guard.js');
const libraryClientPosition = index.indexOf('user-library-client.js');
const personalPosition = index.indexOf('registry-user-personalization.js');
assert.ok(accountGuardPosition >= 0 && libraryClientPosition > accountGuardPosition, 'account guard must execute before user-library sync in final HTML');
assert.ok(personalPosition > libraryClientPosition, 'personalization must execute only after the per-user library client in final HTML');
assert.match(accountGuard, /verifiedOwner/, 'final account guard must retain server-verified ownership state');
assert.match(accountGuard, /wrongOwner[\s\S]*wipePersonalData\(\)/, 'final account guard must discard another user\'s stale local personal library');
assert.match(accountCss, /medindex-library-owner-pending[\s\S]*data-nav="favorites"[\s\S]*visibility: hidden !important/, 'personal UI must remain hidden until ownership reconciliation completes');

console.log('✓ Final post-compose registry release passed: one main table survives every later build phase; Favorites/Notes capture visible columns only; CSS cannot revive the retired toolbar; per-user ownership stays ordered before personalization.');
