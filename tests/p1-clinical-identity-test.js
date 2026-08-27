'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827130837_p1_clinical_substance_identity_foundation.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827130837' &&
    item.name === 'p1_clinical_substance_identity_foundation'
  ),
  'P1 production migration must be present in the migration manifest.'
);

assert.match(MIGRATION, /create table if not exists public\.substance_concepts_v1/i);
assert.match(MIGRATION, /create table if not exists public\.substance_terms_v1/i);
assert.match(MIGRATION, /create table if not exists public\.product_ingredients_v1/i);
assert.match(MIGRATION, /create table if not exists public\.product_ingredient_resolution_v1/i);
assert.match(MIGRATION, /create or replace view public\.medindex_product_ingredient_sets_v1/i);
assert.match(MIGRATION, /create or replace view public\.medindex_product_ingredient_review_queue_v1/i);

assert.match(
  MIGRATION,
  /medindex_stable_uuid_v1\([\s\S]*?set search_path = pg_catalog, public/i,
  'Stable clinical IDs must use a pinned search_path.'
);
assert.match(
  MIGRATION,
  /string_agg\(i\.concept_id::text,'\|' order by i\.concept_id::text\)/i,
  'Ingredient set identity must sort concept IDs, so source ingredient order cannot change identity.'
);
assert.match(
  MIGRATION,
  /resolution_status in \('RESOLVED_SINGLE','RESOLVED_MULTI','NEEDS_REVIEW','EXCLUDED'\)/i,
  'Every product must have an explicit ingredient-resolution state.'
);
assert.match(
  MIGRATION,
  /d\.active_substance !~\* '\\sand\\s'/i,
  'Word-connector combinations must not be silently treated as single ingredients.'
);
assert.match(
  MIGRATION,
  /'EQUIVALENCE_EXPRESSION'/i,
  'Equivalent/corresponding expressions must be routed to review.'
);
assert.match(
  MIGRATION,
  /'UNRESOLVED_COMPONENT'/i,
  'Unresolved combination components must be routed to review.'
);
assert.match(
  MIGRATION,
  /'DUPLICATE_COMPONENT'/i,
  'Duplicate components must be routed to review.'
);

assert.doesNotMatch(
  MIGRATION,
  /update\s+public\.drugs\b/i,
  'P1 must not rewrite raw drug source rows.'
);
assert.doesNotMatch(
  MIGRATION,
  /pharmaceutical_form\s*=/i,
  'P1 must not alter pharmaceutical_form.'
);
assert.doesNotMatch(
  MIGRATION,
  /update\s+public\.medindex_drug_core_map_v1\b/i,
  'P1 must not rewrite legacy substance_concept_id mappings.'
);

console.log('P1 clinical identity migration contract passed.');
