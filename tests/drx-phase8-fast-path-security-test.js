'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260830215626_drx_phase8zf_fast_path_security_definer.sql',
  'utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase8zf-fast-path-security-definer-rollback.sql',
  'utf8'
);

assert.match(migration,/alter function public\.medindex_dose_product_fast_path_v3\(text,uuid\)\s+security definer/i);
assert.match(migration,/revoke all on function public\.medindex_dose_product_fast_path_v3\(text,uuid\)[\s\S]*from public,anon,authenticated/i);
assert.match(migration,/grant execute on function public\.medindex_dose_product_fast_path_v3\(text,uuid\)[\s\S]*to service_role/i);
assert.doesNotMatch(migration,/grant\s+usage\s+on\s+schema\s+drx_dose/i);
assert.doesNotMatch(migration,/grant\s+.*\s+to\s+(anon|authenticated)/i);

assert.match(rollback,/security invoker/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);

console.log('DRx Phase 8 fast-path security contract: PASS');
