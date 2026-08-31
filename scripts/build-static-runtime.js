const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const runtimeSources = [
  'app-parts/part-01.txt',
  'app-parts/part-02.txt',
  'app-parts/part-03.txt',
  'app-parts/part-04.txt',
  'app-parts/core-tail.txt',
];
const runtimeOutputs = [
  path.join(root, 'app-runtime.js'),
  path.join(root, 'app-runtime-performance.js'),
];
const tailadminCss = path.join(root, 'tailadmin-medindex.css');
const ignoredDirectories = new Set(['.git', '.vercel', 'node_modules', 'test-results', 'playwright-report']);
const clinicalPages = [
  '/index.html',
  '/klasifikimi.html',
  '/icd.html',
  '/dozologjia.html',
  '/protokollet.html',
  '/urgjencat.html',
  '/recetat.html',
  '/analizat.html',
  '/medical-hub.html',
  '/sistemi.html',
];
// Keep offline discovery aligned with the canonical authenticated surface:
 // all ten authenticated standalone workspaces must be discoverable together.
const generatedStaticSources = new Map([
  ['/offline-runtime-performance.js', 'offline-runtime.js'],
  ['/app-runtime-performance.js', 'app-runtime-performance.js'],
  ['/app-runtime.js', 'app-runtime.js'],
]);

function readSource(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

function normalizeShellUrl(rawValue) {
  const value = String(rawValue || '').trim().replace(/&amp;/g, '&');
  if (!value || /^(?:data:|https?:|mailto:|tel:|#)/i.test(value)) return null;
  const interpolated = value.includes('${');
  const candidate = interpolated ? value.split('?')[0] : value;
  let url;
  try { url = new URL(candidate, 'https://medindex.local/'); }
  catch { return null; }
  if (url.origin !== 'https://medindex.local') return null;

  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!relative || relative.split('/').includes('..')) return null;
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) return null;
  const generatedSource = generatedStaticSources.get(url.pathname);
  const exists = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  if (!exists && !generatedSource) return null;
  return `${url.pathname}${interpolated ? '' : url.search}`;
}

function coreShellSeed(workerSource) {
  const match = workerSource.match(/const CORE_SHELL = \[([\s\S]*?)\n\];/);
  if (!match) throw new Error('CORE_SHELL nuk u gjet në service worker.');
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(item => item[1]);
}

function htmlAssetReferences(relativePage) {
  const html = readSource(path.join(root, relativePage.replace(/^\/+/, '')));
  return [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1]);
}

function scriptAssetReferences(source) {
  return [...source.matchAll(/["'`]((?:\/|\.\/)?[^"'`\s]+?\.(?:css|js|svg|png|jpe?g|webp|ico|webmanifest)(?:\?[^"'`]*)?)["'`]/gi)]
    .map(match => match[1]);
}

function stylesheetAssetReferences(source) {
  return [...source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)].map(match => match[1]);
}

function buildOfflineShell(workerSource) {
  const assets = [];
  const exact = new Set();
  const byPath = new Set();
  const scanQueue = [];
  const scanned = new Set();

  const add = rawValue => {
    const value = normalizeShellUrl(rawValue);
    if (!value) return;
    const pathname = new URL(value, 'https://medindex.local/').pathname;
    if (!value.includes('?') && byPath.has(pathname)) return;
    if (!exact.has(value)) {
      exact.add(value);
      byPath.add(pathname);
      assets.push(value);
    }
    if (/\.(?:css|js)$/i.test(pathname) && !scanned.has(pathname)) scanQueue.push(pathname);
  };

  coreShellSeed(workerSource).forEach(add);
  clinicalPages.forEach(add);
  clinicalPages.flatMap(htmlAssetReferences).forEach(add);

  while (scanQueue.length) {
    const pathname = scanQueue.shift();
    if (scanned.has(pathname)) continue;
    scanned.add(pathname);
    const relative = generatedStaticSources.get(pathname) || pathname.replace(/^\/+/, '');
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) continue;
    const source = readSource(absolute);
    const references = pathname.endsWith('.css')
      ? stylesheetAssetReferences(source)
      : scriptAssetReferences(source);
    references.forEach(add);
  }

  return assets;
}

function renderCoreShell(assets) {
  const values = assets.map(value => `  '${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`);
  return `const CORE_SHELL = [\n${values.join('\n')}\n];`;
}

function checkGeneratedSyntax(file, source) {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-generated-'));
  const tempFile = path.join(tempDirectory, path.basename(file));
  try {
    fs.writeFileSync(tempFile, source, 'utf8');
    execFileSync(process.execPath, ['--check', tempFile], { stdio:'pipe' });
  } finally {
    fs.rmSync(tempDirectory, { recursive:true, force:true });
  }
}

function buildRegistryRuntime() {
  const missing = runtimeSources.filter(file => !fs.existsSync(path.join(root, file)));
  if (missing.length) throw new Error(`Mungojnë fragmentet e runtime-it: ${missing.join(', ')}`);

  let source = runtimeSources.map(file => readSource(path.join(root, file))).join('');
  const opener = '(async () => {';
  if (!source.startsWith(opener)) {
    throw new Error('Fragmentet e runtime-it nuk fillojnë me wrapper-in e pritur async.');
  }
  source = source.replace(opener, 'window.MEDINDEX_REGISTRY_UI_READY = (async () => {');

  const banner = '/* AUTO-GENERATED by scripts/build-static-runtime.js. Do not edit directly. */\n';
  const generated = `${banner}${source}\n//# sourceURL=medindex-registry-runtime.js\n`;
  checkGeneratedSyntax('app-runtime.js', generated);
  runtimeOutputs.forEach(output => fs.writeFileSync(output, generated, 'utf8'));
  console.log(`Generated ${runtimeOutputs.length} registry runtime artifacts from ${runtimeSources.length} audited fragments.`);
}

function buildCacheIsolatedOfflineRuntime() {
  const workerInput = path.join(root, 'sw-resilient.js');
  const runtimeInput = path.join(root, 'offline-runtime.js');
  const workerOutput = path.join(root, 'sw-resilient-v3.js');
  const runtimeOutput = path.join(root, 'offline-runtime-performance.js');
  if (!fs.existsSync(workerInput) || !fs.existsSync(runtimeInput)) {
    throw new Error('Mungon burimi i offline runtime-it ose resilient service worker-it.');
  }

  const workerSource = readSource(workerInput);
  const offlineShell = buildOfflineShell(workerSource);
  const workerGenerated = workerSource
    .replace("const VERSION = 'low-bandwidth-v2';", "const VERSION = 'low-bandwidth-v3';")
    .replace(/const CORE_SHELL = \[[\s\S]*?\n\];/, renderCoreShell(offlineShell))
    .replace('async function cacheCoreShell() {\n  const cache = await caches.open(STATIC_CACHE);', 'async function cacheCoreShell() {')
    .replace(
      '      await cache.put(request, response.clone());',
      "      const expectedPath = canonicalPagePath(new URL(request.url).pathname);\n      const privatePage = PRIVATE_PAGES.has(expectedPath);\n      if (privatePage && !validHtmlResponse(response, expectedPath)) throw new Error(`${path}: përgjigjja private nuk ishte faqja e pritur`);\n      const cache = await caches.open(privatePage ? PAGE_CACHE : STATIC_CACHE);\n      await cache.put(request, response.clone());"
    )
    .replace(
      '  } catch { return null; }\n}\n\nasync function navigationResponse',
      "  } catch {\n    networkProfile.online = false;\n    await broadcast({ type:'MEDINDEX_NETWORK_STATUS', online:false });\n    return null;\n  }\n}\n\nasync function navigationResponse"
    )
    .replace(
      "  return { state:cached === REQUIRED_PRIVATE_PATHS.length ? 'ready' : 'limited', cached, required:REQUIRED_PRIVATE_PATHS.length };",
      "  return { state:cached === REQUIRED_PRIVATE_PATHS.length ? 'ready' : 'limited', cached, required:REQUIRED_PRIVATE_PATHS.length, online:networkProfile.online };"
    );
  if (workerGenerated === workerSource
      || !workerGenerated.includes("const VERSION = 'low-bandwidth-v3';")
      || !workerGenerated.includes('privatePage ? PAGE_CACHE : STATIC_CACHE')
      || !workerGenerated.includes("'/analizat.html',")
      || !workerGenerated.includes('MEDINDEX_NETWORK_STATUS')
      || !workerGenerated.includes('online:networkProfile.online')
      || offlineShell.some(asset => !workerGenerated.includes(`'${asset.replace(/'/g, "\\'")}',`))) {
    throw new Error('Versioni i cache-isolated service worker-it, precache-i klinik ose sinjali i rrjetit nuk u gjenerua.');
  }
  checkGeneratedSyntax(workerOutput, workerGenerated);
  fs.writeFileSync(workerOutput, workerGenerated, 'utf8');

  const runtimeSource = readSource(runtimeInput);
  const runtimeGenerated = runtimeSource
    .replace("const RESILIENCE_VERSION = 'low-bandwidth-v2';", "const RESILIENCE_VERSION = 'low-bandwidth-v3';")
    .replace('const SERVICE_WORKER_URL = `/sw-resilient.js?v=${RESILIENCE_VERSION}`;', 'const SERVICE_WORKER_URL = `/sw-resilient-v3.js?v=${RESILIENCE_VERSION}`;');
  if (runtimeGenerated === runtimeSource
      || !runtimeGenerated.includes("const RESILIENCE_VERSION = 'low-bandwidth-v3';")
      || !runtimeGenerated.includes('/sw-resilient-v3.js')
      || !runtimeGenerated.includes('window.MEDINDEX_AUTH_READY')
      || !runtimeGenerated.includes('reachabilityPromise')
      || !runtimeGenerated.includes('void verifyNetworkReachability()')
      || !runtimeGenerated.includes("message.online === false || !networkReachable || !navigator.onLine")
      || (runtimeGenerated.match(/fetch\('\/api\/auth\?offline_probe=1'/g) || []).length !== 1) {
    throw new Error('Cache-isolated offline runtime ose konfirmimi determinist i rrjetit nuk u gjenerua.');
  }
  checkGeneratedSyntax(runtimeOutput, runtimeGenerated);
  fs.writeFileSync(runtimeOutput, runtimeGenerated, 'utf8');
  console.log('Generated cache-isolated offline runtime, verified clinical page precache, deterministic network probe and resilient service worker v3.');
}

function hardenTailAdminCss() {
  if (!fs.existsSync(tailadminCss)) throw new Error('Mungon tailadmin-medindex.css.');
  const original = fs.readFileSync(tailadminCss, 'utf8');
  if (original.length < 25000 || !original.includes('.mi-sidebar-header') || !original.includes('.mi-content-container')) {
    throw new Error('tailadmin-medindex.css duket i cunguar; build-i u ndal për të mbrojtur layout-in.');
  }

  const hardened = original
    .replace(/^@import\s+url\(["']https:\/\/fonts\.googleapis\.com\/[^\n]+\);\s*/i, '/* External font import removed during audited build. */\n\n')
    .replace(/--mi-font:\s*"Outfit",\s*Inter,\s*ui-sans-serif,\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI",\s*sans-serif;/,
      '--mi-font: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;');

  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(hardened)) {
    throw new Error('Një burim fonti i jashtëm mbeti në TailAdmin CSS.');
  }
  if (hardened.length < original.length - 400 || !hardened.includes('.mi-sidebar-header') || !hardened.includes('@media')) {
    throw new Error('Transformimi i fontit ndryshoi papritur strukturën e TailAdmin CSS.');
  }
  fs.writeFileSync(tailadminCss, hardened, 'utf8');
  console.log('Hardened TailAdmin CSS without third-party font requests.');
}

function listCssFiles(directory = root) {
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listCssFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.css') ? [absolute] : [];
  });
}

function auditStylesheetOrigins() {
  const violations = [];
  for (const file of listCssFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    const imports = [...source.matchAll(/@import\s+(?:url\()?\s*["']?https?:\/\/[^;\s)"']+/gi)].map(match => match[0]);
    const urls = [...source.matchAll(/url\(\s*["']?https?:\/\/[^)"']+/gi)].map(match => match[0]);
    if (imports.length || urls.length) {
      violations.push(`${path.relative(root, file)}: ${[...imports, ...urls].slice(0, 3).join(', ')}`);
    }
  }
  if (violations.length) {
    throw new Error(`Stylesheet-et përmbajnë burime të jashtme të palejuara:\n${violations.join('\n')}`);
  }
  console.log(`Audited ${listCssFiles().length} stylesheets: no third-party origins.`);
}

buildRegistryRuntime();
buildCacheIsolatedOfflineRuntime();
hardenTailAdminCss();
auditStylesheetOrigins();
