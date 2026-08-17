'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');

/* Canonical Favorites/Notes release verifier.
 *
 * Phase 16 keeps the build contract deterministic: source ownership is audited
 * once before build patches, then this finalizer executes exactly one blocking
 * release gate with both static invariants and behavior-level recovery tests.
 */

const ROOT = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-personal-release-gate.js')], {
  cwd:ROOT,
  stdio:'inherit',
});

console.log('Canonical registry personalization finalizer passed: frozen favorites-notes-v1.0.0 acceptance gate completed before offline packaging.');
