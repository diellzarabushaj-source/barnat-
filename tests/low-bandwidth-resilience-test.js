const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const files = ['sw-resilient.js', 'offline-runtime.js', 'login.js', 'tailadmin-shell.js', 'vercel.json'];
for (const file of files) assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
for (const file of files.filter(file => file.endsWith('.js'))) execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

const worker = read('sw-resilient.js');
assert.match(worker, /VERSION = 'low-bandwidth-v2'/);
assert.match(worker, /page-low-bandwidth-hit/);
assert.match(worker, /static-fast-hit/);
assert.match(worker, /private-fast-hit/);
assert.match(worker, /SET_NETWORK_PROFILE/);
assert.match(worker, /networkProfile\.slow/);
assert.match(worker, /response\.redirected && finalPath !== expected/, 'redirected login HTML must not be cached as a clinical page');
assert.match(worker, /PRIVATE_PAGES\.has\(expected\)[\s\S]*finalPath === '\/login\.html'/, 'private page validation must reject login responses');
assert.match(worker, /if \(cached\)[\s\S]*refreshNavigation[\s\S]*return cloneWithHeader\(cached/, 'navigation must return cache before background refresh');
assert.match(worker, /for \(let index = 0; index < CORE_SHELL\.length; index \+= 2\)/, 'core shell must warm in small batches');
assert.doesNotMatch(worker, /Promise\.allSettled\(APP_SHELL\.map/, 'large concurrent shell downloads must not return');
assert.match(worker, /migratePrivateCaches/, 'existing private offline data must be migrated');
assert.doesNotMatch(worker, /refreshSafeClinicalPages|client\.navigate/, 'worker activation must not force page reloads');
assert.match(worker, /url\.pathname === '\/api\/auth'[\s\S]*fetch\(request\)/, 'auth must remain network-only');

const runtime = read('offline-runtime.js');
assert.match(runtime, /sw-resilient\.js/);
assert.match(runtime, /scheduleRegistration/);
assert.match(runtime, /window\.addEventListener\('load'/, 'first worker installation must wait until the visible page loads');
assert.match(runtime, /requestIdleCallback/, 'registration and warm-up must use idle time');
assert.match(runtime, /Lidhje e dobët · përdoret cache-i lokal/);
assert.match(runtime, /SET_NETWORK_PROFILE/);
assert.match(runtime, /saveData/);
assert.match(runtime, /slow-2g\|2g/);
assert.doesNotMatch(runtime, /await navigator\.serviceWorker\.ready/, 'startup must not block waiting for service-worker readiness');

const login = read('login.js');
assert.match(login, /saveBootstrapLease/);
assert.match(login, /bootstrap:true/);
assert.match(login, /45000/, 'slow login must allow a longer response window');
assert.match(login, /purgeOnlyStaleRuntimeEntries/);
assert.doesNotMatch(login, /registration\.unregister\(\)/, 'normal login must preserve the installed worker');
assert.doesNotMatch(login, /names\.filter\([^\n]*medindex-pages-[\s\S]*caches\.delete/, 'normal login must preserve page caches');
const init = login.slice(login.indexOf('function init()'));
assert.match(init, /setBusy\(false\)/, 'login form must be usable immediately');
assert.doesNotMatch(init, /await /, 'login initialization must not block on storage or network');

const shell = read('tailadmin-shell.js');
assert.match(shell, /revealCachedShellOnWeakConnection/);
assert.match(shell, /recentBootstrap/);
assert.match(shell, /auth-optimistic/);
assert.match(shell, /profile\.slow \|\| profile\.saveData/, 'runtime prefetch must stop on constrained connections');

const vercel = JSON.parse(read('vercel.json'));
const resilientHeader = vercel.headers.find(item => item.source === '/sw-resilient.js');
assert.ok(resilientHeader, 'resilient worker headers are missing');
assert.match(JSON.stringify(resilientHeader.headers), /no-store/);
assert.match(JSON.stringify(resilientHeader.headers), /Service-Worker-Allowed/);

console.log('Low-bandwidth, cache-first and non-blocking startup audit passed.');
