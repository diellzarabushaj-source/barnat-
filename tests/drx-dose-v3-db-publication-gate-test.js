'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','drx-dose-v3-additive-candidate.sql'),'utf8');

assert.match(sql,/safety_validation_status text not null default 'pending'/);
assert.match(sql,/dose_rules_v3_published_safety_check/);

assert.match(sql,/create or replace function private\.drx_lock_source_snapshot_v3\(\)/);
assert.match(sql,/create or replace function private\.drx_lock_source_section_v3\(\)/);
assert.match(sql,/create or replace function private\.drx_enforce_product_publication_v3\(\)/);
assert.match(sql,/create or replace function private\.drx_enforce_rule_publication_v3\(\)/);
assert.match(sql,/create trigger dose_products_v3_publication_guard[\s\S]*before insert or update/);
assert.match(sql,/create trigger dose_rules_v3_publication_guard[\s\S]*before insert or update/);

assert.match(sql,/source tier is not publication eligible/);
assert.match(sql,/source key does not match snapshot/);
assert.match(sql,/DRX_V3_PROVENANCE_LOCKED/);
assert.match(sql,/verified SmPC section 4\.2 artifact missing/);
assert.match(sql,/source section hash does not match persisted artifact/);
assert.match(sql,/section_code = '4\.2'[\s\S]*extraction_status = 'extracted'/);

assert.match(sql,/no verified product binding/);
assert.match(sql,/legacy comparison incomplete or conflicting/);
assert.match(sql,/clinical review remains open/);
assert.match(sql,/specialist rule requires resolved manual review/);
assert.match(sql,/renal adjustment required but no verified provenance-valid renal adjustment exists/);
assert.match(sql,/hepatic adjustment required but no verified provenance-valid hepatic adjustment exists/);

assert.match(sql,/revoke all on function private\.drx_enforce_product_publication_v3\(\)[\s\S]*from public, anon, authenticated/);
assert.match(sql,/revoke all on function private\.drx_enforce_rule_publication_v3\(\)[\s\S]*from public, anon, authenticated/);

console.log('DRx V3 DB publication gate contract passed.');
