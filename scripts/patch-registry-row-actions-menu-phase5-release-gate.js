'use strict';

/* Phase 5 — final release/freeze gate for desktop Registry row actions.
 * Runs only after Phase 1-3 and first-render ARIA hardening have produced the
 * final browser assets. It intentionally adds no UI. Instead it re-validates
 * the singleton menu contract, frozen phone ownership, optimistic persistence,
 * and the full-runtime pagination owner invariant before later packaging can
 * freeze or cache the generated runtime.
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const tests = [
  'registry-row-actions-menu-phase2-test.js',
  'registry-row-actions-menu-phase3-test.js',
  'full-runtime-pagination-owner-test.js',
  'registry-row-actions-menu-phase5-release-test.js',
];

for (const test of tests) {
  execFileSync(process.execPath, [path.join(ROOT, 'tests', test)], {
    cwd:ROOT,
    stdio:'inherit',
  });
}

console.log('Registry row actions Phase 5: final singleton release gate passed before downstream packaging.');
