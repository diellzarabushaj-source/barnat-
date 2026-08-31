'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const r = read('20260831102104_drx_phase11r_source_first_complex_regimen_staging.sql');
const s = read('20260831102222_drx_phase11s_simple_regimen_and_source_restriction_staging.sql');
const t = read('20260831102305_drx_phase11t_source_backed_draft_indications.sql');
const u = read('20260831102424_drx_phase11u_source_adjustment_staging.sql');
const v = read('20260831102613_drx_phase11v_fill_once_target_context_architecture.sql');
const w = read('20260831102817_drx_phase11w_generalize_safety_targets_to_combinations.sql');
const x = read('20260831102921_drx_phase11x_strength_aware_coamoxiclav_combo_staging.sql');

assert.match(r, /create table if not exists drx_dose\.source_regimen_candidates_v1/);
assert.match(r, /create table if not exists drx_dose\.source_regimen_steps_v1/);
assert.match(r, /regimen_kind in \('single_step','sequence','weight_band','conditional','sequence_and_band'\)/);
assert.match(r, /SRC-RIVA-DVTPE-ADULT-SEQUENCE/);
assert.match(r, /SRC-RIVA-PED-VTE-WEIGHT-BANDS/);
assert.match(r, /publication_ready/);
assert.match(r, /false::boolean as runtime_ready/);

assert.match(s, /create table if not exists drx_dose\.source_restriction_candidates_v1/);
assert.match(s, /NO_ESTABLISHED_DATA/);
assert.match(s, /SRC-DESLOR-ALLERGIC-RHINITIS-12PLUS/);
assert.match(s, /SRC-REST-RIVA-CRCL-BELOW-15/);
assert.match(s, /auto_apply_allowed boolean not null default false/);

assert.match(t, /editorial_status\s*\)\s*select[\s\S]*'draft'/);
assert.match(t, /icd_verification_status[\s\S]*'unverified'/);
assert.match(t, /create or replace view drx_dose\.source_indication_review_queue_v1/);
assert.match(t, /create or replace view drx_dose\.source_regimen_promotion_queue_v1/);
assert.match(t, /false::boolean as promotion_ready/);
assert.match(t, /false::boolean as auto_publish_allowed/);

assert.match(u, /create table if not exists drx_dose\.source_adjustment_candidates_v1/);
assert.match(u, /CONSIDER_REDUCTION/);
assert.match(u, /SRC-ADJ-RIVA-NVAF-CRCL-15-49/);
assert.match(u, /auto_apply_allowed boolean not null default false/);

assert.match(v, /target_kind in \('SUBSTANCE','INGREDIENT_SET'\)/);
assert.match(v, /create table if not exists drx_dose\.source_regimen_step_components_v1/);
assert.match(v, /create or replace view drx_dose\.dose_target_catalog_v1/);
assert.match(v, /create or replace view drx_dose\.dose_target_context_queue_v1/);
assert.match(v, /product ingredient identity/i);

assert.match(w, /SOURCE_RESTRICTION_COMBINATION_COMPONENTS_REQUIRED/);
assert.match(w, /SOURCE_ADJUSTMENT_COMBINATION_COMPONENTS_REQUIRED/);
assert.match(w, /create or replace view drx_dose\.dose_target_safety_coverage_v1/);

assert.match(x, /EXACT_COMPONENT_STRENGTH/);
assert.match(x, /create table if not exists drx_dose\.source_regimen_strength_requirements_v1/);
assert.match(x, /SRC-COAMOX-875125-ADULT-STANDARD/);
assert.match(x, /SRC-COAMOX-PED-STANDARD-RANGE/);
assert.match(x, /25,45,'mg','kg\/day'/);
assert.match(x, /3\.6,6\.4,'mg','kg\/day'/);
assert.match(x, /SRC-REST-COAMOX-875125-TABLET-BELOW-25KG/);
assert.match(x, /SRC-REST-COAMOX-7TO1-CRCL-BELOW-30/);

for (const sql of [r,s,t,u,v,w,x]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_apply_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /runtime_eligible\s*=\s*true/i);
  assert.doesNotMatch(sql, /runtime_ready\s*=\s*true/i);
}

console.log('DRx Phase 11 fill-once architecture contract passed.');
