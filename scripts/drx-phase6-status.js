'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const baseUrl = String(process.env.MEDINDEX_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SECRET_KEY || '';

assert.ok(baseUrl, 'MEDINDEX_SUPABASE_URL is required');
assert.ok(key, 'SUPABASE_SECRET_KEY is required');

async function main() {
  const response = await fetch(baseUrl + '/rest/v1/rpc/drx_phase6_status_v1', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });

  const body = await response.text();
  assert.equal(response.ok, true, 'Phase 6 RPC failed: ' + response.status + ' ' + body);
  const status = JSON.parse(body);

  assert.equal(status.current_source_documents, status.source_keys);
  assert.equal(status.full_safety_documents, status.source_keys);
  assert.equal(status.indication_source_claims, status.source_keys);
  assert.equal(status.classified_market_products, status.market_products);
  assert.equal(status.classified_variants, status.clinical_variants);
  assert.equal(status.evidence_hash_mismatches, 0);
  assert.equal(status.source_policy_rank_mismatches, 0);
  assert.equal(status.inferred_indication_semantics, 0);
  assert.equal(status.inferred_safety_semantics, 0);
  assert.equal(status.reconstruction_true_diffs, 0);
  assert.equal(status.generated_true_diffs, 0);
  assert.equal(status.variant_source_binding_inferred, false);
  assert.equal(status.icd10_inferred_from_free_text, false);
  assert.equal(status.safety_semantics_inferred_from_free_text, false);
  assert.equal(status.publication_allowed, false);
  assert.equal(status.gate_pass, true);

  const evidence = {
    evidence_version: 'drx-phase6-status-evidence-v1',
    generated_at: new Date().toISOString(),
    source: 'public.drx_phase6_status_v1',
    status
  };

  fs.writeFileSync('drx-phase6-status-evidence.json', JSON.stringify(evidence,null,2) + '\n');
  console.log(JSON.stringify(evidence,null,2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
