'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const contract = JSON.parse(read('data/pediatric-master-contract.json'));
const migration = read('database/migrations/20260817_pediatric_master_fields.sql');
const appsScript = read('google-apps-script/medindex-drive-neon-sync.gs');
const syncSource = read('lib/drive-neon-sync.js');
const Sync = require('../lib/drive-neon-sync.js');

assert.equal(contract.version, 'pediatric-master-v1');
assert.equal(contract.masterSheet, 'Sheet1');
assert.equal(contract.masterRange, 'U:AX');
assert.equal(contract.normalizedSheet, 'Doza pediatrike');
assert.equal(contract.neonTable, 'public.drugs');
assert.equal(contract.columns.length, 30, 'Master pediatric projection must remain exactly U:AX (30 fields).');
assert.match(contract.clinicalRule, /Never infer pediatric dose from product strength/i);

const expectedHeaders = [
  'Doza pediatrike — përmbledhje', 'Indikacioni pediatrik', 'Statusi i përdorimit pediatrik',
  'Mosha minimale — vlerë', 'Mosha minimale — njësi', 'Mosha maksimale — vlerë',
  'Mosha maksimale — njësi', 'Pesha minimale (kg)', 'Pesha maksimale (kg)',
  'Doza pediatrike — min', 'Doza pediatrike — max', 'Njësia e dozës', 'Baza e dozës',
  'Nr. dozave / ditë', 'Intervali (orë)', 'Maks. për dozë — vlerë', 'Maks. për dozë — njësi',
  'Maks. në 24h — vlerë', 'Maks. në 24h — njësi', 'Rruga pediatrike',
  'Kufizim / mos-përdorim pediatrik', 'Koncentrimi — sasia', 'Koncentrimi — njësi',
  'Koncentrimi për — sasia', 'Koncentrimi për — njësi', 'Burimi pediatrik',
  'Seksioni i burimit pediatrik', 'Statusi i verifikimit pediatrik', 'Verifikuar më',
  'Regimen ID kryesor',
];
assert.deepEqual(contract.columns.map(item => item.sheet), expectedHeaders);
assert.equal(new Set(contract.columns.map(item => item.sheet)).size, 30);
assert.equal(new Set(contract.columns.map(item => item.db)).size, 30);

// The Apps Script must read the live header width, so U:AX is automatically included.
assert.match(appsScript, /const lastColumn = sheet\.getLastColumn\(\)/);
assert.match(appsScript, /getRange\(config\.headerRow, 1, 1, lastColumn\)/);
assert.match(appsScript, /headers\.map/);

// mapDrug keeps the complete Sheet row in source_payload; the DB trigger performs typed projection.
assert.match(syncSource, /source_payload:values/);
const sample = Object.fromEntries(expectedHeaders.map(header => [header, '']));
sample['Nr rendor'] = '999';
sample.PDID = 'PED-CONTRACT';
sample['Emri tregtar'] = 'Contract Test';
sample['Substanca aktive'] = 'Contract Substance';
sample['ATC Code'] = 'X00XX00';
sample['Doza pediatrike — min'] = '10';
sample['Doza pediatrike — max'] = '15';
sample['Njësia e dozës'] = 'mg';
sample['Baza e dozës'] = 'kg/dozë';
sample['Mosha minimale — vlerë'] = '3';
sample['Mosha minimale — njësi'] = 'muaj';
sample['Pesha minimale (kg)'] = '5';
sample['Statusi i verifikimit pediatrik'] = 'in_review';
const mapped = Sync.mapDrug(sample);
for (const header of expectedHeaders) {
  assert.equal(mapped.source_payload[header], sample[header], `mapDrug lost pediatric header: ${header}`);
}

// Migration must materialize every contract column and exact Albanian header mapping.
for (const { sheet, db, type } of contract.columns) {
  const escapedDb = db.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${escapedDb} `), `Migration missing ${db}`);
  assert.ok(migration.includes(`NEW.source_payload->>'${sheet}'`), `Trigger missing Sheet header ${sheet}`);
  if (type === 'numeric') assert.ok(migration.includes(`NEW.${db} := public.medindex_numeric_or_null`), `${db} must be typed numeric`);
}

for (const marker of [
  'medindex_numeric_or_null',
  'medindex_timestamp_or_null',
  'medindex_sync_drug_pediatric_fields',
  'drugs_sync_pediatric_fields_from_source_payload',
  'drugs_pediatric_nonnegative_check',
  'drugs_pediatric_age_unit_check',
  'drugs_pediatric_dose_unit_check',
  'drugs_pediatric_basis_check',
  'drugs_pediatric_use_status_check',
  'drugs_pediatric_verification_check',
  'drugs_pediatric_verified_source_check',
  'drugs_pediatric_range_check',
  'drugs_pediatric_verified_structure_check',
]) {
  assert.ok(migration.includes(marker), `Pediatric Neon contract is missing ${marker}`);
}

assert.match(migration, /pediatric_max_weight_kg >= pediatric_min_weight_kg/);
assert.match(migration, /pediatric_dose_max >= pediatric_dose_min/);
assert.match(migration, /pediatric_doses_per_day IS NULL OR pediatric_doses_per_day > 0/);
assert.match(migration, /pediatric_interval_hours IS NULL OR pediatric_interval_hours > 0/);
assert.match(migration, /pediatric_verification_status <> 'verified'/);
assert.match(migration, /pediatric_source_url IS NOT NULL/);
assert.match(migration, /pediatric_verified_at IS NOT NULL/);
assert.match(migration, /pediatric_dose_unit IS NOT NULL AND pediatric_dose_basis IS NOT NULL/);
assert.match(migration, /UPDATE public\.drugs SET source_payload = source_payload/);

// Dose semantics are explicit: calculator must distinguish per-dose, per-day and continuous bases.
assert.deepEqual(contract.allowed.doseBasis, [
  'kg/dozë', 'kg/ditë', 'kg/orë', 'kg/min', 'm²/dozë', 'm²/ditë', 'bandë peshe', 'dozë fikse',
]);
assert.deepEqual(contract.allowed.verificationStatus, ['needs_source', 'in_review', 'verified', 'not_applicable']);
assert.ok(contract.allowed.useStatus.includes('KUNDËRINDIKUAR'));
assert.ok(contract.allowed.useStatus.includes('NUK REKOMANDOHET'));

console.log('Pediatric master Sheet -> Neon contract passed: 30 typed fields, dynamic header sync, safety constraints and provenance requirements are locked.');
