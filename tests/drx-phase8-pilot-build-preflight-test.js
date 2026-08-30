'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const baseSql = fs.readFileSync(
  'supabase/migrations/20260830201012_drx_phase8p_pilot_build_preflight.sql',
  'utf8'
);
assert.match(baseSql,/drx_phase8_pilot_build_preflight_v1/);
assert.match(baseSql,/security definer/i);
assert.match(baseSql,/CLINICAL_REFERENCE_REVIEW_PENDING/);
assert.match(baseSql,/humanClinicalReviewRequired',true/);
assert.match(baseSql,/automaticClinicalReviewEnabled',false/);
assert.match(baseSql,/automaticPublicationEnabled',false/);
assert.match(baseSql,/revoke all on function public\.drx_phase8_pilot_build_preflight_v1\(\)\s+from public,anon,authenticated/i);
assert.match(baseSql,/grant execute on function public\.drx_phase8_pilot_build_preflight_v1\(\)\s+to service_role/i);
assert.doesNotMatch(baseSql,/evidence_review_status\s*=\s*'VERIFIED'/i);

const findingsSql = fs.readFileSync(
  'supabase/migrations/20260830204339_drx_phase8s_exact_smpc_findings.sql',
  'utf8'
);
const findingsRollback = fs.readFileSync(
  'supabase/drx-phase8s-exact-smpc-findings-rollback.sql',
  'utf8'
);
assert.match(findingsSql,/phase8_clinical_rule_findings_v1/);
assert.match(findingsSql,/EXACT_SMPC_RULE_REVIEW_PENDING/);
assert.match(findingsSql,/drx-phase8-pilot-build-preflight-v2/);
assert.match(findingsSql,/automatic_resolution_allowed boolean not null default false/);
assert.match(findingsSql,/drx_phase8_clinical_correction_packet_v1/);
assert.match(findingsSql,/phase9StartAllowed',false/);
assert.match(findingsSql,/revoke all on function public\.drx_phase8_clinical_correction_packet_v1\(\)/i);
assert.match(findingsSql,/grant execute on function public\.drx_phase8_clinical_correction_packet_v1\(\)\s+to service_role/i);
assert.doesNotMatch(findingsRollback,/\bcascade\b/i);
assert.match(findingsRollback,/reviewed clinical findings exist/);
assert.match(findingsRollback,/drx-phase8-pilot-build-preflight-v1/);
assert.match(findingsRollback,/drop table if exists drx_dose\.phase8_clinical_rule_findings_v1/);

const statusScript = fs.readFileSync('scripts/drx-phase8-status.js','utf8');
assert.match(statusScript,/drx_phase8_pilot_build_preflight_v1/);
assert.match(statusScript,/drx-phase8-pilot-build-preflight-v2/);
assert.match(statusScript,/preflight\.unresolvedClinicalFindings > 0/);
assert.match(statusScript,/if \(preflight\.preflightPass\)/);
assert.match(statusScript,/if \(status\.exit_gate_pass\)/);
assert.match(statusScript,/p_limit:50/);
assert.doesNotMatch(statusScript,/\\n\s+assert\./);

console.log('DRx Phase 8 pilot preflight + exact SmPC findings contract: PASS');
