'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const migration=fs.readFileSync('supabase/migrations/20260831050641_drx_phase10e_security_and_legacy_write_evidence.sql','utf8');
const rollback=fs.readFileSync('supabase/drx-phase10e-security-and-legacy-write-evidence-rollback.sql','utf8');
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

for(const expected of [
  'SECURITY_P0_P1_ZERO','LEGACY_WRITES_ZERO','33359238154',
  '5d4539727051d100e24aa7b660f1f3b76fe673c5','9746133660',
  'd16cfe564e5d8440db0f16ee330da53f5148fff4b2d2d585c9fc1f9c4380f449',
  '33359238202','33359238137'
]) assert.ok(migration.includes(expected),expected+' missing');

assert.match(migration,/if v_writes<>0 then/i);
assert.match(migration,/legacy-write evidence blocked/i);
assert.match(migration,/legacyWriteEvents',0/);
for(const relation of ['dose_products_v2','dose_rules_v2','dose_rule_products_v2','dose_indications_v2','dose_sources_v2']){
  assert.ok(migration.includes(relation),relation+' not audited');
}
assert.match(rollback,/Rollback blocked/);
assert.match(rollback,/immutable/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);
assert.doesNotMatch(rollback,/\bdelete\b/i);
assert.ok(history.migrations.some(m=>m.version==='20260831050641'&&m.name==='drx_phase10e_security_and_legacy_write_evidence'));
console.log('DRx Phase 10E security and legacy-write evidence contract: PASS');
