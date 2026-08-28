'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const drugSearch = require('../api/drug-search.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'registry-v2.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'registry-v2.js'), 'utf8');

assert.match(html, /data-drx-app="registry-v2"/);
assert.match(html, /\/registry-v2\.css\?v=profile-columns-v5/);
assert.match(html, /\/registry-v2\.js\?v=profile-columns-v5/);
assert.match(html, /\/drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/);
assert.doesNotMatch(html, /registry-mobile-|registry-ux-phase|registry-unified-table|registry-table-tools|tailadmin-/);

[
  'searchInput',
  'filterPanel',
  'formPickerButton',
  'formPickerPanel',
  'formPickerSearch',
  'formPickerList',
  'registryTable',
  'registryRows',
  'prevPageButton',
  'nextPageButton',
  'detailDrawer',
  'drawerBody',
].forEach(id => assert.match(html, new RegExp(`id="${id}"`)));

assert.match(css, /--accent:#635bff/);
assert.match(css, /\.detail-drawer/);
assert.match(css, /\.form-picker-panel/);
assert.match(css, /\.form-category/);
assert.match(css, /\.form-option/);
assert.match(css, /@media\(max-width:760px\)/);
assert.doesNotMatch(css, /!important/);

assert.match(js, /view:'registry-page'/);
assert.match(js, /\/api\/dosage\?view=cards/);
assert.match(js, /view=registry-detail/);
assert.match(js, /\/api\/dosage\?view=card/);
assert.match(js, /AbortController/);
assert.match(js, /requestId/);
assert.match(js, /escapeHtml/);
assert.match(js, /FORM_GROUPS/);
assert.match(js, /formExact/);
assert.match(js, /formCategory/);
assert.doesNotThrow(() => new Function(js));

const page = drugSearch.buildPageRequest({
  page:'2',
  pageSize:'50',
  includeTotal:'true',
  q:'amoxicillin',
  status:'Gjenerik',
  atc:'N02',
  form:'Tabletë',
  sort:'name',
  direction:'desc',
});

assert.equal(page.page, 2);
assert.equal(page.pageSize, 50);
assert.equal(page.includeTotal, true);
assert.equal(page.sort, 'name');
assert.equal(page.direction, 'desc');
assert.equal(page.atc, 'N02');
assert.match(page.path, /is_published=eq\.true/);
assert.match(page.path, /editorial_status=eq\.published/);
assert.match(page.path, /limit=50/);
assert.match(page.path, /offset=50/);
assert.match(page.path, /registry_search_text=ilike/);
assert.match(decodeURIComponent(page.path), /atc_code=ilike\.N02\*/);

const capped = drugSearch.buildPageRequest({ pageSize:'500' });
assert.equal(capped.pageSize, drugSearch.REGISTRY_MAX_PAGE_SIZE);

console.log('registry-v2-contract-test: ok');
