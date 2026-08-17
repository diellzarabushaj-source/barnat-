'use strict';

/* Canonical late-stage personalization finalizer.
 *
 * Keep the ordering explicit in one place. Phase 8 establishes the visual/state
 * contract first; Phase 10 then hardens that contract for long sessions and
 * rapid mutations. Regression gates run against the composed output before the
 * offline manifest is generated.
 */

require('./patch-registry-phase16-personal-ux-v2.js');
require('./patch-registry-personal-long-session.js');
require('../tests/registry-personal-ux-phase8-test.js');
require('../tests/registry-personal-long-session-test.js');
require('../tests/registry-personal-finalizer-test.js');

console.log('Canonical registry personalization finalizer passed: UX, long-session hardening and regression gates are composed before offline packaging.');
