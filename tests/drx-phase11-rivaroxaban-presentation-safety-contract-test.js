'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const am = read('20260831114151_drx_phase11am_rivaroxaban_step_presentation_and_safety.sql');
const an = read('20260831114311_drx_phase11an_deduplicate_source_safety_candidates.sql');
const ao = read('20260831114412_drx_phase11ao_scope_aware_duplicate_detection.sql');

assert.match(am, /source_regimen_step_presentation_requirements_v1/);
assert.match(am, /source_regimen_step_administration_v1/);
assert.match(am, /SRC-RIVA-DVTPE-ADULT-SEQUENCE/);
assert.match(am, /SRC-RIVA-PED-VTE-WEIGHT-BANDS/);
assert.match(am, /WITH_FOOD/);
assert.match(am, /SRC-ADJ-RIVA-CRCL15TO29-CAUTION/);
assert.match(am, /SRC-REST-RIVA-HEPATIC-COAGULOPATHY-BLEEDING/);
assert.match(am, /auto_bind_allowed boolean not null default false/);
assert.match(am, /auto_apply_allowed boolean not null default false/);

assert.match(an, /source_adjustment_semantic_duplicates_v1/);
assert.match(an, /source_restriction_semantic_duplicates_v1/);
assert.match(an, /SRC-ADJ-RIVA-NVAF-CRCL15TO49-15QD/);
assert.match(an, /SRC-REST-RIVA-ADULT-CRCL-LT15/);

assert.match(ao, /source_strength_value/);
assert.match(ao, /applicability_form_family/);
assert.match(ao, /applicability_release_key/);
assert.match(ao, /drop view if exists drx_dose\.source_restriction_semantic_duplicates_v1/);

for (const sql of [am, an, ao]) {
  assert.doesNotMatch(sql, /auto_bind_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_apply_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
}

console.log('DRx Phase 11 rivaroxaban presentation/safety contract passed.');
