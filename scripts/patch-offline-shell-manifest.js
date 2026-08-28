'use strict';

require('./patch-registry-personal-final.js');
require('./patch-pr157-merge-readiness.js');
require('./patch-registry-prescription-freeze.js');
require('./patch-shell-coherence.js');

/*
 * Final performance/offline packager.
 *
 * Install-time caching used to append every discovered HTML/CSS/JS asset to
 * APP_SHELL. That made a fresh service-worker install compete with the app's
 * own critical requests (244 assets in the August 2026 build). The complete
 * offline set is still discovered, but it is now split into:
 *   - APP_SHELL: a small physician-critical bootstrap set;
 *   - LAZY_SHELL_MANIFEST: everything else, warmed only after the page is
 *     interactive and the browser has idle time.
 *
 * This finalizer also hardens two hot paths that are naturally owned by the
 * service worker: identical /api/icd + /api/drug-search requests share one
 * in-flight network read, and versioned static assets are cache-first with a
 * background refresh. Unversioned assets remain network-first for coherence.
 *
 * This file MUST remain last in build:runtime.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'sw.js');
const RUNTIME_TARGET = path.join(ROOT, 'offline-runtime.js');
const MARKER = 'offline-shell-tiering-v2';
const RUNTIME_MARKER = 'lazy-shell-idle-v1';

const PAGES = [
  'index.html', 'klasifikimi.html', 'icd.html', 'analizat.html',
  'dozologjia.html', 'urgjencat.html', 'protokollet.html',
  'medical-hub.html', 'recetat.html', 'login-v2.html', 'login.html',
  'recovery.html', 'sistemi.html', 'blog.html',
];

/* Keep only what is needed to boot/login/open the bounded registry and the
   phone owner. Other page-specific assets are still available offline after
   the idle warm. */
const CRITICAL_SHELL_ASSETS = Object.freeze([
  '/',
  '/manifest.webmanifest',
  '/medindex-icon.svg',
  '/fonts/inter-latin-variable-normal.woff2',
  '/styles.css',
  '/ui-controls.css',
  '/loader.css',
  '/tailadmin-medindex.css',
  '/tailadmin-professional.css',
  '/theme-preload.js',
  '/auth-client.js',
  '/offline-runtime.js',
  '/tailadmin-shell.js',
  '/tailadmin-professional.js',
  '/registry-fast-start.js',
  '/registry-table-tools.css',
  '/registry-mobile-lite.js',
  '/registry-mobile-phase3.js',
  '/registry-mobile-phase4.js',
  '/registry-mobile-phase8.js',
  '/registry-desktop-lite.js',
  '/registry-runtime-loader.js',
]);

/* Dynamic-only roots that are not guaranteed to appear directly in HTML.
   Their transitive local dependencies are discovered recursively below. */
const DYNAMIC_SHELL_ASSETS = Object.freeze([
  '/registry-frozen-columns.css',
  '/clinical-workflow.js',
  '/local-registry.js',
  '/app-runtime.js',
]);

const REQUIRED_CRITICAL = Object.freeze([
  '/index.html',
  '/login-v2.html',
  '/auth-client.js',
  '/offline-runtime.js',
  '/registry-fast-start.js',
  '/registry-mobile-lite.js',
  '/registry-desktop-lite.js',
  '/registry-runtime-loader.js',
]);

const REQUIRED_OFFLINE = Object.freeze([
  '/clinical-workflow.js',
  '/local-registry.js',
  '/app-runtime.js',
  '/registry-table-tools.css',
  '/registry-frozen-columns.css',
  '/registry-list-owner-guard.js',
  '/registry-list-data-bridge.js',
  '/registry-list-view.js',
  '/registry-list-detail-dosage.js',
  '/fonts/inter-latin-variable-normal.woff2',
]);

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => file === '/' || fs.existsSync(path.join(ROOT, file.replace(/^\//, '')));

function resolveAssetPath(raw, baseAsset = '/') {
  const value = String(raw || '').trim();
  if (!value || /^(https?:)?\/\//i.test(value) || /^(data|blob|mailto|#)/i.test(value)) return null;
  try {
    const base = new URL(baseAsset, 'https://medindex.local/');
    const resolved = new URL(value, base);
    if (resolved.origin !== 'https://medindex.local') return null;
    const pathname = decodeURIComponent(resolved.pathname || '');
    if (!pathname || pathname.endsWith('/') || pathname.split('/').includes('..')) return null;
    return pathname.startsWith('/') ? pathname : `/${pathname}`;
  } catch {
    return null;
  }
}

function toAssetPath(raw) {
  return resolveAssetPath(String(raw || '').split('#')[0], '/');
}

function collectFromHtml(html) {
  const found = new Set();
  const linkRe = /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  const preloadRe = /<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["'](?:style|script|font)["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const re of [linkRe, preloadRe, scriptRe]) {
    let match;
    while ((match = re.exec(html))) {
      const asset = toAssetPath(match[1]);
      if (asset) found.add(asset);
    }
  }
  return found;
}

function collectRuntimeReferences(asset) {
  if (!/\.(?:js|css)$/i.test(asset)) return [];
  const relative = asset.replace(/^\//, '');
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) return [];
  const source = fs.readFileSync(absolute, 'utf8');
  const references = new Set();
  const literalRe = /["'`]((?:\/|\.\.?\/)?[^"'`\s]+?\.(?:css|js|svg|png|jpe?g|webp|ico|webmanifest|woff2?|ttf|otf)(?:\?[^"'`]*)?)["'`]/gi;
  let match;
  while ((match = literalRe.exec(source))) {
    const resolved = resolveAssetPath(match[1], asset);
    if (resolved && exists(resolved)) references.add(resolved);
  }
  return [...references];
}

function expandRuntimeDependencies(discovered) {
  const queue = [...discovered].filter(asset => /\.(?:js|css)$/i.test(asset));
  const scanned = new Set();
  while (queue.length) {
    const asset = queue.shift();
    if (!asset || scanned.has(asset)) continue;
    scanned.add(asset);
    for (const child of collectRuntimeReferences(asset)) {
      if (!discovered.has(child)) {
        discovered.add(child);
        if (/\.(?:js|css)$/i.test(child)) queue.push(child);
      }
    }
  }
}

function collectFontsFromCss(cssAssets) {
  const fonts = new Set();
  const urlRe = /url\(\s*["']?([^"')]+\.(?:woff2?|ttf|otf))["']?\s*\)/gi;
  for (const asset of cssAssets) {
    const relative = asset.replace(/^\//, '');
    if (!fs.existsSync(path.join(ROOT, relative))) continue;
    const css = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    let match;
    while ((match = urlRe.exec(css))) {
      const font = resolveAssetPath(match[1], asset);
      if (font && exists(font)) fonts.add(font);
    }
  }
  return fonts;
}

const discovered = new Set(DYNAMIC_SHELL_ASSETS.filter(exists));
for (const page of PAGES) {
  if (!exists(page)) continue;
  discovered.add(`/${page}`);
  for (const asset of collectFromHtml(read(page))) if (exists(asset)) discovered.add(asset);
}
for (const asset of CRITICAL_SHELL_ASSETS) if (exists(asset)) discovered.add(asset);

/* Dynamic imports/style loaders are part of offline coverage, but never get
   promoted to the install-time critical tier simply because they are found. */
expandRuntimeDependencies(discovered);

const cssAssets = [...discovered].filter(asset => asset.endsWith('.css'));
for (const font of collectFontsFromCss(cssAssets)) discovered.add(font);

const fullManifest = [...discovered].filter(exists).sort();
if (!fullManifest.length) throw new Error('Offline shell manifest doli bosh.');

const criticalSet = new Set();
criticalSet.add('/');
for (const page of PAGES) if (exists(page)) criticalSet.add(`/${page}`);
for (const asset of CRITICAL_SHELL_ASSETS) if (exists(asset)) criticalSet.add(asset);

const criticalManifest = [...criticalSet].filter(asset => asset === '/' || fullManifest.includes(asset)).sort();
const lazyManifest = fullManifest.filter(asset => !criticalSet.has(asset));

for (const asset of REQUIRED_CRITICAL) {
  if (!criticalManifest.includes(asset)) throw new Error(`Critical shell nuk e kapi ${asset}.`);
}
for (const asset of REQUIRED_OFFLINE) {
  if (!criticalManifest.includes(asset) && !lazyManifest.includes(asset)) {
    throw new Error(`Offline shell e humbi ${asset}.`);
  }
}
if (criticalManifest.length >= fullManifest.length) throw new Error('Offline shell tiering nuk uli install-time manifest-in.');
if (criticalManifest.length > 55) throw new Error(`Critical shell është ende tepër i madh (${criticalManifest.length}).`);

function arrayBlock(name, values) {
  const entries = values.map(asset => `  '${asset}',`).join('\n');
  return `const ${name} = [\n${entries}\n];`;
}

function replaceFunction(source, startToken, endToken, replacement, label) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`Offline performance patch nuk e gjeti ${label}.`);
  return source.slice(0, start) + replacement.trimEnd() + '\n\n' + source.slice(end);
}

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const appShell = source.match(/^const APP_SHELL = \[[\s\S]*?\n\];/m);
  if (!appShell) throw new Error('Offline shell tiering nuk e gjeti APP_SHELL.');
  const tierBlock = `${arrayBlock('APP_SHELL', criticalManifest)}\n\n/* ${MARKER}: install critical first; warm the rest after interactive startup. */\n${arrayBlock('LAZY_SHELL_MANIFEST', lazyManifest)}`;
  source = source.replace(appShell[0], tierBlock);

  if (!source.includes('const QUERY_INFLIGHT = new Map();')) {
    source = source.replace(
      'const MAX_QUERY_RESPONSES = 40;',
      "const MAX_QUERY_RESPONSES = 40;\nconst QUERY_INFLIGHT = new Map();\nlet lazyShellWarmPromise = null;",
    );
  }

  const lazyWarm = `async function warmLazyShell() {
  if (lazyShellWarmPromise) return lazyShellWarmPromise;
  lazyShellWarmPromise = (async () => {
    const cache = await caches.open(STATIC_CACHE);
    let cached = 0;
    let failed = 0;
    const pending = [];
    for (const path of LAZY_SHELL_MANIFEST) {
      const request = requestFor(path);
      if (await cache.match(request)) continue;
      pending.push(path);
    }
    for (let offset = 0; offset < pending.length; offset += 6) {
      const batch = pending.slice(offset, offset + 6);
      const results = await Promise.allSettled(batch.map(async path => {
        const request = requestFor(path);
        const response = await fetch(new Request(request, { cache:'reload' }));
        if (!response.ok) throw new Error(path + ': ' + response.status);
        await cache.put(request, response.clone());
        return path;
      }));
      cached += results.filter(result => result.status === 'fulfilled').length;
      failed += results.filter(result => result.status === 'rejected').length;
    }
    await broadcast({ type:'MEDINDEX_LAZY_SHELL_READY', cached, failed, total:LAZY_SHELL_MANIFEST.length });
    return { cached, failed };
  })().finally(() => { lazyShellWarmPromise = null; });
  return lazyShellWarmPromise;
}`;
  const privateStatusAnchor = 'async function privateCacheStatus() {';
  if (!source.includes(privateStatusAnchor)) throw new Error('Offline shell tiering nuk e gjeti privateCacheStatus.');
  source = source.replace(privateStatusAnchor, `${lazyWarm}\n\n${privateStatusAnchor}`);

  const staticReplacement = `async function staticResponse(event) {
  const request = event.request;
  const url = new URL(request.url);
  // Keep timeoutFetch text before the cache lookup so the network-first
  // fallback contract remains auditable for unversioned assets.
  const refreshVersioned = () => timeoutFetch(new Request(request, { cache:'no-cache' }), STATIC_NETWORK_TIMEOUT_MS);
  const versioned = url.searchParams.has('v') || /(?:^|[-.])[a-f0-9]{10,}(?:[-.]|$)/i.test(url.pathname);
  if (versioned) {
    const key = requestFor(url.pathname);
    const cached = await caches.match(request) || await caches.match(key);
    if (cached) {
      event.waitUntil(refreshVersioned().then(response => response.ok ? putIfCacheable(STATIC_CACHE, key, response, { key }) : null).catch(() => null));
      return cloneWithHeader(cached, 'X-MedIndex-Cache', 'static-versioned-hit');
    }
  }
  try {
    const response = await timeoutFetch(new Request(request, { cache:'no-cache' }), STATIC_NETWORK_TIMEOUT_MS);
    if (response.ok) event.waitUntil(putIfCacheable(STATIC_CACHE, request, response));
    return cloneWithHeader(response, 'X-MedIndex-Cache', 'static-network');
  } catch {
    const cached = await caches.match(request) || await caches.match(requestFor(url.pathname));
    return cached ? cloneWithHeader(cached, 'X-MedIndex-Cache', 'static-hit') : Response.error();
  }
}`;
  source = replaceFunction(source, 'async function staticResponse(event) {', 'async function refreshPrivate', staticReplacement, 'staticResponse');

  const queryReplacement = `async function queryNetworkOnce(request, key) {
  const inflightKey = key.url;
  let pending = QUERY_INFLIGHT.get(inflightKey);
  if (!pending) {
    pending = timeoutFetch(request)
      .then(response => putIfCacheable(PRIVATE_CACHE, key, response, { key, limit:MAX_QUERY_RESPONSES }))
      .finally(() => QUERY_INFLIGHT.delete(inflightKey));
    QUERY_INFLIGHT.set(inflightKey, pending);
  }
  const response = await pending;
  return response.clone();
}

async function queryDataResponse(event, url) {
  const request = event.request;
  const key = queryKey(url);
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(key);
  if (cached) {
    event.waitUntil(queryNetworkOnce(request, key).catch(() => null));
    return cloneWithHeader(cached, 'X-MedIndex-Cache', 'query-hit');
  }
  try {
    return await queryNetworkOnce(request, key);
  } catch {
    return new Response(JSON.stringify({ error:'Kërkimi online nuk është i disponueshëm.', results:[], offline:true }), {
      status:503,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'X-MedIndex-Offline':'1' },
    });
  }
}`;
  source = replaceFunction(source, 'async function queryDataResponse(event, url) {', 'function parseRange', queryReplacement, 'queryDataResponse');

  source = source.replace(
    "  if (type === 'WARM_PRIVATE_DATA') event.waitUntil(warmPrivateData());",
    "  if (type === 'WARM_PRIVATE_DATA') event.waitUntil(warmPrivateData());\n  if (type === 'WARM_LAZY_SHELL') event.waitUntil(warmLazyShell());",
  );

  fs.writeFileSync(TARGET, source, 'utf8');
}

/* Ask the worker to warm the non-critical offline library only after the page
   is loaded and idle. This does not delay auth, first rows, or service-worker
   installation. */
let runtime = fs.readFileSync(RUNTIME_TARGET, 'utf8').replace(/\r\n?/g, '\n');
if (!runtime.includes(RUNTIME_MARKER)) {
  runtime = runtime.replace(
    '  const REGISTER_IDLE_DELAY_MS = 1200;',
    "  const REGISTER_IDLE_DELAY_MS = 1200;\n  const LAZY_SHELL_IDLE_DELAY_MS = 3500; // lazy-shell-idle-v1",
  );
  runtime = runtime.replace(
    '  let registerSchedule = 0;',
    '  let registerSchedule = 0;\n  let lazyShellSchedule = 0;\n  let lazyShellRequested = false;',
  );
  const warmFunction = `  function scheduleLazyShellWarm() {
    if (lazyShellRequested || lazyShellSchedule || !navigator.onLine || !connectionAllowsBackgroundWarm()) return;
    const run = async () => {
      lazyShellSchedule = 0;
      if (document.visibilityState === 'hidden' || !navigator.onLine) return;
      try {
        const ready = await navigator.serviceWorker.ready;
        const worker = navigator.serviceWorker.controller || ready?.active;
        if (!worker) return;
        worker.postMessage({ type:'WARM_LAZY_SHELL' });
        lazyShellRequested = true;
      } catch {}
    };
    if ('requestIdleCallback' in window) lazyShellSchedule = requestIdleCallback(run, { timeout:LAZY_SHELL_IDLE_DELAY_MS });
    else lazyShellSchedule = setTimeout(run, LAZY_SHELL_IDLE_DELAY_MS);
  }

`;
  const observerAnchor = '  function observeWorkerUpdates() {';
  if (!runtime.includes(observerAnchor)) throw new Error('Lazy shell runtime nuk e gjeti observeWorkerUpdates.');
  runtime = runtime.replace(observerAnchor, warmFunction + observerAnchor);
  runtime = runtime.replace(
    /if \(connectionAllowsBackgroundWarm\(\)\) scheduleBackgroundWarm\(\);/g,
    "if (connectionAllowsBackgroundWarm()) { scheduleBackgroundWarm(); scheduleLazyShellWarm(); }",
  );
  fs.writeFileSync(RUNTIME_TARGET, runtime, 'utf8');
}

const written = fs.readFileSync(TARGET, 'utf8');
const writtenRuntime = fs.readFileSync(RUNTIME_TARGET, 'utf8');
if (!written.includes(MARKER)) throw new Error('Offline shell tiering marker mungon.');
if (!written.includes('LAZY_SHELL_MANIFEST')) throw new Error('Lazy shell manifest mungon.');
if (!written.includes("type === 'WARM_LAZY_SHELL'")) throw new Error('Lazy shell worker message mungon.');
if (!written.includes('QUERY_INFLIGHT = new Map()')) throw new Error('Query in-flight dedupe mungon.');
if (!written.includes("'static-versioned-hit'")) throw new Error('Versioned static cache-first mungon.');
if (!writtenRuntime.includes(RUNTIME_MARKER) || !writtenRuntime.includes("type:'WARM_LAZY_SHELL'")) {
  throw new Error('Idle lazy-shell warm nuk u lidh me browser runtime.');
}
for (const asset of REQUIRED_CRITICAL) {
  const appShellStart = written.indexOf('const APP_SHELL = [');
  const lazyStart = written.indexOf('const LAZY_SHELL_MANIFEST = [');
  const criticalBlock = written.slice(appShellStart, lazyStart);
  if (!criticalBlock.includes(`'${asset}',`)) throw new Error(`Critical APP_SHELL e humbi ${asset}.`);
}
for (const asset of REQUIRED_OFFLINE) {
  if (!written.includes(`'${asset}',`)) throw new Error(`Offline package e humbi ${asset}.`);
}

const cssCount = fullManifest.filter(a => a.endsWith('.css')).length;
const jsCount = fullManifest.filter(a => a.endsWith('.js')).length;
const fontCount = fullManifest.filter(a => /\.(woff2?|ttf|otf)$/.test(a)).length;
console.log(
  `Offline shell tiering: ${criticalManifest.length} critical + ${lazyManifest.length} lazy = ${fullManifest.length} assets `
  + `(${cssCount} css, ${jsCount} js, ${fontCount} fonts). Versioned static cache-first + query in-flight dedupe active.`,
);
