'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260830231548_drx_phase10c_golden_and_parity_evidence.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase10c-golden-and-parity-evidence-rollback.sql','utf8'
);
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(migration,/GOLDEN_CLINICAL_100/);
assert.match(migration,/PARITY_100_PUBLISHED_V3/);
assert.match(migration,/33341199441/);
assert.match(migration,/c8680d8e89ce473a441665d410f0b143a06381de/);
assert.match(migration,/9740585689/);
assert.match(migration,/sha256:64d19069c75dab1a4c378ac4e07cd620575c218af6098cdfcda2b43d2036df2a/);
assert.match(migration,/v_rules<>4/);
assert.match(migration,/v_comparisons<>2/);
assert.match(migration,/v_effective<>2/);
assert.match(migration,/v_approved<>2/);
assert.match(migration,/v_raw_diffs<>2/);
assert.match(migration,/APPROVED_CLINICAL_CORRECTION/);
assert.match(migration,/Raw RULE_SEMANTICS diffs are preserved/);

assert.match(rollback,/later Phase 10 migration history exists/);
assert.match(rollback,/104287dc461790eeda49fef728f8ab6584e79a7e5e5575be7b83a1c439faa98e/);
assert.match(rollback,/6dc51366961a8d1e11b79ff187d0b3df97f7e2b04ab849b94ad9239d303d1a9c/);
assert.doesNotMatch(rollback,/\bcascade\b/i);

assert.ok(history.migrations.some(
  m=>m.version==='20260830231548' && m.name==='drx_phase10c_golden_and_parity_evidence'
));

console.log('DRx Phase 10C golden and parity evidence contract: PASS');
