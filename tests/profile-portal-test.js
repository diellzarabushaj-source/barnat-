'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(ROOT, 'medindex-brand-runtime.js'), 'utf8');

assert.match(runtime, /medindex-brand-v4/);
assert.match(runtime, /profile-portal-v2/);
assert.match(runtime, /medindex_profile_v1/);
assert.match(runtime, /width:min\(560px,calc\(100vw - 28px\)\)/);
assert.match(runtime, /max-height:min\(760px,calc\(100dvh - 28px\)\)/);
assert.match(runtime, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
assert.match(runtime, /@media\(max-width:430px\)/);
assert.match(runtime, /min-height:40px!important;height:40px!important/);
assert.match(runtime, /max-width:430px/);
assert.match(runtime, /aria-modal=\"true\"/);
assert.match(runtime, /aria-describedby=\"miProfileDescription\"/);
assert.match(runtime, /event\.key === 'Tab'/);
assert.match(runtime, /event\.key === 'Escape'/);
assert.match(runtime, /image\/png/);
assert.match(runtime, /5 \* 1024 \* 1024/);
assert.match(runtime, /320 \/ Math\.max/);
assert.match(runtime, /canvas\.toDataURL\('image\/jpeg', \.86\)/);
assert.match(runtime, /localStorage\.setItem\(PROFILE_KEY/);
assert.doesNotMatch(runtime, /fetch\(|XMLHttpRequest|navigator\.sendBeacon|sessionStorage\.setItem/);
assert.match(runtime, /@media\(forced-colors:active\)/);
assert.match(runtime, /@media\(prefers-reduced-motion:reduce\)/);

console.log('Compact profile portal, responsive geometry, accessibility and local-only persistence contract passed.');
