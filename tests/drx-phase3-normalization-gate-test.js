'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const core = fs.readFileSync(
  'supabase/migrations/20260830151016_drx_phase3_normalization_core.sql',
  'utf8'
);
const hardening = fs.readFileSync(
  'supabase/migrations/20260830152739_drx_phase3_normalization_gate_hardening.sql',
  'utf8'
);
const workflow = fs.readFileSync(
  '.github/workflows/drx-phase3-normalization-gate.yml',
  'utf8'
);
const rollback = fs.readFileSync(
  'docs/DRX-PHASE3-ROLLBACK.md',
  'utf8'
);

assert.match(core, /create schema if not exists drx_norm/i);
assert.match(core, /form_dictionary_v1/);
assert.match(core, /route_dictionary_v1/);
assert.match(core, /route_alias_v1/);
assert.match(core, /route_form_rules_v1/);
assert.match(core, /parse_strength_v1/);
assert.match(core, /concentration_not_dose/);
assert.match(core, /drx_phase3_import_form_dictionary_v1/);
assert.match(core, /publication_allowed',false/);
assert.match(core, /grant execute on function public\.drx_phase3_status_v1\(\)\s+to service_role/is);
assert.doesNotMatch(core, /grant execute on function public\.drx_phase3_status_v1\(\)\s+to authenticated/is);

assert.match(hardening, /form_alias_v1/);
assert.match(hardening, /release_dictionary_v1/);
assert.match(hardening, /release_alias_v1/);
assert.match(hardening, /normalization_review_queue_v1/);
assert.match(hardening, /form_alias_ambiguities_v1/);
assert.match(hardening, /percentage_no_conversion/);
assert.match(hardening, /concentration_not_dose/);
assert.match(hardening, /auto_strength_conversions_enabled',false/);
assert.match(hardening, /gate_pass/);
assert.match(hardening, /publication_allowed',false/);

for (const key of [
  'ADULT_ONLY',
  'PEDIATRIC_ONLY',
  'ADULT_AND_PEDIATRIC',
  'NEONATAL_ONLY',
  'PEDIATRIC_SUBGROUP',
  'GERIATRIC_SPECIFIC',
  'SPECIAL_POPULATION',
  'NOT_ESTABLISHED'
]) {
  assert.match(hardening, new RegExp(key));
}

for (const release of [
  'IMMEDIATE',
  'MODIFIED',
  'PROLONGED',
  'GASTRO_RESISTANT',
  'DELAYED',
  'NOT_APPLICABLE'
]) {
  assert.match(hardening, new RegExp(release));
}

assert.match(workflow, /SUPABASE_SECRET_KEY/);
assert.match(workflow, /drx-phase3-status-evidence/);
assert.match(workflow, /drx-phase3-normalization-gate-test\.js/);
assert.match(rollback, /V2/i);
assert.match(rollback, /do not drop/i);

console.log('DRx Phase 3 normalization contract: PASS');

// CI trigger: Phase 3 atomic migration commit is live on main.
