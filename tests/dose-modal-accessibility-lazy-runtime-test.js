'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');

const index = read('index.html');
const loader = read('registry-dose-modal-accessibility-loader.js');
const runtime = read('registry-dose-modal-accessibility.js');

assert.match(index, /registry-dose-modal-accessibility-loader\.js\?v=dose-modal-accessibility-lazy-v1/);
assert.match(index, /data-dose-modal-accessibility-runtime="registry-dose-modal-accessibility\.js\?[^\"]+"/);
assert.doesNotMatch(index, /<script\s+src="registry-dose-modal-accessibility\.js[^\"]*"[^>]*><\/script>/);

assert.match(loader, /const TRIGGER_SELECTOR = '\.dose-calculator-open'/);
assert.match(loader, /let runtimePromise = null/);
assert.match(loader, /const replaying = new WeakSet\(\)/);
assert.match(loader, /document\.addEventListener\('click', onClick, true\)/);
assert.match(loader, /event\.preventDefault\(\)/);
assert.match(loader, /event\.stopImmediatePropagation\(\)/);
assert.match(loader, /script\.async = false/);
assert.match(loader, /trigger\.click\(\)/);
assert.match(loader, /window\.MedIndexDoseModalAccessibility/);
assert.match(loader, /if \(runtimePromise\) return runtimePromise/);

assert.match(runtime, /bodyObserver\.observe\(document\.body, \{ childList:true \}\)/);
assert.match(runtime, /document\.addEventListener\('keydown', onKeyDown, true\)/);
assert.match(runtime, /restoreTriggerFocus/);

const calculatorIndex = index.indexOf('registry-dose-calculator.js');
const loaderIndex = index.indexOf('registry-dose-modal-accessibility-loader.js');
assert.ok(calculatorIndex >= 0 && loaderIndex > calculatorIndex, 'loader must stay after calculator; capture phase owns the first click');

console.log('✓ Dose modal accessibility lazy runtime passed: no startup a11y observer/listeners; first calculator click loads runtime once, then replays through focus-safe capture.');
