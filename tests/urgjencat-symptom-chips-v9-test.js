'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('urgjencat.html');
const js = read('emergency-symptom-chips-v9.js');
const css = read('emergency-symptom-chips-v9.css');

assert.match(html, /emergency-symptom-chips-v9\.css\?v=20260824-1/);
assert.match(html, /emergency-symptom-chips-v9\.js\?v=20260824-1/);
assert.ok(
  html.indexOf('emergency-search-core-v8.js') < html.indexOf('emergency-smart-search-v8.js')
  && html.indexOf('emergency-smart-search-v8.js') < html.indexOf('emergency-symptom-chips-v9.js'),
  'The symptom layer must load after the deterministic search engine and UI.',
);
assert.match(js, /const CANDIDATES = \[/);
assert.match(js, /MAX_VISIBLE = 8/);
assert.match(js, /Dhimbje gjoksi/);
assert.match(js, /Dispne/);
assert.match(js, /Pa vetëdije/);
assert.match(js, /Konvulsione/);
assert.match(js, /Palpitacione/);
assert.match(js, /Reaksion alergjik/);
assert.match(js, /Gjakderdhje/);
assert.match(js, /engine\.rank/);
assert.match(js, /selected = new Set/);
assert.match(js, /aria-pressed/);
assert.match(js, /search\.dispatchEvent\(new Event\('input'/);
assert.match(js, /availableCandidates/);
assert.match(js, /hits > 0/);
assert.doesNotMatch(js, /gemini|generative|fetch\(|XMLHttpRequest/i);
assert.doesNotMatch(js, /mg\/kg|mcg\/kg|adrenalin|epinefrin|nalokson|atropin|amiodaron|adenozin/i);
assert.match(css, /\.ck-v9-symptoms/);
assert.match(css, /button\[aria-pressed="true"\]/);
assert.match(css, /#emergencyQuickSearch\{display:none!important\}/);
assert.match(css, /@media\(max-width:760px\)/);

console.log('Urgjencat multi-symptom rapid lookup v9 contract passed.');
