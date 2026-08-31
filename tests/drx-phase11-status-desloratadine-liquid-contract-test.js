'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const as = read('20260831115113_drx_phase11as_extended_operational_status.sql');
const at = read('20260831115350_drx_phase11at_desloratadine_oral_solution_capture.sql');
const au = read('20260831115635_drx_phase11au_desloratadine_oral_solution_age_bands.sql');

assert.match(as, /drx_phase11_status_v2/);
assert.match(as, /clinicalReviewReadyRegimens/);
assert.match(as, /ruleProductReviewGaps/);
assert.match(as, /highScoreIcdCandidateRows/);
assert.match(as, /'autoClinicalApprovalAllowed',false/);
assert.match(as, /'runtimeServeEnabledV2',false/);

assert.match(at, /EMC-PRODUCT-6510-SMPC/);
assert.match(at, /0\.5 mg\/mL desloratadine oral solution/);
assert.match(at, /Children 1 through 5 years/);
assert.match(at, /Children 6 through 11 years/);
assert.match(at, /Safety and efficacy below 1 year have not been established/);

assert.match(au, /SRC-DESLOR-SOLUTION-AGE-BANDS/);
assert.match(au, /'conditional'/);
assert.match(au, /1\.25/);
assert.match(au, /2\.5/);
assert.match(au, /WITH_OR_WITHOUT_FOOD/);
assert.match(au, /COMPATIBLE_STRENGTH_REVIEW/);
assert.match(au, /desloratadine-urticaria-1plus/);
assert.match(au, /SRC-REST-DESLOR-SOLUTION-BELOW-1Y/);
assert.match(au, /EXACT_PRESENTATION_ONLY/);

for (const sql of [as, at, au]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_apply_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_bind_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /runtimeServeEnabledV2'\s*,\s*true/i);
}

console.log('DRx Phase 11 extended status + desloratadine liquid contract passed.');
