'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const baseUrl = String(process.env.MEDINDEX_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SECRET_KEY || '';

assert.ok(baseUrl, 'MEDINDEX_SUPABASE_URL is required');
assert.ok(key, 'SUPABASE_SECRET_KEY is required');

async function main() {
  const response = await fetch(baseUrl + '/rest/v1/rpc/drx_phase4_status_v1', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });

  const body = await response.text();
  assert.equal(response.ok, true, 'Phase 4 RPC failed: ' + response.status + ' ' + body);

  const status = JSON.parse(body);

  assert.equal(status.stage_sources, status.stage_mapped);
  assert.equal(status.public_sources, status.public_mapped);
  assert.equal(status.unresolved_combination_components, 0);
  assert.equal(status.legacy_alias_cycles, 0);
  assert.equal(status.relationship_evidence_violations, 0);
  assert.equal(status.base_equals_salt_auto_merge_enabled, false);
  assert.equal(status.search_alias_merges_identity, false);
  assert.equal(status.similarity_merge_enabled, false);
  assert.equal(status.source_literal_identity_claims_equivalence, false);
  assert.equal(status.publication_allowed, false);
  assert.equal(status.gate_pass, true);

  const evidence = {
    evidence_version: 'drx-phase4-status-evidence-v1',
    generated_at: new Date().toISOString(),
    source: 'public.drx_phase4_status_v1',
    status
  };

  fs.writeFileSync(
    'drx-phase4-status-evidence.json',
    JSON.stringify(evidence, null, 2) + '\n'
  );

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
