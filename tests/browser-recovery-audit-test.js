const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['recovery.html', 'recovery.js', 'login.js', 'middleware.ts', 'vercel.json']) {
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
}
execFileSync(process.execPath, ['--check', path.join(ROOT, 'recovery.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'login.js')], { stdio:'pipe' });

const recoveryHtml = read('recovery.html');
assert.match(recoveryHtml, /recovery\.js\?v=production-audit-v1/);
assert.doesNotMatch(recoveryHtml, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i, 'Recovery page must not contain executable inline script');

const recovery = read('recovery.js');
assert.match(recovery, /serviceWorker\.getRegistrations/);
assert.match(recovery, /registration\.unregister\(\)/);
assert.match(recovery, /name\.startsWith\('medindex-'\)/);
assert.match(recovery, /location\.replace/);

const login = read('login.js');
assert.match(login, /releaseStaleBrowserShell/);
assert.match(login, /medindex-pages-/);
assert.match(login, /medindex-static-/);
assert.match(login, /registration\.unregister\(\)/);
assert.ok(login.indexOf('await releaseStaleBrowserShell()') < login.indexOf("timedFetch('/api/auth'"), 'Login must release stale browser shell before auth validation');

const middleware = read('middleware.ts');
assert.match(middleware, /'\/recovery\.html'/);
assert.match(middleware, /'\/recovery\.js'/);
assert.match(middleware, /!value\.startsWith\('\/recovery'\)/);

const vercel = JSON.parse(read('vercel.json'));
for (const source of ['/recovery.html', '/recovery.js']) {
  const entry = vercel.headers.find(item => item.source === source);
  assert.ok(entry, `${source} cache header is missing`);
  assert.match(JSON.stringify(entry.headers), /no-store/, `${source} must be non-cacheable`);
}

console.log('Browser cache and Service Worker recovery audit passed.');
