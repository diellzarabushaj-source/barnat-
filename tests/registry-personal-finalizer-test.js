'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const finalizer = read('scripts/patch-registry-personal-final.js');
const offline = read('scripts/patch-offline-shell-manifest.js');

const phase8 = finalizer.indexOf("require('./patch-registry-phase16-personal-ux-v2.js')");
const phase10 = finalizer.indexOf("require('./patch-registry-personal-long-session.js')");
const phase8Gate = finalizer.indexOf("require('../tests/registry-personal-ux-phase8-test.js')");
const phase10Gate = finalizer.indexOf("require('../tests/registry-personal-long-session-test.js')");

assert(phase8 >= 0 && phase10 > phase8, 'Phase 8 UX must compose before Phase 10 long-session hardening.');
assert(phase8Gate > phase10, 'Regression gates must run after both personalization transforms.');
assert(phase10Gate > phase8Gate, 'Phase 10 gate must run after the Phase 8 gate.');

assert.match(offline, /^'use strict';\n\nrequire\('\.\/patch-registry-personal-final\.js'\);/,
  'Offline packaging must delegate personalization composition to one canonical finalizer.');
assert.doesNotMatch(offline, /patch-registry-phase16-personal-ux-v2|patch-registry-personal-long-session|registry-personal-ux-phase8-test|registry-personal-long-session-test/,
  'Offline manifest must not know individual personalization implementation stages.');

assert.doesNotMatch(finalizer, /fs\.writeFileSync|localStorage|fetch\s*\(/,
  'The finalizer must orchestrate only; implementation remains in dedicated deterministic stages.');

console.log('Phase 11 finalizer audit passed: personalization composition has one explicit owner and offline packaging is decoupled from implementation details.');
