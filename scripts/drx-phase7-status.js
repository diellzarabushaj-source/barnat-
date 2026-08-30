'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const baseUrl = String(process.env.MEDINDEX_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SECRET_KEY || '';

assert.ok(baseUrl, 'MEDINDEX_SUPABASE_URL is required');
assert.ok(key, 'SUPABASE_SECRET_KEY is required');

async function main() {
  const response = await fetch(baseUrl + '/rest/v1/rpc/drx_phase7_status_v1', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });

  const body = await response.text();
  assert.equal(response.ok, true, 'Phase 7 RPC failed: ' + response.status + ' ' + body);
  const status = JSON.parse(body);

  assert.equal(status.posology_source_claims, status.source_documents);
  assert.equal(status.publication_guard_triggers, 3);
  assert.equal(status.inferred_or_auto_posology_rows, 0);
  assert.equal(status.published_rules, 0);
  assert.equal(status.published_products, 0);
  assert.equal(status.reconstruction_true_diffs, 0);
  assert.equal(status.generated_true_diffs, 0);
  assert.equal(status.free_text_rule_inference_enabled, false);
  assert.equal(status.legacy_auto_migration_enabled, false);
  assert.equal(status.publication_allowed, false);
  assert.equal(status.gate_pass, true);

  const evidence = {
    evidence_version: 'drx-phase7-status-evidence-v1',
    generated_at: new Date().toISOString(),
    source: 'public.drx_phase7_status_v1',
    status
  };

  fs.writeFileSync('drx-phase7-status-evidence.json', JSON.stringify(evidence,null,2) + '\n');
  console.log(JSON.stringify(evidence,null,2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
