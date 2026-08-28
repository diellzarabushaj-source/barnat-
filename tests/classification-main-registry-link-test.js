'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const drugSearch = require('../api/drug-search.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('klasifikimi.html');
const css = read('classification-v2.css');
const js = read('classification-v2.js');
const data = read('classification-data.js');
const vercel = JSON.parse(read('vercel.json'));

assert.match(html, /data-drx-app="classification-v2"/);
assert.match(html, /classification-v2\.css\?v=1/);
assert.match(html, /classification-data\.js\?v=atc-catalog-v2/);
assert.match(html, /classification-v2\.js\?v=1/);
assert.doesNotMatch(html, /classification-redirect\.js|tailadmin-|medindex-tailadmin/);
assert.match(html, /id="atcSearch"/);
assert.match(html, /id="groupList"/);
assert.match(html, /id="categoryList"/);
assert.match(html, /href="\/index\.html"/);

for (const code of ['A','B','C','D','G','H','J','L','M','N','P','R','S','V']) {
  assert.ok(data.includes(`  ${code}:`), `Missing ATC group ${code}`);
}
for (const code of ['A10','C09','J01','N02','R03','S01']) {
  assert.ok(data.includes(`  ${code}:`), `Missing ATC category ${code}`);
}

assert.match(css, /--navy:#1c1e54/);
assert.match(css, /--stripe:#533afd/);
assert.match(css, /\.atc-workspace/);
assert.match(css, /\.group-row/);
assert.match(css, /\.category-row/);
assert.match(css, /@media\(max-width:760px\)/);
assert.doesNotMatch(css, /!important/);

assert.match(js, /\/api\/atc-counts/);
assert.match(js, /registryUrl\(code\)/);
assert.match(js, /\/index\.html/);
assert.match(js, /groupCounts/);
assert.match(js, /categoryDrugCount/);
assert.match(js, /subdivisionEntries/);
assert.match(js, /hashchange/);
assert.match(js, /AbortController/);
assert.doesNotThrow(() => new Function(js));

const redirects = Array.isArray(vercel.redirects) ? vercel.redirects : [];
assert.ok(!redirects.some(rule => rule.source === '/klasifikimi.html'), 'Classification page must no longer redirect away');
assert.ok(!redirects.some(rule => rule.source === '/klasifikimi'), 'Extensionless classification route must no longer redirect away');
const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
assert.ok(rewrites.some(rule => rule.source === '/klasifikimi' && rule.destination === '/klasifikimi.html'), 'Extensionless route must serve classification v2');

const category = drugSearch.buildPageRequest({ atc:'N02', page:'1', pageSize:'25' });
assert.equal(category.atc, 'N02');
assert.match(decodeURIComponent(category.path), /atc_code=ilike\.N02\*/);

const group = drugSearch.buildPageRequest({ atc:'C', page:'1', pageSize:'25' });
assert.equal(group.atc, 'C');
assert.match(decodeURIComponent(group.path), /atc_code=ilike\.C\*/);

const rejected = drugSearch.buildPageRequest({ atc:'N02BE01' });
assert.equal(rejected.atc, '');
assert.doesNotMatch(decodeURIComponent(rejected.path), /atc_code=/);

console.log('Standalone Stripe-style ATC classification and Supabase registry routing passed.');
