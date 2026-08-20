'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const readerSource = read('lib/neon-clinical-reader.js');
const registrySource = read('api/registry.js');
const dosageRouterSource = read('api/dosage.js');
const dosageHandlerSource = read('lib/dosage-handler.js');
const dosageSource = `${dosageRouterSource}\n${dosageHandlerSource}`;
const icdSource = read('lib/icd-api-base.js');
const labsSource = read('analizat.js');
const publishSource = read('scripts/publish-neon-registry.js');
const serviceWorker = read('sw.js');
const migrationWorker = read('sw-resilient-v3.js');
const packageJson = JSON.parse(read('package.json'));

assert.match(readerSource, /MEDINDEX_DATA_SOURCE \|\| 'hybrid'/, 'Neon-first mode must default to hybrid');
assert.match(readerSource, /\['neon', 'hybrid', 'sheets'\]/, 'data source modes must be restricted');
assert.match(readerSource, /is_published:'eq\.true'/, 'published-only gates are required');
assert.match(readerSource, /editorial_status:'eq\.published'/, 'editorial published filter is required');
assert.match(readerSource, /minimum:EXPECTED_MINIMUMS\.drugs/, 'registry row-count gate is missing');
assert.match(readerSource, /calculation_status:'in\.\(text_verified,calculable_verified\)'/, 'dosage verification gate is missing');
assert.doesNotMatch(readerSource, /window\.|document\.|localStorage/, 'Neon reader must remain server-only');

assert.match(registrySource, /buildNeonDataset/, 'registry Neon source is missing');
assert.match(registrySource, /sheets-fallback/, 'registry controlled fallback is missing');
assert.match(registrySource, /X-MedIndex-Data-Source/, 'registry source header is missing');
assert.match(registrySource, /gzipSync/, 'registry payload compression contract changed');

assert.match(dosageRouterSource, /dosageHandler/, 'dosage API router is missing');
assert.match(dosageSource, /buildNeonPayload/, 'dosage Neon source is missing');
assert.match(dosageSource, /rawPublishedRegimens/, 'dosage published row audit is missing');
assert.match(dosageSource, /cardsReadOnlyWhenAutoFillDisabled/, 'read-only dosage cards safety contract changed');
assert.match(dosageSource, /X-MedIndex-Data-Source/, 'dosage source header is missing');

assert.match(icdSource, /dataset.*labs/, 'labs must share an existing API function');
assert.match(icdSource, /getPublishedIcdCodes/, 'ICD Neon reader is missing');
assert.match(icdSource, /getPublishedLabTests/, 'laboratory Neon reader is missing');
assert.match(icdSource, /X-MedIndex-Data-Source/, 'ICD/labs source header is missing');
assert.match(labsSource, /\/api\/icd\?dataset=labs/, 'laboratory UI does not request Neon');
assert.match(labsSource, /loadLocalDataset/, 'laboratory offline fallback is missing');
assert.match(labsSource, /NEON_TIMEOUT_MS/, 'laboratory network timeout is missing');

assert.match(publishSource, /MINIMUM_REGISTRY_ROWS = 3500/, 'registry publication minimum gate is missing');
assert.match(publishSource, /editorial_status:'published', is_published:true/, 'complete registry publication is missing');
assert.match(packageJson.scripts['sync:supabase'], /publish-neon-registry\.js/, 'Supabase registry publication must run after sync');
assert.match(packageJson.scripts['build:runtime'], /patch-neon-offline\.js/, 'single-version cache cutover must run during build');

assert.match(serviceWorker, /QUERY_DATA_PATHS = new Set\(\['\/api\/drug-search', '\/api\/icd'\]\)/, 'ICD and labs query caches are not isolated');
const privateSet = serviceWorker.match(/const PRIVATE_DATA_PATHS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
assert.ok(privateSet, 'PRIVATE_DATA_PATHS set is missing');
assert.doesNotMatch(privateSet, /'\/api\/icd'/, 'ICD query route must not use the query-blind private key');
assert.match(migrationWorker, /importScripts\('\/sw\.js\?v=/, 'legacy worker must migrate to the canonical worker');
assert.doesNotMatch(migrationWorker, /QUERY_DATA_PATHS|PRIVATE_DATA_PATHS/, 'legacy worker must not keep a second Neon cache policy');

for (const browserFile of ['analizat.js', 'icd.js', 'dozologjia.js', 'app.js']) {
  const source = read(browserFile);
  assert.doesNotMatch(source, /apirest\.c-2\.us-west-2\.aws\.neon\.tech|MEDINDEX_NEON_DATA_API_URL|VERCEL_OIDC_TOKEN/, `${browserFile} exposes Neon connection details`);
}

const Reader = require('../lib/neon-clinical-reader.js');
const mappedDrug = Reader.mapDrugRow({
  id:'drug-1', registry_number:1, pdid:'10', trade_name:'Test 10 mg', active_substance:'Test',
  strength:'10 mg', pharmaceutical_form:'Tablet', atc_code:'A01AA01', protocol_no:'P-1', packaging:'20 tableta',
  drug_class:'Klasë', use_text:'Përdorim', source_hash:'abc', source_payload:{ Prodhuesi:'Prodhues' },
});
assert.equal(mappedDrug['Nr rendor'], 1);
assert.equal(mappedDrug['Emri tregtar'], 'Test 10 mg');
assert.equal(mappedDrug['Substanca aktive'], 'Test');
assert.equal(mappedDrug.Prodhuesi, 'Prodhues');

const adult = Reader.adultRegimen({
  source_key:'adult:A-1', regimen_code:'A-1', population:'adult', active_substance:'Test', atc_code:'A01AA01',
  pharmaceutical_form:'Tablet', reference_strength:'10 mg', indication_text:'Indikacion', dose_text:'10', route:'PO',
  frequency_text:'1 herë në ditë', interval_hours:24, signatura_text:'1 tabletë një herë në ditë',
});
assert.equal(adult.status, 'VERIFIKUAR');
assert.ok(adult.matchKey.includes('A01AA01'));

const pediatric = Reader.pediatricRegimen({
  source_key:'pediatric:P-1', regimen_code:'P-1', population:'pediatric', active_substance:'Test', atc_code:'A01AA01',
  pharmaceutical_form:'Syrup', reference_strength:'100 mg/5 mL', indication_text:'Indikacion', calculation_type:'mg_per_kg_dose',
  dose_value_min:10, doses_per_day:3, route:'PO', signatura_text:'Sipas peshës',
});
assert.equal(pediatric.mgPerKg, 10);
assert.equal(pediatric.basis, 'dozë');
assert.equal(pediatric.status, 'VERIFIKUAR');

const icd = Reader.mapIcdRow({
  code:'J00', title_sq:'Nazofaringiti akut', title_en:'Acute nasopharyngitis', level_name:'Kod i plotë',
  chapter_code:'X', chapter_title:'Sëmundjet respiratore', is_family_medicine:true, is_emergency:false,
  is_critical:false, tags:['ftohje'], typical_use:'Kodim klinik', editorial_status:'published',
});
assert.equal(icd.code, 'J00');
assert.equal(icd.isFamilyMedicine, true);
assert.deepEqual(icd.keywords, ['ftohje']);

console.log('Neon-first performance and canonical-worker clinical contract audit passed.');
