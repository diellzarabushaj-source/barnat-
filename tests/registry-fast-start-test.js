const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['registry-fast-start.js', 'registry-runtime-loader.js', 'index.html', 'app-parts/part-01.txt', 'app-performance.js']) {
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
}
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-fast-start.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-runtime-loader.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'app-performance.js')], { stdio:'pipe' });

const fast = read('registry-fast-start.js');
assert.match(fast, /MAX_BLOCKING_MS = 2200/, 'blocking loader window must remain short');
assert.match(fast, /releaseLoader\('background'\)/, 'loader must release while registry continues in background');
assert.match(fast, /Regjistri po përgatitet në sfond/, 'background loading state must remain visible');
assert.match(fast, /MutationObserver/, 'fast-start must detect the first rendered registry rows');
assert.doesNotMatch(fast, /location\.reload|caches\.delete|unregister\(/, 'fast-start must not reset the browser or force a reload');

const index = read('index.html');
assert.match(index, /registry-fast-start\.js\?v=registry-fast-start-v2/);
assert.match(index, /registry-runtime-loader\.js\?v=20260801-2/);
assert.ok(index.indexOf('registry-fast-start.js') < index.indexOf('registry-runtime-loader.js'), 'fast-start must execute before the cooperative registry loader');
assert.doesNotMatch(index, /<script src="app-performance\.js"/, 'heavy registry startup must be delegated to the cooperative loader');
assert.match(index, /app-runtime-performance\.js\?v=clinical-audit-v5-performance-runtime[^>]+as="script"/, 'performance registry runtime must be preloaded');
assert.match(index, /registry-quality\.js\?v=20260723-2[^>]+as="script"/, 'current quality layer must be preloaded');

const loader = read('registry-runtime-loader.js');
assert.match(loader, /registry-runtime-loader-v2/, 'the cooperative interaction gate version must be current');
assert.match(loader, /FIRST_INTERACTION_FALLBACK_MS = 1800/, 'the registry must retain a bounded automatic fallback');
assert.match(loader, /POST_INTERACTION_GRACE_MS = 320/, 'the first interaction must finish before heavy startup');
assert.match(loader, /INTERACTION_EVENTS = \['pointerdown', 'keydown', 'touchstart'\]/, 'pointer, keyboard and touch interactions must open the gate');
assert.match(loader, /app-performance\.js\?v=20260801-1/, 'the cooperative loader must launch the audited registry application');
assert.match(loader, /classList\.contains\('auth-ready'\)/, 'registry startup must wait for the authenticated shell');
assert.match(loader, /requestAnimationFrame\(\(\) => requestAnimationFrame\(loadRuntime\)\)/, 'registry startup must yield across two paint opportunities');

const part = read('app-parts/part-01.txt');
assert.match(part, /const timeout = setTimeout\(finish, 2600\)/, 'quality fallback bootstrap must have a bounded wait');
assert.match(part, /if\(existing\)[\s\S]*existing\.addEventListener\('load', finish/, 'existing quality runtime must settle safely');
assert.match(part, /script\.async = true/, 'quality fallback runtime must not block document parsing');
assert.doesNotMatch(part, /existing\.addEventListener\('error', reject/, 'quality bootstrap must not remain rejected or unresolved');

console.log('Registry fast-start, authenticated first-interaction gate and bounded loader audit passed.');
