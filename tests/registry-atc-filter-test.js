const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

global.window = {};
delete require.cache[require.resolve(path.join(ROOT, 'classification-data.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'atc-shared.js'))];
require(path.join(ROOT, 'classification-data.js'));
const ATC = require(path.join(ROOT, 'atc-shared.js'));

const sampleRows = [
  { 'Emri tregtar':'Panadol', 'Substanca aktive':'Paracetamol', 'ATC Code':'N02BE01' },
  { 'Emri tregtar':'Imigran', 'Substanca aktive':'Sumatriptan', 'ATC Code':'N02CC01' },
  { 'Emri tregtar':'Keppra', 'Substanca aktive':'Levetiracetam', 'ATC Code':'N03AX14' },
  { 'Emri tregtar':'Brufen', 'Substanca aktive':'Ibuprofen', 'ATC Code':'M01AE01' },
  { 'Emri tregtar':'Anzibel', 'Substanca aktive':'Kombinim për fytin', 'ATC Code':'R02AAXX' },
  { 'Emri tregtar':'Prospan', 'Substanca aktive':'Hedera helix', 'ATC Code':'R05CAXX' },
  { 'Emri tregtar':'NoNausea', 'Substanca aktive':'Pa klasifikim', 'ATC Code':'N/A' },
];

const categoryRows = sampleRows.filter(row => ATC.matchesCategory(row['ATC Code'], 'N02'));
assert.deepEqual(categoryRows.map(row => row['Emri tregtar']), ['Panadol', 'Imigran']);

const searchedRows = categoryRows.filter(row =>
  `${row['Emri tregtar']} ${row['Substanca aktive']}`.toLowerCase().includes('paracetamol')
);
assert.deepEqual(searchedRows.map(row => row['Emri tregtar']), ['Panadol']);

assert.deepEqual(
  sampleRows.filter(row => ATC.matchesCategory(row['ATC Code'], 'R02')).map(row => row['Emri tregtar']),
  ['Anzibel'],
  'Non-standard R02 legacy codes must remain visible in the R02 category'
);
assert.deepEqual(
  sampleRows.filter(row => ATC.matchesCategory(row['ATC Code'], 'R05')).map(row => row['Emri tregtar']),
  ['Prospan'],
  'Non-standard R05 legacy codes must remain visible in the R05 category'
);
assert.equal(ATC.matchesCategory('N/A', 'N02'), false, 'Unclassified products must not be assigned to an ATC category');

const coreTail = read('app-parts/core-tail.txt');
assert.match(coreTail, /applyRegistryUrlStateFromLocation\(\)/, 'Registry must initialize its state from the URL');
assert.match(coreTail, /state\.activeAtc = next\.atc/, 'Registry state must keep the active ATC category');
assert.match(coreTail, /registryUrlFromState/, 'Registry must synchronize ATC, query and pagination back to the URL');
assert.match(coreTail, /window\.addEventListener\('popstate'/, 'Browser back and forward must restore registry URL state');
assert.match(coreTail, /getRegistryAtcRows/, 'Registry must have a dedicated ATC-filtered row source');
assert.match(coreTail, /const matches = window\.MedIndexATC\?\.matchesCategory/, 'ATC filtering must use the canonical category matcher');
assert.match(coreTail, /RAW\.filter\(row => matches\(row\['ATC Code'\], activeAtc\)\)/, 'The canonical matcher must filter the registry rows');
assert.match(coreTail, /medindex:registry-atc-state/, 'Registry must publish the active category state for later UI integration');

const atcFilterPosition = coreTail.indexOf('let rows = getRegistryAtcRows();');
const searchPosition = coreTail.indexOf('const q = normalizeSearchText(state.search);', atcFilterPosition);
const renderSource = read('app-parts/part-03.txt') + read('app-parts/part-04.txt');
assert.ok(atcFilterPosition >= 0 && searchPosition > atcFilterPosition, 'ATC must be applied before text search');
assert.match(renderSource, /const filtered = sortRows\(getFiltered\(\)\)/, 'The renderer and pagination must consume fully filtered registry rows');
assert.match(renderSource, /const pageRows = filtered\.slice\(start, start \+ pageSize\)/, 'Pagination must slice only after every filter has been applied');

const sourceFiles = [
  'app-parts/part-01.txt',
  'app-parts/part-02.txt',
  'app-parts/part-03.txt',
  'app-parts/part-04.txt',
  'app-parts/core-tail.txt',
];
const bundle = sourceFiles.map(read).join('');
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-atc-filter-'));
const tempFile = path.join(tempDirectory, 'registry-runtime.js');
try {
  fs.writeFileSync(tempFile, bundle, 'utf8');
  execFileSync(process.execPath, ['--check', tempFile], { stdio:'pipe' });
} finally {
  fs.rmSync(tempDirectory, { recursive:true, force:true });
}

console.log('Registry ATC filtering and URL-state tests passed.');
