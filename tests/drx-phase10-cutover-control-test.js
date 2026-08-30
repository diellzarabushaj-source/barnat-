'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260830230458_drx_phase10a_cutover_control_and_legacy_write_audit.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase10a-cutover-control-and-legacy-write-audit-rollback.sql','utf8'
);
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));
const statusScript=fs.readFileSync('scripts/drx-phase10-status.js','utf8');
const consumerAudit=fs.readFileSync('scripts/drx-phase10-consumer-audit.js','utf8');

assert.match(migration,/phase10_cutover_control_v1/);
assert.match(migration,/mode text not null check \(mode in \('SHADOW','CONTROLLED','STRICT'\)\)/);
assert.match(migration,/true,'SHADOW',0,false,'V2'/);
assert.match(migration,/check \(mode<>'STRICT' or strict_armed\)/);

for(const relation of [
  'phase10_gate_evidence_v1',
  'phase10_soak_windows_v1',
  'phase10_rollback_drills_v1',
  'phase10_legacy_write_events_v1',
]) assert.ok(migration.includes(relation),relation+' missing');

assert.match(migration,/Phase 10 evidence is append-only/);
assert.match(migration,/phase10_audit_legacy_write_v1/);
assert.equal((migration.match(/create trigger phase10_legacy_write_audit/g)||[]).length,5);
assert.match(migration,/after insert or update or delete or truncate/);
assert.match(migration,/minimumSoakDays',14/);
assert.match(migration,/ended_at-started_at>=interval '14 days'/);
assert.match(migration,/critical_clinical_incidents=0/);
assert.match(migration,/critical_security_incidents=0/);

assert.match(migration,/rawShadowDiffs/);
assert.match(migration,/approvedClinicalCorrections/);
assert.match(migration,/effectiveParityCurrent/);
assert.match(migration,/APPROVED_CLINICAL_CORRECTION/);

assert.match(migration,/'finalGatePass',f\.final_gate_pass/);
assert.match(migration,/'destructiveCleanupAllowed',f\.final_gate_pass/);
assert.match(migration,/m\.mode='STRICT'/);
assert.match(migration,/m\.strict_armed/);
assert.match(migration,/m\.legacy_write_events=0/);

assert.match(migration,/revoke all on function public\.drx_phase10_status_v1\(\)[\s\S]*from public,anon,authenticated/i);
assert.match(migration,/grant execute on function public\.drx_phase10_status_v1\(\)[\s\S]*to service_role/i);

assert.match(rollback,/later Phase 10 migration history exists/);
assert.match(rollback,/Phase 10 operational evidence exists/);
assert.doesNotMatch(rollback,/\bcascade\b/i);

assert.match(statusScript,/mode,'SHADOW'/);
assert.match(statusScript,/strictModeLocked,true/);
assert.match(statusScript,/finalGatePass,false/);
assert.match(statusScript,/destructiveCleanupAllowed,false/);

for(const token of ['dose_products_v2','dose_rules_v2','dose_rule_products_v2','dose_indications_v2','dose_sources_v2']){
  assert.ok(consumerAudit.includes(token),token+' missing from consumer audit');
}

assert.ok(history.migrations.some(
  m=>m.version==='20260830230458' && m.name==='drx_phase10a_cutover_control_and_legacy_write_audit'
));

console.log('DRx Phase 10A cutover control and legacy write audit contract: PASS');
