'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ATC = require('../registry-atc-filter.js');
const drugSearch = require('../api/drug-search.js');
const context = { window:{} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../classification-data.js'), 'utf8'), context);
const catalog = ATC.buildCatalog(context.window.MEDINDEX_ATC_GROUPS, context.window.MEDINDEX_ATC_SUBGROUPS, context.window.MEDINDEX_ATC_SUBDIVISIONS);

assert.equal(catalog.roots.length, 14);
assert.deepEqual(ATC.codePath(' j 01 ca 04 '), ['J', 'J01', 'J01C', 'J01CA', 'J01CA04']);
assert.equal(catalog.nodes.get('J01CA').name, 'Penicilina me spektër të gjerë');
assert.ok(catalog.nodes.get('J01C').children.some(node => node.code === 'J01CA'));
assert.ok(ATC.searchCatalog(catalog, 'spekter te gjere').some(node => node.code === 'J01CA'));
assert.equal(ATC.searchCatalog(catalog, 'N02BE')[0].code, 'N02BE');
assert.equal(ATC.searchCatalog(catalog, 'not-a-category').length, 0);

for (const code of ['J', 'J01', 'J01C', 'J01CA', 'J01CA04']) {
  assert.equal(ATC.normalizeCode(code), code);
  const request = drugSearch.buildPageRequest({ atc:code, q:'amoxicillin', formExact:'Capsule', page:2 });
  const params = new URLSearchParams(request.path.split('?')[1]);
  assert.equal(request.atc, code);
  assert.equal(params.get('atc_code'), `ilike.${code}${code.length === 7 ? '' : '*'}`);
  assert.equal(params.get('registry_search_text'), 'ilike.*amoxicillin*');
  assert.equal(params.get('pharmaceutical_form'), 'eq.Capsule');
}
for (const code of ['', 'J0', 'J01CA0', 'J01CA041', 'J01CA*', 'J01CA04,atc_code.eq.N02BE01', '<script>']) {
  assert.equal(ATC.normalizeCode(code), '');
  const params = new URLSearchParams(drugSearch.buildPageRequest({ atc:code }).path.split('?')[1]);
  assert.equal(params.has('atc_code'), false);
}
console.log('Registry ATC picker: full hierarchy, Albanian search, exact codes and combined API filters passed.');
