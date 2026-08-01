const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

global.window = {};
delete require.cache[require.resolve(path.join(ROOT, 'classification-data.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'atc-shared.js'))];
require(path.join(ROOT, 'classification-data.js'));
const ATC = require(path.join(ROOT, 'atc-shared.js'));

const groups = global.window.MEDINDEX_ATC_GROUPS;
const categories = global.window.MEDINDEX_ATC_SUBGROUPS;
const groupCodes = Object.keys(groups);
const categoryCodes = Object.keys(categories);

assert.deepEqual(
  groupCodes,
  ['A', 'B', 'C', 'D', 'G', 'H', 'J', 'L', 'M', 'N', 'P', 'R', 'S', 'V'],
  'The ATC catalog must preserve the complete official top-level group order used by MedIndex'
);
assert.equal(groupCodes.length, 14, 'The catalog must expose all 14 top-level ATC groups');
assert.equal(categoryCodes.length, 81, 'The current MedIndex catalog must expose all 81 populated therapeutic categories');

for (const [code, name] of Object.entries(groups)) {
  assert.match(code, /^[A-Z]$/, `Invalid ATC group code: ${code}`);
  assert.ok(String(name).trim(), `ATC group ${code} needs a visible name`);
  assert.ok(
    categoryCodes.some(categoryCode => categoryCode.startsWith(code)),
    `ATC group ${code} must have at least one child category`
  );
}

for (const [code, name] of Object.entries(categories)) {
  assert.match(code, /^[A-Z]\d{2}$/, `Invalid ATC category code: ${code}`);
  assert.ok(Object.hasOwn(groups, code.charAt(0)), `ATC category ${code} has no known parent group`);
  assert.ok(String(name).trim(), `ATC category ${code} needs a visible name`);
  assert.equal(ATC.resolveCategoryCode(`${code}AA01`), code, `ATC category ${code} must resolve from a full code`);
}

const representativeRows = categoryCodes.map(code => ({ atc_code:`${code}AA01` }));
representativeRows.push(
  { atc_code:'R02AAXX' },
  { atc_code:'R05CAXX' },
  { atc_code:'N/A' },
  { atc_code:'N02-!' },
  { atc_code:'Z01AA01' },
  { atc_code:'N99AA01' }
);

const report = ATC.auditRows(representativeRows);
assert.equal(report.total, 87);
assert.equal(report.catalog.groups, 14);
assert.equal(report.catalog.categories, 81);
assert.equal(report.statuses.standard, 81);
assert.equal(report.statuses.nonstandardResolvable, 2);
assert.equal(report.statuses.unclassified, 1);
assert.equal(report.statuses.invalid, 1);
assert.equal(report.statuses.unknownGroup, 1);
assert.equal(report.statuses.unknownCategory, 1);
assert.equal(report.categorized, 83);
assert.deepEqual(report.emptyCategories, []);
assert.equal(report.categoryCounts.R02, 2, 'R02AAXX must remain visible in R02');
assert.equal(report.categoryCounts.R05, 2, 'R05CAXX must remain visible in R05');
assert.deepEqual(report.examples.nonstandardResolvable, ['R02AAXX', 'R05CAXX']);
assert.deepEqual(report.examples.unclassified, ['N/A']);

assert.deepEqual(ATC.classifyCode('N02BE01'), {
  raw:'N02BE01',
  normalized:'N02BE01',
  group:'N',
  category:'N02',
  status:'standard',
  isStandard:true,
  isCategoryResolvable:true,
});
assert.deepEqual(ATC.classifyCode('R02AAXX'), {
  raw:'R02AAXX',
  normalized:'R02AAXX',
  group:'R',
  category:'R02',
  status:'nonstandard-resolvable',
  isStandard:false,
  isCategoryResolvable:true,
});
assert.equal(ATC.classifyCode('N/A').status, 'unclassified');
assert.equal(ATC.classifyCode('N02-!').status, 'invalid');
assert.equal(ATC.classifyCode('Z01AA01').status, 'unknown-group');
assert.equal(ATC.classifyCode('N99AA01').status, 'unknown-category');

console.log('ATC category catalog integrity and coverage audit passed.');
