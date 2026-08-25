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
// Restore the actual main registry as the only visible table before offline
// packaging. This deliberately runs after list/shell composition so no later
// layer can re-introduce the alternate clinical/full projection.
require('./patch-registry-canonical-main-table.js');
// Personal filters may need the full dataset, but that is a data handoff only:
// the exact table the clinician was already viewing remains the visual contract.
require('./patch-registry-personal-same-table.js');
// Must run before the offline manifest is derived so the privacy guard and its
// CSS become first-class production shell assets, not a late runtime injection.
require('./patch-user-library-account-isolation.js');

const ROOT = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-personal-release-gate.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-shell-favorites-stability-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'user-library-account-isolation-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-canonical-main-table-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-personal-same-table-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});

console.log('Canonical registry personalization finalizer passed: Favorites/Notes keep the same main table, one registry owner is visible, favorites-notes-v1.0.0 remains frozen, and per-user account isolation is gated before offline packaging.');
