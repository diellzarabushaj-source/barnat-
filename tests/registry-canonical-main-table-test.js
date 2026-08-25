'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const js = read('registry-unified-table.js');
const css = read('registry-unified-table.css');
const html = read('index.html');

const RELEASE = 'registry-canonical-main-table-v1';

assert.match(js, new RegExp(`const VERSION = '${RELEASE}'`), 'canonical registry release marker missing');
assert.ok(js.includes("const currentView = () => 'full';"), 'registry must have one full canonical view');
assert.ok(js.includes('const currentOrder = () => FULL_ORDER;'), 'registry must use canonical full order only');
assert.ok(!js.includes('tableWrap.before(replacement)'), 'alternate clinical/full toolbar must not be mounted');
assert.ok(js.includes("document.getElementById('registryViewToolbar')?.remove();"), 'stale alternate toolbar must be removed');
assert.ok(js.includes("document.documentElement.dataset.registryFiltersOpen = 'true';"), 'main registry controls must remain visible');
assert.ok(!js.includes("if (currentView() === 'clinical') CLINICAL_BASE_KEYS"), 'clinical-only synthetic base columns must not return');
assert.ok(!js.includes("if (currentView() === 'clinical' && !CLINICAL_ORDER.includes(key))"), 'clinical projection must not hide canonical columns');

const orderNeedle = "'select', 'number', 'active-substance', 'trade-name', 'atc', 'drug-class', 'use'";
assert.ok(js.includes(orderNeedle), 'canonical column order must start selection → Nr → active substance → trade name');

assert.ok(css.includes(RELEASE), 'canonical table CSS release marker missing');
assert.match(css, /#registryViewToolbar,[\s\S]*?\.registry-view-toolbar-unified[\s\S]*?display:none!important/, 'alternate registry toolbar must be force-hidden');

assert.match(html, /data-registry-ux-view="full"/, 'registry HTML must boot in full canonical mode');
assert.ok(html.includes(`registry-unified-table.css?v=${RELEASE}`), 'canonical CSS version must be published');
assert.ok(html.includes(`registry-unified-table.js?v=${RELEASE}`), 'canonical JS version must be published');
assert.ok(!html.includes('data-registry-ux-view="clinical"'), 'HTML must never boot the alternate clinical projection');

console.log('✓ Canonical registry table gate passed: one main table, full mode, canonical column order and coherent JS/CSS release.');
