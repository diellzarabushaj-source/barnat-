'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

/* The old product-bound pediatric client remains archived, but the canonical
 * Dozologjia V2 asset names now contain the clean substance-first runtime. */
const archivedClient = read('pediatric-calculator-client.js');
const html = read('dozologjia.html');
const client = read('dozologjia-v2.js');
const css = read('dozologjia-v2.css');
const code = client.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

assert.match(archivedClient, /OWNER_FLAG = 'server-v3'/);
assert.match(html, /data-dozologjia-architecture="clean-substance-first"/);
assert.match(html, /dozologjia-v2\.js\?v=clean-substance-first-1/);
assert.doesNotMatch(html, /pediatric-calculator-client\.js|id="dosageFormFilter"|id="patientTreatmentDay"/,
  'Clean Dozologjia must not mount the archived product-bound pediatric UI.');

for (const id of ['substance','population','regimen','weightKg','durationPreview']) assert.match(html, new RegExp(`id="${id}"`));
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
assert.match(client, /fetch\(/);
assert.match(css, /min-height:46px/);
assert.match(css, /@media\(max-width:820px\)/);

console.log('Clean Dozologjia pediatric flow passed; old product-bound pediatric UI is no longer mounted.');
