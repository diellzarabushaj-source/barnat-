const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

global.window = {};
delete require.cache[require.resolve(path.join(ROOT, 'classification-data.js'))];
delete require.cache[require.resolve(path.join(ROOT, 'atc-shared.js'))];
require(path.join(ROOT, 'classification-data.js'));
const ATC = require(path.join(ROOT, 'atc-shared.js'));

const groups = global.window.MEDINDEX_ATC_GROUPS;
const categories = global.window.MEDINDEX_ATC_SUBGROUPS;
const groupCodes = Object.keys(groups);
const categoryCodes = Object.keys(categories);

assert.equal(groupCodes.length, 14, 'The regression matrix expects all 14 ATC groups');
assert.equal(categoryCodes.length, 81, 'The regression matrix expects all 81 MedIndex categories');
assert.equal(new Set(categoryCodes).size, categoryCodes.length, 'ATC category codes must be unique');

let childTotal = 0;
const generatedUrls = new Set();

for (const groupCode of groupCodes) {
  const children = ATC.getChildren(groupCode);
  const expected = categoryCodes.filter(code => code.startsWith(groupCode));
  childTotal += children.length;
  assert.deepEqual(
    children.map(child => child.code),
    expected,
    `Group ${groupCode} must expose every category once and in catalog order`
  );
}

assert.equal(childTotal, 81, 'The 14 group menus must expose exactly 81 category destinations');

for (const code of categoryCodes) {
  const name = categories[code];
  const group = code.charAt(0);
  const label = `${code} — ${name}`;
  const fullCode = `${code}AA01`;

  assert.equal(ATC.resolveGroupCode(code), group, `${code} must resolve to group ${group}`);
  assert.equal(ATC.resolveCategoryCode(fullCode), code, `${fullCode} must resolve to ${code}`);
  assert.equal(ATC.getCategoryName(code), name, `${code} must preserve its Albanian category name`);
  assert.equal(ATC.getCategoryLabel(code), label, `${code} must expose the canonical visible label`);
  assert.equal(ATC.matchesCategory(fullCode, code), true, `${fullCode} must match ${code}`);

  const url = ATC.registryUrl({ atc:code });
  assert.equal(url, `/index.html?atc=${code}`, `${code} must open the main medicines table`);
  assert.equal(generatedUrls.has(url), false, `${code} generated a duplicate destination URL`);
  generatedUrls.add(url);

  const directState = ATC.readRegistryUrlState(`https://medindex.local${url}`);
  assert.equal(directState.atc, code, `${code} must survive direct refresh and deep linking`);
  assert.equal(directState.page, 1, `${code} deep links must start on page 1`);
  assert.equal(directState.pageSize, 50, `${code} deep links must keep the default page size`);

  const combined = ATC.registryUrlFromState(
    'https://medindex.local/index.html?q=test&page=4&pageSize=100',
    { atc:code, query:'test', page:1, pageSize:100 }
  );
  const combinedUrl = new URL(combined, 'https://medindex.local');
  assert.equal(combinedUrl.pathname, '/index.html');
  assert.equal(combinedUrl.searchParams.get('atc'), code, `${code} must combine with table search`);
  assert.equal(combinedUrl.searchParams.get('q'), 'test', `${code} must preserve the active table query`);
  assert.equal(combinedUrl.searchParams.get('page'), null, `${code} changes must reset pagination`);
  assert.equal(combinedUrl.searchParams.get('pageSize'), '100', `${code} must preserve page size`);
}

assert.equal(generatedUrls.size, 81, 'Every category must have one unique main-table destination');
assert.equal(ATC.matchesCategory('R02AAXX', 'R02'), true, 'Legacy R02 codes must remain visible');
assert.equal(ATC.matchesCategory('R05CAXX', 'R05'), true, 'Legacy R05 codes must remain visible');
assert.equal(ATC.matchesCategory('N02BE01', 'N03'), false, 'A medicine must not leak into a neighboring category');

const sidebar = read('atc-sidebar.js');
const context = read('registry-atc-context.js');
const vercel = JSON.parse(read('vercel.json'));

assert.doesNotMatch(sidebar, /href=["']\/klasifikimi|classificationUrl\(/, 'Sidebar destinations must never reopen the removed page');
assert.doesNotMatch(context, /\/klasifikimi(?:\.html)?|classificationUrl/, 'The category panel must stay on the medicines table');
assert.ok(
  vercel.redirects.some(rule => rule.source === '/klasifikimi' && rule.destination === '/index.html'),
  'The old extensionless route must remain a compatibility redirect to the main table'
);
assert.ok(
  vercel.redirects.some(rule => rule.source === '/klasifikimi.html' && rule.destination === '/index.html'),
  'The old HTML route must remain a compatibility redirect to the main table'
);

console.log('All 81 ATC category routes, labels, filters and navigation contracts passed.');