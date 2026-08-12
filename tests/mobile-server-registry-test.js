'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mobile = fs.readFileSync(path.join(root, 'registry-mobile-server.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'registry-runtime-loader.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'registry-mobile-server.css'), 'utf8');

assert.match(mobile, /\(max-width: 767px\)/, 'mobile fast path must be limited to phones');
assert.match(mobile, /DEFAULT_PAGE_SIZE = 25/, 'mobile fast path must request 25 rows by default');
assert.match(mobile, /MAX_PAGE_SIZE = 50/, 'mobile fast path must never request more than 50 rows');
assert.match(mobile, /\/api\/registry-page/, 'mobile fast path must use the lightweight registry API');
assert.match(mobile, /SEARCH_DEBOUNCE_MS = 250/, 'mobile search must be debounced');
assert.match(mobile, /view=detail/, 'medicine detail must load on demand');
assert.match(mobile, /medindex:request-full-registry/, 'advanced features need a safe full-runtime handoff');
assert.match(mobile, /credentials:'same-origin'/, 'mobile registry requests must keep session credentials');
assert.doesNotMatch(mobile, /apirest\.|NEON_DATA_API|VERCEL_OIDC_TOKEN|SELECT\s+\*/i, 'browser code must not expose or query Neon directly');

assert.match(loader, /registry-runtime-loader-v7/, 'runtime loader version must be upgraded');
assert.match(loader, /mobile-server-deferred/, 'full runtime must be deferred while mobile fast path starts');
assert.match(loader, /MOBILE_SERVER_GRACE_MS = 5000/, 'mobile fast path needs a bounded fallback grace period');
assert.match(loader, /medindex:full-registry-started/, 'full-runtime handoff event is required');
assert.match(loader, /desktop-or-legacy/, 'desktop must keep the existing full runtime');

const mobileScriptIndex = html.indexOf('registry-mobile-server.js');
const runtimeLoaderIndex = html.indexOf('registry-runtime-loader.js');
assert.ok(mobileScriptIndex > 0 && runtimeLoaderIndex > mobileScriptIndex, 'mobile server script must run before the legacy runtime loader');
assert.match(html, /registry-mobile-server\.css/, 'mobile server CSS must be linked');
assert.match(css, /@media \(max-width:767px\)/, 'mobile server styles must not alter desktop');

console.log('Mobile server-side registry contract passed.');
