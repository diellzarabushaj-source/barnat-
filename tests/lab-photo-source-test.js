const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
global.window = {};
delete require.cache[require.resolve(path.join(ROOT, 'lab-data.js'))];
require(path.join(ROOT, 'lab-data.js'));

const data = global.window.MEDINDEX_LABS;
assert.ok(data, 'Laboratory source dataset did not load');
assert.equal(data.tests.length, 110, 'Expected exactly 110 tests transcribed from the four images');
assert.match(data.sourcePolicy, /Vetëm analizat/i);

const byId = id => data.tests.find(test => test.id === id);
assert.equal(byId('uric-acid').unit, '', 'Unclear uric-acid unit must remain blank');
assert.match(byId('uric-acid').referenceNote, /nuk lexohet qartë/i);
assert.equal(byId('creatinine-serum').unit, 'mmol/L', 'Source transcription must not be silently normalized');
assert.match(byId('creatinine-serum').referenceNote, /transkriptuar/i);
assert.match(byId('wbc').alternateReference, /3\.5–10\.0/);
assert.equal(byId('pt').reference, '70–120');
assert.equal(byId('inr').reference, 'Pacient pa terapi: 0.8–1.3; Pacient me terapi: 2–3.5');
assert.equal(byId('syphilis-rpr').reference, 'Negative');
assert.equal(byId('urine-appearance').reference, 'Nuk është shënuar në formular');

assert.ok(!fs.existsSync(path.join(ROOT, 'api/labs.js')), 'stale laboratory API must not expose a second contradictory dataset');
const labsHtml = fs.readFileSync(path.join(ROOT, 'analizat.html'), 'utf8');
assert.doesNotMatch(labsHtml, /lab-sheet-data\.js|lab-data\.js|analizat\.js|analizat-polish\.css/, 'Analizat V2 must not load archived laboratory runtimes');
const labsRuntime = fs.readFileSync(path.join(ROOT, 'analizat-v2.js'), 'utf8');
assert.match(labsRuntime, /\/api\/icd\?dataset=labs/, 'Analizat V2 must read the canonical Supabase laboratory dataset through the authenticated API');
assert.match(labsRuntime, /Supabase/, 'Analizat V2 runtime must identify Supabase as the canonical source');

console.log('Kosovo laboratory photo-source preservation test passed.');
