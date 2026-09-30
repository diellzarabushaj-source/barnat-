/* MedIndex physician-first offline service worker */
/* workspace-cache-cutover-v7: purge pre-v6 shell caches after canonical sidebar migration. */
'use strict';

const VERSION = 'workspace-coherence-v9-app-cache';
const CACHE_EPOCH = '20260914-registry-search-v1';
const CACHE_NAMESPACE = `${VERSION}-${CACHE_EPOCH}`;
const STATIC_CACHE = 'medindex-static-device-v1';
const PAGE_CACHE = 'medindex-pages-device-v1';
const PRIVATE_CACHE = 'medindex-private-device-v1';
const AUTH_CACHE = 'medindex-auth-device-v1';
const QUERY_INFLIGHT = new Map();
const WORKSPACE_INFLIGHT = new Map();
const REVALIDATE_MS = 6 * 60 * 60 * 1000;
let dataGeneration = 0;
let deviceOnline = true;
const DOCUMENT_CACHE = 'medindex-documents-device-v1';
const ALL_CACHES = [STATIC_CACHE, PAGE_CACHE, PRIVATE_CACHE, DOCUMENT_CACHE, AUTH_CACHE];
const NETWORK_TIMEOUT_MS = 4500;
const STATIC_NETWORK_TIMEOUT_MS = 3200;
const MAX_DOCUMENTS = 16;
const MAX_QUERY_RESPONSES = 400;

const APP_SHELL = [
  '/', '/index.html', '/klasifikimi.html', '/icd.html', '/analizat.html',
  '/dozologjia.html', '/urgjencat.html', '/protokollet.html', '/medical-hub.html', '/recetat.html', '/sistemi.html',
  '/antibiotiket.html', '/antibiotiket.css', '/antibiotiket.js', '/antibiotiket-data.js', '/antibiotiket-shell.js',
  '/login-v2.html', '/login-v2.css', '/login-v2.js', '/login-v2-canvas.js', '/login.html',
  '/manifest.webmanifest', '/medindex-icon.svg',
  '/brand/drx-horizontal-on-dark.svg', '/brand/drx-mark-on-light.svg', '/fonts/inter-latin-variable-normal.woff2',
  // Canonical standalone V2 shell assets — keep parity with the ten authenticated workspaces.
  '/registry-v2.css', '/registry-v2-dose-calculator.css', '/classification-v2.css', '/icd-v2.css', '/medical-hub-v2.css',
  '/dose-core.js', '/dose-runtime-browser.js', '/registry-v2.js', '/registry-v2-dose-calculator.js',
  '/classification-v2.js', '/icd-v2.js', '/phase9-personal-entities-client.js', '/medical-hub-v2.js',
  '/styles.css', '/ui-controls.css', '/loader.css', '/app-polish.css',
  '/performance.css', '/clean-medindex-ui.css', '/tailadmin-medindex.css',
  '/tailadmin-professional.css', '/registry-table-tools.css', '/medical-hub.css', '/clinical-knowledge.css', '/clinical-density.css',
  '/classification.css', '/classification-nav-fix.css', '/registry-quality.css',
  '/clinical-reference.css', '/analizat-v2.css', '/drx-dashboard-stripe.css',
  '/protokollet-v2.css', '/recetat-v2.css', '/dozologjia-v2.css', '/urgjencat-v2.css', '/sistemi-v2.css',
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
  '/sidebar-taxonomy-core-v3.js', '/protokollet-v2.js', '/recetat-v2.js', '/classification-v2.js',
  '/analizat-v2.js', '/dozologjia-v2.js', '/urgjencat-v2.js', '/sistemi-v2.js', '/sidebar-taxonomy-v3.js', '/medindex-brand-runtime.js',
  '/clinical-dialog.js', '/dosage-engine.js',
  '/sanity-clinical-client.js', '/medical-hub.js', '/protokollet-v2.js', '/recetat-v2.js',
  '/prescription-format-core.js', '/signature-templates.js',
  '/login.js', '/data/registry-quality.js',
  '/data/protocols.json'
];

const PRIVATE_DATA_PATHS = new Set([
  '/api/registry', '/data/registry-data.js', '/api/dosage'
]);
const QUERY_DATA_PATHS = new Set(['/api/drug-search', '/api/icd', '/api/medical-hub']);

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
  if (path === '/api/dosage') return queryKey(url);
  const accept = path === '/api/registry' ? 'application/javascript' : 'application/json';
  return requestFor(path, { headers:{ Accept:accept } });
}

function manifestKey() {
  return requestFor('/data/protocols.json', { headers:{ Accept:'application/json' } });
}

function queryKey(url) {
  const normalized = new URL(url.href);
  normalized.hash = '';
  normalized.searchParams.delete('__drx_worker');
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
  const headers = new Headers(response.headers);
  headers.set('X-DRx-Saved-At', String(Date.now()));
  try {
    await cache.put(options.key || request, new Response(response.clone().body, { status:response.status, headers }));
    if (options.limit) await trimCache(cache, options.limit);
  } catch {
    // Storage pressure must never turn a successful online read into an error.
    await broadcast({type:'MEDINDEX_CACHE_STATUS',state:'limited',storageFull:true});
  }
  return response;
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  clients.forEach(client => client.postMessage(message));
}

// Install only the shared shell. A workspace and its data are saved when opened;
// no hidden full-registry or full-dosage download competes with the first screen.
async function precacheShell() {
  const critical = ['/manifest.webmanifest', '/brand/drx-mark-on-light.svg',
    '/brand/drx-horizontal-on-dark.svg', '/fonts/inter-latin-variable-normal.woff2',
    '/sidebar-taxonomy-v3.js', '/sidebar-taxonomy-core-v3.js', '/drx-dashboard-stripe.css',
    '/brand/drx-app-192.png','/brand/drx-app-512.png','/brand/drx-app-maskable-512.png','/brand/drx-apple-touch-180.png'];
  const results = await Promise.allSettled(critical.map(async path => {
    const request = requestFor(path);
    const response = await timeoutFetch(request);
    if (!response.ok || response.redirected) throw new Error(path);
    await putIfCacheable(STATIC_CACHE, request, response);
  }));
  return { cached:results.filter(result => result.status === 'fulfilled').length,
    failed:results.filter(result => result.status === 'rejected').length };
}

async function authSnapshot() {
  const cache = await caches.open(AUTH_CACHE);
  const response = await cache.match(requestFor('/api/auth'));
  if (!response) return null;
  const snapshot = await response.json();
  return snapshot.expiresAt > Date.now() ? snapshot : null;
}

function offlineAuthResponse(saved) {
  return new Response(JSON.stringify(saved.payload), {headers:{'Content-Type':'application/json','X-MedIndex-Cache':'auth-offline'}});
}

async function authResponse(request) {
  if (request.method !== 'GET' || new URL(request.url).search) {
    const response = await fetch(request);
    if (request.method === 'DELETE' && response.ok) await clearPrivateData();
    return response;
  }
  const generation = dataGeneration;
  const localSession = await authSnapshot();
  if (localSession && !deviceOnline) return offlineAuthResponse(localSession);
  try {
    const response = await timeoutFetch(request, localSession ? 1200 : 4200);
    if (generation !== dataGeneration) return response;
    if ([401,403].includes(response.status)) await clearPrivateData();
    if (response.ok) {
      const payload = await response.clone().json();
      if (!payload.authenticated) await clearPrivateData();
      else if (payload.hardened === true && payload.sessionVersion === 3 && (payload.supabaseAuthenticated === true || payload.rollbackSession === true)) {
        const cache = await caches.open(AUTH_CACHE);
        const previous = await cache.match(requestFor('/api/auth'));
        const old = previous ? await previous.json() : null;
        const owner = String(payload.authUser?.id || payload.user?.email || '');
        if (old && old.owner !== owner) await clearPrivateData();
        // Never persist a credential, token, administrative grant or raw response.
        const safe = { authenticated:true, hardened:true, sessionVersion:3,
          supabaseAuthenticated:payload.supabaseAuthenticated === true,
          rollbackSession:payload.rollbackSession === true, offline:true,
          user:{name:payload.user?.name || '',email:payload.user?.email || ''},
          authUser:{id:payload.authUser?.id || ''} };
        const expiresAt = Date.now() + Math.min(8, Number(payload.sessionHours || 8)) * 3600000;
        const fresh = await caches.open(AUTH_CACHE);
        try { await fresh.put(requestFor('/api/auth'), new Response(JSON.stringify({ owner,expiresAt,payload:safe }))); } catch {}
      }
    }
    if (response.status >= 500) {
      const saved = await authSnapshot();
      if (saved) return offlineAuthResponse(saved);
    }
    return response;
  } catch (error) {
    const saved = await authSnapshot();
    if (!saved) throw error;
    return offlineAuthResponse(saved);
  }
}

async function privateCacheStatus() {
  const cache = await caches.open(PRIVATE_CACHE);
  const keys = await cache.keys();
  const pages = await (await caches.open(PAGE_CACHE)).keys();
  const responses = await Promise.all(keys.map(key => cache.match(key)));
  const savedAt = Math.max(0, ...responses.map(response => Number(response?.headers.get('X-DRx-Saved-At') || 0)));
  return {state:keys.length ? 'ready' : 'limited', cached:keys.length, pages:pages.length, savedAt, preparing:WORKSPACE_INFLIGHT.size > 0, required:0};
}

async function warmPrivateData() {
  // Compatibility with older tabs: report what is already saved, never reload
  // every dataset on a timer or reconnect.
  await broadcast({type:'MEDINDEX_CACHE_STATUS', ...await privateCacheStatus()});
}

async function clearPrivateData() {
  dataGeneration += 1;
  await Promise.all([caches.delete(PRIVATE_CACHE), caches.delete(DOCUMENT_CACHE), caches.delete(AUTH_CACHE), caches.delete(PAGE_CACHE)]);
  await broadcast({ type:'MEDINDEX_CACHE_STATUS', state:'cleared' });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const result = await precacheShell();
    await self.skipWaiting();
    await broadcast({
      type:'MEDINDEX_SHELL_STATUS',
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
    try { await authResponse(requestFor('/api/auth')); } catch {}
    await self.clients.claim();
    const windows = await self.clients.matchAll({type:'window'});
    await Promise.allSettled(windows.map(client => cacheWorkspace(new URL(client.url))));
    await broadcast({ type:'MEDINDEX_SHELL_UPDATED', cacheEpoch:CACHE_EPOCH });
    // Keep active workspaces and scroll position intact during an update.
  })());
});

async function cacheWorkspace(url, observed = []) {
  if (WORKSPACE_INFLIGHT.has(url.pathname)) return WORKSPACE_INFLIGHT.get(url.pathname);
  const pending = cacheWorkspaceFiles(url, observed).finally(async () => {
    WORKSPACE_INFLIGHT.delete(url.pathname);
    await broadcast({type:'MEDINDEX_CACHE_STATUS', ...await privateCacheStatus()});
  });
  WORKSPACE_INFLIGHT.set(url.pathname, pending);
  return pending;
}

async function cacheWorkspaceFiles(url, observed = []) {
  if (!sameOrigin(url) || !/\.html$/.test(url.pathname) && url.pathname !== '/') return;
  const response = await timeoutFetch(requestFor(url.href));
  if (!response.ok || response.redirected || !await authSnapshot()) return;
  const html = await response.clone().text();
  await putIfCacheable(PAGE_CACHE, navigationKey(url), response);
  const assets = [...html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => new URL(match[1].replace(/&amp;/g,'&'), url))
    .concat(observed.slice(0,80).map(value => new URL(value, url)))
    .filter(asset => sameOrigin(asset) && /\.(?:js|css|woff2|svg|png)$/.test(asset.pathname));
  // Recover the first page's resources from the HTTP cache; subsequent pages
  // are observed normally by fetch events. Two at a time protects slow links.
  for (let i = 0; i < assets.length; i += 2) await Promise.allSettled(assets.slice(i,i+2).map(async asset => {
    const request = requestFor(asset.href);
    const cache = await caches.open(STATIC_CACHE);
    if (await cache.match(request)) return;
    const result = await fetch(new Request(request,{cache:'force-cache'}));
    if (result.ok && !result.redirected) {
      await putIfCacheable(STATIC_CACHE, request, result);
      // Include explicit dynamic script dependencies (the shared core, profile
      // and personal-library client) which need not appear in the HTML.
      if (asset.pathname.endsWith('.js')) {
        const script = await result.clone().text();
        const knownPaths = new Set(assets.map(value => value.pathname));
        for (const match of script.matchAll(/['"](\/[^'"\s]+\.js(?:\?[^'"]*)?)['"]/g)) {
          const child = new URL(match[1], url);
          if (sameOrigin(child) && !knownPaths.has(child.pathname) && !child.pathname.startsWith('/sw') && !child.href.includes('$') && assets.length < 80) {
            knownPaths.add(child.pathname); assets.push(child);
          }
        }
      }
    }
  }));
  await broadcast({type:'MEDINDEX_WORKSPACE_SAVED', path:url.pathname});
  await broadcast({type:'MEDINDEX_CACHE_STATUS', ...await privateCacheStatus()});
}

async function rememberFirstRead(message) {
  const url = new URL(message.url);
  if (!sameOrigin(url)) return;
  let snapshot = await authSnapshot();
  if (!snapshot) { try { await authResponse(requestFor('/api/auth')); snapshot = await authSnapshot(); } catch {} }
  if (!snapshot || snapshot.owner !== message.owner) return;
  if (!QUERY_DATA_PATHS.has(url.pathname) && !PRIVATE_DATA_PATHS.has(url.pathname) && url.pathname !== '/data/protocols.json') return;
  if (typeof message.body !== 'string' || message.body.length > 8 * 1024 * 1024) return;
  const key = url.pathname === '/data/protocols.json' ? manifestKey() : PRIVATE_DATA_PATHS.has(url.pathname) ? normalizedPrivateKey(url) : queryKey(url);
  await putIfCacheable(PRIVATE_CACHE, key, new Response(message.body, {headers:{'Content-Type':'application/json'}}), {key,limit:MAX_QUERY_RESPONSES});
  await broadcast({type:'MEDINDEX_CACHE_STATUS', ...await privateCacheStatus()});
}

self.addEventListener('message', event => {
  const type = event.data?.type;
  if (type === 'SET_DEVICE_ONLINE') deviceOnline = event.data.online !== false;
  if (type === 'SAVE_WORKSPACE' && event.source?.url) event.waitUntil(cacheWorkspace(new URL(event.source.url), event.data.assets || []));
  if (type === 'REMEMBER_FIRST_READ') event.waitUntil(rememberFirstRead(event.data));
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
  const cache = await caches.open(PAGE_CACHE);
  const cached = await cache.match(key);
  const refresh = async () => {
    const response = await timeoutFetch(new Request(request, {cache:'no-cache'}), cached ? 1200 : NETWORK_TIMEOUT_MS);
    const finalPath = new URL(response.url || request.url).pathname;
    if (response.ok && !response.redirected && finalPath === new URL(request.url).pathname && await authSnapshot())
      await putIfCacheable(PAGE_CACHE, key, response, {key});
    return response;
  };
  if (cached) {
    event.waitUntil(refresh().catch(() => null));
    return cloneWithHeader(cached, 'X-MedIndex-Cache', 'page-hit');
  }
  try { return await refresh(); }
  catch { return new Response('<!doctype html><html lang="sq"><meta name="viewport" content="width=device-width"><title>DRx · Pa lidhje</title><body style="font:16px system-ui;padding:24px;color:#1c1e54"><h1>Kjo faqe ende nuk është ruajtur</h1><p>Hape një herë me internet për ta përdorur më vonë pa lidhje.</p><a href="/index.html">Kthehu te Barnat</a></body></html>', {status:503,headers:{'Content-Type':'text/html;charset=utf-8'}}); }
}

async function staticResponse(event) {
  const request = event.request;
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cloneWithHeader(cached, 'X-MedIndex-Cache', 'static-hit');
  try {
    const response = await timeoutFetch(new Request(request, {cache:'no-cache'}), STATIC_NETWORK_TIMEOUT_MS);
    if (response.ok && !response.redirected) await putIfCacheable(STATIC_CACHE, request, response);
    return response;
  } catch {
    // Only unversioned assets may use a precached pathname. A new version must
    // never silently receive older JavaScript or CSS.
    const fallback = !new URL(request.url).search && await cache.match(requestFor(new URL(request.url).pathname));
    return fallback || Response.error();
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

async function queryNetworkOnce(request, key) {
  let pending = QUERY_INFLIGHT.get(key.url);
  if (!pending) {
    const generation = dataGeneration;
    pending = (async () => {
      const cache = await caches.open(PRIVATE_CACHE);
      const previous = await cache.match(key);
      const headers = new Headers(request.headers);
      const etag = previous?.headers.get('ETag');
      const modified = previous?.headers.get('Last-Modified');
      if (etag) headers.set('If-None-Match', etag);
      else if (modified) headers.set('If-Modified-Since', modified);
      let response = await timeoutFetch(new Request(request, {headers}));
      if (response.status === 304 && previous) response = cloneWithHeader(previous, 'X-MedIndex-Cache', 'query-revalidated');
      if ([401,403].includes(response.status)) {
        await clearPrivateData();
        await broadcast({type:'MEDINDEX_AUTH_INVALID'});
      } else if (response.ok && generation === dataGeneration && await authSnapshot()) {
        await putIfCacheable(PRIVATE_CACHE, key, response, {key,limit:MAX_QUERY_RESPONSES});
        await broadcast({type:'MEDINDEX_CACHE_STATUS', ...await privateCacheStatus()});
      }
      return response;
    })().finally(() => QUERY_INFLIGHT.delete(key.url));
    QUERY_INFLIGHT.set(key.url, pending);
  }
  return (await pending).clone();
}

async function savedDataResponse(event, key) {
  const cache = await caches.open(PRIVATE_CACHE);
  const cached = await cache.match(key);
  const snapshot = await authSnapshot();
  const force = /no-cache/.test(event.request.headers.get('Cache-Control') || '');
  if (cached && snapshot && !force) {
    const savedAt = Number(cached.headers.get('X-DRx-Saved-At') || 0);
    if (deviceOnline && Date.now() - savedAt >= REVALIDATE_MS)
      event.waitUntil(queryNetworkOnce(event.request, key).catch(() => null));
    return cloneWithHeader(cached, 'X-MedIndex-Cache', 'query-local-hit');
  }
  try { return await queryNetworkOnce(event.request, key); }
  catch {
    if (cached && snapshot) return cloneWithHeader(cached, 'X-MedIndex-Cache', 'query-offline-hit');
    return new Response(JSON.stringify({error:'Këto të dhëna ende nuk janë ruajtur në këtë pajisje. Hapi një herë me internet.',rows:[],results:[],offline:true}),
      {status:503,headers:{'Content-Type':'application/json','X-MedIndex-Offline':'1'}});
  }
}

async function privateDataResponse(event, url) { return savedDataResponse(event, normalizedPrivateKey(url)); }
async function manifestResponse(event) { return savedDataResponse(event, manifestKey()); }
async function queryDataResponse(event, url) { return savedDataResponse(event, queryKey(url)); }

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
  if (cached && await authSnapshot()) {
    if (Date.now() - Number(cached.headers.get('X-DRx-Saved-At') || 0) >= REVALIDATE_MS) event.waitUntil(refreshDocument(fullRequest));
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

  if (url.pathname === '/api/auth') return event.respondWith(authResponse(request));
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
