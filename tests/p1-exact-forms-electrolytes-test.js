'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827135634_p1_exact_forms_and_electrolytes.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827135634' &&
    item.name === 'p1_exact_forms_and_electrolytes'
  ),
  'P1.7 migration must be present in the production migration manifest.'
);

for (const concept of [
  'caffeineanhydrous',
  'magnesiumcarbonate',
  'beclometasonedipropionateanhydrous',
  'formoterolfumaratedihydrate',
  'isoconazolenitrate',
  'diflucortolonevalerate',
  'cetylpyridiniumchloride',
  'potassiumacetate',
  'magnesiumchloridehexahydrate',
  'sodiumacetatetrihydrate',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Exact concept missing: ${concept}`);
}

for (const alias of [
  ['beclometasonedipropionateanhydrate','beclometasonedipropionateanhydrous'],
  ['formoterolfumaratedihhydrate','formoterolfumaratedihydrate'],
  ['isoconasolenitrate','isoconazolenitrate'],
  ['potassiiumacetate','potassiumacetate'],
  ['magnesiumchoridehexahydrate','magnesiumchloridehexahydrate'],
  ['sodiumacetattrihydrate','sodiumacetatetrihydrate'],
]) {
  assert.ok(MIGRATION.includes(`('${alias[0]}','${alias[1]}'`), `Safe alias missing: ${alias[0]} -> ${alias[1]}`);
}

assert.ok(
  MIGRATION.includes("('caffeine','caffeineanhydrous'") ||
  MIGRATION.includes("('caffeineanhydrous','caffeine'"),
  'Caffeine hydration-state distinction must remain explicit.'
);
assert.ok(
  MIGRATION.includes("('formoterolfumaratedehydrous','formoterolfumaratedihydrate'") ||
  MIGRATION.includes("('formoterolfumaratedihydrate','formoterolfumaratedehydrous'"),
  'Unverified dehydrous/dihydrate forms must never auto-merge.'
);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.7 exact forms + electrolytes contract passed.');
