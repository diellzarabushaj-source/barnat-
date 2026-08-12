'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'sw.js');
const MARKER = 'phase9-targeted-private-cache-v1';

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Phase 9 PWA patch could not find ${label}.`);
  source = source.replace(before, after);
}

if (!source.includes(MARKER)) {
  replaceOnce(
    `const MAX_QUERY_RESPONSES = 40;`,
    `const MAX_QUERY_RESPONSES = 40;\nconst PHASE9_CACHE_CONTRACT = '${MARKER}';`,
    'cache contract marker',
  );

  const shellAnchor = `  '/mobile-experience.js', '/offline-runtime.js', '/clinical-workflow.js',`;
  const shellReplacement = `  '/mobile-experience.js', '/offline-runtime.js', '/clinical-workflow.js',\n  '/registry-mobile-lite.css', '/registry-mobile-lite.js',\n  '/registry-mobile-phase3.css', '/registry-mobile-phase3.js',\n  '/registry-mobile-phase4.css', '/registry-mobile-phase4.js',\n  '/registry-mobile-phase8.css', '/registry-mobile-phase8.js', '/registry-runtime-loader.js',`;
  replaceOnce(shellAnchor, shellReplacement, 'mobile PWA shell assets');

  source = source.replace(
    `const REQUIRED_PRIVATE_PATHS = ['/api/registry', '/api/dosage', '/data/protocols.json'];`,
    `const REQUIRED_PRIVATE_PATHS = ['/api/registry', '/data/protocols.json'];`
  );
  if (source.includes(`const REQUIRED_PRIVATE_PATHS = ['/api/registry', '/api/dosage', '/data/protocols.json'];`)) {
    throw new Error('Phase 9 must not background-warm the full dosage payload.');
  }

  const queryKeyAnchor = `function queryKey(url) {\n  const normalized = new URL(url.href);\n  normalized.hash = '';\n  normalized.searchParams.sort();\n  return requestFor(normalized.href, { headers:{ Accept:'application/json' } });\n}`;
  const queryKeyReplacement = `${queryKeyAnchor}\n\nfunction isTargetedDosageRequest(url) {\n  return url.pathname === '/api/dosage' && url.searchParams.has('view');\n}`;
  replaceOnce(queryKeyAnchor, queryKeyReplacement, 'targeted dosage request classifier');

  const oldStatus = `  const checks = await Promise.all([\n    cache.match(normalizedPrivateKey(new URL('/api/registry', self.location.origin))),\n    cache.match(normalizedPrivateKey(new URL('/api/dosage', self.location.origin))),\n    cache.match(manifestKey(), { ignoreSearch:true }),\n  ]);`;
  const newStatus = `  const checks = await Promise.all([\n    cache.match(normalizedPrivateKey(new URL('/api/registry', self.location.origin))),\n    cache.match(manifestKey(), { ignoreSearch:true }),\n  ]);`;
  replaceOnce(oldStatus, newStatus, 'private cache readiness checks');

  const oldFallback = `    error:'Kërkimi online nuk është i disponueshëm.', results:[], offline:true`;
  const newFallback = `    error:'Kërkimi online nuk është i disponueshëm.', results:[], cards:[], adult:[], pediatric:[], ok:false, offline:true`;
  replaceOnce(oldFallback, newFallback, 'query offline fallback shape');

  const routingAnchor = `  if (url.pathname === '/api/protocol-document') return event.respondWith(protocolDocumentResponse(event));\n  if (PRIVATE_DATA_PATHS.has(url.pathname)) return event.respondWith(privateDataResponse(event, url));\n  if (QUERY_DATA_PATHS.has(url.pathname)) return event.respondWith(queryDataResponse(event, url));`;
  const routingReplacement = `  if (url.pathname === '/api/protocol-document') return event.respondWith(protocolDocumentResponse(event));\n  if (isTargetedDosageRequest(url)) return event.respondWith(queryDataResponse(event, url));\n  if (PRIVATE_DATA_PATHS.has(url.pathname)) return event.respondWith(privateDataResponse(event, url));\n  if (QUERY_DATA_PATHS.has(url.pathname)) return event.respondWith(queryDataResponse(event, url));`;
  replaceOnce(routingAnchor, routingReplacement, 'fetch routing precedence');
}

if (!source.includes(MARKER)) throw new Error('Phase 9 cache marker is missing.');
if (!source.includes("function isTargetedDosageRequest(url)")) throw new Error('Phase 9 targeted dosage classifier is missing.');
if (!source.includes("url.pathname === '/api/dosage' && url.searchParams.has('view')")) throw new Error('Phase 9 targeted dosage classifier is not query-aware.');
if (!source.includes("const REQUIRED_PRIVATE_PATHS = ['/api/registry', '/data/protocols.json'];")) throw new Error('Phase 9 private warm set is not lightweight.');
if (!source.includes("'/registry-mobile-phase8.css', '/registry-mobile-phase8.js', '/registry-runtime-loader.js'")) throw new Error('Phase 9 mobile shell is incomplete.');

const targetedRoute = source.indexOf('if (isTargetedDosageRequest(url))');
const privateRoute = source.indexOf('if (PRIVATE_DATA_PATHS.has(url.pathname))', targetedRoute);
if (targetedRoute < 0 || privateRoute < 0 || targetedRoute > privateRoute) {
  throw new Error('Phase 9 targeted dosage routing must run before generic private-data routing.');
}
if (!source.includes("const PRIVATE_DATA_PATHS = new Set([\n  '/api/registry', '/data/registry-data.js', '/api/dosage'")) {
  throw new Error('Phase 9 must preserve full /api/dosage compatibility when explicitly opened.');
}

fs.writeFileSync(TARGET, source, 'utf8');
console.log('Phase 9 PWA targeted dosage cache isolation, lightweight warm set and mobile shell precache passed.');
