'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');

/* Canonical Favorites/Notes release verifier.
 *
 * Phase 16 keeps the build contract deterministic: source ownership is audited
 * once before build patches, then this finalizer executes exactly one blocking
 * release gate with both static invariants and behavior-level recovery tests.
 *
 * Registry List Phase 19-22 also run here because this finalizer is invoked by
 * the final offline-packaging step, after all registry runtime patches have
 * settled but before the service-worker asset manifest is derived from
 * index.html.
 */

require('./patch-phase19-registry-list-owner.js');
require('./patch-phase20-registry-list-controller.js');
require('./patch-phase21-registry-list-cache-coherence.js');
require('./patch-phase22-registry-list-release-gate.js');
require('./patch-registry-shell-favorites-stability.js');

const ROOT = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-personal-release-gate.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-shell-favorites-stability-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});

console.log('Canonical registry personalization finalizer passed: frozen favorites-notes-v1.0.0 acceptance gate plus shell/Favorites stability gate completed before offline packaging; Registry List Phase 19-22 were applied first.');
