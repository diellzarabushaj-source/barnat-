'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const api = read('api/dosage.js');
const handler = read('lib/dose-safety-handler.js');
const ui = read('registry-dose-safety-layer.js');
const html = read('index.html');

assert.match(api, /dose-safety-handler/);
assert.match(api, /view\) === 'safety'|requestView\(req\) === 'safety'/);
assert.match(handler, /ALLOWED_STATUSES = new Set\(\['verified', 'published'\]\)/);
assert.match(handler, /officialVerifiedOnly:true/);
assert.match(handler, /verified_by/);
assert.match(handler, /verified_at/);
assert.match(handler, /rowMatchesProduct/);
assert.match(handler, /dedupeSafety/);
assert.match(handler, /block:0, manual_review:1, caution:2, info:3/);
assert.match(ui, /Kalkulimi u bllokua/);
assert.match(ui, /Kërkohet vlerësim manual/);
assert.match(ui, /Kontroll i shpejtë i sigurisë/);
assert.match(ui, /data-safety-suppressed/);
assert.match(ui, /MAX_VISIBLE_ITEMS = 4/);
assert.match(ui, /patientGroupMatches/);
assert.match(ui, /indicationKey/);
assert.match(html, /registry-dose-safety-layer\.js\?v=20260809-2/);
assert.ok(html.indexOf('registry-dose-calculator.js') < html.indexOf('registry-dose-safety-layer.js'), 'Safety layer must load after calculator core');
assert.ok(html.indexOf('registry-dose-safety-layer.js') < html.indexOf('registry-dose-10s-flow.js'), 'Safety layer must be available before 10-second flow enhancements');

console.log('Dose safety layer verified-only, product-aware and physician-fast contract passed.');
