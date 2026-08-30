'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const sql=fs.readFileSync(
  'supabase/migrations/20260830204847_drx_phase8t_clinical_finding_review_control.sql',
  'utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase8t-clinical-finding-review-control-rollback.sql',
  'utf8'
);

assert.match(sql,/drx_phase8_review_clinical_finding_v1/);
assert.match(sql,/APPROVE_PROPOSED_ACTION/);
assert.match(sql,/REJECT_FINDING/);
assert.match(sql,/reviewerRole/);
assert.match(sql,/drx-phase8-clinical-finding-attestation-v1/);
assert.match(sql,/reviewerAttested/);
assert.match(sql,/stale or mismatched source snapshot/);
assert.match(sql,/correctionApplied',false/);
assert.match(sql,/publicationAllowed',false/);
assert.match(sql,/automaticResolutionAllowed',false/);
assert.match(sql,/review_status='RESOLVED' and old\.review_status<>'APPROVED'/);
assert.match(sql,/revoke all on function public\.drx_phase8_review_clinical_finding_v1\(jsonb\)/i);
assert.match(sql,/grant execute on function public\.drx_phase8_review_clinical_finding_v1\(jsonb\)\s+to service_role/i);
assert.doesNotMatch(sql,/update\s+public\.dose_rules_v2/i);
assert.doesNotMatch(sql,/update\s+public\.dose_rules_v3/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);
assert.match(rollback,/rollback blocked: clinical finding review decisions exist/i);

console.log('DRx Phase 8 clinical finding review control: PASS');
