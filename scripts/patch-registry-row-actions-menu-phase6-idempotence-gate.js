'use strict';

/* Phase 6 — deterministic/double-build release gate.
 * The registry build is intentionally patch-composed. This gate proves that
 * re-running the complete row-actions chain cannot add a second singleton,
 * listener, CSS block, ARIA marker, or otherwise mutate the generated assets.
 *
 * The child probe re-enters Phase 1 with MEDINDEX_ROW_ACTIONS_PHASE6_PROBE=1;
 * that flag only suppresses this gate on the nested pass so the test cannot
 * recurse forever. All Phase 1→5 transforms and tests still execute normally.
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.env.MEDINDEX_ROW_ACTIONS_PHASE6_PROBE === '1') {
  console.log('Registry row actions Phase 6: nested idempotence probe reached the final gate; recursion suppressed.');
} else {
  const ROOT = path.resolve(__dirname, '..');
  execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-row-actions-menu-phase6-idempotence-test.js')], {
    cwd:ROOT,
    stdio:'inherit',
  });
  console.log('Registry row actions Phase 6: deterministic double-build gate passed.');
}
