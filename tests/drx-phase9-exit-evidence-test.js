'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260830224240_drx_phase9g_technical_qa_exit_evidence.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase9g-technical-qa-exit-evidence-rollback.sql','utf8'
);
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(migration,/create table if not exists drx_dose\.phase9_frontend_qa_evidence_v1/i);
assert.match(migration,/enable row level security/i);
assert.match(migration,/force row level security/i);
assert.match(migration,/guard_phase9_frontend_qa_evidence_immutable_v1/);
assert.match(migration,/before update or delete/i);
assert.match(migration,/from public,anon,authenticated,service_role/i);

for(const expected of [
  '8ecaa2283e13c4626bf8125cd90b354700ca1172',
  '33339677881',
  '9740145041',
  'sha256:10f50320135c925df73fe2ed31900fb4fafc087356bc67f1cfa4c59225099950',
  'f89adcf71f575f6f7bcd88f27b0bac55ea3c7dd1',
  '33339770836',
  '33339770831',
  '390x844',
  '768x1024',
  '1440x1000',
]) assert.ok(migration.includes(expected),expected+' missing from technical QA ledger');

assert.match(migration,/clinical_attestation_used boolean not null default false/);
assert.match(migration,/check \(clinical_attestation_used=false\)/);
assert.match(migration,/No clinical reviewer attestation is represented or implied/);
assert.match(migration,/technical_qa_evidence_pass/);
assert.match(migration,/'finalExitPass',g\.backend_foundation_gate_pass and g\.technical_qa_evidence_pass/);
assert.match(migration,/'phase10Allowed',g\.backend_foundation_gate_pass and g\.technical_qa_evidence_pass/);
assert.match(migration,/'v3CutoverEnabled',g\.v3_cutover_enabled/);
assert.match(migration,/'v2FallbackRequired',true/);

assert.match(rollback,/rollback blocked: Phase 10 migration history exists/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);

assert.ok(history.migrations.some(
  m=>m.version==='20260830224240' && m.name==='drx_phase9g_technical_qa_exit_evidence'
));

console.log('DRx Phase 9G technical QA exit evidence contract: PASS');
