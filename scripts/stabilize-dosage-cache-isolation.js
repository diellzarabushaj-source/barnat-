'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const MARKER = 'dosage-query-cache-isolation-v1';
const targets = ['sw-resilient.js', 'sw-resilient-v3.js'];
const block = (...lines) => lines.join('\n');

function replaceOnce(source, pattern, replacement, label, file) {
  if (!pattern.test(source)) throw new Error(`${file}: dosage cache isolation anchor missing: ${label}`);
  return source.replace(pattern, replacement);
}

function patchWorker(file) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) return false;
  let source = fs.readFileSync(target, 'utf8');
  if (source.includes(MARKER)) return false;

  source = replaceOnce(
    source,
    /const MAX_DOCUMENTS = 16;\n/,
    `const MAX_DOCUMENTS = 16;\nconst DOSAGE_CACHE_ISOLATION = '${MARKER}';\n`,
    'runtime marker',
    file,
  );

  source = replaceOnce(
    source,
    /function normalizedPrivateKey\(url\) \{[\s\S]*?\n\}\n\nfunction manifestKey/,
    block(
      'function normalizedPrivateKey(url) {',
      "  const path = url.pathname === '/data/registry-data.js' ? '/api/registry' : url.pathname;",
      "  const accept = path === '/api/registry' ? 'application/javascript' : 'application/json';",
      '',
      "  if (path === '/api/dosage') {",
      '    const normalized = new URL(url.href);',
      '    normalized.pathname = path;',
      "    normalized.hash = '';",
      '    normalized.searchParams.sort();',
      '    return requestFor(normalized.href, { headers:{ Accept:accept } });',
      '  }',
      '',
      '  return requestFor(path, { headers:{ Accept:accept } });',
      '}',
      '',
      'function manifestKey',
    ),
    'query-aware private cache key',
    file,
  );

  source = replaceOnce(
    source,
    /    await migratePrivateCaches\(\);\n    const names = await caches\.keys\(\);/,
    block(
      '    await migratePrivateCaches();',
      '    // Remove the legacy bare /api/dosage entry. Older workers ignored query',
      '    // parameters, so one registry page could receive dosage cards from another.',
      '    const privateCache = await caches.open(PRIVATE_CACHE);',
      "    await privateCache.delete(requestFor('/api/dosage', { headers:{ Accept:'application/json' } }));",
      '    const names = await caches.keys();',
    ),
    'legacy dosage cache eviction',
    file,
  );

  source = replaceOnce(
    source,
    /async function manifestResponse\(event\) \{/,
    block(
      'async function dosageDataResponse(event, url) {',
      '  const request = event.request;',
      '  const key = normalizedPrivateKey(url);',
      '  const cache = await caches.open(PRIVATE_CACHE);',
      '',
      '  // Dosage is clinical data: while online, prefer the exact network request',
      '  // instead of stale-while-revalidate. The cache is only a fallback for an',
      '  // actual network failure and is isolated by the complete sorted query.',
      '  if (networkProfile.online) {',
      '    const response = await refreshPrivate(request, key);',
      "    if (response) return cloneWithHeader(response, 'dosage-network');",
      '  }',
      '',
      '  const cached = await cache.match(key);',
      "  if (cached) return cloneWithHeader(cached, 'dosage-query-hit');",
      '  return privateFallback(url);',
      '}',
      '',
      'async function manifestResponse(event) {',
    ),
    'dosage network-first response',
    file,
  );

  source = replaceOnce(
    source,
    /  if \(url\.pathname === '\/api\/protocol-document'\) return event\.respondWith\(protocolDocumentResponse\(event\)\);\n  if \(PRIVATE_DATA_PATHS\.has\(url\.pathname\)\) return event\.respondWith\(privateDataResponse\(event, url\)\);/,
    block(
      "  if (url.pathname === '/api/protocol-document') return event.respondWith(protocolDocumentResponse(event));",
      "  if (url.pathname === '/api/dosage') return event.respondWith(dosageDataResponse(event, url));",
      '  if (PRIVATE_DATA_PATHS.has(url.pathname)) return event.respondWith(privateDataResponse(event, url));',
    ),
    'dosage fetch routing',
    file,
  );

  const required = [
    `const DOSAGE_CACHE_ISOLATION = '${MARKER}'`,
    "if (path === '/api/dosage')",
    'normalized.searchParams.sort();',
    'async function dosageDataResponse(event, url)',
    "cloneWithHeader(response, 'dosage-network')",
    "cloneWithHeader(cached, 'dosage-query-hit')",
    "privateCache.delete(requestFor('/api/dosage'",
    "if (url.pathname === '/api/dosage') return event.respondWith(dosageDataResponse(event, url));",
  ];
  for (const needle of required) {
    if (!source.includes(needle)) throw new Error(`${file}: dosage cache isolation output missing: ${needle}`);
  }

  fs.writeFileSync(target, source, 'utf8');
  return true;
}

let changed = 0;
for (const file of targets) if (patchWorker(file)) changed += 1;
console.log(changed
  ? `Isolated dosage service-worker cache by full query in ${changed} runtime file(s).`
  : 'Dosage service-worker cache isolation already applied.');
