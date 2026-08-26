'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const auth = read('auth-client.js');
const desktop = read('registry-desktop-lite.js');

for (const file of ['auth-client.js', 'registry-desktop-lite.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(auth, /auth-pagination-regressions-v1: confirm auth before global expiry/,
  'Auth client must carry the confirmed-expiry regression fix.');
assert.match(auth, /function sameOriginApiTarget\(target\)/,
  'Only same-origin API responses may trigger session revalidation.');
assert.match(auth, /function confirmSessionAfterApiAuthFailure\(\)/,
  'Secondary API authorization failures must be revalidated against the auth source of truth.');
assert.match(auth, /apiAuthRevalidation = authRequest\(\)/,
  'Auth revalidation must reuse the canonical no-store auth request instead of a secondary endpoint response.');
assert.match(auth, /if \(confirmed === false\) showExpired\(\);/,
  'Logout must happen only after auth is positively confirmed invalid.');
assert.doesNotMatch(auth, /!String\(target\)\.includes\('\/api\/auth'\)\) showExpired\(\);/,
  'A random API 401/403 must never directly expire the whole MedIndex session.');
assert.match(auth, /\.catch\(\(\) => null\)/,
  'Network/revalidation uncertainty must fail non-destructively instead of logging the doctor out.');

assert.match(desktop, /auth-pagination-regressions-v1: keep document viewport stable on pagination/,
  'Desktop registry must carry the pagination viewport regression fix.');
assert.match(desktop, /function resetDesktopTableViewport\(\)/,
  'Pagination must reset only the table viewport.');
assert.match(desktop, /document\.getElementById\('tableWrap'\)/,
  'The table scroll container, not the document, owns pagination scroll reset.');
assert.match(desktop, /const left = Number\(tableWrap\.scrollLeft \|\| 0\)/,
  'Horizontal table position must be preserved while changing pages.');
assert.match(desktop, /if \(scroll\) resetDesktopTableViewport\(\);/,
  'Page changes must use the scoped table reset.');
assert.doesNotMatch(desktop, /registryContent'\)\?\.scrollIntoView/,
  'Pagination must not jump the whole document and hide the Barnat header/toolbars.');

assert.match(desktop, /desktop-handoff-busy-release-v1: the outgoing owner cannot leave shared UI busy/,
  'Explicit desktop-lite handoff must release shared pagination busy state.');
assert.match(desktop, /state\.disabled = true;[\s\S]*?desktop-handoff-busy-release-v1[\s\S]*?window\.clearTimeout\(searchTimer\);[\s\S]*?pageController\?\.abort\(\);[\s\S]*?pageController = null;[\s\S]*?setBusy\(false\);[\s\S]*?window\.MEDINDEX_DESKTOP_LITE_ACTIVE = false;/,
  'Explicit handoff must cancel pending lightweight work and release busy before full-runtime ownership.');

assert.match(desktop, /desktop-full-runtime-ready-cutover-v1: full runtime readiness is the authoritative owner boundary/,
  'A directly loaded full runtime must also terminate the lightweight owner.');
assert.match(desktop, /window\.addEventListener\('medindex:registry-ready', \(\) => \{[\s\S]*?state\.disabled = true;[\s\S]*?window\.clearTimeout\(searchTimer\);[\s\S]*?pageController\?\.abort\(\);[\s\S]*?pageController = null;[\s\S]*?setBusy\(false\);[\s\S]*?window\.MEDINDEX_DESKTOP_LITE_ACTIVE = false;[\s\S]*?window\.MEDINDEX_REGISTRY_PARTIAL = false;[\s\S]*?registryDesktopLiteState = 'full-runtime'/,
  'registry-ready must be an authoritative one-way owner cutover with no stale request/busy state.');
assert.match(desktop, /document\.getElementById\('pagination'\)\?\.classList\.toggle\('is-loading', value\)/,
  'The regression gate must remain tied to the actual shared pagination busy-state owner.');

console.log('✓ Auth + pagination regression contract passed: auxiliary API 401/403 cannot fake session expiry, paging keeps document viewport stable, and explicit or direct full-runtime cutover cannot leave desktop-lite active or pagination busy.');
