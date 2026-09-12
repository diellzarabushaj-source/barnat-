'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

/* The V3 pediatric client remains in the repository only as archived/regression
 * material. Dozologjia itself is now a clean substance-first runtime. */
const archivedClient = read('pediatric-calculator-client.js');
const archivedBundle = read('dozologjia-v2.js');
const html = read('dozologjia.html');
const client = read('dozologjia.js');
const css = read('dozologjia.css');
const code = client.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

assert.match(archivedClient, /OWNER_FLAG = 'server-v3'/);
assert.match(archivedBundle, /OWNER_FLAG = 'server-v3'/);
assert.match(html, /data-dozologjia-architecture="clean-substance-first"/);
assert.doesNotMatch(html, /pediatric-calculator-client\.js|dozologjia-v2\.js|id="dosageFormFilter"|id="patientTreatmentDay"/,
  'Clean Dozologjia must not mount the archived V3 UI.');

assert.match(html, /id="substance"/);
assert.match(html, /id="population"/);
assert.match(html, /id="regimen"/);
assert.match(html, /id="weightKg"/);
assert.match(html, /id="durationPreview"/);
assert.match(client, /\/api\/dosage\?view=substances/);
assert.match(client, /\/api\/dosage\?view=regimens&substance=/);
assert.match(client, /action:'calculate'/);
assert.match(client, /method:'POST'/);

for (const forbidden of [
  /weightKg\s*\*/,
  /\*\s*weightKg/,
  /\/\s*concentration/i,
  /Math\.min\s*\(\s*[^)]*max/i,
  /dose(?:Min|Max)\s*[*/]/,
]) assert.doesNotMatch(code, forbidden, `Clean client must not calculate doses: ${forbidden}`);

assert.doesNotMatch(code, /innerHTML/);
assert.match(client, /textContent/);
assert.match(client, /AbortController|fetch\(/);
assert.match(css, /min-height:46px/);
assert.match(css, /@media\(max-width:820px\)/);

console.log('Clean Dozologjia UI passed; pediatric V3 UI remains archived and is no longer mounted.');
