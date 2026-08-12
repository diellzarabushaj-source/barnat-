const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['registry-fast-start.js', 'registry-mobile-server.js', 'registry-runtime-loader.js', 'index.html', 'app-parts/part-01.txt', 'app-performance.js']) {
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
}
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-fast-start.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-mobile-server.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-runtime-loader.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'app-performance.js')], { stdio:'pipe' });

const fast = read('registry-fast-start.js');
assert.match(fast, /MAX_BLOCKING_MS = 2200/, 'blocking loader window must remain bounded');
assert.match(fast, /releaseLoader\('background'\)/, 'loader must retain a bounded fallback release');
assert.match(fast, /releaseInteractiveShell/, 'loader must release as soon as authentication and shell are ready');
assert.match(fast, /classList\.contains\('auth-ready'\)/, 'interactive release must wait for authentication');
assert.match(fast, /querySelector\('\.mi-app-shell'\)/, 'interactive release must wait for the mounted shell');
assert.match(fast, /loader\.style\.pointerEvents = 'none'/, 'loader must stop intercepting input before removal');
assert.match(fast, /Regjistri po përgatitet në sfond/, 'background loading state must remain visible');
assert.match(fast, /MutationObserver/, 'fast-start must detect the first rendered registry rows');
assert.doesNotMatch(fast, /location\.reload|caches\.delete|unregister\(/, 'fast-start must not reset the browser or force a reload');

const index = read('index.html');
assert.match(index, /registry-fast-start\.js\?v=registry-fast-start-v2/);
assert.match(index, /registry-mobile-server\.js\?v=20260812-1/);
assert.match(index, /registry-runtime-loader\.js\?v=20260812-7/);
assert.ok(index.indexOf('registry-fast-start.js') < index.indexOf('registry-mobile-server.js'), 'fast-start must execute before the mobile fast path');
assert.ok(index.indexOf('registry-mobile-server.js') < index.indexOf('registry-runtime-loader.js'), 'mobile fast path must execute before the full registry loader');
assert.doesNotMatch(index, /<script src="app-performance\.js"/, 'heavy registry startup must remain dynamically loaded');
assert.match(index, /app-runtime-performance\.js\?v=clinical-audit-v5-performance-runtime[^>]+as="script"/, 'performance registry runtime must be preloaded');
assert.match(index, /registry-quality\.js\?v=20260723-2[^>]+as="script"/, 'current quality layer must be preloaded');

const mobile = read('registry-mobile-server.js');
assert.match(mobile, /\(max-width: 767px\)/, 'mobile fast path must remain phone-only');
assert.match(mobile, /DEFAULT_PAGE_SIZE = 25/, 'mobile fast path must remain lightweight');
assert.match(mobile, /MEDINDEX_MOBILE_SERVER_ACTIVE = true/, 'mobile fast path must expose its active state');

const loader = read('registry-runtime-loader.js');
assert.match(loader, /registry-runtime-loader-v7/, 'deferred registry loader version must be current');
assert.match(loader, /MOBILE_SERVER_GRACE_MS = 5000/, 'mobile fast path must have a bounded fallback');
assert.match(loader, /mobile-server-deferred/, 'phone startup must defer the full registry while fast path is healthy');
assert.match(loader, /desktop-or-legacy/, 'desktop must keep the existing full registry startup path');
assert.match(loader, /app-performance\.js\?v=20260801-2/, 'loader must launch the current registry application');
assert.match(loader, /classList\.contains\('auth-ready'\)/, 'registry startup must wait for the authenticated shell');
assert.match(loader, /requestAnimationFrame\(\(\) => \{[\s\S]*loadRuntime\(reason\)/, 'full registry startup must yield one frame before loading');
assert.doesNotMatch(loader, /FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|INTERACTION_EVENTS/, 'artificial interaction delays must be removed');
assert.doesNotMatch(loader, /MEDINDEX_REGISTRY_UI_READY\s*=\s*new Promise/, 'loader must not create a circular UI-ready promise');

const part = read('app-parts/part-01.txt');
assert.match(part, /const timeout = setTimeout\(finish, 2600\)/, 'quality fallback bootstrap must have a bounded wait');
assert.match(part, /if\(existing\)[\s\S]*existing\.addEventListener\('load', finish/, 'existing quality runtime must settle safely');
assert.match(part, /script\.async = true/, 'quality fallback runtime must not block document parsing');
assert.doesNotMatch(part, /existing\.addEventListener\('error', reject/, 'quality bootstrap must not remain rejected or unresolved');

console.log('Registry fast-start, mobile lightweight path and deferred authenticated loader v7 audit passed.');
