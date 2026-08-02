const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('icd.html');
const browser = read('icd-advanced-search.js');
const styles = read('icd-advanced-search.css');
const tree = read('icd-tree.js');
const apiWrapper = read('api/icd.js');
const apiBase = read('lib/icd-api-base.js');
const advancedHandler = read('lib/icd-advanced-handler.js');
const engineBase = read('lib/icd-search-engine.js');
const engine = read('lib/icd-search-engine-v2.js');

for (const asset of ['icd-advanced-search.css?v=sq-clinical-search-v1','icd-advanced-search.js?v=sq-clinical-search-v1']) {
  assert.ok(html.includes(asset), `ICD advanced search page missing ${asset}`);
}
assert.ok(
  html.indexOf('icd-advanced-search.js?v=sq-clinical-search-v1') < html.indexOf('icd-tree.js?v=icd-tree-v1'),
  'Advanced fetch routing must load before the tree controller.',
);

for (const marker of [
  "const SOURCE_PATH = '/api/icd'", "const ADVANCED_FLAG = 'advanced'", "url.searchParams.set(ADVANCED_FLAG, '1')",
  'sq-clinical-search-v1', 'MutationObserver', 'Diagnoza të sugjeruara',
  'Kategori më të gjera', 'Nënkode më specifike', 'nuk vendosin diagnozë',
]) assert.ok(browser.includes(marker), `Browser integration missing ${marker}`);
for (const marker of ['loadSuggestions', "endpoint('suggest'", 'revealCode', 'data-suggestion-index']) {
  assert.ok(tree.includes(marker), `Tree search integration missing ${marker}`);
}
for (const marker of [
  'icd-suggestion-group-title', 'icd-suggestion-match', 'icd-suggestion-safety',
  '@media(max-width:620px)', 'html[data-theme="dark"]', '@media(forced-colors:active)',
]) assert.ok(styles.includes(marker), `Advanced suggestion CSS missing ${marker}`);
for (const marker of [
  "require('../lib/icd-api-base.js')", "require('../lib/icd-advanced-handler.js')",
  "String(req.query?.advanced || '') === '1'", 'advancedHandler(req, res)', 'baseHandler(req, res)',
]) assert.ok(apiWrapper.includes(marker), `Shared ICD API router missing ${marker}`);
for (const marker of [
  "require('../lib/icd-search-engine-v2.js')", 'verifySessionToken', 'MAX_QUERY_CHARS',
  'strictCounts:true', 'diagnosticDecision:false', 'X-MedIndex-Search-Version', "['GET', 'HEAD']", 'private, no-store',
]) assert.ok(advancedHandler.includes(marker), `Advanced search handler missing ${marker}`);
for (const marker of ['FULL_SPREADSHEET_ID', 'loadFullHierarchy', 'fullViewPayload', 'X-MedIndex-ICD-Nodes']) {
  assert.ok(apiBase.includes(marker), `Base ICD handler missing ${marker}`);
}
for (const marker of ['ALIAS_ROWS', 'boundedDistance', 'aliasExpansions', 'rankNodes', 'suggestDataset', 'nuk vendosin diagnozë']) {
  assert.ok(engineBase.includes(marker), `Base advanced search engine missing ${marker}`);
}
for (const marker of ["require('./icd-search-engine.js')", 'exactEditorialAlias', 'prioritizeExactAlias', 'terminologyAliases', 'rankNodes', 'suggestDataset']) {
  assert.ok(engine.includes(marker), `Editorial alias ranking engine missing ${marker}`);
}
assert.ok(!fs.existsSync(path.join(root, 'api/icd-advanced-search.js')), 'Advanced search must not create a twelfth Vercel function.');
assert.doesNotMatch(browser, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(styles, /https?:\/\//);
assert.doesNotMatch(advancedHandler, /res\.status\(200\).*verifySessionToken/s);
new Function(browser); new Function(tree); new Function(apiWrapper); new Function(apiBase); new Function(advancedHandler); new Function(engineBase); new Function(engine);
console.log('Advanced ICD search routes into the hierarchy tree with authentication and safety contracts intact.');
