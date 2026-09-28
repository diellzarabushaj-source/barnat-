'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const reference = JSON.parse(read('data/pediatric-common-drugs-reference.json'));
const migration = read('supabase/migrations/20260928005317_add_pediatric_common_reference_v1.sql');
const api = read('api/dosage.js');
const handler = read('lib/pediatric-common-reference-handler.js');
const transport = read('lib/medindex-data-api.js');
const client = read('dozologjia-master-client.js');
const bundle = read('dozologjia-v2.js');
const html = read('dozologjia.html');

const embedded = migration.match(/\$pediatric_json\$([\s\S]*?)\$pediatric_json\$::jsonb/);
assert.ok(embedded, 'Migration must contain the exact JSON source payload');
assert.deepStrictEqual(JSON.parse(embedded[1]), reference, 'Database seed payload must exactly match the committed source table JSON');

assert.equal(reference.sections.length, 10);
assert.equal(reference.sections.reduce((sum, section) => sum + section.drugs.length, 0), 50);
assert.deepStrictEqual(reference.sections.map(section => section.roman), ['I','II','III','IV','V','VI','VII','VIII','IX','X']);

assert.match(migration, /pediatric_common_reference_snapshots_v1/);
assert.match(migration, /pediatric_common_reference_rows_v1/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.pediatric_common_reference_snapshots_v1 from anon, authenticated/);
assert.match(migration, /revoke all on table public\.pediatric_common_reference_rows_v1 from anon, authenticated/);
assert.match(migration, /jsonb_array_elements\(s\.payload->'sections'\)/);
assert.match(migration, /jsonb_array_elements\(section_value->'drugs'\)/);

assert.match(handler, /DATASET_KEY = 'pediatric_common_drugs_20260928'/);
assert.match(handler, /verifySessionToken/);
assert.match(handler, /pediatric_common_reference_snapshots_v1/);
assert.match(api, /pediatricCommonReferenceHandler\.VIEW/);
assert.match(transport, /'pediatric_common_reference_snapshots_v1'/);
assert.match(transport, /'pediatric_common_reference_rows_v1'/);

assert.match(client, /\/api\/dosage\?view=pediatric-common-reference/);
assert.match(client, /STATIC_FALLBACK_URL = '\/data\/pediatric-common-drugs-reference\.json'/);
assert.match(client, /source = 'database'/);
assert.ok(bundle.endsWith(client), 'Generated Dozologjia bundle must include the current database-backed client');
const cssVersion = html.match(/dozologjia-v2\.css\?v=(\d+)/)?.[1];
const jsVersion = html.match(/dozologjia-v2\.js\?v=(\d+)/)?.[1];
assert.ok(cssVersion && jsVersion);
assert.equal(cssVersion, jsVersion);
assert.ok(Number(cssVersion) >= 34);
assert.match(html, /id="pediatricCommonReference"/);

console.log('PASS: pediatric common-dose reference is source-exact in JSON, migration, database route and Dozologjia runtime');
