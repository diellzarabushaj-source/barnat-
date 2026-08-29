'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','drx-dose-v3-additive-candidate.sql'),'utf8');

assert.match(sql,/safety_validation_status text not null default 'pending'/);
assert.match(sql,/dose_rules_v3_published_safety_check/);
assert.match(sql,/create or replace function private\.drx_enforce_rule_publication_v3\(\)/);
assert.match(sql,/no verified product binding/);
assert.match(sql,/legacy comparison incomplete or conflicting/);
assert.match(sql,/clinical review remains open/);
assert.match(sql,/specialist rule requires resolved manual review/);\nassert.match(sql,/source tier is not publication eligible/);\nassert.match(sql,/verified SmPC section 4\\.2 artifact missing/);\nassert.match(sql,/extraction_status = 'extracted'/);
assert.match(sql,/create trigger dose_rules_v3_publication_guard/);
assert.match(sql,/create trigger dose_products_v3_publication_guard[\\s\\S]*before insert or update/);\nassert.match(sql,/create trigger dose_rules_v3_publication_guard[\\s\\S]*before insert or update/);
assert.match(sql,/revoke all on function private\.drx_enforce_rule_publication_v3\(\)[\s\S]*from public, anon, authenticated/);
console.log('DRx V3 DB publication gate contract passed.');
