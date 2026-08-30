'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const { supabaseRequest } = require('../lib/medindex-data-api.js');

async function rpc(name,body={}) {
  const { data } = await supabaseRequest('rpc/' + name,{
    method:'POST',body,timeoutMs:20000,label:'DRx Phase 8 ' + name
  },{ privileged:true });
  return data;
}

async function main() {
  const status = await rpc('drx_phase8_status_v1');
  const captureStatus = await rpc('drx_phase8_capture_status_v1');
  const preflight = await rpc('drx_phase8_pilot_build_preflight_v1');

  // Phase-wide invariants: V2 stays served and Phase 8 never enables cutover.
  assert.equal(status.phase8_functions,3);
  assert.equal(status.reconstruction_true_diffs,0);
  assert.equal(status.generated_true_diffs,0);
  assert.equal(status.shadow_only,true);
  assert.equal(status.v2_runtime_preserved,true);
  assert.equal(status.v3_cutover_enabled,false);
  assert.equal(status.publication_allowed,false);
  assert.equal(status.implementation_gate_pass,true);
  assert.equal(status.unique_source_identities,25);
  assert.equal(status.unresolved_source_identities,0);
  assert.equal(status.v3_product_candidates,status.review_product_source_bindings);
  assert.ok(status.strongest_review_candidates > 0);
  assert.equal(status.automatic_candidate_insert_enabled,false);
  assert.equal(status.automatic_product_source_verification_enabled,false);
  assert.equal(status.reference_label_bindings,status.review_product_source_bindings);
  assert.equal(status.exact_market_product_bindings,0);
  assert.equal(status.exact_market_product_evidence_rows,0);
  assert.equal(status.invalid_verified_product_source_bindings,0);
  assert.equal(status.exact_product_guard_triggers,2);
  assert.equal(status.reference_label_can_verify_market_product,false);
  assert.equal(status.published_v2_comparator_products,2);
  assert.equal(status.exact_source_discovery_candidates,2);
  assert.equal(status.exact_source_snapshot_ready,2);
  assert.equal(status.pilot_source_snapshot_missing,0);
  assert.equal(status.automatic_exact_source_promotion_enabled,false);

  assert.equal(captureStatus.published_v2_comparator_products,2);
  assert.equal(captureStatus.exact_source_discovery_candidates,2);
  assert.equal(captureStatus.exact_source_snapshot_ready,2);
  assert.equal(captureStatus.exact_source_capture_rows,2);
  assert.equal(captureStatus.exact_source_review_bindings,0);
  assert.equal(captureStatus.exact_source_verified_bindings,2);
  assert.equal(captureStatus.exact_source_rejected_bindings,0);
  assert.equal(captureStatus.pilot_review_pending,0);
  assert.equal(captureStatus.pilot_source_snapshot_missing,0);
  assert.equal(captureStatus.invalid_ingested_discovery_rows,0);
  assert.equal(captureStatus.orphan_exact_source_bindings,0);
  assert.equal(captureStatus.source_capture_gate_pass,true);
  assert.equal(captureStatus.human_review_required,true);
  assert.equal(captureStatus.automatic_verification_enabled,false);
  assert.equal(captureStatus.publication_allowed,false);

  assert.equal(preflight.preflightVersion,'drx-phase8-pilot-build-preflight-v1');
  assert.equal(preflight.requiredPilotCount,2);
  assert.equal(preflight.pilotCount,2);
  assert.equal(preflight.humanClinicalReviewRequired,true);
  assert.equal(preflight.automaticClinicalReviewEnabled,false);
  assert.equal(preflight.automaticPublicationEnabled,false);

  // Before both explicit clinical reviews, V3 publication must remain impossible.
  if (preflight.clinicalReviewsVerified < preflight.requiredPilotCount) {
    assert.equal(preflight.pilotsReadyForV3Build,0);
    assert.equal(preflight.pilotsPublishedInV3,0);
    assert.equal(status.v3_published_products,0);
    assert.equal(status.v3_published_rules,0);
    assert.equal(status.exit_gate_pass,false);
    assert.equal(status.gate_pass,false);
  }

  // Once preflight passes, both reviewed pilots must be fully represented in V3.
  if (preflight.preflightPass) {
    assert.equal(preflight.clinicalReviewsVerified,2);
    assert.equal(preflight.pilotsReadyForV3Build,2);
    assert.equal(preflight.pilotsPublishedInV3,2);
    assert.ok(status.v3_published_products >= 2);
    assert.ok(status.v3_published_rules > 0);
  }

  // Final Phase 8 exit is stricter than build preflight: every recorded shadow
  // comparison must match and V2 remains the served runtime.
  if (status.exit_gate_pass) {
    assert.equal(preflight.preflightPass,true);
    assert.ok(status.shadow_comparisons > 0);
    assert.equal(status.shadow_matches,status.shadow_comparisons);
    assert.equal(status.shadow_diffs,0);
    assert.equal(status.shadow_v2_only,0);
    assert.equal(status.shadow_v3_only,0);
    assert.equal(status.shadow_both_missing,0);
    assert.equal(status.shadow_v3_errors,0);
    assert.equal(status.shadow_skipped,0);
    assert.equal(status.gate_pass,true);
  } else {
    assert.equal(status.gate_pass,false);
  }

  const search = await rpc('drx_dose_search_v3_shadow_v1',{ p_query:'aa',p_limit:50 });
  assert.ok(Array.isArray(search));
  assert.ok(search.length <= 50);

  const evidence = {
    evidence_version:'drx-phase8-status-evidence-v2',
    generated_at:new Date().toISOString(),
    source:'public.drx_phase8_status_v1',
    status,
    captureStatus,
    preflight,
    shadow_search_result_count:search.length,
    shadow_search_limit:50
  };
  fs.writeFileSync('drx-phase8-status-evidence.json',JSON.stringify(evidence,null,2) + '\n');
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(error => { console.error(error); process.exitCode=1; });
