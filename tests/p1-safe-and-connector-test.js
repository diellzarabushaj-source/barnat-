'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827132647_p1_safe_and_connector_resolution.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827132647' &&
    item.name === 'p1_safe_and_connector_resolution'
  ),
  'P1.3 production migration must be in the migration manifest.'
);

for (const concept of [
  'desogestrel',
  'ethinylestradiol',
  'piperacillinsodium',
  'tazobactamsodium',
  'clavulanatepotassium',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Official concept missing: ${concept}`);
}

assert.match(MIGRATION, /create or replace view public\.medindex_p1_and_parts_v1/i);
assert.match(MIGRATION, /create or replace view public\.medindex_p1_safe_and_v1/i);
assert.match(
  MIGRATION,
  /count\(\*\)=2[\s\S]*count\(p\.concept_id\)=2[\s\S]*count\(distinct p\.concept_id\)=2/i,
  'AND resolution must require exactly two known, distinct concepts.'
);
assert.match(
  MIGRATION,
  /!~\* '\(equivalent to\|corresponding to\|extract\|mixture\|virus\|complex factors/i,
  'Complex/equivalence expressions must stay outside AND auto-resolution.'
);
assert.match(
  MIGRATION,
  /'SLASH_CONNECTOR'/i,
  'Slash expressions must remain explicitly routed to review.'
);
assert.match(
  MIGRATION,
  /resolution_method in \('SINGLE_CANONICAL','DELIMITER_EXACT','AND_EXACT'\)/i,
  'Only audited resolution methods may be stored.'
);
assert.doesNotMatch(MIGRATION, /resolution_method in \([^)]*SLASH/i);

assert.match(
  MIGRATION,
  /security definer[\s\S]*?set search_path = pg_catalog, public/i,
  'Refresh function must retain a pinned search_path.'
);
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.3 safe AND connector contract passed.');
