'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const library = read('lib/user-library.js');
const sidebar = read('sidebar-taxonomy-v3.js');
const client = read('phase9-personal-entities-client.js');
const libraryModule = require('../lib/user-library.js');

assert.match(library, /exactCount/);
assert.match(library, /function getPersonalSummary\(/);
assert.match(library, /queryValue\(req, 'view'\) === 'summary'/);
assert.match(library, /countPrivateRows\('user_favorites'[\s\S]*entity_type:'in\.\(product,drug\)'/);
assert.match(library, /countPrivateRows\('user_notes'[\s\S]*entity_type:'eq\.product'/);
assert.match(library, /deleted_at', 'is\.null'/);
assert.match(library, /prefer:'count=exact'/);
assert.match(library, /Range:'0-0'/);
assert.match(library, /function personalProductPayload\(/);
assert.match(library, /function personalProductMetadataByIds\(/);
assert.match(library, /function mergePersonalProductMetadata\(/);
assert.match(library, /Personal library product metadata/);
assert.match(library, /is_published'\s*,\s*'eq\.true'/);
assert.match(library, /editorial_status'\s*,\s*'eq\.published'/);

const canonical = libraryModule._test.personalProductPayload({
  id:'a29ce6e1-7581-4e9e-bc6e-db29e0ac451d',
  registry_number:7,
  pdid:'3673',
  trade_name:'BISOLVON',
  active_substance:'Bromhexine-HCL',
  strength:'4 mg/5 ml',
  pharmaceutical_form:'Syrup',
  atc_code:'R05CB02',
});
assert.equal(canonical.tradeName,'BISOLVON');
assert.equal(canonical.registryNumber,7);
assert.equal(canonical.pdid,'3673');

const merged = libraryModule._test.mergePersonalProductMetadata({
  entityType:'product',
  entityKey:'a29ce6e1-7581-4e9e-bc6e-db29e0ac451d',
  payload:{},
}, new Map([['a29ce6e1-7581-4e9e-bc6e-db29e0ac451d', canonical]]));
assert.equal(merged.payload.tradeName,'BISOLVON');
assert.equal(merged.payload.activeSubstance,'Bromhexine-HCL');

const legacy = {
  entityType:'drug',
  entityKey:'4602|Lactulosum Hasco|2.5 g/5 ml',
  payload:{},
};
assert.equal(libraryModule._test.legacyFavoritePdid(legacy),'4602');
const legacyCanonical = {
  drugId:'b8ab3608-8db8-436e-81b0-e1f2d7310ca5',
  tradeName:'Lactulosum Hasco',
  label:'Lactulosum Hasco',
  registryNumber:1683,
  pdid:'4602',
  activeSubstance:'Lactulose',
  strength:'2.5 g/5 ml',
  form:'Syrup',
  atc:'A06AD11',
};
const legacyMerged = libraryModule._test.mergeLegacyFavoriteMetadata(
  legacy,
  new Map([['4602', legacyCanonical]])
);
assert.equal(legacyMerged.payload.tradeName,'Lactulosum Hasco');
assert.equal(legacyMerged.payload.drugId,'b8ab3608-8db8-436e-81b0-e1f2d7310ca5');

assert.match(sidebar, /PERSONAL_SUMMARY_API = '\/api\/user-library\?view=summary'/);
assert.match(sidebar, /PERSONAL_COUNT_CACHE_KEY/);
assert.match(sidebar, /applyPersonalCounts\(/);
assert.match(sidebar, /syncPersonalCounts\(/);
assert.match(sidebar, /if \(cached && !force\)[\s\S]{0,180}return;/);
assert.match(sidebar, /countsFromPersonalSnapshot/);
assert.match(sidebar, /adoptPersonalSnapshotCounts/);
assert.match(sidebar, /drx:phase9-personal-changed/);
assert.match(sidebar, /find\('\/index\.html#favorites'\), find\('\/index\.html#notes'\), find\('\/recetat\.html'\)/);

assert.match(client, /clientUpdatedAt:text\(row\.clientUpdatedAt\)/);
assert.match(client, /serverUpdatedAt:text\(row\.serverUpdatedAt\)/);
assert.match(client, /payload:row\.payload && typeof row\.payload === 'object'/);
assert.match(client, /new Set\(\['drug','substance','variant','product'\]\)/);
assert.match(sidebar, /\['product','drug'\]\.includes/);

assert.doesNotThrow(() => new Function(sidebar));
assert.doesNotThrow(() => new Function(client));

console.log('Personal library summary, site-wide badges and timestamp contract passed.');
