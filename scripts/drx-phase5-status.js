'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const baseUrl = String(process.env.MEDINDEX_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SECRET_KEY || '';

assert.ok(baseUrl, 'MEDINDEX_SUPABASE_URL is required');
assert.ok(key, 'SUPABASE_SECRET_KEY is required');

async function main() {
  const response = await fetch(baseUrl + '/rest/v1/rpc/drx_phase5_status_v1', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });

  const body = await response.text();
  assert.equal(response.ok, true, 'Phase 5 RPC failed: ' + response.status + ' ' + body);

  const status = JSON.parse(body);

  assert.equal(status.market_products, status.source_products);
  assert.equal(status.bound_products + status.anomaly_products, status.source_products);
  assert.equal(status.duplicate_variant_signatures, 0);
  assert.equal(status.orphan_product_bindings, 0);
  assert.equal(status.binding_mismatches, 0);
  assert.equal(status.unaccounted_source_products, 0);
  assert.equal(status.invented_market_product_ids, 0);
  assert.equal(status.variants_without_products, 0);
  assert.equal(status.invalid_pdid_bound, 0);
  assert.equal(status.bound_with_anomalies, 0);
  assert.equal(status.anomaly_without_reason, 0);
  assert.equal(status.reconstruction_true_diffs, 0);
  assert.equal(status.generated_true_diffs, 0);
  assert.equal(status.publication_allowed, false);
  assert.equal(status.gate_pass, true);

  const evidence = {
    evidence_version: 'drx-phase5-status-evidence-v1',
    generated_at: new Date().toISOString(),
    source: 'public.drx_phase5_status_v1',
    status
  };

  fs.writeFileSync(
    'drx-phase5-status-evidence.json',
    JSON.stringify(evidence, null, 2) + '\n'
  );

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
