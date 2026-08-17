'use strict';

/* Canonical late-stage personalization verifier.
 *
 * Phase 12 moved the behavior into canonical source files. These compatibility
 * stages are intentionally read-only audits now: Phase 8 verifies UX/state,
 * Phase 10 verifies long-session and revision-safety invariants, then the
 * regression gates run before offline packaging.
 */

require('./patch-registry-phase16-personal-ux-v2.js');
require('./patch-registry-personal-long-session.js');
require('../tests/registry-personal-ux-phase8-test.js');
require('../tests/registry-personal-long-session-test.js');
require('../tests/registry-personal-finalizer-test.js');

console.log('Canonical registry personalization finalizer passed: source-owned UX and long-session behavior were verified read-only before offline packaging.');
