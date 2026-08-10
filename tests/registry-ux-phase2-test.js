'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('index.html');
const js = read('registry-ux-phase2.js');
const css = read('registry-ux-phase2.css');

assert.doesNotThrow(() => new Function(js), 'Phase 2 clinical scanner JS must parse');
assert.match(html, /data-registry-ui-release="20260810-ux-phase2"/);
assert.match(html, /registry-ux-phase2\.css\?v=20260810-1/);
assert.match(html, /registry-ux-phase2\.js\?v=20260810-1/);
assert.ok(html.indexOf('registry-unified-table.css') < html.indexOf('registry-ux-phase2.css'), 'Phase 2 CSS must enhance the audited table after its base stylesheet');
assert.ok(html.indexOf('registry-ux-phase1.css') < html.indexOf('registry-ux-phase2.css'), 'Phase 2 visual hierarchy must load after Phase 1 command UI');
assert.ok(html.indexOf('registry-unified-table.js') < html.indexOf('registry-ux-phase2.js'), 'Phase 2 must decorate the stable unified table rather than replace it');
assert.ok(html.indexOf('registry-ux-phase1.js') < html.indexOf('registry-ux-phase2.js'), 'Phase 2 must extend Phase 1 interaction UX');

assert.match(js, /registry-ux-phase2-v1\.0\.0/);
assert.match(js, /MEDINDEX_REGISTRY_ROWS/);
assert.match(js, /rawByDrugKey = new Map/);
assert.match(js, /#tbody > tr/);
assert.match(js, /registry-scan-meta/);
assert.match(js, /ATC Code/);
assert.match(js, /Statusi/);
assert.match(js, /medindex:registry-rendered/);
assert.match(js, /requestAnimationFrame/);
assert.doesNotMatch(js, /MutationObserver/);
assert.doesNotMatch(js, /setInterval\s*\(/);
assert.doesNotMatch(js, /dosage|dose.*=.*[+*/-]/i, 'Phase 2 must not implement dosing calculations');

assert.match(css, /Clinical Scanner/);
assert.match(css, /registry-scan-atc/);
assert.match(css, /registry-scan-status/);
assert.match(css, /data-registry-column-key="dosage-adult"/);
assert.match(css, /data-registry-column-key="dosage-pediatric"/);
assert.match(css, /@media\(min-width:1100px\)/);
assert.match(css, /position:sticky!important/);
assert.match(css, /data-registry-column-key="trade-name"/);
assert.match(css, /@media\(max-width:1099px\)/);
assert.match(css, /position:relative!important/);
assert.match(css, /prefers-reduced-motion/);
assert.doesNotMatch(css, /tbody tr\s*\{[^}]*height\s*:/s, 'Phase 2 must not change the audited fixed row geometry');

console.log('Phase 2 clinical scanner hierarchy, desktop identity pinning and event-driven performance audit passed.');
