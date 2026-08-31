'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const ap = read('20260831114635_drx_phase11ap_clinical_review_packet_and_promotion_gate_v2.sql');
const aq = read('20260831114715_drx_phase11aq_primary_evidence_backfill_and_review_priority.sql');

assert.match(ap, /source_regimen_clinical_review_packet_v1/);
assert.match(ap, /source_regimen_promotion_gate_v2/);
assert.match(ap, /source_regimen_review_dashboard_v1/);
assert.match(ap, /PRIMARY_SOURCE_EVIDENCE/);
assert.match(ap, /PRESENTATION_REQUIREMENT_REVIEW/);
assert.match(ap, /ADMINISTRATION_REQUIREMENT_REVIEW/);
assert.match(ap, /LINKED_INDICATION_REVIEW/);
assert.match(ap, /false::boolean as auto_publish_allowed/);
assert.match(ap, /false::boolean as runtime_ready/);

assert.match(aq, /source_regimen_supporting_evidence_v1/);
assert.match(aq, /'PRIMARY'/);
assert.match(aq, /source_regimen_review_priority_v1/);
assert.match(aq, /CLINICAL_REVIEW/);
assert.match(aq, /CLEAR_PROMOTION_BLOCKERS/);
assert.match(aq, /PROMOTION_GATE_READY/);
assert.match(aq, /false::boolean as auto_approve_allowed/);
assert.match(aq, /false::boolean as auto_publish_allowed/);

for (const sql of [ap, aq]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_approve_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /runtime_ready\s*=\s*true/i);
}

console.log('DRx Phase 11 clinical-review pipeline contract passed.');
