'use strict';

/* Canonical personalization release verifier.
 *
 * Phase 15 keeps exactly two ownership checkpoints: the build starts with the
 * canonical source audit, then this postbuild finalizer runs one consolidated
 * release gate before the offline manifest is emitted. No late patch stage is
 * allowed to reconstruct Favorites/Notes behavior.
 */

require('../tests/registry-personal-release-gate.js');

console.log('Canonical registry personalization finalizer passed: one consolidated Phase 15 release gate verified source-owned Favorites/Notes behavior before offline packaging.');
