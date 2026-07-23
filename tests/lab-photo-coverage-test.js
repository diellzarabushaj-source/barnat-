const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
global.window = {};
delete require.cache[require.resolve(path.join(ROOT, 'lab-data.js'))];
require(path.join(ROOT, 'lab-data.js'));

const data = global.window.MEDINDEX_LABS;
assert.ok(data && Array.isArray(data.tests), 'Laboratory source dataset did not load');
assert.equal(data.tests.length, 110, 'The four approved photos must produce exactly 110 laboratory entries');

const expectedIds = [
  'esr','rbc','hgb','wbc','mcv','mch','mchc','hct','plt','retic','bleeding-time','clotting-time','peripheral-smear',
  'lym-abs','lym-pct','mid-abs','mid-pct','gra-abs','gra-pct','rdw-a','rdw-pct','mpv','pdw-a','pdw-pct','pct','p-lcr','p-lcc',
  'neutrophils','eosinophils','basophils','lymphocytes','monocytes','bands',
  'urea','creatinine-serum','glucose','cholesterol','triglycerides','total-lipids','ldl','vldl','hdl','uric-acid','total-protein','albumin','globulin','fibrinogen',
  'anti-dna','latex-rf','asto','waler-rosse','crp','ggt','bilirubin-total','bilirubin-direct','alp','alt','ast','ck','ckmb','troponin-i','ldh','amylase-serum','acid-phosphatase','prostatic-phosphatase',
  'sodium','potassium','chloride','magnesium','phosphorus','calcium','lithium','iron','tibc','iga','igg','igm','c3','c4','syphilis-rpr','syphilis-tpha',
  'pt','aptt','tt','inr','urine-amylase','urine-creatinine','creatinine-clearance','urine-total-protein','bence-jones',
  'thc-urine','cocaine-urine','methamphetamine-urine','opiates-urine','amphetamine-urine','ecstasy-urine','chlamydia',
  'urine-appearance','urine-color','urine-reaction','urine-specific-gravity','urine-protein','urine-glucose','urine-blood','urine-ketones','urine-bilirubin','urine-urobilinogen','urine-nitrite','urine-sediment','stool-exam'
];

assert.equal(expectedIds.length, 110, 'Coverage fixture must list 110 unique entries');
const actualIds = data.tests.map(test => test.id);
assert.equal(new Set(actualIds).size, actualIds.length, 'Laboratory IDs must be unique');
assert.deepEqual([...actualIds].sort(), [...expectedIds].sort(), 'A laboratory test from the four source photos is missing, renamed, or replaced');

const byId = id => data.tests.find(test => test.id === id);
assert.match(byId('wbc').alternateReference, /3\.5–10\.0/, 'Analyzer WBC interval was not preserved');
assert.equal(byId('p-lcc').reference, '1–1999', 'Analyzer P-LCC interval was not preserved');
assert.equal(byId('pt').reference, '70–120', 'PT reference from the Kosovo form was not preserved');
assert.match(byId('inr').reference, /0\.8–1\.3/, 'INR untreated range was not preserved');
assert.match(byId('inr').reference, /2–3\.5/, 'INR treated range was not preserved');
assert.equal(byId('crp').reference, 'Deri 6', 'CRP reference from the Kosovo form was not preserved');
assert.equal(byId('sodium').reference, '136–146', 'Sodium reference was not preserved');
assert.match(byId('phosphorus').reference, /Të rriturit: 0\.81–1\.62/, 'Adult phosphorus range was not preserved');
assert.match(byId('phosphorus').reference, /Fëmijët: 1\.30–2\.26/, 'Pediatric phosphorus range was not preserved');
assert.equal(byId('syphilis-rpr').reference, 'Negative', 'RPR source result was not preserved');
assert.equal(byId('urine-amylase').unit, 'U/L', 'Urine amylase unit was not preserved');
assert.equal(byId('uric-acid').unit, '', 'An unreadable uric-acid unit must not be inferred');
assert.match(byId('uric-acid').referenceNote, /nuk lexohet qartë/i, 'Unreadable uric-acid unit must remain flagged');
assert.match(byId('stool-exam').reference, /Nuk është shënuar/i, 'Missing stool reference must remain explicit');

console.log('All 110 laboratory entries from the four approved Kosovo source photos are present and source-faithful.');
