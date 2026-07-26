/* MedIndex physician-first offline service worker */
'use strict';

const VERSION = 'production-audit-v1';
const CACHE_EPOCH = 'fresh-navigation-20260726-1';
const CACHE_NAMESPACE = `${VERSION}-${CACHE_EPOCH}`;
const STATIC_CACHE = `medindex-static-${CACHE_NAMESPACE}`;
const PAGE_CACHE = `medindex-pages-${CACHE_NAMESPACE}`;
const PRIVATE_CACHE = `medindex-private-${CACHE_NAMESPACE}`;
const DOCUMENT_CACHE = `medindex-documents-${CACHE_NAMESPACE}`;
const ALL_CACHES = [STATIC_CACHE, PAGE_CACHE, PRIVATE_CACHE, DOCUMENT_CACHE];
const NETWORK_TIMEOUT_MS = 4200;
const STATIC_NETWORK_TIMEOUT_MS = 3000;
const MAX_DOCUMENTS = 16;
const MAX_QUERY_RESPONSES = 40;

const APP_SHELL = [
  '/', '/index.html', '/klasifikimi.html', '/icd.html', '/analizat.html',
  '/dozologjia.html', '/protokollet.html', '/recetat.html', '/login.html',
  '/manifest.webmanifest', '/medindex-icon.svg',
  '/styles.css', '/ui-controls.css', '/loader.css', '/app-polish.css',
  '/performance.css', '/clean-medindex-ui.css', '/tailadmin-medindex.css',
  '/tailadmin-professional.css', '/medical-hub.css', '/clinical-density.css',
  '/classification.css', '/classification-nav-fix.css', '/registry-quality.css',
  '/clinical-reference.css', '/analizat-polish.css', '/analizat-tailwind-cards-v2.css',
  '/icd-premium-cards.css', '/icd-clinical-workspace.css', '/icd-tailadmin-cards-v2.css',
  '/recetat.css', '/recetat-audit.css', '/signature-templates.css', '/login.css',
  '/tailadmin-shell.js', '/tailadmin-shell-legacy.js', '/tailadmin-professional.js',
  '/mobile-experience.js', '/offline-runtime.js', '/clinical-workflow.js',
  '/local-registry.js', '/local-registry-fidelity.js', '/auth-client.js',
  '/app-stability.js', '/app.js', '/ui-enhancements.js', '/name-display.js',
  '/medical-icons.js', '/section-icons.js', '/classification-icons.js',
  '/classification-data.js', '/classification-registry-bridge.js',
  '/classification-v3.js', '/classification-audit-view.js',
  '/classification-info-v3.js', '/icd-data.js', '/icd.js',
  '/icd-premium-cards.js', '/icd-clinical-workspace.js',
  '/icd-clinical-style-loader.js', '/icd-tailadmin-card-style-loader.js',
  '/lab-sheet-data.js', '/analizat.js', '/analizat-clinical-style-loader.js',
  '/clinical-dialog.js', '/dosage-engine.js', '/dozologjia.js', '/protokollet.js',
  '/prescription-format-core.js', '/signature-templates.js',
  '/recetat.js', '/login.js', '/data/registry-quality.js',
  '/data/protocols.json', '/app-parts/part-01.txt',
  '/app-parts/part-02.txt', '/app-parts/part-03.txt',
  '/app-parts/part-04.txt', '/app-parts/core-tail.txt'
];

const PRIVATE_DATA_PATHS = new Set([
  '/api/registry', '/data/registry-data.js', '/api/dosage', '/api/icd'
]);
const QUERY_DATA_PATHS = new Set(['/api/drug-search']);
const SAFE_AUTO_REFRESH_PATHS = new Set(['/icd.html', '/analizat.html']);

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function timeoutFetch(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function requestFor(pathOrUrl, options = {}) {
  const url = new URL(pathOrUrl, self.location.origin);
  return new Request(url.href, {
    method: 'GET',
    credentials: 'same-origin',
    headers: options.headers || undefined,
  });
}

function navigationKey(url) {
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  return requestFor(path);
}

function normalizedPrivateKey(url) {
  const path = url.pathname === '/data/registry-data.js' ? '/api/registry' : url.pathname;
  const accept = path === '/api/registry' ? 'application/javascript' : 'application/json';
  return requestFor(path, { headers: { Accept: accept } });
}

function queryKey(url) {
  const normalized = new URL(url.href);
  normalized.hash = '';
  normalized.searchParams.sort();
  return requestFor(normalized.href, { headers: { Accept: 'application/json' } });
}

function cloneWithHeader(response, name, value) {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function trimCache(cache, limit) {
  const keys = await cache.keys();
  while (keys.length > limit) await cache.delete(keys.shift());
}

async function putIfCacheable(cacheName, request, response, options = {}) {
  if (!response || !response.ok || response.status === 206) return response;
  if (response.type !== 'basic' && response.type !== 'default') return response;
  const cache = await caches.open(cacheName);
  await cache.put(options.key || request, response.clone());
  if (options.limit) await trimCache(cache, options.limit);
  return response;
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage(message));
}

async function precacheShell() {
  const cache = await caches.open(STATIC_CACHE);
  let cached = 0;
  const failed = [];
  await Promise.all(APP_SHELL.map(async path => {
    try {
      const request = requestFor(path);
      const response = await fetch(new Request(request, { cache: 'reload' }));
      if (!response.ok) throw new Error(String(response.status));
      await cache.put(request, response.clone());
      cached += 1;
    } catch {
      failed.push(path);
    }
  }));
  return { cached, failed };
}

async function warmPrivateData() {
  await broadcast({ type: 'MEDINDEX_CACHE_STATUS', state: 'syncing' });
  const cache = await caches.open(PRIVATE_CACHE);
  const required = ['/api/registry', '/api/dosage', '/data/protocols.json'];
  const optional = ['/api/icd'];
  let cached = 0;
  for (const path of [...required, ...optional]) {
    try {
      const isRegistry = path.includes('registry');
      const request = requestFor(path, { headers: { Accept: isRegistry ? 'application/javascript' : 'application/json' } });
      const response = await fetch(new Request(request, { cache: 'no-store' }));
      if (response.status === 401 || response.status === 403) {
        await broadcast({ type: 'MEDINDEX_AUTH_INVALID' });
        break;
      }
      if (!response.ok) continue;
      const key = path === '/data/protocols.json' ? request : normalizedPrivateKey(new URL(request.url));
      await cache.put(key, response.clone());
      cached += 1;
    } catch {}
  }
  const state = cached >= required.length ? 'ready' : 'limited';
  await broadcast({ type: 'MEDINDEX_CACHE_STATUS', state, cached, required: required.length, syncedAt: Date.now() });
  return cached;
}

async function clearPrivateData() {
  await Promise.all([caches.delete(PRIVATE_CACHE), caches.delete(DOCUMENT_CACHE)]);
  await broadcast({ type: 'MEDINDEX_CACHE_STATUS', state: 'cleared' });
}

async function refreshSafeClinicalPages() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(windows.map(async client => {
    try {
      const url = new URL(client.url);
      if (url.origin !== self.location.origin || !SAFE_AUTO_REFRESH_PATHS.has(url.pathname)) return;
      await client.navigate(client.url);
    } catch {}
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const result = await precacheShell();
    await self.skipWaiting();
    await broadcast({
      type: 'MEDINDEX_CACHE_STATUS',
      state: result.failed.length ? 'shell-limited' : 'shell-ready',
      cached: result.cached,
      failed: result.failed.length,
      cacheEpoch: CACHE_EPOCH,
    });
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('medindex-') && !ALL_CACHES.includes(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
    await broadcast({ type: 'MEDINDEX_SHELL_UPDATED', cacheEpoch: CACHE_EPOCH });
    await refreshSafeClinicalPages();
  })());
});

self.addEventListener('message', event => {
  const type = event.data && event.data.type;
  if (type === 'WARM_PRIVATE_DATA') event.waitUntil(warmPrivateData());
  if (type === 'CLEAR_PRIVATE_DATA') event.waitUntil(clearPrivateData());
  if (type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (type === 'GET_CACHE_STATUS') {
    event.waitUntil((async () => {
      const cache = await caches.open(PRIVATE_CACHE);
      const keys = await cache.keys();
      event.source?.postMessage({ type: 'MEDINDEX_CACHE_STATUS', state: keys.length >= 3 ? 'ready' : 'limited', cached: keys.length });
    })());
  }
});

async function refreshPage(request, key) {
  try {
    const response = await timeoutFetch(new Request(request, { cache: 'no-store' }));
    if (response.ok) await putIfCacheable(PAGE_CACHE, key, response, { key });
    return response;
  } catch {
    return null;
  }
}

async function navigationResponse(event) {
  const request = event.request;
  const url = new URL(request.url);
  const key = navigationKey(url);
  const cache = await caches.open(PAGE_CACHE);

  const fresh = await refreshPage(request, key);
  if (fresh) return cloneWithHeader(fresh, 'X-MedIndex-Cache', 'page-network');

  const cached = await cache.match(key) || await caches.match(key, { ignoreSearch: true });
  if (cached) return cloneWithHeader(cached, 'X-MedIndex-Cache', 'page-hit');

  return await caches.match('/index.html') || await caches.match('/login.html') || Response.error();
}

async function staticResponse(event) {
  const request = event.request;
  try {
    const fresh = await timeoutFetch(new Request(request, { cache: 'no-cache' }), STATIC_NETWORK_TIMEOUT_MS);
    if (fresh.ok) await putIfCacheable(STATIC_CACHE, request, fresh);
    return cloneWithHeader(fresh, 'X-MedIndex-Cache', 'static-network');
  } catch {
    const exact = await caches.match(request);
    if (exact) return cloneWithHeader(exact, 'X-MedIndex-Cache', 'static-hit');
    const pathFallback = await caches.match(requestFor(new URL(request.url).pathname));
    return pathFallback ? cloneWithHeader(pathFallback, 'X-MedIndex-Cache', 'static-hit') : Response.error();
  }
}

async function refreshPrivate(request, key) {
  try {
    const response = await timeoutFetch(new Request(request, { cache: 'no-store' }));
    if (response.status === 401 || response.status === 403) {
      await broadcast({ type: 'MEDINDEX_AUTH_INVALID' });
      return response;
    }
    if (response.ok) await putIfCacheable(PRIVATE_CACHE, key, response, { key });
    return response;
  } catch {
    return null;
  }
}

function privateFallback(url) {
  if (url.pathname === '/api/registry' || url.pathname === '/data/registry-data.js') {
    return new Response('window.REGISTRY_LOAD_ERROR="Nuk ka kopje lokale të regjistrit.";window.DRUG_DATA_PARTS=[];', {
      status: 503,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'X-MedIndex-Offline': '1' },
    });
  }
  return new Response(JSON.stringify({
    error: 'Këto të dhëna nuk janë sinkronizuar ende për përdorim offline.',
    forms: [], adult: [], pediatric: [], offline: true,
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-MedIndex-Offline': '1' },
  });
}

async function privateDataResponse(event, url) {
  const request = event.request;
  const key = normalizedPrivateKey(url);
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(key);
  if (cached) {
    event.waitUntil(refreshPrivate(request, key));
    return cloneWithHeader(cached, 'X-MedIndex-Cache', 'private-hit');
  }
  const response = await refreshPrivate(request, key);
  return response || privateFallback(url);
}

async function manifestResponse(event) {
  const request = event.request;
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true }) || await caches.match(request, { ignoreSearch: true });
  if (cached) {
    event.waitUntil(fetch(new Request(request, { cache: 'no-store' }))
      .then(response => response.ok ? cache.put(request, response.clone()) : null)
      .catch(() => null));
    return cloneWithHeader(cached, 'X-MedIndex-Cache', 'manifest-hit');
  }
  try {
    const response = await timeoutFetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

async function queryDataResponse(event, url) {
  const request = event.request;
  const key = queryKey(url);
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(key);
  if (cached) {
    event.waitUntil(fetch(request)
      .then(response => putIfCacheable(PRIVATE_CACHE, key, response, { key, limit: MAX_QUERY_RESPONSES }))
      .catch(() => null));
    return cloneWithHeader(cached, 'X-MedIndex-Cache', 'query-hit');
  }
  try {
    const response = await timeoutFetch(request);
    return putIfCacheable(PRIVATE_CACHE, key, response, { key, limit: MAX_QUERY_RESPONSES });
  } catch {
    return new Response(JSON.stringify({ error:'Kërkimi online nuk është i disponueshëm.', results:[], offline:true }), {
      status:503,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'X-MedIndex-Offline':'1' },
    });
  }
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header || '');
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function rangedResponse(response, rangeHeader) {
  const buffer = await response.arrayBuffer();
  const range = parseRange(rangeHeader, buffer.byteLength);
  if (!range) return new Response(null, { status:416, headers:{ 'Content-Range':`bytes */${buffer.byteLength}` } });
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${buffer.byteLength}`);
  headers.set('Content-Length', String(range.end - range.start + 1));
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-MedIndex-Cache', 'document-hit');
  return new Response(buffer.slice(range.start, range.end + 1), { status:206, headers });
}

async function refreshDocument(fullRequest) {
  try {
    const response = await fetch(new Request(fullRequest, { cache:'no-store' }));
    return putIfCacheable(DOCUMENT_CACHE, fullRequest, response, { limit:MAX_DOCUMENTS });
  } catch {
    return null;
  }
}

async function protocolDocumentResponse(event) {
  const request = event.request;
  const cache = await caches.open(DOCUMENT_CACHE);
  const fullRequest = requestFor(request.url);
  const rangeHeader = request.headers.get('range');
  const cached = await cache.match(fullRequest);
  if (cached) {
    event.waitUntil(refreshDocument(fullRequest));
    return rangeHeader ? rangedResponse(cached.clone(), rangeHeader) : cloneWithHeader(cached, 'X-MedIndex-Cache', 'document-hit');
  }
  if (rangeHeader) {
    try {
      const response = await fetch(request);
      event.waitUntil(refreshDocument(fullRequest));
      return response;
    } catch {
      return new Response('Dokumenti nuk është ruajtur ende për përdorim offline.', { status:503, headers:{ 'Content-Type':'text/plain; charset=utf-8' } });
    }
  }
  const response = await refreshDocument(fullRequest);
  return response || new Response('Dokumenti nuk është ruajtur ende për përdorim offline.', {
    status:503,
    headers:{ 'Content-Type':'text/plain; charset=utf-8', 'X-MedIndex-Offline':'1' },
  });
}

async function geminiResponse(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({
      error:'Gemini kërkon internet. Receta mund të formatohet lokalisht pa AI.',
      offline:true,
    }), {
      status:503,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'X-MedIndex-Offline':'1' },
    });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;

  if (url.pathname === '/api/auth') return event.respondWith(fetch(request));
  if (url.pathname === '/api/gemini-prescription') return event.respondWith(geminiResponse(request));
  if (url.pathname === '/api/protocol-document') return event.respondWith(protocolDocumentResponse(event));
  if (PRIVATE_DATA_PATHS.has(url.pathname)) return event.respondWith(privateDataResponse(event, url));
  if (QUERY_DATA_PATHS.has(url.pathname)) return event.respondWith(queryDataResponse(event, url));
  if (url.pathname === '/data/protocols.json') return event.respondWith(manifestResponse(event));
  if (request.mode === 'navigate') return event.respondWith(navigationResponse(event));
  if (/\.(?:css|js|json|txt|svg|png|jpe?g|webp|ico|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(staticResponse(event));
  }
});
