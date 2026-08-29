'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','drx-dose-v3-postapply-smoke.sql'),'utf8');

const tables=[
'dose_source_snapshots_v3','dose_source_sections_v3','dose_indication_concepts_v3',
'dose_indication_terms_v3','dose_products_v3','dose_rules_v3','dose_renal_adjustments_v3',
'dose_hepatic_adjustments_v3','dose_rule_products_v3','dose_legacy_comparisons_v3',
'dose_review_queue_v3','dose_publication_events_v3'
];

assert.match(sql,/STATUS: PREPARED_NOT_EXECUTED/);
assert.match(sql,/begin transaction read only/);
assert.match(sql,/rollback;/);
assert.match(sql,/relrowsecurity is not true/);
assert.match(sql,/grantee in \('PUBLIC','anon','authenticated'\)/);
assert.match(sql,/privilege_type in \('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'\)/);
assert.match(sql,/grantee = 'PUBLIC'[\s\S]*privilege_type = 'SELECT'/);
assert.match(sql,/p\.prosecdef is true/);
assert.match(sql,/dose_products_v3_publication_guard/);
assert.match(sql,/dose_rules_v3_publication_guard/);
assert.ok(sql.includes("'dose_renal_adjustments_v3'"));
assert.ok(sql.includes("'dose_hepatic_adjustments_v3'"));
assert.match(sql,/dose_source_snapshots_v3_provenance_lock/);
assert.match(sql,/dose_source_sections_v3_provenance_lock/);
assert.match(sql,/drx_lock_source_snapshot_v3/);
assert.match(sql,/drx_lock_source_section_v3/);
assert.match(sql,/medindex_dose_product_fast_path_v3\(null, null\)/);
assert.match(sql,/selector-less RPC probe must fail closed to NULL/);

for(const table of tables){
  assert.ok(sql.includes("'"+table+"'"),table+' must be included in smoke expected set');
}

assert.doesNotMatch(sql,/^\s*insert\s+into\b/im);
assert.doesNotMatch(sql,/^\s*update\s+(?:public\.)?[a-z_]/im);
assert.doesNotMatch(sql,/^\s*delete\s+from\b/im);
assert.doesNotMatch(sql,/^\s*drop\s+/im);
assert.doesNotMatch(sql,/^\s*truncate\s+/im);

console.log('DRx V3 post-apply smoke contract passed.');
