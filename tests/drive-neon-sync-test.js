'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const syncPath = path.join(root, 'lib', 'drive-neon-sync.js');
const apiPath = path.join(root, 'api', 'drive-sync.js');
const appsScriptPath = path.join(root, 'google-apps-script', 'medindex-drive-neon-sync.gs');

execFileSync(process.execPath, ['--check', syncPath], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', apiPath], { stdio:'pipe' });

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-drive-sync-'));
const appsScriptCheckPath = path.join(tempDirectory, 'medindex-drive-neon-sync.js');
try {
  fs.copyFileSync(appsScriptPath, appsScriptCheckPath);
  execFileSync(process.execPath, ['--check', appsScriptCheckPath], { stdio:'pipe' });
} finally {
  fs.rmSync(tempDirectory, { recursive:true, force:true });
}

const source = read('lib/drive-neon-sync.js');
const api = read('api/drive-sync.js');
const appsScript = read('google-apps-script/medindex-drive-neon-sync.gs');
const envExample = read('.env.example');
const Sync = require('../lib/drive-neon-sync.js');

assert.equal(Object.keys(Sync.SOURCE_CONFIGS).length, 6);
assert.match(source, /MEDINDEX_DRIVE_SYNC_SECRET/);
assert.match(source, /x-medindex-sync-secret/);
assert.match(source, /timingSafeEqual/);
assert.match(source, /MAX_ROWS_PER_REQUEST = 100/);
assert.match(source, /MAX_DELETED_KEYS = 200/);
assert.match(source, /drive_sync_sources/);
assert.match(source, /drive_sheet_rows/);
assert.match(source, /editorial_override/);
assert.match(source, /resolution=merge-duplicates/);
assert.doesNotMatch(source, /MEDINDEX_DRIVE_SYNC_SECRET\s*=\s*['"][^'"]+['"]/);
assert.match(api, /DriveNeonSync\.handle/);

for (const marker of [
  'setupMedIndexDriveSync',
  'medIndexDriveOnEdit',
  'medIndexDriveReconcile',
  'NEON_SYNC_STATE',
  'X-MedIndex-Sync-Secret',
  'everyMinutes(5)',
  'LockService',
]) {
  assert.ok(appsScript.includes(marker), `Apps Script is missing ${marker}`);
}
assert.doesNotMatch(appsScript, /MEDINDEX_DRIVE_SYNC_SECRET\s*:\s*['"][^'"]+['"]/);
assert.match(envExample, /MEDINDEX_DRIVE_SYNC_SECRET=/);

const drug = Sync.mapDrug({
  'Nr rendor':'1',
  ProtocolNo:'PD0468/041225',
  PDID:'1131',
  'Emri tregtar':'Dasatinib - 1A Pharma 20 mg Filmtabletten',
  'Substanca aktive':'Dasatinib',
  'ATC Code':'L01XE06',
  Fortësia:'20 mg',
  'Forma farmaceutike':'Film coated tablet',
  'Çmimi me pakicë':'1086,80',
});
assert.equal(drug.registry_number, 1);
assert.equal(drug.trade_name, 'Dasatinib - 1A Pharma 20 mg Filmtabletten');
assert.equal(drug.retail_price, 1086.8);
assert.equal(drug.is_published, true);
assert.equal(drug.editorial_override, false);
assert.equal(drug.source_hash.length, 64);

const adult = Sync.mapAdultDosage({
  RegimenID:'AD-1',
  Statusi:'VERIFIKUAR',
  'Auto-fill':'PO',
  ATC:'N02BE01',
  'Substanca aktive':'Paracetamol',
  Forma:'Tablet',
  'Fortësia referencë':'500 mg',
  Indikacioni:'Dhimbje',
  'Doza për marrje (mg)':'500',
  Rruga:'PO',
  Shpeshtësia:'çdo 8 orë',
});
assert.equal(adult.source_key, 'adult:AD-1');
assert.equal(adult.editorial_status, 'published');
assert.equal(adult.population, 'adult');

const pediatric = Sync.mapPediatricDosage({
  RegimenID:'PED-1',
  Statusi:'VERIFIKUAR',
  'Auto-fill':'PO',
  ATC:'N02BE01',
  'Substanca aktive':'Paracetamol',
  Forma:'Syrup',
  Përqendrimi:'120 mg/5 mL',
  Indikacioni:'Temperaturë',
  'Vlera mg/kg':'15',
  'Baza (dozë/ditë)':'dozë',
  Rruga:'PO',
  Shpeshtësia:'çdo 6 orë',
});
assert.equal(pediatric.source_key, 'pediatric:PED-1');
assert.equal(pediatric.calculation_type, 'mg_per_kg_dose');
assert.equal(pediatric.dose_value_min, 15);

const icd = Sync.mapIcd({
  'Kodi ICD-10':'R51',
  'Emri në shqip':'Dhimbje koke',
  'Emri në anglisht':'Headache',
  'Mjekësi familjare':'PO',
  Urgjencë:'—',
  'Fjalë kyçe':'kokë; dhimbje',
});
assert.equal(icd.code, 'R51');
assert.equal(icd.title_sq, 'Dhimbje koke');
assert.deepEqual(icd.tags, ['kokë', 'dhimbje']);

console.log('Google Drive to Neon incremental sync contract passed.');
