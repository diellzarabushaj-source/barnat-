'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','drx-dose-v3-additive-candidate.sql'),'utf8');

const tables=[
'dose_source_snapshots_v3','dose_source_sections_v3','dose_indication_concepts_v3',
'dose_indication_terms_v3','dose_rules_v3','dose_rule_products_v3',
'dose_legacy_comparisons_v3','dose_review_queue_v3','dose_publication_events_v3'
];
for(const t of tables){
  assert.match(sql,new RegExp('create table if not exists public\\.'+t));
  assert.match(sql,new RegExp('alter table public\\.'+t+' enable row level security'));
}
assert.doesNotMatch(sql,/\bdrop\s+table\b/i);
assert.doesNotMatch(sql,/\btruncate\b/i);
assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
assert.doesNotMatch(sql,/alter\s+table\s+public\.dose_rules_v2/i);
assert.doesNotMatch(sql,/alter\s+table\s+public\.dosage_regimens/i);
assert.match(sql,/references public\.substance_concepts_v1\(concept_id\)/);
assert.match(sql,/references public\.drugs\(id\)/);
assert.match(sql,/source_snapshot_id text not null references public\.dose_source_snapshots_v3/);
assert.match(sql,/editorial_status = 'published'/);
assert.match(sql,/binding_status = 'verified'/);
assert.match(sql,/revoke all privileges on table/);
assert.match(sql,/grant select on table public\.dose_rules_v3 to anon, authenticated/);
assert.match(sql,/dose_rules_v3_verified_provenance_check/);
assert.match(sql,/dose_rules_v3_published_not_manual_check/);
console.log('DRx V3 additive Supabase candidate contract passed.');
