'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const finalizer = read('scripts/patch-registry-personal-final.js');
const phase8Stage = read('scripts/patch-registry-phase16-personal-ux-v2.js');
const phase10Stage = read('scripts/patch-registry-personal-long-session.js');
const offline = read('scripts/patch-offline-shell-manifest.js');

const phase8 = finalizer.indexOf("require('./patch-registry-phase16-personal-ux-v2.js')");
const phase10 = finalizer.indexOf("require('./patch-registry-personal-long-session.js')");
const phase8Gate = finalizer.indexOf("require('../tests/registry-personal-ux-phase8-test.js')");
const phase10Gate = finalizer.indexOf("require('../tests/registry-personal-long-session-test.js')");

assert(phase8 >= 0 && phase10 > phase8, 'Phase 8 audit must run before the Phase 10 audit.');
assert(phase8Gate > phase10, 'Regression gates must run after both personalization audits.');
assert(phase10Gate > phase8Gate, 'Phase 10 gate must run after the Phase 8 gate.');

assert.match(offline, /^'use strict';\n\nrequire\('\.\/patch-registry-personal-final\.js'\);/,
  'Offline packaging must delegate personalization verification to one canonical finalizer.');
assert.doesNotMatch(offline, /patch-registry-phase16-personal-ux-v2|patch-registry-personal-long-session|registry-personal-ux-phase8-test|registry-personal-long-session-test/,
  'Offline manifest must not know individual personalization audit stages.');

assert.doesNotMatch(finalizer, /fs\.writeFileSync|localStorage|fetch\s*\(/,
  'The finalizer must orchestrate only.');
for (const [label, source] of [['Phase 8', phase8Stage], ['Phase 10', phase10Stage]]) {
  assert.doesNotMatch(source, /writeFileSync|\bwrite\s*=|function\s+replaceSection|function\s+patch[A-Z]/,
    `${label} compatibility stage must remain audit-only after source materialization.`);
  assert.match(source, /this stage is audit-only/, `${label} stage must declare its read-only role.`);
}

console.log('Phase 13 finalizer audit passed: personalization behavior is source-owned and late compatibility stages are read-only regression verifiers.');
