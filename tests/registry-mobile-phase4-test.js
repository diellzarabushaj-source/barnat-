'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const router = read('api/dosage.js');
const handler = read('lib/dosage-card-handler.js');
const runtime = read('registry-mobile-phase4.js');
const css = read('registry-mobile-phase4.css');

execFileSync(process.execPath, ['--check', path.join(root, 'lib/dosage-card-handler.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(root, 'registry-mobile-phase4.js')], { stdio:'pipe' });

assert.match(router, /dosage-card-handler\.js/);
assert.match(router, /requestView\(req\) === 'card'/);
assert.match(router, /return dosageCardHandler\(req, res\)/);
assert.match(handler, /dosage_regimens\?/);
assert.match(handler, /drug_clinical_profiles\?/);
assert.match(handler, /editorial_status/);
assert.match(handler, /text_verified,calculable_verified/);
assert.match(handler, /drug_id/);
assert.match(handler, /private, max-age=60, stale-while-revalidate=300/);
assert.match(handler, /X-MedIndex-Data-Source', 'neon'/);
assert.doesNotMatch(handler, /select',\s*'\*'/);
assert.doesNotMatch(handler, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i, 'targeted clinical detail must remain read-only');
assert.doesNotMatch(handler, /source_payload/,'targeted clinical detail must not transfer the heavy registry payload');

assert.match(runtime, /registry-mobile-phase4-v2/);
assert.match(runtime, /\(max-width: 767px\)/);
assert.match(runtime, /medindex:mobile-lite-detail-opened/);
assert.match(runtime, /view:'card'/);
assert.match(runtime, /CACHE_LIMIT = 12/);
assert.match(runtime, /verifiedDose/);
assert.match(runtime, /text_verified/);
assert.match(runtime, /calculable_verified/);
assert.match(runtime, /✓ E verifikuar/);
assert.match(runtime, /data-mi-phase4-dose-verified/);
assert.match(runtime, /cache:'default'/);
assert.match(runtime, /data-mi-phase4-retry/);
assert.match(runtime, /Riprovo/);
assert.match(runtime, /cache\.delete\(id\)/);
assert.match(runtime, /Dozimi për të rritur/);
assert.match(runtime, /Dozimi për fëmijë/);
assert.match(runtime, /Kundërindikacionet/);
assert.match(runtime, /Paralajmërimet/);
assert.match(runtime, /Ndërveprimet/);
assert.match(runtime, /Burimet/);
assert.doesNotMatch(runtime, /MEDINDEX_REGISTRY_ROWS/,'Phase 4 must not require the full registry dataset');
assert.doesNotMatch(runtime, /DRUG_DATA_PARTS/,'Phase 4 must not decode the full registry payload');

assert.match(css, /@media \(max-width:767px\)/);
assert.match(css, /mi-phase4-clinical/);
assert.match(css, /mi-phase4-dose/);
assert.match(css, /mi-phase4-dose-verified/);
assert.match(css, /mi-phase4-retry/);
assert.match(css, /min-height:44px/);
assert.match(css, /mi-phase4-safety/);
assert.match(css, /data-theme="dark"/);

assert.match(index, /registry-mobile-phase4\.js\?v=20260812-2/);
assert.match(index, /registry-mobile-phase4\.css\?v=20260812-2/);
assert.ok(index.indexOf('registry-mobile-lite.js') < index.indexOf('registry-mobile-phase4.js'));
assert.ok(index.indexOf('registry-mobile-phase3.js') < index.indexOf('registry-mobile-phase4.js'));

console.log('Phase 4 verified dosage, retry, Neon-only detail and mobile isolation contract passed.');