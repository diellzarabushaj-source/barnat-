'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const ax = read('20260831132518_drx_phase11ax_completion_gates_and_review_batches.sql');
const ay = read('20260831132652_drx_phase11ay_combination_aware_review_batches.sql');

assert.match(ax, /phase11_completion_checklist_v1/);
assert.match(ax, /phase11_completion_summary_v1/);
assert.match(ax, /clinical_review_batch_summary_v1/);
assert.match(ax, /PRODUCT_IDENTITY_COVERAGE/);
assert.match(ax, /CLINICAL_REGIMEN_REVIEW/);
assert.match(ax, /PROMOTION_GATE_READY/);
assert.match(ax, /RUNTIME_CUTOVER/);
assert.match(ax, /auto_finish_allowed/);
assert.match(ax, /auto_approve_allowed/);

assert.match(ay, /Amoxicillin/);
assert.match(ay, /dose_moiety_key/);
assert.match(ay, /array_to_string\(t\.dose_moiety_names,' \+ '\)/);
assert.match(ay, /INGREDIENT_SET|target_kind/);
assert.match(ay, /READY_FOR_CLINICAL_REVIEW/);

for (const sql of [ax, ay]) {
  assert.doesNotMatch(sql, /auto_finish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_approve_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
}

console.log('DRx Phase 11 completion-gate contract passed.');
