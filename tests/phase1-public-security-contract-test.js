'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8')
);

const required = Object.freeze([
  ['20260829002859', 'phase1_public_read_hardening'],
  ['20260829003649', 'phase1_publication_and_default_grant_hardening'],
  ['20260829003744', 'phase1_default_maintain_hardening'],
]);

for (const [version, name] of required) {
  assert.ok(
    manifest.migrations.some(item => String(item.version) === version && item.name === name),
    `Missing Phase 1 migration from migration-history.json: ${version}_${name}`
  );
  assert.ok(
    fs.existsSync(path.join(MIGRATIONS, `${version}_${name}.sql`)),
    `Missing Phase 1 migration file: ${version}_${name}.sql`
  );
}

const readHardening = fs.readFileSync(
  path.join(MIGRATIONS, '20260829002859_phase1_public_read_hardening.sql'),
  'utf8'
);
assert.match(readHardening, /public\.drugs[\s\S]*?is_published\s*=\s*true[\s\S]*?editorial_status\s*=\s*'published'/i);
assert.match(readHardening, /public\.dosage_regimens[\s\S]*?editorial_status\s*=\s*'published'/i);
assert.match(readHardening, /public\.drug_clinical_profiles[\s\S]*?verification_status\s*=\s*'verified'/i);
assert.match(readHardening, /revoke\s+execute\s+on\s+function\s+private\.handle_new_auth_user\(\)/i);
assert.match(readHardening, /revoke\s+execute\s+on\s+function\s+private\.set_updated_at\(\)/i);

const publicationHardening = fs.readFileSync(
  path.join(MIGRATIONS, '20260829003649_phase1_publication_and_default_grant_hardening.sql'),
  'utf8'
);
for (const table of [
  'dose_indications_v2',
  'dose_products_v2',
  'dose_rule_products_v2',
  'dose_rules_v2',
  'dose_safety_v2',
  'dose_sources_v2',
]) {
  assert.match(publicationHardening, new RegExp(`['"]${table}['"]`));
}
assert.match(publicationHardening, /active\s*=\s*true\s+and\s+editorial_status\s*=\s*''published''/i);
assert.match(publicationHardening, /public\.drug_indications[\s\S]*?editorial_status\s*=\s*'published'/i);
assert.match(publicationHardening, /public\.icd_codes[\s\S]*?is_published\s*=\s*true[\s\S]*?editorial_status\s*=\s*'published'/i);
assert.match(publicationHardening, /public\.icd_hierarchy_revisions[\s\S]*?status\s*=\s*'active'/i);
assert.match(publicationHardening, /public\.lab_tests[\s\S]*?is_published\s*=\s*true[\s\S]*?editorial_status\s*=\s*'published'/i);
assert.match(publicationHardening, /alter\s+default\s+privileges[\s\S]*?revoke[\s\S]*?on\s+tables\s+from\s+anon,\s*authenticated,\s*service_role/i);
assert.match(publicationHardening, /alter\s+default\s+privileges[\s\S]*?revoke\s+execute[\s\S]*?on\s+functions\s+from\s+public,\s*anon,\s*authenticated,\s*service_role/i);

const maintainHardening = fs.readFileSync(
  path.join(MIGRATIONS, '20260829003744_phase1_default_maintain_hardening.sql'),
  'utf8'
);
assert.match(maintainHardening, /revoke\s+maintain\s+on\s+all\s+tables\s+in\s+schema\s+public/i);
assert.match(maintainHardening, /alter\s+default\s+privileges[\s\S]*?revoke\s+maintain\s+on\s+tables/i);

const dataApi = fs.readFileSync(path.join(ROOT, 'lib', 'medindex-data-api.js'), 'utf8');
assert.match(dataApi, /const\s+privileged\s*=\s*shouldUseSupabaseServer\(path,\s*options\)/);
assert.match(dataApi, /const\s+key\s*=\s*privileged\s*\?\s*SUPABASE_SECRET_KEY\s*:\s*SUPABASE_PUBLISHABLE_KEY/);

console.log('Phase 1 public security contract passed.');
