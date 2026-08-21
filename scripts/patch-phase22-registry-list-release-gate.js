'use strict';

/* Phase 22 — exact regression gate for the Registry List ownership incident.
 * Runs after Phase 19-21 have produced the final browser assets and before the
 * offline manifest is frozen. A future refactor therefore cannot silently
 * restore the dual-UI race, the full-runtime data handoff, an unbounded browse
 * endpoint, or mixed List asset releases.
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TEST = path.join(ROOT, 'tests', 'registry-list-single-owner-test.js');

execFileSync(process.execPath, [TEST], {
  cwd:ROOT,
  stdio:'inherit',
});

console.log('Registry List Phase 5: exact single-owner regression gate passed before offline packaging.');
