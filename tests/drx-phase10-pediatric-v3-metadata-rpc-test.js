'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260831053832_drx_phase10j_pediatric_v3_calculator_metadata.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase10j-pediatric-v3-calculator-metadata-rollback.sql','utf8'
);
const runtime=fs.readFileSync('lib/pediatric-v3-runtime.js','utf8');

assert.match(migration,/create or replace function public\.drx_pediatric_v3_calculator_metadata_v1\(p_product_key text\)/i);
assert.match(migration,/security definer/i);
assert.match(migration,/set search_path\s*=\s*public,\s*pg_temp/i);
assert.match(migration,/p\.editorial_status\s*=\s*'published'/i);
assert.match(migration,/b\.binding_status\s*=\s*'verified'/i);
assert.match(migration,/r\.editorial_status\s*=\s*'published'/i);
assert.match(migration,/a\.review_status\s*=\s*'verified'/i);
assert.match(migration,/verified_by/i);
assert.match(migration,/verified_at/i);
assert.match(migration,/\^https:\/\//i);
assert.match(migration,/revoke all on function[\s\S]*from public,anon,authenticated/i);
assert.match(migration,/grant execute on function[\s\S]*to service_role/i);
assert.doesNotMatch(migration,/grant\s+(select|insert|update|delete)\s+on\s+(?:table\s+)?public\.dose_/i,
  'Phase 10J must not expose V3 tables');

assert.match(rollback,/drop function if exists public\.drx_pediatric_v3_calculator_metadata_v1\(text\)/i);

assert.match(runtime,/supabaseRequest\(/);
assert.match(runtime,/rpc\/drx_pediatric_v3_calculator_metadata_v1/);
assert.match(runtime,/\{ privileged:true \}/);
assert.match(runtime,/metadataVersion!=='drx-pediatric-v3-calculator-metadata-v1'/);
assert.doesNotMatch(runtime,/dose_source_snapshots_v3\?select=/);
assert.doesNotMatch(runtime,/dose_renal_adjustments_v3\?select=/);
assert.doesNotMatch(runtime,/dose_hepatic_adjustments_v3\?select=/);

console.log('DRx Phase 10J pediatric V3 metadata RPC security contract: PASS');
