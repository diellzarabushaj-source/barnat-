'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n?/g, '\n');
const write = (relative, content) => fs.writeFileSync(path.join(root, relative), content.replace(/\r\n?/g, '\n'), 'utf8');

function cleanRelease(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 96);
}

const packageJson = JSON.parse(read('package.json'));
const releaseId = cleanRelease(
  process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.VERCEL_DEPLOYMENT_ID
  || `local-${packageJson.version}`
);
if (!releaseId) throw new Error('Phase 6 release ID could not be resolved.');

function checkSyntax(relative, source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-phase6-'));
  const temporary = path.join(directory, path.basename(relative));
  try {
    fs.writeFileSync(temporary, source, 'utf8');
    execFileSync(process.execPath, ['--check', temporary], { stdio:'pipe' });
  } finally {
    fs.rmSync(directory, { recursive:true, force:true });
  }
}

function patchAuthReleaseEndpoint() {
  let source = read('api/auth.js');
  if (!source.includes('single-version-release-endpoint-v1')) {
    const resetAnchor = "function resetRequested(req) {\n  return req.method === 'GET' && queryValue(req, 'reset') === '1';\n}\n";
    if (!source.includes(resetAnchor)) throw new Error('Auth release endpoint anchor is missing.');
    source = source.replace(resetAnchor, `${resetAnchor}\n// single-version-release-endpoint-v1\nfunction releaseRequested(req) {\n  return req.method === 'GET' && queryValue(req, 'release') === '1';\n}\n\nfunction deploymentRelease() {\n  return String(\n    process.env.VERCEL_GIT_COMMIT_SHA\n    || process.env.GITHUB_SHA\n    || process.env.VERCEL_DEPLOYMENT_ID\n    || 'local-1.8.0'\n  ).trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 96);\n}\n`);
    source = source.replace(
      "  if (resetRequested(req)) {",
      "  if (releaseRequested(req)) {\n    return res.status(200).json({ id:deploymentRelease(), strategy:'single-version-v1' });\n  }\n\n  if (resetRequested(req)) {"
    );
    source = source.replace(
      "  resetRequested,\n  browserResetPage,",
      "  resetRequested,\n  releaseRequested,\n  deploymentRelease,\n  browserResetPage,"
    );
  }
  if (!source.includes('single-version-release-endpoint-v1')
      || !source.includes("queryValue(req, 'release') === '1'")
      || !source.includes("strategy:'single-version-v1'")) {
    throw new Error('Release identity was not integrated into api/auth.js.');
  }
  checkSyntax('api/auth.js', source);
  write('api/auth.js', source);
}

function patchOfflineRuntime() {
  let source = read('offline-runtime.js');
  source = source.replace(/  const VERSION = '[^']+';/, "  const VERSION = 'single-version-v1';");

  if (/  const RESILIENCE_VERSION = '[^']+';/.test(source)) {
    source = source.replace(
      /  const RESILIENCE_VERSION = '[^']+';/,
      `  const RELEASE_ID = '${releaseId}';\n  const RELEASE_ENDPOINT = '/api/auth?release=1';\n  const RELEASE_CHECK_INTERVAL_MS = 5 * 60 * 1000;`
    );
  } else {
    source = source.replace(/  const RELEASE_ID = '[^']+';/, `  const RELEASE_ID = '${releaseId}';`);
    source = source.replace(/  const RELEASE_ENDPOINT = '[^']+';/, "  const RELEASE_ENDPOINT = '/api/auth?release=1';");
  }

  source = source
    .replace(/  const SERVICE_WORKER_URL = `[^`]+`;/, '  const SERVICE_WORKER_URL = `/sw.js?v=${RELEASE_ID}`;')
    .replace(/RESILIENCE_VERSION/g, 'RELEASE_ID');

  if (!source.includes('single-version-release-runtime-v1')) {
    const anchor = '  let reachabilityPromise = null;\n';
    if (!source.includes(anchor)) throw new Error('Offline runtime release injection anchor is missing.');
    const releaseLayer = `${anchor}\n  // single-version-release-runtime-v1\n  let releaseCheckTimer = 0;\n  let pendingReleaseId = '';\n  let releaseListenerInstalled = false;\n\n  function hasUnsavedWork() {\n    if (document.documentElement.dataset.miDirty === '1' || document.body?.dataset?.miDirty === '1') return true;\n    const active = document.activeElement;\n    if (!active?.matches?.('textarea,[contenteditable="true"],input:not([type]),input[type="text"],input[type="number"],input[type="email"],input[type="date"],input[type="datetime-local"]')) return false;\n    if (active.matches('input[type="search"]')) return false;\n    if ('value' in active) return String(active.value || '') !== String(active.defaultValue || '');\n    return Boolean(String(active.textContent || '').trim());\n  }\n\n  async function checkRelease() {\n    if (!navigator.onLine) return false;\n    try {\n      const response = await fetch(\`${'${RELEASE_ENDPOINT}'}&t=${'${Date.now()}'}\`, {\n        cache:'no-store',\n        credentials:'same-origin',\n        headers:{ Accept:'application/json', 'X-MedIndex-Release-Check':'1' },\n      });\n      if (!response.ok) return false;\n      const payload = await response.json();\n      const nextRelease = String(payload?.id || '').trim();\n      if (!nextRelease || nextRelease === RELEASE_ID) {\n        pendingReleaseId = '';\n        document.documentElement.dataset.miRelease = RELEASE_ID;\n        return true;\n      }\n      pendingReleaseId = nextRelease;\n      updateActivated = true;\n      const dirty = hasUnsavedWork();\n      setStatus('update', dirty ? 'Version i ri gati · ruaj dhe rifresko' : 'Version i ri gati · kliko për rifreskim');\n      registration?.update?.().catch(() => null);\n      window.dispatchEvent(new CustomEvent('medindex:release-ready', {\n        detail:{ current:RELEASE_ID, next:nextRelease, dirty },\n      }));\n      return false;\n    } catch {\n      return false;\n    }\n  }\n\n  function scheduleReleaseCheck(delay = 15000) {\n    clearTimeout(releaseCheckTimer);\n    releaseCheckTimer = setTimeout(async () => {\n      if (document.visibilityState !== 'hidden' && navigator.onLine) await checkRelease();\n      scheduleReleaseCheck(RELEASE_CHECK_INTERVAL_MS);\n    }, delay);\n  }\n\n  function installReleaseListener() {\n    if (releaseListenerInstalled) return;\n    releaseListenerInstalled = true;\n    document.addEventListener('visibilitychange', () => {\n      if (document.visibilityState === 'visible') void checkRelease();\n    });\n    window.addEventListener('pageshow', () => void checkRelease(), { passive:true });\n  }\n`;
    source = source.replace(anchor, releaseLayer);
  }

  source = source.replace(
    "    installListeners();\n    void verifyNetworkReachability();",
    "    installListeners();\n    installReleaseListener();\n    document.documentElement.dataset.miRelease = RELEASE_ID;\n    scheduleReleaseCheck();\n    void verifyNetworkReachability();"
  );

  source = source.replace(
    "      version:RELEASE_ID,\n      warm:",
    "      version:RELEASE_ID,\n      release:() => RELEASE_ID,\n      pendingRelease:() => pendingReleaseId,\n      checkRelease,\n      warm:"
  );

  if (!source.includes('const SERVICE_WORKER_URL = `/sw.js?v=${RELEASE_ID}`;')
      || !source.includes("const RELEASE_ENDPOINT = '/api/auth?release=1';")
      || !source.includes('single-version-release-runtime-v1')
      || source.includes('sw-resilient-v3.js')
      || source.includes('RESILIENCE_VERSION')) {
    throw new Error('Canonical offline runtime was not produced.');
  }
  checkSyntax('offline-runtime.js', source);
  write('offline-runtime.js', source);
  return source;
}

function patchServiceWorker() {
  let source = read('sw.js');
  source = source.replace(
    /const VERSION = '[^']+';\nconst CACHE_EPOCH = '[^']+';\nconst CACHE_NAMESPACE = `\$\{VERSION\}-\$\{CACHE_EPOCH\}`;/,
    `const VERSION = 'single-version-v1';\nconst RELEASE_ID = '${releaseId}';\nconst CACHE_EPOCH = RELEASE_ID;\nconst CACHE_NAMESPACE = \`\${VERSION}-\${RELEASE_ID}\`;`
  );
  source = source.replace("  '/recetat-safe-print.js', '/ui-enhancements.js', '/name-display.js',", "  '/recetat-safe-print.js', '/name-display.js',");
  source = source.replace('    await refreshSafeClinicalPages();\n', '    // Phase 6: never force-navigate an open clinical page during worker activation.\n');

  if (!source.includes(`const RELEASE_ID = '${releaseId}';`)
      || !source.includes('const CACHE_NAMESPACE = `${VERSION}-${RELEASE_ID}`;')
      || source.includes("'/ui-enhancements.js'")
      || source.includes('    await refreshSafeClinicalPages();')) {
    throw new Error('Canonical single-version service worker was not produced.');
  }
  checkSyntax('sw.js', source);
  write('sw.js', source);
  return source;
}

function patchRuntimeReferences() {
  let shell = read('tailadmin-shell.js');
  shell = shell
    .replace(/const OFFLINE_RUNTIME_SRC = '[^']+';/, `const OFFLINE_RUNTIME_SRC = '/offline-runtime.js?v=${releaseId}';`)
    .replace("script.dataset.medindexOfflineRuntime = 'performance-v3';", "script.dataset.medindexOfflineRuntime = 'single-version-v1';")
    .replace('MedIndex performance offline runtime failed to load.', 'MedIndex single-version offline runtime failed to load.');
  write('tailadmin-shell.js', shell);
  checkSyntax('tailadmin-shell.js', shell);

  let auth = read('auth-client.js');
  auth = auth.replace(/const OFFLINE_RUNTIME_SRC = '[^']+';/, `const OFFLINE_RUNTIME_SRC = '/offline-runtime.js?v=${releaseId}';`);
  write('auth-client.js', auth);
  checkSyntax('auth-client.js', auth);

  let index = read('index.html');
  index = index.replace(
    /<script src="offline-runtime-performance\.js(?:\?[^\"]*)?" data-medindex-offline-runtime defer><\/script>/,
    `<script src="offline-runtime.js?v=${releaseId}" data-medindex-offline-runtime defer></script>`
  );
  index = index.replace(
    /<script src="offline-runtime\.js(?:\?[^\"]*)?" data-medindex-offline-runtime defer><\/script>/,
    `<script src="offline-runtime.js?v=${releaseId}" data-medindex-offline-runtime defer></script>`
  );
  if (!index.includes(`offline-runtime.js?v=${releaseId}`) || index.includes('offline-runtime-performance.js')) {
    throw new Error('index.html still loads a legacy offline runtime.');
  }
  write('index.html', index);
}

function writeMigrationShims() {
  const workerShim = `/* Phase 6 compatibility shim: one implementation lives in /sw.js */\n'use strict';\nimportScripts('/sw.js?v=${releaseId}');\n`;
  checkSyntax('sw-resilient.js', workerShim);
  write('sw-resilient.js', workerShim);
  write('sw-resilient-v3.js', workerShim);

  const runtimeShim = `(() => {\n  'use strict';\n  if (window.MedIndexOffline?.version === '${releaseId}') return;\n  if (document.querySelector('script[data-medindex-single-version-migration]')) return;\n  const script = document.createElement('script');\n  script.src = '/offline-runtime.js?v=${releaseId}';\n  script.defer = true;\n  script.dataset.medindexSingleVersionMigration = '1';\n  document.head.appendChild(script);\n})();\n`;
  checkSyntax('offline-runtime-performance.js', runtimeShim);
  write('offline-runtime-performance.js', runtimeShim);
}

patchAuthReleaseEndpoint();
const runtime = patchOfflineRuntime();
const worker = patchServiceWorker();
patchRuntimeReferences();
writeMigrationShims();

if (!runtime.includes(`const RELEASE_ID = '${releaseId}';`)) throw new Error('Offline runtime release mismatch.');
if (!worker.includes(`const RELEASE_ID = '${releaseId}';`)) throw new Error('Service worker release mismatch.');

console.log(`Phase 6 single-version runtime active: ${releaseId}. Canonical /offline-runtime.js + /sw.js; release identity uses existing /api/auth; legacy paths are migration shims only.`);
