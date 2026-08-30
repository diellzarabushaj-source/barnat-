'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync(
  'supabase/migrations/20260830202332_drx_phase8r_server_performance_probe.sql','utf8'
);

assert.match(sql,/drx_phase8_performance_probe_v1/);
assert.match(sql,/database-server-execution/);
assert.match(sql,/networkLatencyExcluded',true/);
assert.match(sql,/searchP95MaxMs',300/);
assert.match(sql,/productDetailP95MaxMs',400/);
assert.match(sql,/searchPageLimit',50/);
assert.match(sql,/percentile_disc\(0\.95\)/);
assert.match(sql,/revoke all on function public\.drx_phase8_performance_probe_v1\(integer,integer\)/i);
assert.match(sql,/grant execute on function public\.drx_phase8_performance_probe_v1\(integer,integer\)\s+to service_role/i);
assert.doesNotMatch(sql,/\b(insert|update|delete)\b/i);

console.log('DRx Phase 8 server performance probe contract: PASS');
