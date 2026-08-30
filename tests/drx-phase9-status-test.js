'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const sql=fs.readFileSync(
  'supabase/migrations/20260830221548_drx_phase9e_frontend_foundation_status.sql','utf8'
);
const statusPerf=fs.readFileSync(
  'supabase/migrations/20260830223039_drx_phase9f_status_single_phase8_evaluation.sql','utf8'
);
const exitSql=fs.readFileSync(
  'supabase/migrations/20260830224240_drx_phase9g_technical_qa_exit_evidence.sql','utf8'
);
const script=fs.readFileSync('scripts/drx-phase9-status.js','utf8');

assert.match(sql,/drx_phase9_status_v1/);
assert.match(sql,/backendFoundationGatePass/);
assert.match(sql,/v2FallbackRequired',true/);
assert.match(sql,/v3CutoverEnabled/);
assert.match(sql,/contextAnonExecute/);
assert.match(sql,/contextAuthenticatedExecute/);
assert.match(sql,/finalExitPass',false/);
assert.match(sql,/revoke all on function public\.drx_phase9_status_v1\(\)[\s\S]*from public,anon,authenticated/i);
assert.match(sql,/grant execute[\s\S]*to service_role/i);

assert.match(statusPerf,/with p8 as materialized/i);
assert.equal((statusPerf.match(/public\.drx_phase8_status_v1\(\)/g) || []).length,1,
  'Phase 9 status must evaluate Phase 8 status exactly once');
assert.match(statusPerf,/backendFoundationGatePass/);
assert.match(statusPerf,/finalExitPass',false/);

assert.match(script,/drx_phase9_status_v1/);
assert.match(script,/backendFoundationGatePass,true/);
assert.match(script,/drx_phase9_product_context_v1/);
assert.match(exitSql,/phase9_frontend_qa_evidence_v1/);
assert.match(exitSql,/drx-phase9-browser-qa-v1/);
assert.match(exitSql,/33339677881/);
assert.match(exitSql,/9740145041/);
assert.match(exitSql,/sha256:10f50320135c925df73fe2ed31900fb4fafc087356bc67f1cfa4c59225099950/);
assert.match(exitSql,/clinical_attestation_used=false/);
assert.match(exitSql,/'finalExitPass',g\.backend_foundation_gate_pass and g\.technical_qa_evidence_pass/);
assert.match(exitSql,/'phase10Allowed',g\.backend_foundation_gate_pass and g\.technical_qa_evidence_pass/);
assert.match(exitSql,/revoke all on table drx_dose\.phase9_frontend_qa_evidence_v1[\s\S]*service_role/i);

assert.match(script,/statusVersion,'drx-phase9-status-v2'/);
assert.match(script,/technicalQaEvidencePass,true/);
assert.match(script,/clinicalAttestationUsed,false/);
assert.match(script,/finalExitPass,true/);
assert.match(script,/phase10Allowed,true/);

console.log('DRx Phase 9E foundation status contract: PASS');
