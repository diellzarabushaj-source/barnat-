const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const apiFiles = ['api/registry.js', 'api/dosage.js', 'api/clinical-editor.js', 'api/drug-search.js'];
const dosage = read('api/dosage.js');
const dozologjiaEngine = read('lib/dozologjia.js');
const clinicalEditor = read('api/clinical-editor.js');
const icdBase = read('lib/icd-api-base.js');
const vercel = JSON.parse(read('vercel.json'));
const sources = {
  'api/registry.js':read('api/registry.js'),
  'api/dosage.js':dosage,
  'api/icd (clinical-editor rewrite)':`${clinicalEditor}\n${icdBase}`,
  'api/drug-search.js':read('api/drug-search.js'),
};

for (const file of [...apiFiles, 'lib/dozologjia.js']) {
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio:'pipe' });
}
for (const [file, source] of Object.entries(sources)) {
  assert.match(source, /authorized|verifySessionToken/, `${file}: authentication guard missing`);
  assert.match(source, /X-Content-Type-Options/, `${file}: nosniff missing`);
  assert.match(source, /Cache-Control/, `${file}: cache policy missing`);
}

assert.match(dosage, /require\('\.\.\/lib\/dozologjia\.js'\)/);
assert.match(dosage, /registryHandler\.authorized/);
assert.match(dosage, /view === 'substances'/);
assert.match(dosage, /view === 'regimens'/);
assert.match(dosage, /body\.action !== 'calculate'/);
assert.match(dosage, /legacyViews/);
assert.match(dosage, /status, payload/);
for (const legacyImport of [
  'dosage-handler','dose-calculator-handler','dose-safety-handler','dose-product-fast-path-handler','pediatric-dosage-handler'
]) {
  assert.doesNotMatch(dosage, new RegExp(`^const\\s+.*require\\([^\\n]*${legacyImport}`, 'm'));
}
assert.doesNotMatch(dosage, /error:error\.message|stack:/, 'Dozologjia endpoint must not return raw upstream errors');
assert.match(dozologjiaEngine, /requiresReview:true/);
assert.match(dozologjiaEngine, /mg-kg-day-range/);
assert.doesNotMatch(dozologjiaEngine, /product_id|drug_id/i, 'Clean Dozologjia engine must not depend on product registry identity.');

const dosageHandler = require('../api/dosage.js');
assert.equal(typeof dosageHandler.authorized, 'function');
assert.equal(typeof dosageHandler.engine.calculate, 'function');
const sample = dosageHandler.engine.calculate({ substanceId:'ceftriaxone', regimenId:'ctx-gonorrhoea-adult' });
assert.equal(sample.outcome, 'CALCULATED');
assert.equal(sample.dose.perDoseMg, 500);
assert.equal(sample.duration.kind, 'single');
assert.equal(sample.requiresReview, true);

const rewrites = new Map((vercel.rewrites || []).map(row => [row.source, row.destination]));
assert.equal(rewrites.get('/api/icd'), '/api/clinical-editor?icdApi=1',
  'ICD endpoint must stay routed through the consolidated clinical-editor function');
assert.match(clinicalEditor, /queryFlag\(req, 'icdApi'\)/);
assert.match(clinicalEditor, /authorizedIcd/);
assert.match(clinicalEditor, /verifySessionToken/);

const icd = icdBase;
assert.match(icd, /MAX_CSV_BYTES/);
assert.match(icd, /pendingLoad/);
assert.match(icd, /Buffer\.byteLength/);
assert.match(icd, /httpsUrl\(row\['Burimi WHO'\]\)/);
assert.match(icd, /Server-Timing/);
assert.match(icd, /ok:false, data:null/);

const search = read('api/drug-search.js');
assert.match(search, /MAX_QUERY/);
assert.match(search, /MAX_RESULTS/);
assert.match(search, /slice\(0, MAX_QUERY\)/);
assert.match(search, /registryHandler\.authorized/);
assert.match(search, /qualityStatus/);

const registry = read('api/registry.js');
assert.match(registry, /MAX_WORKBOOK_BYTES/);
assert.match(registry, /MIN_EXPECTED_ROWS/);
assert.match(registry, /pendingDataset/);
assert.match(registry, /ETag/);
assert.match(registry, /if-none-match/);

console.log('Clinical API contract audit passed.');
