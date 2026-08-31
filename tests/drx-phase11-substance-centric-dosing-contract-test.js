'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const phase11 = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20260831073232_drx_phase11_substance_centric_dosing_pipeline.sql'),
  'utf8',
);
const phase11b = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20260831073535_drx_phase11b_pilot_targets_and_promotion_queue.sql'),
  'utf8',
);

assert.match(phase11, /create table if not exists drx_dose\.rule_targets_v1/);
assert.match(phase11, /target_kind in \('SUBSTANCE','INGREDIENT_SET'\)/);
assert.match(phase11, /dose_basis_component_concept_id/);
assert.match(phase11, /strength_match_mode in \('ANY_COMPATIBLE','EXACT_STRENGTH','EXACT_VARIANT','MANUAL_REVIEW'\)/);

assert.match(phase11, /create table if not exists drx_dose\.rule_candidate_extractions_v1/);
assert.match(phase11, /auto_publish_allowed boolean not null default false/);
assert.match(phase11, /check \(auto_publish_allowed=false\)/);
assert.match(phase11, /create or replace function drx_dose\.parse_legacy_dose_text_v1/);
assert.match(phase11, /STRUCTURED_CANDIDATE/);
assert.match(phase11, /TEXT_ONLY/);
assert.match(phase11, /BLOCKED/);
assert.match(phase11, /NEEDS_REVIEW/);

assert.match(phase11, /create or replace view drx_dose\.product_rule_targets_v1/);
assert.match(phase11, /RESOLVED_SINGLE/);
assert.match(phase11, /RESOLVED_MULTI/);
assert.match(phase11, /strict_autoinherit_ready/);
assert.match(phase11, /create or replace view drx_dose\.inherited_rule_matches_v1/);
assert.match(phase11, /substance_inheritance/);
assert.match(phase11, /ingredient_set_inheritance/);
assert.match(phase11, /t\.required_strength_hash=p\.strength_hash/);
assert.match(phase11, /p\.strict_autoinherit_ready/);

assert.match(phase11, /create or replace function public\.drx_phase11_refresh_candidates_v1/);
assert.match(phase11, /where p\.editorial_status='published'/);
assert.match(phase11, /and d\.is_published=true/);
assert.match(phase11, /auto_publish_allowed=false/);
assert.match(phase11, /runtimeServeEnabled',false/);

assert.match(phase11b, /EXACT_STRENGTH/);
assert.match(phase11b, /create or replace view drx_dose\.rule_candidate_promotion_queue_v1/);
assert.match(phase11b, /EXACT_SOURCE_SNAPSHOT/);
assert.match(phase11b, /INDICATION_CONCEPT/);
assert.match(phase11b, /CLINICAL_REVIEW/);
assert.match(phase11b, /promotion_ready/);
assert.match(phase11b, /auto_publish_allowed/);
assert.match(phase11b, /create or replace view drx_dose\.phase11_review_queue_v1/);
assert.match(phase11b, /legacyRegimensExcludedBecauseProductNotPublished/);
assert.match(phase11b, /runtimeServeEnabled',false/);

console.log('DRx Phase 11 substance-centric dosing contract passed.');
