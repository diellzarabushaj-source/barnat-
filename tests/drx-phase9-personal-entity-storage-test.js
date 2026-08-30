'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260830220141_drx_phase9a_personal_entity_storage.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase9a-personal-entity-storage-rollback.sql','utf8'
);
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

for(const entity of ['drug','substance','variant','product']){
  assert.match(migration,new RegExp("'" + entity + "'"));
}
assert.match(migration,/user_favorites_select_own_clinical/);
assert.match(migration,/user_id=\(select auth\.uid\(\)\)/);
assert.match(migration,/private\.is_active_user\(\)/);
assert.match(migration,/add column if not exists entity_type text/i);
assert.match(migration,/add column if not exists entity_key text/i);
assert.match(migration,/entity_type='drug' and drug_id is not null and entity_key=drug_id::text/i);
assert.match(migration,/entity_type in \('substance','variant','product'\) and drug_id is null/i);
assert.match(migration,/unique index if not exists user_notes_user_entity_unique_idx/i);

assert.match(rollback,/rollback blocked: non-drug personal data exists/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);

assert.ok(history.migrations.some(
  item=>item.version==='20260830220141' && item.name==='drx_phase9a_personal_entity_storage'
));

console.log('DRx Phase 9A personal entity storage contract: PASS');
