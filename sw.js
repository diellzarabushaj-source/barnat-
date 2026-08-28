/* MedIndex physician-first offline service worker */
'use strict';

const VERSION = 'production-audit-v2';
const CACHE_EPOCH = 'clinical-knowledge-20260829-emergency-v10';
const CACHE_NAMESPACE = `${VERSION}-${CACHE_EPOCH}`;
const STATIC_CACHE = `medindex-static-${CACHE_NAMESPACE}`;
const PAGE_CACHE = `medindex-pages-${CACHE_NAMESPACE}`;
const PRIVATE_CACHE = `medindex-private-${CACHE_NAMESPACE}`;
const DOCUMENT_CACHE = `medindex-documents-${CACHE_NAMESPACE}`;
const ALL_CACHES = [STATIC_CACHE, PAGE_CACHE, PRIVATE_CACHE, DOCUMENT_CACHE];
const NETWORK_TIMEOUT_MS = 4500;
const STATIC_NETWORK_TIMEOUT_MS = 3200;
const MAX_DOCUMENTS = 16;
const MAX_QUERY_RESPONSES = 40;

const APP_SHELL = [
  '/', '/index.html', '/klasifikimi.html', '/icd.html', '/analizat.html',
  '/dozologjia.html', '/urgjencat.html', '/protokollet.html', '/medical-hub.html', '/recetat.html',
  '/login-v2.html', '/login-v2.css', '/login-v2.js', '/login-v2-canvas.js', '/login.html',
  '/manifest.webmanifest', '/medindex-icon.svg',
  '/brand/drx-horizontal-on-dark.svg', '/brand/drx-mark-on-light.svg', '/fonts/inter-latin-variable-normal.woff2',
  '/styles.css', '/ui-controls.css', '/loader.css', '/app-polish.css',
  '/performance.css', '/clean-medindex-ui.css', '/tailadmin-medindex.css',
  '/tailadmin-professional.css', '/registry-table-tools.css', '/medical-hub.css', '/clinical-knowledge.css', '/clinical-density.css',
  '/classification.css', '/classification-nav-fix.css', '/registry-quality.css',
  '/clinical-reference.css', '/analizat-v2.css', '/drx-dashboard-stripe.css',
  '/protokollet-v2.css', '/recetat-v2.css', '/dozologjia-v2.css', '/urgjencat-v2.css',
  '/icd-premium-cards.css', '/icd-clinical-workspace.css', '/icd-tailadmin-cards-v2.css',
  
  '/signature-templates.css', '/login.css',
  '/tailadmin-shell.js', '/tailadmin-shell-legacy.js', '/tailadmin-professional.js',
  '/mobile-experience.js', '/offline-runtime.js', '/clinical-workflow.js',
  '/local-registry.js', '/local-registry-fidelity.js', '/auth-client.js',
  '/app-stability.js', '/app.js', '/app-runtime.js', '/theme-preload.js', '/registry-table-tools.js',
  '/ui-enhancements.js', '/name-display.js',
  '/medical-icons.js', '/section-icons.js', '/classification-icons.js',
  '/classification-data.js', '/classification-registry-bridge.js',
  '/classification-v3.js', '/classification-audit-view.js',
  '/classification-info-v3.js', '/icd-data.js', '/icd.js',
  '/icd-premium-cards.js', '/icd-clinical-workspace.js',
  '/icd-clinical-style-loader.js', '/icd-tailadmin-card-style-loader.js',
  '/analizat-v2.js', '/dozologjia-v2.js', '/urgjencat-v2.js', '/sidebar-taxonomy-v3.js', '/medindex-brand-runtime.js',
  '/clinical-dialog.js', '/dosage-engine.js',
  '/dozologjia-deep-audit.js', '/sanity-clinical-client.js', '/medical-hub.js', '/protokollet-v2.js', '/recetat-v2.js',
  '/prescription-format-core.js', '/signature-templates.js',
  '/login.js', '/data/registry-quality.js',
  '/data/protocols.json'
];

const PRIVATE_DATA_PATHS = new Set([
  '/api/registry', '/data/registry-data.js', '/api/dosage'
]);
const QUERY_DATA_PATHS = new Set(['/api/drug-search', '/api/icd']);
const SAFE_AUTO_REFRESH_PATHS = new Set(['/icd.html', '/analizat.html']);
const REQUIRED_PRIVATE_PATHS = ['/api/registry', '/api/dosage', '/data/protocols.json'];

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function timeoutFetch(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal:controller.signal }).finally(() => clearTimeout(timer));
}

function requestFor(pathOrUrl, options = {}) {
  const url = new URL(pathOrUrl, self.location.origin);
  return new Request(url.href, {
    method:'GET',
    credentials:'same-origin',
    headers:options.headers || undefined,
  });
}

function navigationKey(url) {
  return requestFor(url.pathname === '/' ? '/index.html' : url.pathname);
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

function cloneWithHeader(response, name, value) {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(response.clone().body, {
    status:response.status,
    statusText:response.statusText,
    headers,
  });
}

async function trimCache(cache, limit) {
  const keys = await cache.keys();
  while (keys.length > limit) await cache.delete(keys.shift());
}

async function putIfCacheable(cacheName, request, response, options = {}) {
  if (!response?.ok || response.status === 206) return response;
  if (!['basic', 'default'].includes(response.type)) return response;
  const cache = await caches.open(cacheName);
  await cache.put(options.key || request, response.clone());
  if (options.limit) await trimCache(cache, options.limit);
  return response;
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  clients.forEach(client => client.postMessage(message));
}

async function precacheShell() {
  const cache = await caches.open(STATIC_CACHE);
  const results = await Promise.allSettled(APP_SHELL.map(async path => {
    const request = requestFor(path);
    const response = await fetch(new Request(request, { cache:'reload' }));
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    await cache.put(request, response.clone());
    return path;
  }));
  return {
    cached:results.filter(result => result.status === 'fulfilled').length,
    failed:results.filter(result => result.status === 'rejected').length,
  };
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

async function warmPrivateData() {
  await broadcast({ type:'MEDINDEX_CACHE_STATUS', state:'syncing' });
  const cache = await caches.open(PRIVATE_CACHE);
  const required = REQUIRED_PRIVATE_PATHS;
  const optional = ['/api/icd'];
  let cached = 0;
  for (const path of [...required, ...optional]) {
    try {
      const isRegistry = path === '/api/registry';
      const request = requestFor(path, { headers:{ Accept:isRegistry ? 'application/javascript' : 'application/json' } });
      const response = await fetch(new Request(request, { cache:'no-store' }));
      if ([401, 403].includes(response.status)) {
        await broadcast({ type:'MEDINDEX_AUTH_INVALID' });
        break;
      }
      if (!response.ok) continue;
      const key = path === '/data/protocols.json' ? manifestKey() : normalizedPrivateKey(new URL(request.url));
      await cache.put(key, response.clone());
      cached += 1;
    } catch {}
  }
  const status = await privateCacheStatus();
  await broadcast({ type:'MEDINDEX_CACHE_STATUS', ...status, syncedAt:Date.now() });
  return cached;
}

async function clearPrivateData() {
  await Promise.all([caches.delete(PRIVATE_CACHE), caches.delete(DOCUMENT_CACHE)]);
  await broadcast({ type:'MEDINDEX_CACHE_STATUS', state:'cleared' });
}

async function refreshSafeClinicalPages() {
  const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  await Promise.all(clients.map(async client => {
    try {
      const url = new URL(client.url);
      if (url.origin === self.location.origin && SAFE_AUTO_REFRESH_PATHS.has(url.pathname)) await client.navigate(client.url);
    } catch {}
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const result = await precacheShell();
    await self.skipWaiting();
    await broadcast({
      type:'MEDINDEX_CACHE_STATUS',
      state:result.failed ? 'shell-limited' : 'shell-ready',
      cached:result.cached,
      failed:result.failed,
      cacheEpoch:CACHE_EPOCH,
    });
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('medindex-') && !ALL_CACHES.includes(name)).map(name => caches.delete(name)));
    await self.clients.claim();
    await broadcast({ type:'MEDINDEX_SHELL_UPDATED', cacheEpoch:CACHE_EPOCH });
    await refreshSafeClinicalPages();
  })());
});

self.addEventListener('message', event => {
  const type = event.data?.type;
  if (type === 'WARM_PRIVATE_DATA') event.waitUntil(warmPrivateData());
  if (type === 'CLEAR_PRIVATE_DATA') event.waitUntil(clearPrivateData());
  if (type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (type === 'GET_CACHE_STATUS') {
    event.waitUntil(privateCacheStatus().then(status => {
      event.source?.postMessage({ type:'MEDINDEX_CACHE_STATUS', ...status });
    }));
  }
});

async function navigationResponse(event) {
  const request = event.request;
  const key = navigationKey(new URL(request.url));
  try {
    const response = await timeoutFetch(new Request(request, { cache:'no-store' }));
    if (response.ok) event.waitUntil(putIfCacheable(PAGE_CACHE, key, response, { key }));
    return cloneWithHeader(response, 'X-MedIndex-Cache', 'page-network');
  } catch {
    const cache = await caches.open(PAGE_CACHE);
    const cached = await cache.match(key) || await caches.match(key, { ignoreSearch:true });
    if (cached) return cloneWithHeader(cached, 'X-MedIndex-Cache', 'page-hit');
    return await caches.match('/index.html')
      || await caches.match('/login-v2.html')
      || await caches.match('/login.html')
      || Response.error();
  }
}

async function staticResponse(event) {
  const request = event.request;
  try {
    const response = await timeoutFetch(new Request(request, { cache:'no-cache' }), STATIC_NETWORK_TIMEOUT_MS);
    if (response.ok) event.waitUntil(putIfCacheable(STATIC_CACHE, request, response));
    return cloneWithHeader(response, 'X-MedIndex-Cache', 'static-network');
  } catch {
    const cached = await caches.match(request) || await caches.match(requestFor(new URL(request.url).pathname));
    return cached ? cloneWithHeader(cached, 'X-MedIndex-Cache', 'static-hit') : Response.error();
  }
}

async function refreshPrivate(request, key) {
  try {
    const response = await timeoutFetch(new Request(request, { cache:'no-store' }));
    if ([401, 403].includes(response.status)) {
      await broadcast({ type:'MEDINDEX_AUTH_INVALID' });
      return response;
    }
    if (response.ok) await putIfCacheable(PRIVATE_CACHE, key, response, { key });
    return response;
  } catch {
    return null;
  }
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
    event.waitUntil(refreshPrivate(request, key));
    return cloneWithHeader(cached, 'X-MedIndex-Cache', 'private-hit');
  }
  const response = await refreshPrivate(request, key);
  return response || privateFallback(url);
}

async function manifestResponse(event) {
  const request = event.request;
  const key = manifestKey();
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(key, { ignoreSearch:true }) || await caches.match(request, { ignoreSearch:true });
  if (cached) {
    event.waitUntil(fetch(new Request(request, { cache:'no-store' })).then(response => response.ok ? cache.put(key, response.clone()) : null).catch(() => null));
    return cloneWithHeader(cached, 'X-MedIndex-Cache', 'manifest-hit');
  }
  try {
    const response = await timeoutFetch(request);
    if (response.ok) event.waitUntil(cache.put(key, response.clone()));
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
    event.waitUntil(fetch(request).then(response => putIfCacheable(PRIVATE_CACHE, key, response, { key, limit:MAX_QUERY_RESPONSES })).catch(() => null));
    return cloneWithHeader(cached, 'X-MedIndex-Cache', 'query-hit');
  }
  try {
    const response = await timeoutFetch(request);
    return putIfCacheable(PRIVATE_CACHE, key, response, { key, limit:MAX_QUERY_RESPONSES });
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
    return new Response(JSON.stringify({ error:'Gemini kërkon internet. Receta mund të formatohet lokalisht pa AI.', offline:true }), {
      status:503,
      headers:{ 'Content-Type':'application/json; charset=utf-8', 'X-MedIndex-Offline':'1' },
    });
  }
}

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
  if (request.mode === 'navigate') return event.respondWith(navigationResponse(event));
  /* Fontet duhen këtu bashkë me pjesën tjetër. Pa `woff2` në këtë listë,
     kërkesa e `@font-face` nuk kalon fare nga shërbyesi: shkon drejt rrjetit
     dhe offline dështon, sado e plotë të jetë lista e para-ruajtjes. Rezultati
     ishte se offline faqja e humbte Inter-in dhe binte te fonti i sistemit. */
  if (/\.(?:css|js|json|txt|svg|png|jpe?g|webp|ico|webmanifest|woff2?|ttf|otf)$/i.test(url.pathname)) event.respondWith(staticResponse(event));
});
