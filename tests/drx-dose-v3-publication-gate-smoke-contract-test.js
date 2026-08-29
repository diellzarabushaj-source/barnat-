'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','drx-dose-v3-publication-gate-smoke.sql'),'utf8');

assert.match(sql,/STATUS: PREPARED_NOT_EXECUTED/);
assert.match(sql,/^begin;/m);
assert.match(sql,/^rollback;/m);
assert.doesNotMatch(sql,/^commit;/m);

assert.match(sql,/source tier is not publication eligible/);
assert.match(sql,/verified SmPC section 4\.2 artifact missing/);
assert.match(sql,/no verified product binding/);
assert.match(sql,/renal-required rule unexpectedly published without adjustment/);
assert.match(sql,/renal adjustment required but no verified provenance-valid renal adjustment exists/);
assert.match(sql,/insert into public\.dose_renal_adjustments_v3/);
assert.match(sql,/RPC did not return the verified renal adjustment/);
assert.match(sql,/renal adjustment section hash provenance mismatch/);
assert.match(sql,/comparison_status\)\s*\n\s*values[\s\S]*'not_applicable'/);
assert.match(sql,/set editorial_status='published'/);
assert.match(sql,/medindex_dose_product_fast_path_v3\('drx-smoke-good-product',null\)/);
assert.match(sql,/sectionSha256/);
assert.match(sql,/DRX_V3_PROVENANCE_LOCKED/);
assert.match(sql,/published source section mutation was not blocked/);
assert.match(sql,/published source snapshot mutation was not blocked/);

for(const hashChar of ['a','b','c','d']){
  assert.match(sql,new RegExp("repeat\\('"+hashChar+"',64\\)"));
}

assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
assert.doesNotMatch(sql,/\bdrop\s+(?:table|schema|function|trigger)\b/i);
assert.doesNotMatch(sql,/\btruncate\b/i);
assert.doesNotMatch(sql,/dose_rules_v2|dose_products_v2|dosage_regimens/i);

console.log('DRx V3 transactional publication-gate smoke contract passed.');
