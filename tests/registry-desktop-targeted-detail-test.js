'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('index.html');
const runtime = read('registry-desktop-targeted-detail.js');
const rowExpand = read('registry-row-expand.js');
const drugSearch = read('api/drug-search.js');
const dosageCard = read('lib/dosage-card-handler.js');
const wiring = read('scripts/patch-phase12-targeted-detail-wiring.js');
const rowStability = read('scripts/patch-registry-row-expand-stability.js');

for (const file of [
  'registry-desktop-targeted-detail.js',
  'scripts/patch-phase12-targeted-detail-wiring.js',
  'scripts/patch-registry-row-expand-stability.js',
]) execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

const rowScript = 'registry-row-expand.js?v=20260810-1';
const detailScript = 'registry-desktop-targeted-detail.js?v=20260812-1';
const prescriptionScript = 'registry-desktop-prescription-lite.js?v=20260812-1';
assert(index.includes(rowScript), 'Canonical row expander must remain present.');
assert(index.includes(detailScript), 'Phase 12 targeted detail runtime must be wired.');
assert(index.includes(prescriptionScript), 'Phase 13 prescription bridge must be wired.');
assert(index.indexOf(rowScript) < index.indexOf(detailScript), 'Targeted detail must augment, not replace, the canonical row expander.');
assert(index.indexOf(detailScript) < index.indexOf(prescriptionScript), 'Prescription bridge must load after targeted detail.');

assert.match(runtime, /registry-desktop-targeted-detail-v1/);
assert.match(runtime, /\(min-width: 768px\)/, 'Phase 12 must remain desktop-only.');
assert.match(runtime, /MEDINDEX_DESKTOP_LITE_ACTIVE/, 'Targeted detail must run only in desktop-lite mode.');
assert.match(runtime, /REGISTRY_DETAIL_API \+ '\?view=registry-detail&id='/, 'Registry detail must fetch one drug only.');
assert.match(runtime, /CLINICAL_DETAIL_API \+ '\?view=card&id='/, 'Clinical detail must fetch one clinical card only.');
assert.match(runtime, /Promise\.allSettled/, 'Registry and clinical one-drug reads should run together and degrade independently.');
assert.match(runtime, /const DETAIL_CACHE_LIMIT = 96;/, 'Targeted detail session memory must have a conservative bound.');
assert.match(runtime, /const cache = new Map\(\)/);
assert.match(runtime, /const inflight = new Map\(\)/);
assert.match(runtime, /function readDetailCache\(id\)/, 'Targeted detail cache reads must refresh recency.');
assert.match(runtime, /function rememberDetail\(id, payload\)/, 'Targeted detail cache writes must use the bounded LRU helper.');
assert.match(runtime, /while \(cache\.size > DETAIL_CACHE_LIMIT\)/, 'Targeted detail cache must evict the least-recent entry after the cap.');
assert.match(runtime, /cache\.has\(id\)/, 'Reopening the same drug must reuse its in-memory detail.');
assert.match(runtime, /Riprovo/);
assert.match(runtime, /desktop-targeted-detail-advanced/, 'Full runtime must be an explicit advanced action only.');
assert.match(runtime, /observer\.observe\(tbody, \{ childList:true \}\)/, 'Targeted detail must observe only direct tbody row replacement.');
assert.match(runtime, /medindex:registry-row-expanded-change/, 'Targeted detail must consume the canonical row expansion event.');
assert.doesNotMatch(runtime, /observer\.observe\(tbody, \{[\s\S]*?subtree\s*:\s*true/, 'Targeted detail must not observe nested table mutations for the full session.');
assert.doesNotMatch(runtime, /attributeFilter:\s*\['data-registry-row-expanded'\]/, 'Targeted detail must not keep the old attribute subtree observer.');
assert.doesNotMatch(runtime, /\/api\/registry(?:\?|['"`])|DRUG_DATA_PARTS|DecompressionStream|\batob\s*\(/, 'Phase 12 normal detail path must never load or parse the full registry.');
assert.doesNotMatch(runtime, /localStorage|indexedDB/i, 'One-drug detail cache must stay session-memory only.');

assert.match(rowExpand, /registry-row-details-toggle/);
assert.match(rowExpand, /Shiko detajet/);
assert.match(rowExpand, /const expansionChanged = row\.dataset\.registryRowExpanded !== expandedState/, 'Row-expanded state writes must be idempotent.');
assert.match(rowExpand, /medindex:registry-row-expanded-change/, 'Canonical row controller must publish a targeted expansion-change event.');
assert.match(runtime, /data-registry-row-expanded|registryRowExpanded/, 'Phase 12 must follow the existing row-expanded state instead of inventing a second interaction model.');
assert.match(runtime, /registry-targeted-detail-row/);

assert.match(drugSearch, /REGISTRY_DETAIL_SELECT/);
assert.match(drugSearch, /params\.set\('limit', '1'\)/, 'Registry detail must remain a one-row Neon read.');
assert.doesNotMatch(drugSearch.match(/const REGISTRY_DETAIL_SELECT[\s\S]*?;/)?.[0] || '', /source_payload|\*/, 'Registry detail projection must remain explicit and lightweight.');
assert.match(dosageCard, /const MAX_REGIMENS = 16/);
assert.match(dosageCard, /params\.set\('drug_id', `eq\.\$\{drugId\}`\)/, 'Clinical card must stay scoped to one drug_id.');
assert.match(dosageCard, /editorial_status', 'eq\.published/);
assert.match(dosageCard, /calculation_status', 'in\.\(text_verified,calculable_verified\)/);
assert.match(wiring, /registry-desktop-targeted-detail\.js\?v=20260812-1/);
assert.match(wiring, /patchTargetedDetailObserver/, 'Phase 12 build must deterministically remove the subtree observer.');
assert.match(wiring, /patchTargetedDetailCache/, 'Phase 12 build must deterministically enforce the bounded detail cache.');
assert.match(wiring, /DETAIL_CACHE_LIMIT = 96/, 'Phase 12 build must preserve the conservative detail cache bound.');
assert.match(rowStability, /medindex:registry-row-expanded-change/, 'Row-expansion build must preserve the dedicated expansion event.');
assert.match(wiring, /registry-desktop-prescription-lite\.js\?v=20260812-1/);

require('./registry-desktop-prescription-lite-test.js');
console.log('Phase 12/13 desktop targeted detail is event-driven, direct-row observed, bounded in session memory and remains off the full-registry normal path.');
