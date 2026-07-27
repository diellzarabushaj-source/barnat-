'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const Neon = require('../lib/neon-clinical-reader.js');
const DosageEngine = require('../dosage-engine.js');

assert.equal(Neon.dataSourceMode(), 'hybrid', 'Neon-first rollout must default to hybrid.');
assert.equal(Neon.allowNeon('hybrid'), true);
assert.equal(Neon.allowSheetsFallback('hybrid'), true);
assert.equal(Neon.allowSheetsFallback('neon'), false);
assert.equal(Neon.MINIMUMS.drugs, 3500);
assert.equal(Neon.MINIMUMS.dosage, 1400);
assert.equal(Neon.MINIMUMS.icd, 700);
assert.equal(Neon.MINIMUMS.labs, 110);

const drug = Neon.mapDrugRow({
  id:'drug-1',
  registry_number:7,
  protocol_no:'P-7',
  pdid:'PD-7',
  trade_name:'Test',
  active_substance:'Substancë',
  atc_code:'A01AA',
  strength:'500 mg',
  pharmaceutical_form:'Tabletë',
  packaging:'20 tableta',
  editorial_status:'published',
  source_payload:{ 'Statusi ':'Aktiv' },
});
assert.equal(drug['Nr rendor'], 7);
assert.equal(drug['Emri tregtar'], 'Test');
assert.equal(drug['Substanca aktive'], 'Substancë');
assert.equal(drug['Forma farmaceutike'], 'Tabletë');
assert.equal(drug['Statusi '], 'Aktiv');

const adult = Neon.mapAdultRegimen({
  source_key:'adult:test',
  regimen_code:'AD-1',
  population:'adult',
  active_substance:'Paracetamol',
  atc_code:'N02BE01',
  pharmaceutical_form:'Tabletë',
  reference_strength:'500 mg',
  indication_text:'Dhimbje',
  dose_text:'500 mg',
  route:'PO',
  frequency_text:'çdo 8 orë',
  editorial_status:'published',
}, DosageEngine);
assert.equal(adult.regimenId, 'AD-1');
assert.equal(adult.status, 'VERIFIKUAR');
assert.ok(adult.matchKey);

const pediatric = Neon.mapPediatricRegimen({
  source_key:'pediatric:test',
  regimen_code:'PED-1',
  population:'pediatric',
  active_substance:'Paracetamol',
  atc_code:'N02BE01',
  pharmaceutical_form:'Shurup',
  reference_strength:'120 mg/5 mL',
  indication_text:'Temperaturë',
  route:'PO',
  frequency_text:'çdo 6 orë',
  calculation_type:'mg_per_kg_dose',
  dose_value_min:15,
  editorial_status:'published',
}, DosageEngine);
assert.equal(pediatric.mgPerKg, 15);
assert.equal(pediatric.basis, 'dozë');
assert.ok(pediatric.matchKey);

const icd = Neon.mapIcdEntry({
  code:'R51',
  title_sq:'Dhimbje koke',
  title_en:'Headache',
  level_name:'Kod i plotë',
  is_family_medicine:true,
  is_emergency:false,
  is_critical:false,
  tags:['kokë'],
});
assert.equal(icd.code, 'R51');
assert.equal(icd.title, 'Dhimbje koke');
assert.equal(icd.isFamilyMedicine, true);

const labs = Neon.mapLabDataset(
  [{ id:'cat-1', category_number:1, title:'Hemogrami' }],
  [{
    id:'lab-1', category_id:'cat-1', form_name:'WBC', full_name_en:'White blood cells',
    full_name_sq:'Leukocitet', what_it_shows:'Numrin e leukociteve', high_when:'Infeksion',
    low_when:'Leukopeni', source_url:'https://example.test',
  }]
);
assert.equal(labs.categories[0].id, 'category-1');
assert.equal(labs.tests[0].formName, 'WBC');

const registry = fs.readFileSync(path.join(root, 'api/registry.js'), 'utf8');
const dosage = fs.readFileSync(path.join(root, 'api/dosage.js'), 'utf8');
const icdApi = fs.readFileSync(path.join(root, 'api/icd.js'), 'utf8');
const labBootstrap = fs.readFileSync(path.join(root, 'lab-neon-bootstrap.js'), 'utf8');
const syncPipeline = fs.readFileSync(path.join(root, 'scripts/sync-neon-pipeline.js'), 'utf8');
const workerPatch = fs.readFileSync(path.join(root, 'scripts/build-neon-runtime-patch.js'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

assert.match(registry, /X-MedIndex-Data-Source/);
assert.match(registry, /buildNeonDataset/);
assert.doesNotMatch(registry, /require\(['"]xlsx['"]\)/i, 'Registry request path must not parse Excel normally.');
assert.match(dosage, /totalPublishedRegimens/);
assert.match(fs.readFileSync(path.join(root, 'lib/neon-clinical-reader.js'), 'utf8'), /editorial_status=eq\.published/);
assert.doesNotMatch(dosage, /require\(['"]xlsx['"]\)/i, 'Dosage request path must not parse Excel normally.');
assert.match(icdApi, /scope === 'labs'/);
assert.match(icdApi, /getPublishedIcdCodes/);
assert.match(labBootstrap, /\/api\/icd\?scope=labs/);
assert.match(labBootstrap, /local-static-fallback/);
assert.match(syncPipeline, /content_versions/);
assert.match(syncPipeline, /publishOfficialRegistry/);
assert.match(workerPatch, /lab-neon-bootstrap\.js/);
assert.match(workerPatch, /searchParams\.get\('scope'\) === 'labs'/);
assert.equal(vercel.env.MEDINDEX_DATA_SOURCE, 'hybrid');

const browserFiles = ['app.js', 'analizat.js', 'icd.js', 'lab-neon-bootstrap.js'];
for (const file of browserFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, /MEDINDEX_NEON_DATA_API_URL|VERCEL_OIDC_TOKEN|Bearer\s+[A-Za-z0-9]/,
    `${file} must not contain Neon credentials.`);
}

console.log('Neon-first clinical data contract and rollout audit passed.');
