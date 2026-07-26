const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const apis = ['api/registry.js', 'api/dosage.js', 'api/icd.js', 'api/drug-search.js'];

for (const file of apis) {
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio:'pipe' });
  const source = read(file);
  assert.match(source, /authorized|verifySessionToken/, `${file}: authentication guard missing`);
  assert.match(source, /X-Content-Type-Options/, `${file}: nosniff missing`);
  assert.match(source, /Cache-Control/, `${file}: cache policy missing`);
}

const dosage = read('api/dosage.js');
assert.match(dosage, /MAX_WORKBOOK_BYTES/);
assert.match(dosage, /pendingBuild/);
assert.match(dosage, /sourceDate:clean\(row\['Data e burimit'\]\)/);
assert.match(dosage, /const cards = cardsResult\.output/);
assert.match(dosage, /cardsReadOnlyWhenAutoFillDisabled/);
assert.match(dosage, /X-MedIndex-Dosage-Cards/);
assert.doesNotMatch(dosage, /const cards = clinicalAutoFillEnabled \? cardsResult\.output : \[\]/);

const icd = read('api/icd.js');
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