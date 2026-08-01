const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('icd.html');
const browser = read('icd-advanced-search.js');
const styles = read('icd-advanced-search.css');
const api = read('api/icd-advanced-search.js');
const engine = read('lib/icd-search-engine.js');

for (const asset of [
  'icd-advanced-search.css?v=sq-clinical-search-v1',
  'icd-advanced-search.js?v=sq-clinical-search-v1',
]) assert.ok(html.includes(asset), `ICD advanced search page missing ${asset}`);

assert.ok(
  html.indexOf('icd-advanced-search.js?v=sq-clinical-search-v1') < html.indexOf('icd-full-table.js?v=icd-full-table-v1'),
  'Advanced fetch routing must load before the table controller.',
);

for (const marker of [
  '/api/icd-advanced-search', 'sq-clinical-search-v1', 'MutationObserver',
  'Diagnoza të sugjeruara', 'Kategori më të gjera', 'Nënkode më specifike',
  'nuk vendosin diagnozë',
]) assert.ok(browser.includes(marker), `Browser integration missing ${marker}`);

for (const marker of [
  'icd-suggestion-group-title', 'icd-suggestion-match', 'icd-suggestion-safety',
  '@media(max-width:620px)', 'html[data-theme="dark"]', '@media(forced-colors:active)',
]) assert.ok(styles.includes(marker), `Advanced suggestion CSS missing ${marker}`);

for (const marker of [
  "require('../lib/icd-search-engine.js')", 'verifySessionToken', 'MAX_QUERY_CHARS',
  'strictCounts:true', 'diagnosticDecision:false', 'X-MedIndex-Search-Version',
  "['GET', 'HEAD']", 'private, no-store',
]) assert.ok(api.includes(marker), `Advanced search API missing ${marker}`);

for (const marker of [
  'ALIAS_ROWS', 'boundedDistance', 'aliasExpansions', 'rankNodes', 'suggestDataset',
  'nuk vendosin diagnozë',
]) assert.ok(engine.includes(marker), `Advanced search engine missing ${marker}`);

assert.doesNotMatch(browser, /eval\s*\(|new Function\s*\(/, 'Browser search integration must not use dynamic code.');
assert.doesNotMatch(styles, /https?:\/\//, 'Advanced search CSS must not load external assets.');
assert.doesNotMatch(api, /res\.status\(200\).*verifySessionToken/s, 'Authentication must happen before successful data delivery.');

new Function(browser);
new Function(api);
new Function(engine);

console.log('Advanced ICD search wiring, authentication, accessibility and safety contract passed.');
