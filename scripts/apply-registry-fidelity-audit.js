const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(ROOT, file), content);

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Nuk u gjet blloku për ${label}.`);
  return source.replace(before, after);
}

let registry = read('api/registry.js');
const oldMerge = `function rowKey(row) {
  return \`\${normalizeHeader(row.PDID)}|\${normalizeHeader(row.ProtocolNo)}\`;
}

function buildPrescriptionMap(rows) {
  const exact = new Map();
  const byPdid = new Map();
  rows.forEach(row => {
    const notation = normalizeHeader(row['Si të shënohet në recetë']);
    if (!notation) return;
    exact.set(rowKey(row), notation);
    const pdid = normalizeHeader(row.PDID);
    if (pdid && !byPdid.has(pdid)) byPdid.set(pdid, notation);
  });
  return { exact, byPdid };
}

function attachPrescriptionNotation(rows, prescriptionRows = []) {
  const maps = buildPrescriptionMap(prescriptionRows);
  let matched = 0;
  let generated = 0;
  const output = rows.map(row => {
    const pdid = normalizeHeader(row.PDID);
    const fromSheet = maps.exact.get(rowKey(row)) || maps.byPdid.get(pdid) || '';
    const notation = fromSheet || PrescriptionNotation.build(row).full;
    if (fromSheet) matched += 1;
    else generated += 1;
    return { ...row, 'Si të shënohet në recetë':notation };
  });
  return { rows:output, matched, generated, sheetRows:prescriptionRows.length };
}`;

const newMerge = `function rowKey(row) {
  return \`\${normalizeHeader(row.PDID)}|\${normalizeHeader(row.ProtocolNo)}\`;
}

function ordinalKey(row) {
  return normalizeHeader(row['Nr rendor']);
}

function identityKey(row) {
  return [
    row['Emri tregtar'], row['Substanca aktive'], row['ATC Code'],
    row['Fortësia'], row['Forma farmaceutike'], row['Madhësia e paketimit'],
  ].map(normalizeHeader).join('|');
}

function buildUniqueMap(rows, keyForRow) {
  const values = new Map();
  const ambiguous = new Set();
  rows.forEach(row => {
    const notation = normalizeHeader(row['Si të shënohet në recetë']);
    const key = keyForRow(row);
    if (!notation || !key || ambiguous.has(key)) return;
    if (values.has(key) && values.get(key) !== notation) {
      values.delete(key);
      ambiguous.add(key);
      return;
    }
    values.set(key, notation);
  });
  return { values, ambiguous };
}

function buildPrescriptionMap(rows) {
  return {
    byOrdinal:buildUniqueMap(rows, ordinalKey),
    byIdentity:buildUniqueMap(rows, identityKey),
    exact:buildUniqueMap(rows, rowKey),
    byPdid:buildUniqueMap(rows, row => normalizeHeader(row.PDID)),
  };
}

function attachPrescriptionNotation(rows, prescriptionRows = []) {
  const maps = buildPrescriptionMap(prescriptionRows);
  const stats = { matched:0, generated:0, matchedByOrdinal:0, matchedByIdentity:0, matchedByExact:0, matchedByPdid:0 };
  const output = rows.map(row => {
    const candidates = [
      ['matchedByOrdinal', maps.byOrdinal.values.get(ordinalKey(row))],
      ['matchedByIdentity', maps.byIdentity.values.get(identityKey(row))],
      ['matchedByExact', maps.exact.values.get(rowKey(row))],
      ['matchedByPdid', maps.byPdid.values.get(normalizeHeader(row.PDID))],
    ];
    const match = candidates.find(([, value]) => value);
    const fromSheet = match?.[1] || '';
    const notation = fromSheet || PrescriptionNotation.build(row).full;
    if (fromSheet) {
      stats.matched += 1;
      stats[match[0]] += 1;
    } else stats.generated += 1;
    return { ...row, 'Si të shënohet në recetë':notation, __sheetPrescriptionNotation:fromSheet };
  });
  return {
    rows:output,
    ...stats,
    sheetRows:prescriptionRows.length,
    ambiguousOrdinal:maps.byOrdinal.ambiguous.size,
    ambiguousIdentity:maps.byIdentity.ambiguous.size,
    ambiguousExact:maps.exact.ambiguous.size,
    ambiguousPdid:maps.byPdid.ambiguous.size,
  };
}`;
registry = replaceOnce(registry, oldMerge, newMerge, 'bashkimin e kolonës së recetës');

const oldDataset = `  const sourceRows = bufferToRows(workbookBuffer);
  const enriched = attachPrescriptionNotation(sourceRows, prescriptionResult.rows);
  const quality = registryQuality.applyRows(enriched.rows);
  return {
    rows:quality.rows,
    meta:{`;
const newDataset = `  const sourceRows = bufferToRows(workbookBuffer);
  const enriched = attachPrescriptionNotation(sourceRows, prescriptionResult.rows);
  const quality = registryQuality.applyRows(enriched.rows);
  const rows = quality.rows.map(row => {
    const generated = PrescriptionNotation.build(row);
    return {
      ...row,
      __prescriptionLine:generated.line,
      __packagingSummary:generated.packaging,
      __dispense:generated.dispense,
      __prescriptionRoute:generated.route,
    };
  });
  return {
    rows,
    meta:{`;
registry = replaceOnce(registry, oldDataset, newDataset, 'pasurimin e dataset-it');
registry = replaceOnce(registry,
`      prescriptionMatched:enriched.matched,
      prescriptionGeneratedFallback:enriched.generated,
      prescriptionSheetError:prescriptionResult.error || '',`,
`      prescriptionMatched:enriched.matched,
      prescriptionGeneratedFallback:enriched.generated,
      prescriptionMatchedByOrdinal:enriched.matchedByOrdinal,
      prescriptionMatchedByIdentity:enriched.matchedByIdentity,
      prescriptionMatchedByExact:enriched.matchedByExact,
      prescriptionMatchedByPdid:enriched.matchedByPdid,
      prescriptionAmbiguousOrdinal:enriched.ambiguousOrdinal,
      prescriptionAmbiguousIdentity:enriched.ambiguousIdentity,
      prescriptionAmbiguousExact:enriched.ambiguousExact,
      prescriptionAmbiguousPdid:enriched.ambiguousPdid,
      prescriptionSheetError:prescriptionResult.error || '',`,
'metadatat e auditimit');
write('api/registry.js', registry);

let local = read('local-registry.js');
local = replaceOnce(local,
`  const MAX_QUERY_LENGTH = 90;
  let rowsPromise = null;`,
`  const MAX_QUERY_LENGTH = 90;
  const REGISTRY_SCHEMA_VERSION = 'registry-fidelity-v1';
  let rowsPromise = null;`,
'versionin e cache-it lokal');
local = local.replace(`        version: 'production-audit-v1',`, `        version: REGISTRY_SCHEMA_VERSION,`);
local = local.replace(`    if (!record?.parts?.length) record = await fetchAndStoreParts();`, `    if (!record?.parts?.length || record.version !== REGISTRY_SCHEMA_VERSION) record = await fetchAndStoreParts();`);
const oldResult = `  function resultFromRow(row) {
    const tradeName = clean(row['Emri tregtar']);
    const substance = clean(row['Substanca aktive']);
    const strength = clean(row['Fortësia']);
    const form = clean(row['Forma farmaceutike']);
    const pdid = clean(row.PDID);
    return {
      key: \`\${pdid}|\${tradeName}|\${strength}\`,
      tradeName,
      substance,
      strength,
      form,
      atc: clean(row['ATC Code']),
      pdid,
      qualityStatus: clean(row.__qualityStatus || 'verified'),
    };
  }`;
const newResult = `  function resultFromRow(row) {
    const tradeName = clean(row['Emri tregtar']);
    const substance = clean(row['Substanca aktive']);
    const strength = clean(row['Fortësia']);
    const form = clean(row['Forma farmaceutike']);
    const packaging = clean(row['Madhësia e paketimit']);
    const pdid = clean(row.PDID);
    const protocolNo = clean(row.ProtocolNo);
    const sheetPrescriptionNotation = clean(row.__sheetPrescriptionNotation || row['Si të shënohet në recetë']);
    return {
      key: \`\${pdid}|\${protocolNo}|\${tradeName}|\${strength}\`,
      tradeName,
      substance,
      strength,
      form,
      packaging,
      prescriptionLine:clean(row.__prescriptionLine),
      prescriptionNotation:clean(row['Si të shënohet në recetë']),
      packagingSummary:clean(row.__packagingSummary),
      dispense:clean(row.__dispense),
      route:clean(row.__prescriptionRoute),
      sheetPrescriptionNotation,
      atc:clean(row['ATC Code']),
      pdid,
      protocolNo,
      qualityStatus:clean(row.__qualityStatus || 'verified'),
    };
  }`;
local = replaceOnce(local, oldResult, newResult, 'rezultatin lokal të barit');
local = replaceOnce(local,
`    const atc = normalize(row['ATC Code']);
    const haystack = \`\${substance} \${trade} \${strength} \${form} \${atc}\`;`,
`    const atc = normalize(row['ATC Code']);
    const prescription = normalize(row['Si të shënohet në recetë']);
    const packaging = normalize(row['Madhësia e paketimit']);
    const haystack = \`\${substance} \${trade} \${strength} \${form} \${atc} \${prescription} \${packaging}\`;`,
'indeksin e kërkimit lokal');
write('local-registry-fidelity.js', local);

let recetat = read('recetat.html');
if (!recetat.includes('local-registry-fidelity.js')) {
  recetat = recetat.replace(
    `  <script src="auth-client.js?v=production-audit-v1" defer></script>`,
    `  <script src="local-registry-fidelity.js?v=registry-fidelity-v1" defer></script>\n  <script src="auth-client.js?v=production-audit-v1" defer></script>`
  );
}
write('recetat.html', recetat);

let sw = read('sw.js');
if (!sw.includes("'/local-registry-fidelity.js'")) {
  sw = sw.replace(
    `'/clinical-workflow.js', '/local-registry.js', '/auth-client.js',`,
    `'/clinical-workflow.js', '/local-registry.js', '/local-registry-fidelity.js', '/auth-client.js',`
  );
}
write('sw.js', sw);

const test = `const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../api/registry.js');

const sourceRows = [
  { 'Nr rendor':3844, ProtocolNo:'d.fizike', PDID:'d.fizike', 'Emri tregtar':'Parcoten', 'Substanca aktive':'Paracetamol & Codeine Phosphate', 'ATC Code':'N02AJ06', 'Fortësia':'500mg/10mg', 'Forma farmaceutike':'Tablet', 'Madhësia e paketimit':'20 tablets' },
  { 'Nr rendor':3845, ProtocolNo:'d.fizike', PDID:'d.fizike', 'Emri tregtar':'Bortezomib STADA', 'Substanca aktive':'Bortezomib', 'ATC Code':'L01XG01', 'Fortësia':'2.5 mg/ml', 'Forma farmaceutike':'Solution for injection', 'Madhësia e paketimit':'One 1.4 ml vial' },
  { 'Nr rendor':3846, ProtocolNo:'d.fizike', PDID:'d.fizike', 'Emri tregtar':'Amoxicillin Stada', 'Substanca aktive':'Amoxicillin', 'ATC Code':'J01CA04', 'Fortësia':'1000 mg', 'Forma farmaceutike':'Film coated tablet', 'Madhësia e paketimit':'10 tablets' },
];
const prescriptionRows = sourceRows.map((row, index) => ({ ...row, 'Si të shënohet në recetë':\`NOTATION-\${index + 1}\` }));
const result = registry.attachPrescriptionNotation(sourceRows, prescriptionRows);
assert.equal(result.rows.length, 3);
assert.deepEqual(result.rows.map(row => row['Si të shënohet në recetë']), ['NOTATION-1', 'NOTATION-2', 'NOTATION-3']);
assert.equal(result.matched, 3);
assert.equal(result.generated, 0);
assert.equal(result.matchedByOrdinal, 3);
assert.equal(result.ambiguousExact, 1);
assert.equal(result.ambiguousPdid, 1);

const root = path.resolve(__dirname, '..');
const local = fs.readFileSync(path.join(root, 'local-registry-fidelity.js'), 'utf8');
for (const marker of ['REGISTRY_SCHEMA_VERSION', 'packagingSummary', 'prescriptionLine', 'sheetPrescriptionNotation', 'record.version !== REGISTRY_SCHEMA_VERSION']) {
  assert.ok(local.includes(marker), \`local registry missing \${marker}\`);
}
const html = fs.readFileSync(path.join(root, 'recetat.html'), 'utf8');
assert.match(html, /local-registry-fidelity\\.js\\?v=registry-fidelity-v1/);
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.match(worker, /local-registry-fidelity\\.js/);
console.log('Registry source fidelity and collision audit passed.');
`;
write('tests/registry-source-fidelity-test.js', test);

const packagePath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const command = 'node tests/registry-source-fidelity-test.js';
if (!pkg.scripts.test.includes(command)) pkg.scripts.test += ` && ${command}`;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

let workflow = read('.github/workflows/medindex-validation.yml');
if (!workflow.includes('registry-source-fidelity-test.js')) {
  workflow = workflow.replace(
    `          test -f tests/prescription-notation-test.js`,
    `          test -f tests/prescription-notation-test.js\n          test -f tests/registry-source-fidelity-test.js\n          test -f local-registry-fidelity.js`
  );
}
write('.github/workflows/medindex-validation.yml', workflow);

console.log('Registry fidelity audit changes applied.');
