'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync(
  'supabase/migrations/20260830201012_drx_phase8p_pilot_build_preflight.sql',
  'utf8'
);

assert.match(sql,/drx_phase8_pilot_build_preflight_v1/);
assert.match(sql,/security definer/i);
assert.match(sql,/CLINICAL_REFERENCE_REVIEW_PENDING/);
assert.match(sql,/humanClinicalReviewRequired',true/);
assert.match(sql,/automaticClinicalReviewEnabled',false/);
assert.match(sql,/automaticPublicationEnabled',false/);
assert.match(sql,/revoke all on function public\.drx_phase8_pilot_build_preflight_v1\(\)\s+from public,anon,authenticated/i);
assert.match(sql,/grant execute on function public\.drx_phase8_pilot_build_preflight_v1\(\)\s+to service_role/i);
assert.doesNotMatch(sql,/\b(insert|update|delete)\s+(into\s+|from\s+)?(?:public\.|drx_dose\.)/i);
assert.doesNotMatch(sql,/evidence_review_status\s*=\s*'VERIFIED'/i);

console.log('DRx Phase 8 pilot build preflight contract: PASS');
