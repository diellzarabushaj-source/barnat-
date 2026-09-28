'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const map = JSON.parse(read('data/pediatric-weight-age-defaults.json'));
const migration = read('supabase/migrations/20260928032000_add_pediatric_weight_age_default_v1.sql');
const handler = read('lib/pediatric-common-reference-handler.js');
const transport = read('lib/medindex-data-api.js');
const client = read('dozologjia-master-client.js');
const html = read('dozologjia.html');

const embedded = migration.match(/\$weight_age_json\$([\s\S]*?)\$weight_age_json\$::jsonb/);
assert.ok(embedded, 'Weight-age migration must embed the exact JSON payload');
assert.deepStrictEqual(JSON.parse(embedded[1]), map, 'Weight-age database seed must exactly match the committed JSON');
assert.equal(map.bands.length, 14);
assert.equal(map.interpolationAnchors.length, 14);

assert.match(migration, /pediatric_weight_age_defaults_v1/);
assert.match(migration, /pediatric_weight_age_default_rows_v1/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.pediatric_weight_age_defaults_v1 from anon, authenticated/);
assert.match(migration, /jsonb_array_elements\(s\.payload->'bands'\)/);

assert.match(handler, /WEIGHT_AGE_DATASET_KEY = 'pediatric_weight_age_default_20260928'/);
assert.match(handler, /pediatric_weight_age_defaults_v1/);
assert.match(handler, /weightAgeDefaults:ageData\[0\]\.payload/);

assert.match(transport, /'pediatric_weight_age_defaults_v1'/);
assert.match(transport, /'pediatric_weight_age_default_rows_v1'/);
assert.match(transport, /PRIVATE_SERVER_RELATIONS/);

assert.match(client, /STATIC_AGE_DEFAULTS_URL = '\/data\/pediatric-weight-age-defaults\.json'/);
assert.match(client, /function resolvedAgeInfo\(/);
assert.match(client, /function safeAgeBand\(/);
assert.match(client, /Pesha → mosha AUTO → doza → mL/);
assert.match(client, /MOSHA AUTO NGA PESHA/);
assert.match(html, /pediatric-weight-age-core\.js\?v=1/);

console.log('PASS: pediatric weight-age defaults are exact in JSON/database and wired into the weight-first calculator');
