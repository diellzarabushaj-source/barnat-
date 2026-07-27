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
  assert.match(source, /X-MedIndex-Data-Source|registryHandler/, `${file}: data-source observability missing`);
}

const reader = read('lib/neon-clinical-reader.js');
assert.match(reader, /QUERY_TIMEOUT_MS/);
assert.match(reader, /PAGE_SIZE/);
assert.match(reader, /MINIMUMS/);
assert.match(reader, /editorial_status=eq\.published/);
assert.match(reader, /calculation_status=in\.\(text_verified,calculable_verified\)/);
assert.match(reader, /is_published=eq\.true/);
assert.doesNotMatch(reader, /window\.|document\.|localStorage|sessionStorage/);

const dosage = read('api/dosage.js');
assert.match(dosage, /buildNeonPayload/);
assert.match(dosage, /ENABLE_DOSAGE_AUTOFILL/);
assert.match(dosage, /cardsReadOnlyWhenAutoFillDisabled/);
assert.match(dosage, /X-MedIndex-Dosage-Cards/);
assert.match(dosage, /X-MedIndex-Dosage-Regimens/);
assert.match(dosage, /totalPublishedRegimens/);
assert.doesNotMatch(dosage, /require\(['"]xlsx['"]\)/i, 'normal dosage request path must not parse Excel');

const icd = read('api/icd.js');
assert.match(icd, /scope === 'labs'/);
assert.match(icd, /getPublishedIcdCodes/);
assert.match(icd, /getPublishedLabTests/);
assert.match(icd, /Server-Timing/);
assert.match(icd, /ok:false, data:null/);
assert.doesNotMatch(icd, /docs\.google\.com|MAX_CSV_BYTES|parseCsv/);

const search = read('api/drug-search.js');
assert.match(search, /MAX_QUERY/);
assert.match(search, /MAX_RESULTS/);
assert.match(search, /slice\(0, MAX_QUERY\)/);
assert.match(search, /registryHandler\.authorized/);
assert.match(search, /qualityStatus/);

const registry = read('api/registry.js');
assert.match(registry, /buildNeonDataset/);
assert.match(registry, /getPublishedDrugs/);
assert.match(registry, /pendingDatasets/);
assert.match(registry, /ETag/);
assert.match(registry, /if-none-match/);
assert.doesNotMatch(registry, /require\(['"]xlsx['"]\)/i, 'normal registry request path must not parse Excel');

console.log('Clinical API contract audit passed.');
