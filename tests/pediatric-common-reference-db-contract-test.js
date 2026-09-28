'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const reference = JSON.parse(read('data/pediatric-common-drugs-reference.json'));
const clinicalAudit = JSON.parse(read('data/pediatric-clinical-audit-v1.json'));
const migration = read('supabase/migrations/20260928005317_add_pediatric_common_reference_v1.sql');
const clinicalMigration = read('supabase/migrations/20260928101736_add_pediatric_clinical_audit_v1.sql');
const api = read('api/dosage.js');
const handler = read('lib/pediatric-common-reference-handler.js');
const transport = read('lib/medindex-data-api.js');
const client = read('dozologjia-master-client.js');
const bundle = read('dozologjia-v2.js');
const html = read('dozologjia.html');

const embedded = migration.match(/\$pediatric_json\$([\s\S]*?)\$pediatric_json\$::jsonb/);
assert.ok(embedded, 'Reference migration must contain the exact source JSON');
assert.deepStrictEqual(JSON.parse(embedded[1]), reference);

const embeddedClinical = clinicalMigration.match(/\$clinical_audit_json\$([\s\S]*?)\$clinical_audit_json\$::jsonb/);
assert.ok(embeddedClinical, 'Clinical audit migration must contain the exact audit JSON');
assert.deepStrictEqual(JSON.parse(embeddedClinical[1]), clinicalAudit);

assert.equal(reference.sections.length, 10);
assert.equal(reference.sections.reduce((sum, section) => sum + section.drugs.length, 0), 50);
assert.equal(Object.keys(clinicalAudit.drugs).length, 11);
assert.deepStrictEqual(reference.sections.map(section => section.roman), ['I','II','III','IV','V','VI','VII','VIII','IX','X']);

assert.match(migration, /pediatric_common_reference_snapshots_v1/);
assert.match(migration, /pediatric_common_reference_rows_v1/);
assert.match(migration, /enable row level security/);
assert.match(clinicalMigration, /pediatric_clinical_audits_v1/);
assert.match(clinicalMigration, /enable row level security/);
assert.match(clinicalMigration, /revoke all on table public\.pediatric_clinical_audits_v1 from anon, authenticated/);

assert.match(handler, /DATASET_KEY = 'pediatric_common_drugs_20260928'/);
assert.match(handler, /CLINICAL_AUDIT_DATASET_KEY = 'pediatric_clinical_audit_20260928'/);
assert.match(handler, /verifySessionToken/);
assert.match(handler, /pediatric_common_reference_snapshots_v1/);
assert.match(handler, /pediatric_clinical_audits_v1/);
assert.match(handler, /clinicalAudit:Array\.isArray\(auditData\)/);
assert.match(api, /pediatricCommonReferenceHandler\.VIEW/);
assert.match(transport, /'pediatric_common_reference_snapshots_v1'/);
assert.match(transport, /'pediatric_common_reference_rows_v1'/);
assert.match(transport, /'pediatric_clinical_audits_v1'/);

assert.match(client, /\/api\/dosage\?view=pediatric-common-reference/);
assert.match(client, /STATIC_FALLBACK_URL = '\/data\/pediatric-common-drugs-reference\.json'/);
assert.match(client, /CLINICAL_AUDIT_URL = '\/data\/pediatric-clinical-audit-v1\.json'/);
assert.match(client, /payload\?\.clinicalAudit/);
assert.match(client, /source = 'database'/);

assert.ok(bundle.endsWith(client), 'Generated Dozologjia bundle must include the current database-backed client');
const cssVersion = html.match(/dozologjia-v2\.css\?v=(\d+)/)?.[1];
const jsVersion = html.match(/dozologjia-v2\.js\?v=(\d+)/)?.[1];
assert.ok(cssVersion && jsVersion);
assert.equal(cssVersion, jsVersion);
assert.ok(Number(cssVersion) >= 41);
assert.match(html, /pediatric-common-liquid-core\.js\?v=3/);
assert.match(html, /id="pediatricCommonReference"/);

console.log('PASS: pediatric source table and independent clinical audit are database-backed, source-exact and wired into Dozologjia');
