'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const sql=fs.readFileSync(
  'supabase/migrations/20260830221548_drx_phase9e_frontend_foundation_status.sql','utf8'
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

assert.match(script,/drx_phase9_status_v1/);
assert.match(script,/backendFoundationGatePass,true/);
assert.match(script,/drx_phase9_product_context_v1/);
assert.match(script,/finalExitPass,false/);

console.log('DRx Phase 9E foundation status contract: PASS');
