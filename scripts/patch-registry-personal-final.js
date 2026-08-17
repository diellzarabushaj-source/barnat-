'use strict';

/* Canonical late-stage personalization verifier.
 *
 * Phase 12 moved Favorites/Notes behavior into canonical source files. Phase 14
 * removes the obsolete late patch stages entirely: one canonical source audit
 * and the focused regression gates now verify the source-owned behavior before
 * offline packaging.
 */

require('./audit-registry-personal-source.js');
require('../tests/registry-personal-ux-phase8-test.js');
require('../tests/registry-personal-long-session-test.js');
require('../tests/registry-personal-finalizer-test.js');

console.log('Canonical registry personalization finalizer passed: source-owned UX, recovery and long-session behavior were verified without late patch stages.');
