'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const worker = read('sw.js');
const runtime = read('offline-runtime.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const packageJson = JSON.parse(read('package.json'));

for (const file of ['sw.js','offline-runtime.js','scripts/patch-phase9-pwa-targeted-cache.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(worker, /phase9-targeted-private-cache-v1/, 'Phase 9 cache marker is missing.');
assert.match(worker, /function isTargetedDosageRequest\(url\)/);
assert.match(worker, /url\.pathname === '\/api\/dosage' && url\.searchParams\.has\('view'\)/);
assert.match(worker, /normalized\.searchParams\.sort\(\)/, 'Query cache keys must be deterministic.');

const targetRoute = worker.indexOf('if (isTargetedDosageRequest(url))');
const privateRoute = worker.indexOf('if (PRIVATE_DATA_PATHS.has(url.pathname))', targetRoute);
assert(targetRoute >= 0 && privateRoute > targetRoute, 'Targeted dosage must route through query-aware cache before generic private cache.');
assert.match(worker, /const PRIVATE_DATA_PATHS = new Set\(\[[\s\S]*'\/api\/dosage'/, 'Full dosage compatibility must remain available when explicitly requested.');
assert.match(worker, /const REQUIRED_PRIVATE_PATHS = \['\/api\/registry', '\/data\/protocols\.json'\]/, 'Background warm must not include the full dosage payload.');

const readiness = worker.slice(worker.indexOf('async function privateCacheStatus'), worker.indexOf('async function warmPrivateData'));
assert.doesNotMatch(readiness, /new URL\('\/api\/dosage'/, 'Offline readiness must not require a full dosage download.');
assert.match(readiness, /new URL\('\/api\/registry'/);
assert.match(readiness, /manifestKey\(\)/);

for (const asset of [
  '/registry-mobile-lite.css','/registry-mobile-lite.js',
  '/registry-mobile-phase3.css','/registry-mobile-phase3.js',
  '/registry-mobile-phase4.css','/registry-mobile-phase4.js',
  '/registry-mobile-phase8.css','/registry-mobile-phase8.js','/registry-runtime-loader.js',
]) {
  assert(worker.includes(`'${asset}'`), `${asset} must be part of the install-time mobile shell.`);
}

const queryStart = worker.indexOf('async function queryDataResponse');
const queryEnd = worker.indexOf('function parseRange', queryStart);
assert(queryStart >= 0 && queryEnd > queryStart, 'Query cache handler boundaries are missing.');
const queryHandler = worker.slice(queryStart, queryEnd);
assert.match(queryHandler, /status:503/, 'Offline targeted-query failure must remain an explicit 503 owned by the resilience layer.');
assert.match(queryHandler, /offline:true/, 'Offline targeted-query fallback must identify itself as offline.');
assert.match(worker, /MAX_QUERY_RESPONSES = 40/, 'Targeted query cache must remain bounded.');
assert.match(runtime, /serviceWorker\.register/);
assert.match(runtime, /\/sw\.js\?v=/);
assert.match(runtime, /beforeinstallprompt/);
assert.equal(manifest.scope, '/');
assert.match(manifest.display, /standalone/);
assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.some(item => String(item.url || '').includes('recetat.html')));

assert.match(packageJson.scripts['build:runtime'], /patch-phase9-pwa-targeted-cache\.js/, 'Phase 9 must be deterministic in the runtime build chain.');
assert.equal(fs.existsSync(path.join(ROOT, 'api', 'offline-cache.js')), false, 'Phase 9 must not consume a new Vercel function slot.');

console.log('Phase 9 targeted dosage cache isolation, lightweight PWA warm set and resilience-owned offline fallback contract passed.');
