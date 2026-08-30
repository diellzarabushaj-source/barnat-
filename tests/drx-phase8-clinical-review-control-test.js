'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(ROOT,'supabase','migrations','20260830195641_drx_phase8o_clinical_review_control.sql'),
  'utf8'
);
const rollback = fs.readFileSync(
  path.join(ROOT,'supabase','drx-phase8o-clinical-review-control-rollback.sql'),
  'utf8'
);
const statusScript = fs.readFileSync(
  path.join(ROOT,'scripts','drx-phase8-clinical-review-status.js'),
  'utf8'
);
const workflow = fs.readFileSync(
  path.join(ROOT,'.github','workflows','drx-phase8-pilot-clinical-reference.yml'),
  'utf8'
);

assert.match(migration,/reviewer_role text/);
assert.match(migration,/review_attestation_version text/);
assert.match(migration,/CLINICAL_REVIEWER/);
assert.match(migration,/drx-phase8-clinical-review-attestation-v1/);
assert.match(migration,/drx_phase8_clinical_review_packet_v1/);
assert.match(migration,/drx_phase8_review_clinical_reference_v1/);
assert.match(migration,/stale review packet; snapshot or section hash changed/);
assert.match(migration,/section_text/);
assert.match(migration,/automaticVerificationAllowed',false/);
assert.match(migration,/automaticPublicationAllowed',false/);
assert.match(migration,/revoke all on function public\.drx_phase8_clinical_review_packet_v1\(\)[\s\S]*?from public,anon,authenticated/i);
assert.match(migration,/revoke all on function public\.drx_phase8_review_clinical_reference_v1\(jsonb\)[\s\S]*?from public,anon,authenticated/i);
assert.doesNotMatch(migration,/automatic_rule_publication_allowed\s*=\s*true/i);
assert.doesNotMatch(migration,/update\s+(?:public\.)?dose_rules_v3\b/i);
assert.doesNotMatch(migration,/update\s+(?:public\.)?dose_rule_product_bindings_v3\b/i);

assert.match(rollback,/rollback blocked: reviewed clinical-reference decisions exist/i);
assert.doesNotMatch(rollback,/drop\s+[\s\S]{0,160}?\bcascade\b/i);

assert.match(statusScript,/drx_phase8_clinical_review_packet_v1/);
assert.doesNotMatch(statusScript,/drx_phase8_review_clinical_reference_v1/);
assert.match(statusScript,/READY_FOR_REVIEW/);
assert.match(statusScript,/VERIFIED/);
assert.match(statusScript,/REJECTED/);

assert.match(workflow,/drx-phase8-clinical-review-control-test\.js/);
assert.match(workflow,/drx-phase8-clinical-review-status\.js/);
assert.match(workflow,/20260830195641_drx_phase8o_clinical_review_control\.sql/);

console.log('DRx Phase 8O clinical review-control contract: PASS');
