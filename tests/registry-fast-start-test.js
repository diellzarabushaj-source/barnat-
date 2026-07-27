const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['registry-fast-start.js', 'index.html', 'app-parts/part-01.txt', 'app-performance.js']) {
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
}
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-fast-start.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'app-performance.js')], { stdio:'pipe' });

const fast = read('registry-fast-start.js');
assert.match(fast, /MAX_BLOCKING_MS = 2200/, 'blocking loader window must remain short');
assert.match(fast, /releaseLoader\('background'\)/, 'loader must release while registry continues in background');
assert.match(fast, /Regjistri po përgatitet në sfond/, 'background loading state must remain visible');
assert.match(fast, /MutationObserver/, 'fast-start must detect the first rendered registry rows');
assert.doesNotMatch(fast, /location\.reload|caches\.delete|unregister\(/, 'fast-start must not reset the browser or force a reload');

const index = read('index.html');
assert.match(index, /registry-fast-start\.js\?v=registry-fast-start-v2/);
assert.ok(index.indexOf('registry-fast-start.js') < index.indexOf('app-performance.js'), 'fast-start must execute before the registry application');
assert.match(index, /app-runtime-performance\.js\?v=clinical-audit-v5-performance-runtime[^>]+as="script"/, 'performance registry runtime must be preloaded');
assert.match(index, /registry-quality\.js\?v=20260723-2[^>]+as="script"/, 'current quality layer must be preloaded');

const part = read('app-parts/part-01.txt');
assert.match(part, /const timeout = setTimeout\(finish, 2600\)/, 'quality fallback bootstrap must have a bounded wait');
assert.match(part, /if\(existing\)[\s\S]*existing\.addEventListener\('load', finish/, 'existing quality runtime must settle safely');
assert.match(part, /script\.async = true/, 'quality fallback runtime must not block document parsing');
assert.doesNotMatch(part, /existing\.addEventListener\('error', reject/, 'quality bootstrap must not remain rejected or unresolved');

console.log('Registry fast-start and bounded loader audit passed.');
