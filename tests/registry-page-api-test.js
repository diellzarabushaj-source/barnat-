'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const drugSearch = require('../api/drug-search.js');

const root = path.resolve(__dirname, '..');
const gatewaySource = fs.readFileSync(path.join(root, 'api/drug-search.js'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(root, 'lib/supabase-data-api.js'), 'utf8');
const extraRegistryFunction = path.join(root, 'api/registry-page.js');

assert.equal(fs.existsSync(extraRegistryFunction), false, 'registry v2 must reuse /api/drug-search on Vercel Hobby');
assert.equal(drugSearch.REGISTRY_DEFAULT_PAGE_SIZE, 25);
assert.equal(drugSearch.REGISTRY_MAX_PAGE_SIZE, 50);
assert.equal(typeof drugSearch.buildPageRequest, 'function');
assert.equal(typeof drugSearch.buildDetailPath, 'function');
assert.equal(typeof drugSearch.buildSearchPath, 'function');

const page = drugSearch.buildPageRequest({
  page:'3', pageSize:'50', includeTotal:'true', q:'amoxicillin', status:'Gjenerik', atc:'N02', form:'Tabletë', sort:'name', direction:'desc',
});
assert.equal(page.page, 3);
assert.equal(page.pageSize, 50);
assert.equal(page.includeTotal, true);
assert.equal(page.sort, 'name');
assert.equal(page.direction, 'desc');
assert.equal(page.atc, 'N02');
const decodedPage = decodeURIComponent(page.path);
assert.match(decodedPage, /^drugs\?/);
assert.match(decodedPage, /is_published=eq\.true/);
assert.match(decodedPage, /editorial_status=eq\.published/);
assert.match(decodedPage, /registry_search_text=ilike\.\*amoxicillin\*/);
assert.match(decodedPage, /product_status=eq\.Gjenerik/);
assert.match(decodedPage, /atc_code=ilike\.N02\*/);
assert.match(decodedPage, /pharmaceutical_form=ilike\.\*Tabletë\*/);
assert.match(decodedPage, /limit=50/);
assert.match(decodedPage, /offset=100/);
assert.match(decodedPage, /order=trade_name\.desc/);

const exactForm = decodeURIComponent(drugSearch.buildPageRequest({ formExact:'Capsule, hard' }).path);
assert.match(exactForm, /pharmaceutical_form=eq\.Capsule, hard/);

const groupedFormRequest = drugSearch.buildPageRequest({ formCategory:'Tableta & pilula' });
const groupedForm = decodeURIComponent(groupedFormRequest.path);
assert.equal(groupedFormRequest.formCategory, 'Tableta & pilula');
assert.match(groupedForm, /pharmaceutical_form=in\.\(/);
assert.match(groupedForm, /Chewable tablet/);
assert.match(groupedForm, /Gastro-resistant tablet/);
assert.match(groupedForm, /Tablet/);

const detail = decodeURIComponent(drugSearch.buildDetailPath({ id:'11111111-1111-4111-8111-111111111111' }));
assert.match(detail, /^drugs\?/);
assert.match(detail, /id=eq\.11111111-1111-4111-8111-111111111111/);
assert.match(detail, /limit=1/);
assert.equal(drugSearch.buildDetailPath({ id:'not-a-uuid' }), null);

const search = drugSearch.buildSearchPath('paracetamol');
assert.ok(search);
assert.match(decodeURIComponent(search.path), /global_search_text=ilike\.\*paracetamol\*/);
assert.match(decodeURIComponent(search.path), /limit=20/);

assert.match(gatewaySource, /supabase-data-api\.js/);
assert.match(gatewaySource, /X-MedIndex-Data-Source/);
assert.match(gatewaySource, /supabase/i);
assert.doesNotMatch(gatewaySource, /neonRequest|neon-data-api|getPublishedDrugs|fetchPaged\('drugs'/);
assert.doesNotMatch(gatewaySource, /SELECT\s+\*/i);
assert.doesNotMatch(gatewaySource, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|migration/i);
assert.doesNotMatch(gatewaySource, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i);

assert.match(supabaseSource, /\/rest\/v1/);
assert.match(supabaseSource, /MEDINDEX_SUPABASE_PUBLISHABLE_KEY/);
assert.doesNotMatch(supabaseSource, /neon/i);

console.log('Registry v2 Supabase paging, detail, indexed search and read-only contracts passed.');
