'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

const files = fs.readdirSync(MIGRATIONS_DIR)
  .filter(name => /^\d+_.+\.sql$/.test(name))
  .sort();

const parsed = files.map(file => {
  const match = /^(\d+)_([^.]*)\.sql$/.exec(file);
  assert.ok(match, `Invalid migration filename: ${file}`);
  return { version: match[1], name: match[2], file };
});

const versions = parsed.map(item => item.version);
assert.equal(new Set(versions).size, versions.length, 'Migration versions must be unique.');
// Supabase migration identity is the version/timestamp. Historical migration names may repeat;
// exact file-to-production parity below is the authoritative integrity check.

const expected = MANIFEST.migrations.map(item => ({
  version: String(item.version),
  name: String(item.name),
}));
const actual = parsed.map(({version,name}) => ({version,name}));
assert.deepEqual(actual, expected, 'GitHub migration files must match the production Supabase migration history 1:1.');

assert.ok(
  files.includes('20260820103539_professional_title_and_document_kind.sql'),
  'Live professional-title migration timestamp must be preserved.'
);
assert.ok(
  files.includes('20260820110739_restrict_admin_role_to_owner_email.sql'),
  'Live admin-role migration timestamp must be preserved.'
);
assert.ok(!files.includes('20260820110000_professional_title_and_document_kind.sql'));
assert.ok(!files.includes('20260820113000_restrict_admin_role_to_owner_email.sql'));

const p0Path = path.join(MIGRATIONS_DIR, '20260827124402_p0_integrity_pipeline_coverage.sql');
const p0 = fs.readFileSync(p0Path, 'utf8');

assert.match(
  p0,
  /create or replace function public\.medindex_substance_component_signature\(value text\)[\s\S]*?set search_path = pg_catalog, public/i,
  'P0 must pin the component-signature function search_path.'
);
assert.match(
  p0,
  /create table if not exists public\.medindex_drug_pipeline_exceptions_v1/i,
  'P0 must represent explicit pipeline exceptions.'
);
assert.match(
  p0,
  /create or replace view public\.medindex_drug_pipeline_coverage_v1[\s\S]*?'MAPPED'[\s\S]*?'EXCLUDED'[\s\S]*?'UNRESOLVED'/i,
  'P0 must expose mapped/excluded/unresolved coverage.'
);
assert.match(
  p0,
  /create or replace view public\.medindex_drug_pipeline_violations_v1/i,
  'P0 must expose pipeline integrity violations.'
);
assert.match(
  p0,
  /drug_count <> mapped_count \+ exception_count/i,
  'P0 must enforce total drug coverage.'
);
assert.match(
  p0,
  /mapped_count <> profile_count/i,
  'P0 must enforce mapped/profile parity.'
);
assert.doesNotMatch(
  p0,
  /update\s+public\.drugs\b/i,
  'P0 must not rewrite source drug rows.'
);
assert.doesNotMatch(
  p0,
  /pharmaceutical_form\s*=/i,
  'P0 must not alter pharmaceutical_form.'
);
assert.doesNotMatch(
  p0,
  /active_substance\s*=/i,
  'P0 must not rewrite raw active_substance.'
);

console.log(`P0 database integrity contract passed: ${files.length} migrations in exact Supabase parity.`);
