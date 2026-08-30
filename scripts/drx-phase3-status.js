'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const baseUrl = String(process.env.MEDINDEX_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SECRET_KEY || '';

assert.ok(baseUrl, 'MEDINDEX_SUPABASE_URL is required');
assert.ok(key, 'SUPABASE_SECRET_KEY is required');

async function main() {
  const response = await fetch(baseUrl + '/rest/v1/rpc/drx_phase3_status_v1', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });

  const text = await response.text();
  assert.equal(response.ok, true, 'Phase 3 RPC failed: ' + response.status + ' ' + text);

  const status = JSON.parse(text);

  assert.equal(status.products, 4015);
  assert.equal(status.form_dictionary_rows, 150);
  assert.equal(status.distinct_product_forms, 150);
  assert.equal(status.form_unmapped, 0);
  assert.equal(status.malformed_normalized_form_keys, 0);
  assert.equal(status.ambiguous_form_aliases, 0);
  assert.equal(status.unsafe_route_autofill_rules, 0);
  assert.equal(status.auto_strength_conversions_enabled, false);
  assert.equal(status.publication_allowed, false);
  assert.equal(status.gate_pass, true);

  const evidence = {
    evidence_version: 'drx-phase3-status-evidence-v1',
    generated_at: new Date().toISOString(),
    source: 'public.drx_phase3_status_v1',
    status
  };

  fs.writeFileSync(
    'drx-phase3-status-evidence.json',
    JSON.stringify(evidence, null, 2) + '\n'
  );

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
