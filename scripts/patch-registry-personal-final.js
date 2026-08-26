'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');

/* Canonical Favorites/Notes release verifier.
 * Release: registry-personal-desktop-lite-v1.
 * Production trigger: auth-pagination-regressions-v1 is part of the final gate.
 * Supabase personal owner: authenticated membership + complete Barnat rows.
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
// Preserve the visible main-table contract for legacy fallback paths.
require('./patch-registry-personal-same-table.js');
// The normal desktop path must never need that fallback: Favorites and Notes
// are server-bounded row filters rendered by the exact same Barnat desktop-lite
// owner, with the same DOM, toolbar, columns, widths and scroll container.
require('./patch-registry-personal-canonical-owner.js');
// Replace the legacy in-memory personal row source with authenticated Supabase
// membership and targeted Supabase drug hydration. This also carries the full
// Barnat static row contract, including prescription notation, into Favorites.
require('./patch-registry-personal-supabase-owner.js');
// Pending local favorite/note revisions must reach Supabase before the personal
// rows are read back. This removes the old fixed 1.6s race without slowing an
// already-synced personal view.
require('./patch-registry-personal-supabase-immediate.js');
// A search typed in Barnat belongs to Barnat. When the user enters Favorites or
// Notes, clear that stale query before the personal request; searching inside
// the active personal view remains fully supported.
require('./patch-registry-personal-view-filter-reset.js');
// Keep the frozen Favorites/Notes release gate's safety ordering without
// changing ownership: the legacy branch is evaluated only when desktop-lite is
// absent, while the normal Barnat/Favorites path stays on one table owner.
require('./patch-registry-personal-release-order.js');
// The browser must not override the authenticated endpoint's cache contract.
// Personal responses still ship private,no-store, while the lightweight client
// uses the same default/server-authorized cache policy as the Barnat table.
require('./patch-registry-personal-cache-policy.js');
// List view still legitimately requests the full dataset through the existing
// desktop-lite owner. Preserve that exact handoff contract while keeping the
// personal-view guard ahead of it so Favorites/Notes never invoke it.
require('./patch-registry-list-handoff-compat.js');
// Fix the two visible regressions after all registry/auth composition has
// settled: secondary API authorization errors must be confirmed by /api/auth
// before logout, and desktop pagination may scroll only the table container.
require('./patch-auth-pagination-regressions.js');
// The same-table composer can synthesize the prescription column before the
// column-lite owner runs. Rehydrate that cell from the canonical API value and
// keep a genuinely absent notation blank rather than rendering a misleading —.
require('./patch-registry-prescription-notation-display.js');
// Must run before the offline manifest is derived so the privacy guard and its
// CSS become first-class production shell assets, not a late runtime injection.
require('./patch-user-library-account-isolation.js');
// After account ownership is settled, persist a per-account state+tombstone
// fingerprint. Unchanged startups remain GET-only; offline/local edits still
// force the same confirmed PUT before they are considered synchronized.
require('./patch-user-library-startup-sync.js');
// Keep the visible Auditimi entry point, but defer the full editor runtime,
// table observer and summary API until the clinician explicitly asks for it.
require('./patch-clinical-editor-lazy-runtime.js');
// Final main-thread budget: broad nested preview observation is replaced by
// explicit content events and dose-table observers stay asleep until the
// visibility/intent-gated calculator has actually activated.
require('./patch-registry-observer-budget.js');
// Phase 1 of the row-action migration: every desktop canonical drug row owns a
// stable three-dot trigger from first render and through unified-table rerenders.
// It remains hidden until Phase 2 wires the singleton menu, so the existing
// Favorite/Note controls stay fully functional during the migration.
require('./patch-registry-row-actions-menu-phase1.js');

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
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'user-library-startup-sync-test.js')], {
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
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-personal-desktop-lite-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-personal-supabase-owner-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-prescription-notation-display-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-personal-supabase-immediate-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-personal-view-filter-reset-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
execFileSync(process.execPath, [path.join(ROOT, 'tests', 'auth-pagination-regression-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});

console.log('Canonical registry personalization finalizer passed: Favorites/Notes stay inside the Barnat desktop-lite owner, composite favorite keys resolve through their real PDIDs, pending personal revisions reach authenticated Supabase before readback, unchanged per-account library startups stay read-only after their authoritative GET, the clinical editor stays interaction-only until Auditimi is requested, the dose calculator/catalog and its auxiliary observers stay off the critical path until visibility or intent, broad nested cell-preview observation is replaced by explicit events, the canonical row-actions trigger is present from first desktop render and remains migration-hidden until the singleton menu cutover, stale Barnat search state cannot leak into personal views, prescription notation cannot collapse into a synthetic dash, one registry table is visible, favorites-notes-v1.0.0 remains frozen, per-user account isolation is gated, secondary API auth failures are confirmed before logout, and pagination keeps the document viewport stable before offline packaging.');
