'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','drx-dose-v3-rollback.sql'),'utf8');

const tables=[
'dose_source_snapshots_v3','dose_source_sections_v3','dose_indication_concepts_v3',
'dose_indication_terms_v3','dose_products_v3','dose_rules_v3','dose_renal_adjustments_v3',
'dose_hepatic_adjustments_v3','dose_rule_products_v3','dose_legacy_comparisons_v3',
'dose_review_queue_v3','dose_publication_events_v3'
];

assert.match(sql,/STATUS: PREPARED_NOT_EXECUTED/);
assert.match(sql,/^begin;/m);
assert.match(sql,/^commit;/m);
assert.doesNotMatch(sql,/\bcascade\b/i);
assert.doesNotMatch(sql,/drop\s+schema\s+(?:if\s+exists\s+)?private/i);
assert.doesNotMatch(sql,/dose_rules_v2|dose_products_v2|dosage_regimens/i);
assert.doesNotMatch(sql,/drop\s+table[^;]*(?:public\.)?drugs\b/i);
assert.doesNotMatch(sql,/drop\s+table[^;]*(?:public\.)?substance_concepts_v1\b/i);

for(const table of tables){
  assert.equal(
    (sql.match(new RegExp('drop table if exists public\\.'+table+';','g'))||[]).length,
    1,
    table+' must be dropped exactly once'
  );
}

assert.match(sql,/drop function if exists public\.medindex_dose_product_fast_path_v3\(text, uuid\)/);
assert.match(sql,/drop function if exists private\.drx_enforce_product_publication_v3\(\)/);
assert.match(sql,/drop function if exists private\.drx_enforce_rule_publication_v3\(\)/);

console.log('DRx V3 rollback contract passed.');
