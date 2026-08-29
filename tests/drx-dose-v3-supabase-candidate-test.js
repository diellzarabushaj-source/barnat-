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

// Additive-only / rollback-safe candidate: legacy production tables must remain untouched.
assert.match(sql,/STATUS: NOT_APPLIED/);
assert.doesNotMatch(sql,/\bdrop\s+table\b/i);
assert.doesNotMatch(sql,/\btruncate\b/i);
assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
assert.doesNotMatch(sql,/alter\s+table\s+public\.dose_rules_v2/i);
assert.doesNotMatch(sql,/alter\s+table\s+public\.dosage_regimens/i);
assert.match(sql,/references public\.substance_concepts_v1\(concept_id\)/);
assert.match(sql,/references public\.drugs\(id\)/);
assert.match(sql,/source_snapshot_id text not null references public\.dose_source_snapshots_v3/);

// Clinical publication must stay fail-closed and provenance-backed.
assert.match(sql,/editorial_status = 'published'/);
assert.match(sql,/binding_status = 'verified'/);
assert.match(sql,/dose_rules_v3_verified_provenance_check/);
assert.match(sql,/dose_rules_v3_published_not_manual_check/);
assert.match(sql,/source_evidence_hash ~ '\^\[0-9a-f\]\{64\}\$'/);

// Supabase public-schema least privilege: revoke defaults first, then expose SELECT only.
assert.match(sql,/revoke all privileges on table/);
assert.match(sql,/grant select on table public\.dose_indication_concepts_v3 to anon, authenticated/);
assert.match(sql,/grant select on table public\.dose_rules_v3 to anon, authenticated/);
assert.match(sql,/grant select on table public\.dose_rule_products_v3 to anon, authenticated/);
assert.doesNotMatch(sql,/grant\s+(?:insert|update|delete|truncate|references|trigger|all(?:\s+privileges)?)\b[\s\S]*?\bto\s+(?:anon|authenticated)\b/i);
assert.doesNotMatch(sql,/create\s+policy[\s\S]*?for\s+(?:insert|update|delete|all)\s+to\s+(?:anon|authenticated)\b/i);

// No privileged helper/view may silently bypass RLS in this candidate.
assert.doesNotMatch(sql,/\bsecurity\s+definer\b/i);
assert.doesNotMatch(sql,/\bcreate\s+(?:or\s+replace\s+)?function\b/i);
assert.doesNotMatch(sql,/\bcreate\s+(?:or\s+replace\s+)?view\b/i);

// Client-visible rows remain constrained to published concepts/rules and verified bindings.
assert.match(sql,/create policy dose_indication_concepts_v3_published_read[\s\S]*?using \(editorial_status = 'published'\)/);
assert.match(sql,/create policy dose_rules_v3_published_read[\s\S]*?using \(editorial_status = 'published'\)/);
assert.match(sql,/create policy dose_rule_products_v3_published_read[\s\S]*?binding_status = 'verified'[\s\S]*?r\.editorial_status = 'published'/);

console.log('DRx V3 additive Supabase candidate least-privilege contract passed.');
