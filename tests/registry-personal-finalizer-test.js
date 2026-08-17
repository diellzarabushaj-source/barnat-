'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const finalizer = read('scripts/patch-registry-personal-final.js');
const offline = read('scripts/patch-offline-shell-manifest.js');

const sourceAudit = finalizer.indexOf("require('./audit-registry-personal-source.js')");
const phase8Gate = finalizer.indexOf("require('../tests/registry-personal-ux-phase8-test.js')");
const phase10Gate = finalizer.indexOf("require('../tests/registry-personal-long-session-test.js')");
const finalGate = finalizer.indexOf("require('../tests/registry-personal-finalizer-test.js')");

assert(sourceAudit >= 0, 'Canonical source audit must run in the final personalization verifier.');
assert(phase8Gate > sourceAudit, 'Phase 8 regression gate must run after canonical source audit.');
assert(phase10Gate > phase8Gate, 'Phase 10 regression gate must run after the Phase 8 gate.');
assert(finalGate > phase10Gate, 'Final architecture gate must run after focused personalization gates.');

assert.match(offline, /^'use strict';\n\nrequire\('\.\/patch-registry-personal-final\.js'\);/,
  'Offline packaging must delegate personalization verification to one canonical finalizer.');
assert.doesNotMatch(offline, /patch-registry-phase16-personal-ux-v2|patch-registry-personal-long-session|registry-personal-ux-phase8-test|registry-personal-long-session-test/,
  'Offline manifest must not know individual personalization implementation or regression stages.');

assert.doesNotMatch(finalizer, /patch-registry-phase16-personal-ux-v2|patch-registry-personal-long-session/,
  'Phase 14 finalizer must not reference obsolete late patch stages.');
assert.doesNotMatch(finalizer, /fs\.writeFileSync|localStorage|fetch\s*\(/,
  'The finalizer must verify only; behavior remains in canonical source.');
assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'patch-registry-phase16-personal-ux-v2.js')), false,
  'Obsolete Phase 8 late patch stage must stay deleted.');
assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'patch-registry-personal-long-session.js')), false,
  'Obsolete Phase 10 late patch stage must stay deleted.');

console.log('Phase 14 finalizer audit passed: one canonical source audit and focused regression gates replace the obsolete late personalization patch stages.');
