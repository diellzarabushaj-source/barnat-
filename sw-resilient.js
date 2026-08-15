/* MedIndex resilient low-bandwidth service worker */
'use strict';

const VERSION = 'low-bandwidth-v3';
const STATIC_CACHE = `medindex-static-${VERSION}`;
const PAGE_CACHE = `medindex-pages-${VERSION}`;
const PRIVATE_CACHE = 'medindex-private-resilient-v2';
const DOCUMENT_CACHE = 'medindex-documents-resilient-v2';
const ALL_CACHES = [STATIC_CACHE, PAGE_CACHE, PRIVATE_CACHE, DOCUMENT_CACHE];
const MAX_QUERY_RESPONSES = 40;
const MAX_DOCUMENTS = 16;

const CORE_SHELL = [
  '/login-v2.html', '/login-v2.css', '/login-v2.js', '/login-v2-canvas.js',
  '/login.html', '/recovery.html', '/login.css', '/login.js', '/recovery.js',
  '/auth-client.js', '/offline-runtime.js', '/manifest.webmanifest', '/medindex-icon.svg',
];

/* Faqet ku përfundon një vizitor i pakyçur. Përdoret për të dalluar një
   ridrejtim drejt hyrjes nga faqja private që u kërkua. */
const LOGIN_PAGES = new Set(['/login-v2.html', '/login.html', '/recovery.html']);
const PRIVATE_PAGES = new Set([
  '/index.html', '/klasifikimi.html', '/icd.html', '/analizat.html',
  '/dozologjia.html', '/protokollet.html', '/recetat.html',
]);
const PRIVATE_DATA_PATHS = new Set([
  '/api/registry', '/data/registry-data.js', '/api/dosage',
]);
const QUERY_DATA_PATHS = new Set(['/api/drug-search', '/api/icd']);
const REQUIRED_PRIVATE_PATHS = ['/api/registry', '/api/dosage', '/data/protocols.json'];
let networkProfile = { online:true, slow:false, saveData:false };

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function canonicalPagePath(pathname) {
  return pathname === '/' ? '/index.html' : pathname;
}

function requestFor(pathOrUrl, options = {}) {
  const url = new URL(pathOrUrl, self.location.origin);
  return new Request(url.href, {
    method:options.method || 'GET',
    credentials:'same-origin',
    headers:options.headers || undefined,
  });
}

function timeoutFetch(request, normalMs = 10000, slowMs = 24000) {
  const controller = new AbortController();
  const timeoutMs = networkProfile.slow ? slowMs : normalMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(new Request(request, { signal:controller.signal })).finally(() => clearTimeout(timer));
}

function cloneWithHeader(response, value) {
  const headers = new Headers(response.headers);
  headers.set('X-MedIndex-Cache', value);
  return new Response(response.clone().body, {
    status:response.status,
    statusText:response.statusText,
    headers,
  });
}

function validHtmlResponse(response, expectedPath) {
  if (!response?.ok) return false;
  if (!String(response.headers.get('content-type') || '').includes('text/html')) return false;
  let finalPath = '';
  try { finalPath = canonicalPagePath(new URL(response.url).pathname); } catch { return false; }
  const expected = canonicalPagePath(expectedPath);
  if (PRIVATE_PAGES.has(expected) && LOGIN_PAGES.has(finalPath)) return false;
  if (response.redirected && finalPath !== expected) return false;
  return finalPath === expected || (expected === '/index.html' && finalPath === '/');
}

function normalizedPrivateKey(url) {
  const path = url.pathname === '/data/registry-data.js' ? '/api/registry' : url.pathname;
  const accept = path === '/api/registry' ? 'application/javascript' : 'application/json';
  return requestFor(path, { headers:{ Accept:accept } });
}

function manifestKey() {
  return requestFor('/data/protocols.json', { headers:{ Accept:'application/json' } });
}

function queryKey(url) {
  const normalized = new URL(url.href);
  normalized.hash = '';
  normalized.searchParams.sort();
  return requestFor(normalized.href, { headers:{ Accept:'application/json' } });
}

async function trimCache(cache, limit) {
  const keys = await cache.keys();
  while (keys.length > limit) await cache.delete(keys.shift());
}

async function putIfCacheable(cacheName, request, response, options = {}) {
  if (!response?.ok || response.status === 206 || response.type === 'opaque') return response;
  const cache = await caches.open(cacheName);
  await cache.put(options.key || request, response.clone());
  if (options.limit) await trimCache(cache, options.limit);
  return response;
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  clients.forEach(client => client.postMessage(message));
}

async function cacheCoreShell() {
  const cache = await caches.open(STATIC_CACHE);
  let cached = 0;
  let failed = 0;
  for (let index = 0; index < CORE_SHELL.length; index += 2) {
    const batch = CORE_SHELL.slice(index, index + 2);
    const results = await Promise.allSettled(batch.map(async path => {
      const request = requestFor(path);
      const response = await timeoutFetch(new Request(request, { cache:'reload' }), 6000, 14000);
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      await cache.put(request, response.clone());
    }));
    cached += results.filter(result => result.status === 'fulfilled').length;
    failed += results.filter(result => result.status === 'rejected').length;
  }
  return { cached, failed };
}

async function migratePrivateCaches() {
  const names = await caches.keys();
  const migrations = [
    ['medindex-private-', PRIVATE_CACHE],
    ['medindex-documents-', DOCUMENT_CACHE],
  ];
  for (const [prefix, targetName] of migrations) {
    const target = await caches.open(targetName);
    for (const name of names.filter(value => value.startsWith(prefix) && value !== targetName)) {
      const source = await caches.open(name);
      const keys = await source.keys();
      for (const key of keys) {
        if (await target.match(key)) continue;
        const response = await source.match(key);
        if (response) await target.put(key, response);
      }
    }
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const result = await cacheCoreShell();
    await self.skipWaiting();
    await broadcast({ type:'MEDINDEX_CACHE_STATUS', state:result.failed ? 'shell-limited' : 'shell-ready', ...result });
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await migratePrivateCaches();
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => (name.startsWith('medindex-static-') || name.startsWith('medindex-pages-')) && !ALL_CACHES.includes(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
    await broadcast({ type:'MEDINDEX_SHELL_UPDATED', version:VERSION });
  })());
});

async function refreshNavigation(request, key, expectedPath) {
  try {
    const response = await timeoutFetch(new Request(request, { cache:'no-store' }), 9000, 26000);
    if (validHtmlResponse(response, expectedPath)) await putIfCacheable(PAGE_CACHE, key, response, { key });
    return response;
  } catch { return null; }
}

async function navigationResponse(event, url) {
  const request = event.request;
  const expectedPath = canonicalPagePath(url.pathname);
  const key = requestFor(expectedPath);
  const cache = await caches.open(PAGE_CACHE);
  const cached = await cache.match(key) || await caches.match(key, { ignoreSearch:true });

  // The registry shell is build-sensitive. When online, always prefer a fresh index.html
  // so an older cached document cannot keep loading an older cohort of registry assets.
  if (expectedPath === '/index.html' && networkProfile.online) {
    const fresh = await refreshNavigation(request, key, expectedPath);
    if (fresh && validHtmlResponse(fresh, expectedPath)) return cloneWithHeader(fresh, 'registry-shell-network');
  }

  if (cached) {
    if (networkProfile.online && !networkProfile.saveData) event.waitUntil(refreshNavigation(request, key, expectedPath));
    return cloneWithHeader(cached, networkProfile.slow ? 'page-low-bandwidth-hit' : 'page-fast-hit');
  }
  const response = await refreshNavigation(request, key, expectedPath);
  if (response) return cloneWithHeader(response, 'page-network');
  return await caches.match('/login-v2.html')
    || await caches.match('/login.html')
    || await caches.match('/recovery.html')
    || Response.error();
}

async function refreshStatic(request) {
  try {
    const response = await timeoutFetch(new Request(request, { cache:'no-cache' }), 8000, 22000);
    if (response.ok) await putIfCacheable(STATIC_CACHE, request, response);
    return response;
  } catch { return null; }
}

async function staticResponse(event) {
  const request = event.request;
  const requestUrl = new URL(request.url);
  const buildPinned = requestUrl.searchParams.has('build');
  const cached = await caches.match(request);
  if (cached) {
    if (networkProfile.online && !networkProfile.slow && !networkProfile.saveData) event.waitUntil(refreshStatic(request));
    return cloneWithHeader(cached, 'static-fast-hit');
  }
  if (!networkProfile.online) {
    // Never disguise an older registry asset as the requested build. Exact-build cache or fail.
    if (buildPinned) return Response.error();
    const offlineFallback = await caches.match(request, { ignoreSearch:true });
    return offlineFallback ? cloneWithHeader(offlineFallback, 'static-offline-version-fallback') : Response.error();
  }
  const response = await refreshStatic(request);
  if (response) return cloneWithHeader(response, 'static-network');
  if (buildPinned) return Response.error();
  const offlineFallback = await caches.match(request, { ignoreSearch:true });
  return offlineFallback ? cloneWithHeader(offlineFallback, 'static-offline-version-fallback') : Response.error();
}

async function refreshPrivate(request, key) {
  try {
    const response = await timeoutFetch(new Request(request, { cache:'no-store' }), 12000, 30000);
    if ([401, 403].includes(response.status)) {
      await broadcast({ type:'MEDINDEX_AUTH_INVALID' });
      return response;
    }
    if (response.ok) await putIfCacheable(PRIVATE_CACHE, key, response, { key });
    return response;
  } catch { return null; }
}

function privateFallback(url) {
  if (['/api/registry', '/data/registry-data.js'].includes(url.pathname)) {
    return new Response('window.REGISTRY_LOAD_ERROR="Nuk ka kopje lokale të regjistrit.";\nwindow.DRUG_DATA_PARTS=[];\n', {
      status:503,
      headers:{ 'Content-Type':'application/javascript; charset=utf-8', 'X-MedIndex-Offline':'1' },
    });
  }
  return new Response(JSON.stringify({
    error:'Këto të dhëna nuk janë sinkronizuar ende për përdorim offline.',
    forms:[], adult:[], pediatric:[], cards:[], results:[], offline:true,
  }), {
    status:503,
    headers:{ 'Content-Type':'application/json; charset=utf-8', 'X-MedIndex-Offline':'1' },
  });
}

async function privateDataResponse(event, url) {
  const request = event.request;
  const key = normalizedPrivateKey(url);
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(key);
  if (cached) {
    if (networkProfile.online && !networkProfile.saveData) event.waitUntil(refreshPrivate(request, key));
    return cloneWithHeader(cached, 'private-fast-hit');
  }
  const response = await refreshPrivate(request, key);
  return response || privateFallback(url);
}

async function manifestResponse(event) {
  const request = event.request;
  const key = manifestKey();
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(key, { ignoreSearch:true });
  if (cached) {
    if (networkProfile.online && !networkProfile.saveData) event.waitUntil(refreshPrivate(request, key));
    return cloneWithHeader(cached, 'manifest-fast-hit');
  }
  const response = await refreshPrivate(request, key);
  return response || Response.error();
}

async function queryDataResponse(event, url) {
  const request = event.request;
  const key = queryKey(url);
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(key);
  if (cached) {
    if (networkProfile.online && !networkProfile.slow && !networkProfile.saveData) {
      event.waitUntil(refreshPrivate(request, key).then(response => response?.ok ? trimCache(cache, MAX_QUERY_RESPONSES) : null));
    }
    return cloneWithHeader(cached, 'query-fast-hit');
  }
  const response = await refreshPrivate(request, key);
  if (response) {
    await trimCache(cache, MAX_QUERY_RESPONSES);
    return response;
  }
  return new Response(JSON.stringify({ error:'Kërkimi online nuk është i disponueshëm.', results:[], offline:true }), {
    status:503,
    headers:{ 'Content-Type':'application/json; charset=utf-8', 'X-MedIndex-Offline':'1' },
  });
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
  return { start, end:Math.min(end, size - 1) };
}

async function rangedResponse(response, rangeHeader) {
  const buffer = await response.arrayBuffer();
  const range = parseRange(rangeHeader, buffer.byteLength);
  if (!range) return new Response(null, { status:416, headers:{ 'Content-Range':`bytes */${buffer.byteLength}` } });
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${buffer.byteLength}`);
  headers.set('Content-Length', String(range.end - range.start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(buffer.slice(range.start, range.end + 1), { status:206, headers });
}

async function protocolDocumentResponse(event) {
  const request = event.request;
  const fullRequest = requestFor(request.url);
  const cache = await caches.open(DOCUMENT_CACHE);
  const cached = await cache.match(fullRequest);
  const rangeHeader = request.headers.get('range');
  if (cached) {
    if (networkProfile.online && !networkProfile.slow && !networkProfile.saveData) {
      event.waitUntil(timeoutFetch(fullRequest, 15000, 35000).then(response => putIfCacheable(DOCUMENT_CACHE, fullRequest, response, { limit:MAX_DOCUMENTS })).catch(() => null));
    }
    return rangeHeader ? rangedResponse(cached.clone(), rangeHeader) : cloneWithHeader(cached, 'document-fast-hit');
  }
  try {
    const response = await timeoutFetch(request, 18000, 45000);
    if (response.ok && !rangeHeader) await putIfCacheable(DOCUMENT_CACHE, fullRequest, response, { limit:MAX_DOCUMENTS });
    return response;
  } catch {
    return new Response('Dokumenti nuk është ruajtur ende për përdorim offline.', { status:503, headers:{ 'Content-Type':'text/plain; charset=utf-8' } });
  }
}

async function warmPrivateData() {
  await broadcast({ type:'MEDINDEX_CACHE_STATUS', state:'syncing' });
  let cached = 0;
  for (const path of [...REQUIRED_PRIVATE_PATHS, '/api/icd']) {
    const isRegistry = path === '/api/registry';
    const request = requestFor(path, { headers:{ Accept:isRegistry ? 'application/javascript' : 'application/json' } });
    const key = path === '/data/protocols.json' ? manifestKey() : normalizedPrivateKey(new URL(request.url));
    const response = await refreshPrivate(request, key);
    if ([401, 403].includes(response?.status)) break;
    if (response?.ok) cached += 1;
    if (networkProfile.slow) await new Promise(resolve => setTimeout(resolve, 350));
  }
  const status = await privateCacheStatus();
  await broadcast({ type:'MEDINDEX_CACHE_STATUS', ...status, syncedAt:Date.now(), cached });
}

async function privateCacheStatus() {
  const cache = await caches.open(PRIVATE_CACHE);
  const checks = await Promise.all([
    cache.match(normalizedPrivateKey(new URL('/api/registry', self.location.origin))),
    cache.match(normalizedPrivateKey(new URL('/api/dosage', self.location.origin))),
    cache.match(manifestKey(), { ignoreSearch:true }),
  ]);
  const cached = checks.filter(Boolean).length;
  return { state:cached === REQUIRED_PRIVATE_PATHS.length ? 'ready' : 'limited', cached, required:REQUIRED_PRIVATE_PATHS.length };
}

async function clearPrivateData() {
  await Promise.all([caches.delete(PRIVATE_CACHE), caches.delete(DOCUMENT_CACHE)]);
  await broadcast({ type:'MEDINDEX_CACHE_STATUS', state:'cleared' });
}

async function geminiResponse(request) {
  try { return await timeoutFetch(request, 18000, 45000); }
  catch {
    return new Response(JSON.stringify({ error:'Gemini kërkon internet. Receta mund të formatohet lokalisht pa AI.', offline:true }), {
      status:503,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'X-MedIndex-Offline':'1' },
    });
  }
}

self.addEventListener('message', event => {
  const type = event.data?.type;
  if (type === 'SET_NETWORK_PROFILE') networkProfile = { ...networkProfile, ...(event.data.profile || {}) };
  if (type === 'WARM_PRIVATE_DATA') event.waitUntil(warmPrivateData());
  if (type === 'CLEAR_PRIVATE_DATA') event.waitUntil(clearPrivateData());
  if (type === 'GET_CACHE_STATUS') event.waitUntil(privateCacheStatus().then(status => event.source?.postMessage({ type:'MEDINDEX_CACHE_STATUS', ...status })));
  if (type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;
  if (url.pathname === '/api/auth') return event.respondWith(fetch(request));
  if (url.pathname === '/api/gemini-prescription') return event.respondWith(geminiResponse(request));
  if (request.method !== 'GET') return;
  if (url.pathname === '/api/protocol-document') return event.respondWith(protocolDocumentResponse(event));
  if (PRIVATE_DATA_PATHS.has(url.pathname)) return event.respondWith(privateDataResponse(event, url));
  if (QUERY_DATA_PATHS.has(url.pathname)) return event.respondWith(queryDataResponse(event, url));
  if (url.pathname === '/data/protocols.json') return event.respondWith(manifestResponse(event));
  if (request.mode === 'navigate') return event.respondWith(navigationResponse(event, url));
  if (/\.(?:css|js|json|txt|svg|png|jpe?g|webp|ico|webmanifest)$/i.test(url.pathname)) return event.respondWith(staticResponse(event));
});