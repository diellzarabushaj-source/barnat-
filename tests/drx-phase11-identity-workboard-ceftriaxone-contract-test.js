'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const y = read('20260831103205_drx_phase11y_unresolved_target_disposition_and_coverage.sql');
const z = read('20260831103630_drx_phase11z_identity_repair_proposal_staging.sql');
const aa = read('20260831103731_drx_phase11aa_stage_to_public_identity_link_staging.sql');
const ab = read('20260831103906_drx_phase11ab_fill_once_workboard_and_status.sql');
const ac = read('20260831104100_drx_phase11ac_ceftriaxone_source_regimens.sql');

assert.match(y, /create or replace view drx_dose\.unresolved_product_disposition_queue_v1/);
assert.match(y, /target_identity_coverage_pct/);
assert.match(y, /unresolved_auto_resolve_allowed/);
assert.match(y, /false::boolean as unresolved_auto_resolve_allowed/);

assert.match(z, /create table if not exists drx_dose\.identity_repair_proposals_v1/);
assert.match(z, /create table if not exists drx_dose\.identity_repair_proposal_components_v1/);
assert.match(z, /STAGE_ONLY_COMPONENT_REQUIRES_PUBLIC_IDENTITY_REVIEW/);
assert.match(z, /DUPLICATE_COMPONENT_COLLAPSE_REVIEW/);
assert.match(z, /auto_apply_allowed boolean not null default false/);
assert.match(z, /review_ready=false/);

assert.match(aa, /create table if not exists drx_dose\.stage_public_identity_link_proposals_v1/);
assert.match(aa, /EXACT_TERM_KEY/);
assert.match(aa, /NO_EXACT_PUBLIC_MATCH/);
assert.match(aa, /approved_public_concept_id/);
assert.match(aa, /auto_apply_allowed boolean not null default false/);

assert.match(ab, /create or replace view drx_dose\.dose_target_fill_priority_v1/);
assert.match(ab, /create or replace view drx_dose\.phase11_workboard_v1/);
assert.match(ab, /STRUCTURE_EXACT_SOURCE_EVIDENCE/);
assert.match(ab, /IDENTITY_REPAIR_REVIEW/);
assert.match(ab, /STAGE_PUBLIC_LINK_REVIEW/);
assert.match(ab, /'autoPublishAllowed',false/);
assert.match(ab, /'identityAutoApplyAllowed',false/);
assert.match(ab, /'runtimeServeEnabled',false/);

assert.match(ac, /create or replace function public\.drx_phase11_refresh_source_indications_v1/);
assert.match(ac, /SRC-CEFTRI-ADULT-CAP-COPD-IAI-CUTI/);
assert.match(ac, /SRC-CEFTRI-PED-MENINGITIS/);
assert.match(ac, /SRC-CEFTRI-NEONATE-MENINGITIS-ENDOCARDITIS/);
assert.match(ac, /SRC-ADJ-CEFTRI-CRCL-BELOW-10-MAX2G/);
assert.match(ac, /SRC-REST-CEFTRI-PREMATURE-NEONATE-PMA41/);
assert.match(ac, /editorial_status[\s\S]*'draft'/);
assert.match(ac, /'autoPublished',false/);

for (const sql of [y,z,aa,ab,ac]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_apply_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /runtimeServeEnabled'\s*,\s*true/i);
}

console.log('DRx Phase 11 unresolved identity + workboard + ceftriaxone contract passed.');
