'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827145654_p1_duplicate_component_identity_collapse.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827145654' &&
    item.name === 'p1_duplicate_component_identity_collapse'
  ),
  'P1.19 migration must be present in the production migration manifest.'
);

assert.match(MIGRATION, /source_occurrence_count integer not null default 1/i);
assert.match(MIGRATION, /source_terms text\[\] not null default/i);
assert.match(MIGRATION, /duplicate_component_count integer not null default 0/i);
assert.match(MIGRATION, /create or replace view public\.medindex_p1_resolved_delimiter_parts_v2/i);
assert.match(MIGRATION, /create or replace view public\.medindex_p1_safe_delimiter_v2/i);
assert.match(MIGRATION, /'DELIMITER_DEDUP'/i);
assert.match(MIGRATION, /'DUPLICATE_SOURCE_COMPONENT_COLLAPSED'/i);

assert.match(
  MIGRATION,
  /sum\(source_occurrence_count\)::integer as source_component_count/i,
  'Raw duplicate occurrences must remain auditable.'
);
assert.match(
  MIGRATION,
  /count\(\*\)::integer as identity_count/i,
  'Clinical ingredient identity count must be distinct from source occurrence count.'
);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.19 duplicate component identity collapse contract passed.');
