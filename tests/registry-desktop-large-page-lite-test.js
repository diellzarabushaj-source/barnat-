'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const desktop = read('registry-desktop-lite.js');
const api = read('api/drug-search.js');
const index = read('index.html');
const patch = read('scripts/patch-phase11-desktop-advanced-lite.js');
const packageJson = JSON.parse(read('package.json'));

execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-desktop-lite.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'scripts/patch-phase11-desktop-advanced-lite.js')], { stdio:'pipe' });

assert.match(index, /<option value="50">50 \/ faqe<\/option>/);
assert.match(index, /<option value="100">100 \/ faqe<\/option>/);
assert.match(index, /<option value="250">250 \/ faqe<\/option>/);
assert.match(index, /<option value="500">500 \/ faqe<\/option>/);

assert.match(desktop, /const SERVER_PAGE_SIZE = 50;/, 'Phase 11 must keep each Neon list request bounded to 50 rows.');
assert.match(desktop, /const MAX_LOGICAL_PAGE_SIZE = 500;/, 'Existing desktop 500-row option must remain supported without full-registry mode.');
assert.match(desktop, /const MAX_PAGE_CHUNKS = 10;/, 'A logical desktop page must never fan out beyond ten 50-row chunks.');
assert.match(desktop, /const CHUNK_CONCURRENCY = 3;/, 'Large logical pages must use bounded request concurrency.');
assert.match(desktop, /function logicalChunkCount\(/);
assert.match(desktop, /function firstServerPage\(/);
assert.match(desktop, /async function fetchRegistryChunk\(/);
assert.match(desktop, /async function fetchLogicalPage\(/);
assert.match(desktop, /const rawPayloadTotal = first\.pagination\?\.total;/, 'Count-free page responses must keep raw total state explicit.');
assert.match(desktop, /rawPayloadTotal === null \|\| rawPayloadTotal === undefined \? null : Number\(rawPayloadTotal\)/, 'A null server total must remain unknown instead of becoming numeric zero.');
assert.doesNotMatch(desktop, /const payloadTotal = Number\(first\.pagination\?\.total\);/, 'Count-free responses must never coerce null totals with Number(null).');
assert.match(desktop, /pageSize:String\(boundedPageSize\)/, 'Every server request must pass the bounded 50-row page size.');
assert.match(desktop, /payloads\.flatMap\(payload => payload\.rows\)\.slice\(0, state\.pageSize\)/, 'Only the requested logical page may be composed in memory.');
assert.match(desktop, /Math\.ceil\(logical\.total \/ state\.pageSize\)/, 'Logical pagination must be computed from the user-selected page size.');
assert.match(desktop, /state\.page \* state\.pageSize < logical\.total/, 'Next-page state must be based on the logical page, not an internal 50-row chunk.');
assert.match(desktop, /Boolean\(logical\.last\?\.pagination\?\.hasNext\)/, 'Unknown-total pages must preserve server look-ahead pagination.');
assert.match(desktop, /chunks:logical\.chunks/, 'Runtime diagnostics must expose the number of bounded chunks used.');
assert.doesNotMatch(desktop, /requestFullRegistry\('desktop-large-page-size'/, '100/250/500 must not trigger the full registry anymore.');
assert.doesNotMatch(desktop, /\/api\/registry(?:\?|['"`])|DRUG_DATA_PARTS/, 'Large desktop pages must stay on the lightweight gateway.');

assert.match(api, /REGISTRY_MAX_PAGE_SIZE = 50/, 'Server-side hard cap must remain 50 rows per Neon request.');
assert.doesNotMatch(api, /params\.set\('select', '\*'\)/, 'Large-page support must never weaken explicit projections.');

assert.match(patch, /MAX_LOGICAL_PAGE_SIZE = 500/);
assert.match(patch, /MAX_PAGE_CHUNKS = 10/);
assert.match(patch, /CHUNK_CONCURRENCY = 3/);
assert.match(patch, /rawPayloadTotal === null \|\| rawPayloadTotal === undefined \? null : Number\(rawPayloadTotal\)/, 'Build patch must preserve unknown totals for count-free search.');
assert.match(patch, /require\('\.\/patch-phase11-form-picker-lite\.js'\)/, 'Phase 11 form picker hardening must compose with the main Phase 11 build patch.');
assert.match(patch, /require\('\.\/patch-phase12-targeted-detail-wiring\.js'\)/, 'Phase 12 targeted detail wiring must compose with the existing desktop build chain.');
assert.match(packageJson.scripts['build:runtime'], /patch-phase11-desktop-advanced-lite\.js/, 'Phase 11 patch must execute deterministically in build:runtime.');
assert.match(packageJson.scripts.test, /registry-desktop-large-page-lite-test\.js/, 'Phase 11 regression test must run in the main test suite.');

require('./registry-desktop-form-lite-test.js');
require('./registry-desktop-targeted-detail-test.js');
console.log('Phase 11/12 desktop bounded pages, count-free unknown-total pagination, lightweight form filtering and targeted one-drug detail remain off the full-registry path.');
