'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const script=fs.readFileSync('scripts/drx-phase8-exit-audit.js','utf8');

assert.match(script,/SEARCH_P95_MAX_MS = 300/);
assert.match(script,/PRODUCT_DETAIL_P95_MAX_MS = 400/);
assert.match(script,/SEARCH_PAGE_LIMIT = 50/);
assert.match(script,/drx_phase8_pilot_build_preflight_v1/);
assert.match(script,/drx_dose_search_v3_shadow_v1/);
assert.match(script,/medindex_dose_product_fast_path_v3/);
assert.match(script,/if\(status\.exit_gate_pass\)/);
assert.match(script,/assert\.equal\(preflight\.preflightPass,true\)/);
assert.match(script,/performanceGatePass/);

console.log('DRx Phase 8 exit audit contract: PASS');
