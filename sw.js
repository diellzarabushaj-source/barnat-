/* MedIndex offline-first service worker
 * Base UI commit: 5a3e284e96f84d54f3a5e5f60a86647797338e3d
 */
'use strict';

const VERSION = '5a3e284e-offline-v1';
const STATIC_CACHE = `medindex-static-${VERSION}`;
const PAGE_CACHE = `medindex-pages-${VERSION}`;
const PRIVATE_CACHE = `medindex-private-${VERSION}`;
const DOCUMENT_CACHE = `medindex-documents-${VERSION}`;
const ALL_CACHES = [STATIC_CACHE, PAGE_CACHE, PRIVATE_CACHE, DOCUMENT_CACHE];
const NETWORK_TIMEOUT_MS = 2600;
const MAX_DOCUMENTS = 16;

const APP_SHELL = [
  '/', '/index.html', '/klasifikimi.html', '/icd.html', '/analizat.html',
  '/dozologjia.html', '/protokollet.html', '/recetat.html', '/login.html',
  '/manifest.webmanifest', '/medindex-icon.svg',
  '/styles.css', '/ui-controls.css', '/loader.css', '/app-polish.css',
  '/performance.css', '/clean-medindex-ui.css', '/tailadmin-medindex.css',
  '/tailadmin-professional.css', '/medical-hub.css', '/clinical-density.css',
  '/classification.css', '/classification-nav-fix.css', '/registry-quality.css',
  '/clinical-reference.css', '/analizat-polish.css', '/recetat.css',
  '/recetat-audit.css', '/signature-templates.css', '/login.css',
  '/tailadmin-shell.js', '/tailadmin-professional.js', '/offline-runtime.js',
  '/auth-client.js', '/app-stability.js', '/app.js', '/ui-enhancements.js',
  '/name-display.js', '/medical-icons.js', '/section-icons.js',
  '/classification-icons.js', '/classification-data.js',
  '/classification-registry-bridge.js', '/classification-v3.js',
  '/classification-audit-view.js', '/classification-info-v3.js',
  '/icd-data.js', '/icd.js', '/lab-sheet-data.js', '/analizat.js',
  '/clinical-dialog.js', '/dosage-engine.js', '/dozologjia.js',
  '/protokollet.js', '/prescription-format-core.js',
  '/signature-templates.js', '/recetat.js', '/login.js',
  '/data/registry-quality.js', '/data/protocols.json',
  '/app-parts/part-01.txt', '/app-parts/part-02.txt',
  '/app-parts/part-03.txt', '/app-parts/part-04.txt', '/app-parts/core-tail.txt'
];

const PRIVATE_DATA_PATHS = new Set(['/api/registry', '/data/registry-data.js', '/api/dosage']);

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function timeoutFetch(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function normalizedPrivateKey(url) {
  const path = url.pathname === '/data/registry-data.js' ? '/api/registry' : url.pathname;
  return new Request(`${self.location.origin}${path}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: path === '/api/registry' ? 'application/javascript' : 'application/json' }
  });
}

function cloneWithHeader(response, name, value) {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function putIfCacheable(cacheName, request, response, options = {}) {
  if (!response || !response.ok || response.status === 206) return response;
  if (response.type !== 'basic' && response.type !== 'default') return response;
  const cache = await caches.open(cacheName);
  await cache.put(options.key || request, response.clone());
  if (options.limit) await trimCache(cache, options.limit);
  return response;
}

async function trimCache(cache, limit) {
  const keys = await cache.keys();
  while (keys.length > limit) {
    await cache.delete(keys.shift());
  }
}

async function precacheShell() {
  const cache = await caches.open(STATIC_CACHE);
  const results = await Promise.allSettled(APP_SHELL.map(async path => {
    const request = new Request(path, { cache: 'reload', credentials: 'same-origin' });
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response);
  }));
  return results.filter(result => result.status === 'fulfilled').length;
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage(message));
}

async function warmPrivateData() {
  await broadcast({ type: 'MEDINDEX_CACHE_STATUS', state: 'syncing' });
  const cache = await caches.open(PRIVATE_CACHE);
  let cached = 0;
  for (const path of ['/api/registry', '/api/dosage', '/data/protocols.json']) {
    try {
      const request = new Request(path, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: path.includes('registry') ? 'application/javascript' : 'application/json' }
      });
      const response = await fetch(request);
      if (response.status === 401) break;
      if (!response.ok) continue;
      const key = path === '/data/protocols.json' ? request : normalizedPrivateKey(new URL(request.url));
      await cache.put(key, response.clone());
      cached += 1;
    } catch (_) {}
  }
  await broadcast({ type: 'MEDINDEX_CACHE_STATUS', state: cached ? 'ready' : 'limited', cached });
  return cached;
}

async function clearPrivateData() {
  await Promise.all([caches.delete(PRIVATE_CACHE), caches.delete(DOCUMENT_CACHE)]);
  await broadcast({ type: 'MEDINDEX_CACHE_STATUS', state: 'cleared' });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const count = await precacheShell();
    await self.skipWaiting();
    await broadcast({ type: 'MEDINDEX_CACHE_STATUS', state: 'shell-ready', cached: count });
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('medindex-') && !ALL_CACHES.includes(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const type = event.data && event.data.type;
  if (type === 'WARM_PRIVATE_DATA') event.waitUntil(warmPrivateData());
  if (type === 'CLEAR_PRIVATE_DATA') event.waitUntil(clearPrivateData());
  if (type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

async function navigationResponse(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await timeoutFetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request, { ignoreSearch: true }))
      || (await caches.match(request, { ignoreSearch: true }))
      || (await caches.match('/index.html'))
      || Response.error();
  }
}

async function staticResponse(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    const refresh = fetch(request)
      .then(response => putIfCacheable(STATIC_CACHE, request, response))
      .catch(() => null);
    self.waitUntil ? self.waitUntil(refresh) : void refresh;
    return cached;
  }
  const response = await fetch(request);
  return putIfCacheable(STATIC_CACHE, request, response);
}

async function privateDataResponse(request, url) {
  const key = normalizedPrivateKey(url);
  const cache = await caches.open(PRIVATE_CACHE);
  try {
    const response = await timeoutFetch(request, 3200);
    if (response.status === 401 || response.status === 403) return response;
    if (response.ok) {
      await cache.put(key, response.clone());
      return response;
    }
    const fallback = await cache.match(key);
    return fallback ? cloneWithHeader(fallback, 'X-MedIndex-Offline', '1') : response;
  } catch (_) {
    const fallback = await cache.match(key);
    if (fallback) return cloneWithHeader(fallback, 'X-MedIndex-Offline', '1');
    if (url.pathname === '/api/registry' || url.pathname === '/data/registry-data.js') {
      return new Response('window.REGISTRY_LOAD_ERROR="Nuk ka kopje lokale të regjistrit.";window.DRUG_DATA_PARTS=[];', {
        status: 503,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'X-MedIndex-Offline': '1' }
      });
    }
    return new Response(JSON.stringify({
      error: 'Dozologjia nuk është sinkronizuar ende për përdorim offline.',
      forms: [], adult: [], pediatric: [], offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-MedIndex-Offline': '1' }
    });
  }
}

async function manifestResponse(request) {
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  try {
    const response = await timeoutFetch(request, 2200);
    if (response.ok) await cache.put(request, response.clone());
    return response.ok ? response : (cached || response);
  } catch (_) {
    return cached || (await caches.match(request, { ignoreSearch: true })) || Response.error();
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
  if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buffer.byteLength}` } });
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${buffer.byteLength}`);
  headers.set('Content-Length', String(range.end - range.start + 1));
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-MedIndex-Offline', '1');
  return new Response(buffer.slice(range.start, range.end + 1), { status: 206, headers });
}

async function protocolDocumentResponse(request) {
  const cache = await caches.open(DOCUMENT_CACHE);
  const fullRequest = new Request(request.url, { credentials: 'same-origin' });
  const rangeHeader = request.headers.get('range');
  const cached = await cache.match(fullRequest);
  if (cached) return rangeHeader ? rangedResponse(cached.clone(), rangeHeader) : cloneWithHeader(cached, 'X-MedIndex-Offline', '1');

  if (rangeHeader) {
    const networkResponse = await fetch(request);
    const fullDownload = fetch(fullRequest)
      .then(response => putIfCacheable(DOCUMENT_CACHE, fullRequest, response, { limit: MAX_DOCUMENTS }))
      .catch(() => null);
    void fullDownload;
    return networkResponse;
  }

  try {
    const response = await fetch(request);
    return putIfCacheable(DOCUMENT_CACHE, fullRequest, response, { limit: MAX_DOCUMENTS });
  } catch (_) {
    return new Response('Dokumenti nuk është ruajtur ende për përdorim offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-MedIndex-Offline': '1' }
    });
  }
}

async function geminiResponse(request) {
  try {
    return await fetch(request);
  } catch (_) {
    return new Response(JSON.stringify({
      error: 'Gemini kërkon internet. Receta mund të formatohet lokalisht pa AI.',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-MedIndex-Offline': '1' }
    });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;

  if (url.pathname === '/api/auth') {
    event.respondWith(fetch(request));
    return;
  }
  if (url.pathname === '/api/gemini-prescription') {
    event.respondWith(geminiResponse(request));
    return;
  }
  if (url.pathname === '/api/protocol-document') {
    event.respondWith(protocolDocumentResponse(request));
    return;
  }
  if (PRIVATE_DATA_PATHS.has(url.pathname)) {
    event.respondWith(privateDataResponse(request, url));
    return;
  }
  if (url.pathname === '/data/protocols.json') {
    event.respondWith(manifestResponse(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (/\.(?:css|js|json|txt|svg|png|jpe?g|webp|ico|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(staticResponse(request));
  }
});
