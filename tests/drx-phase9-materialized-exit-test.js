'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260830225726_drx_phase9h_materialized_phase8_exit_evidence.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase9h-materialized-phase8-exit-evidence-rollback.sql','utf8'
);
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(migration,/create table if not exists drx_dose\.phase9_phase8_exit_evidence_v1/i);
assert.match(migration,/enable row level security/i);
assert.match(migration,/force row level security/i);
assert.match(migration,/before update or delete/i);
assert.match(migration,/from public,anon,authenticated,service_role/i);

for(const expected of [
  'drx-phase8-status-evidence-v3',
  'drx-phase8-exit-audit-v2',
  'bc124406656638b12b7a4bbad021028a04e59a75',
  '33337806358',
  '9739582132',
  'sha256:8c1f8e79597e6d789ed4d3e9e9ff03b8d4419b30c34ade954fd9fbf7bf11c760',
]) assert.ok(migration.includes(expected),expected+' missing from Phase 8 materialized evidence');

assert.match(migration,/clinical_reviews_verified integer not null check \(clinical_reviews_verified=2\)/);
assert.match(migration,/pilots_published_in_v3 integer not null check \(pilots_published_in_v3=2\)/);
assert.match(migration,/shadow_matches integer not null check \(shadow_matches=2\)/);
assert.match(migration,/shadow_diffs integer not null check \(shadow_diffs=0\)/);
assert.match(migration,/search_server_p95_ms numeric not null check \(search_server_p95_ms<=300\)/);
assert.match(migration,/product_detail_server_p95_ms numeric not null check \(product_detail_server_p95_ms<=400\)/);
assert.match(migration,/publication_allowed boolean not null check \(not publication_allowed\)/);
assert.match(migration,/automatic_clinical_review_enabled boolean not null check \(not automatic_clinical_review_enabled\)/);

assert.doesNotMatch(migration,/public\.drx_phase8_status_v1\(\)/,
  'Phase 9H must use materialized Phase 8 exit evidence');
assert.match(migration,/'statusVersion','drx-phase9-status-v3'/);
assert.match(migration,/'finalExitPass',g\.backend_foundation_gate_pass and g\.technical_qa_evidence_pass/);
assert.match(migration,/'phase10Allowed',g\.backend_foundation_gate_pass and g\.technical_qa_evidence_pass/);

assert.match(rollback,/rollback blocked: Phase 10 migration history exists/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);

assert.ok(history.migrations.some(
  m=>m.version==='20260830225726' && m.name==='drx_phase9h_materialized_phase8_exit_evidence'
));

console.log('DRx Phase 9H materialized Phase 8 exit evidence contract: PASS');
