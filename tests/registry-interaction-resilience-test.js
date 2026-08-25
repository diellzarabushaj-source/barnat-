const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['registry-mobile-lite.js', 'registry-desktop-lite.js', 'registry-runtime-loader.js', 'app-performance.js', 'registry-parser-worker-v2.js', 'registry-dosage-loader.js', 'registry-dosage-columns-v3.js', 'registry-unified-table.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

const mobile = read('registry-mobile-lite.js');
const desktop = read('registry-desktop-lite.js');
const loader = read('registry-runtime-loader.js');
const app = read('app-performance.js');
const part = read('app-parts/part-01.txt');
const worker = read('registry-parser-worker-v2.js');
const dosageLoader = read('registry-dosage-loader.js');
const dosage = read('registry-dosage-columns-v3.js');
const unified = read('registry-unified-table.js');
const middleware = read('middleware.ts');
const index = read('index.html');
const builder = read('scripts/build-static-runtime.js');

assert.match(mobile, /registry-mobile-lite-v2/, 'built mobile lightweight client version must be current');
assert.match(mobile, /credentials:'same-origin'/, 'mobile registry requests must retain private session credentials');
assert.match(mobile, /view:'registry-page'/, 'mobile registry must read from the bounded lightweight gateway');
assert.match(mobile, /view:'registry-detail'/, 'mobile detail must remain targeted and on demand');
assert.match(mobile, /DEFAULT_PAGE_SIZE = 25/, 'mobile normal mode must remain bounded at 25 rows by default');
assert.match(mobile, /MAX_PAGE_SIZE = 50/, 'mobile lightweight requests must remain capped at 50 rows');
assert.match(mobile, /fatal-mobile-lite-recovery/, 'mobile must retain an explicit fatal recovery path');
assert.match(mobile, /const controller = new AbortController\(\);\s*pageController = controller;/, 'mobile page loads must capture ownership of the active request');
assert.match(mobile, /signal:controller\.signal/, 'mobile page fetch must use the captured request signal');
assert.match(mobile, /if \(pageController === controller\) \{\s*pageController = null;\s*setBusy\(false\);\s*\}/, 'an aborted mobile request must not clear loading state owned by a newer request');
assert.doesNotMatch(mobile, /signal:pageController\.signal/, 'mobile page fetch must not read a mutable shared controller after request start');
assert.doesNotMatch(mobile, /requestFullRegistry\('mobile-lite-error'\)|requestFullRegistry\('drug-full-detail'\)/, 'ordinary mobile interaction/error paths must not wake the full registry');
assert.doesNotMatch(mobile, /DRUG_DATA_PARTS|app-performance\.js|NEON_DATA_API|apirest\./i, 'mobile client must not load or access the full registry or Neon directly');

assert.match(desktop, /registry-desktop-lite-v1/, 'desktop lightweight client must be active');
assert.match(desktop, /credentials:'same-origin'/, 'desktop registry requests must retain private session credentials');
assert.match(desktop, /view:'registry-page'/, 'desktop registry must use bounded server pagination');
assert.match(desktop, /DEFAULT_PAGE_SIZE = 50/, 'desktop normal mode must remain bounded at 50 rows by default');
assert.match(desktop, /const controller = new AbortController\(\);\s*pageController = controller;/, 'desktop page loads must capture ownership of the active request');
assert.match(desktop, /signal:controller\.signal/, 'desktop logical-page fetch must use the captured request signal');
assert.match(desktop, /if \(pageController === controller\) \{\s*pageController = null;\s*setBusy\(false\);\s*\}/, 'an aborted desktop request must not clear loading state owned by a newer request');
assert.doesNotMatch(desktop, /signal:pageController\.signal/, 'desktop page fetch must not read a mutable shared controller after request start');
assert.match(desktop, /pageController\?\.abort\(\);\s*pageController = null;\s*if \(nextQuery\.length === 1\)/, 'desktop search must cancel stale page ownership before its debounce');
assert.match(desktop, /setBusy\(true\);\s*searchTimer = window\.setTimeout/, 'desktop search must expose pending work throughout its debounce');
assert.doesNotMatch(desktop, /source:'neon'|Neon lightweight|nga Neon/, 'desktop runtime must identify Supabase as its only live registry source');
assert.doesNotMatch(mobile, /source:'neon'/, 'mobile runtime must identify Supabase as its only live registry source');
assert.match(desktop, /medindex:request-full-registry/, 'advanced desktop functions must retain an explicit full-runtime handoff');
assert.doesNotMatch(desktop, /\/api\/registry(?:\?|['"`])|DRUG_DATA_PARTS|NEON_DATA_API|apirest\./i, 'normal desktop lightweight mode must not read the full registry or Neon directly');

assert.match(loader, /registry-runtime-loader-v10/, 'single-owner mobile and bounded desktop authenticated loader version must be current');
assert.match(loader, /classList\.contains\('auth-ready'\)/, 'registry bootstrap must wait for the authenticated shell');
assert.match(loader, /requestAnimationFrame\(\(\) => \{[\s\S]*loadRuntime\(/, 'registry bootstrap must yield a paint opportunity');
assert.match(loader, /app-performance\.js\?v=20260801-2/, 'loader must retain the audited full registry bootstrap for explicit fallback/handoff');
assert.match(loader, /mobile-lite-deferred/, 'phone startup must defer the full registry while lightweight mode is healthy');
assert.match(loader, /mobile-lite-stalled/, 'slow phone startup must stay under mobile-lite ownership and publish a stalled state');
assert.match(loader, /mobile-full-registry-blocked/, 'nonfatal phone attempts to wake the full registry must be blocked');
assert.match(loader, /isExplicitMobileFullRequest/, 'full mobile transition must be explicit fatal recovery or desktop viewport transition');
assert.doesNotMatch(loader, /scheduleRuntime\('mobile-lite-timeout'\)/, 'mobile startup timeout must not replace the lightweight renderer');
assert.match(loader, /desktop-lite-deferred/, 'desktop startup must defer the full registry while lightweight mode is healthy');
assert.match(loader, /desktop-lite-timeout/, 'desktop lightweight startup must have a bounded fallback');
assert.match(loader, /legacy-no-lite/, 'unsupported environments must retain the audited legacy fallback');
assert.match(loader, /medindex:full-registry-started/, 'full-runtime handoff must publish a deterministic event');
assert.match(loader, /medindex:request-full-registry/, 'explicit fatal/desktop lightweight flows must be able to request the full runtime');
assert.doesNotMatch(loader, /scheduleRuntime\('desktop-or-legacy'\)/, 'normal authenticated desktop must not eagerly launch the full registry');
assert.doesNotMatch(loader, /FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|INTERACTION_EVENTS/, 'loader must not wait for legacy interaction gates');
assert.doesNotMatch(loader, /MEDINDEX_REGISTRY_UI_READY\s*=\s*new Promise/, 'loader must not shadow the runtime readiness promise');
assert.doesNotMatch(loader, /document\.write|eval\s*\(|new Function/, 'loader must not use dynamic-code shortcuts');

assert.match(app, /clinical-audit-v5-performance-runtime/, 'registry bootstrap version must isolate the performance runtime');
assert.match(app, /releaseStaleInteractionLock/, 'stale interaction locks must be removed');
assert.match(app, /document\.body\.style\.pointerEvents = ''/, 'body pointer events must be restored');
assert.match(app, /DATABASE_TIMEOUT_MS = 3500/, 'IndexedDB access must be bounded');
assert.match(app, /RUNTIME_TIMEOUT_MS = 40000/, 'runtime startup must be bounded');
assert.match(app, /requestIdleCallback\(run, \{ timeout:8000 \}\)/, 'registry cache writes must wait for idle time');
assert.doesNotMatch(app, /localStorage\.setItem\(CACHE_KEY,\s*JSON\.stringify/, 'full registry serialization must not block the UI thread');
assert.match(app, /medindex:registry-ready/, 'full fallback registry ready event must remain available');
assert.match(app, /app-runtime-performance\.js/, 'full fallback bootstrap must request the cache-isolated runtime path');

assert.match(part, /new Worker\(REGISTRY_WORKER_URL\)/, 'large fallback registry processing must use a Web Worker');
assert.match(part, /registry-parser-worker-v2\.js/, 'the v2 worker path must be used');
assert.match(part, /NORMALIZE_BATCH = 120/, 'cooperative fallback normalization must remain bounded');
assert.match(part, /await yieldToBrowser\(\)/, 'fallback registry processing must yield to the browser');
assert.match(part, /parseRegistryCooperatively/, 'worker failure must retain a cooperative fallback');
assert.match(part, /MEDINDEX_REGISTRY_ROWS = RAW/, 'audited fallback rows must be shared with dependent modules');
assert.match(part, /medindex:registry-data-ready/, 'shared fallback rows must publish a readiness event');
assert.doesNotMatch(part, /Uint8Array\.from\(atob\(/, 'fallback must not decode the full payload synchronously');

assert.match(worker, /DecompressionStream\('gzip'\)/, 'worker must decompress the fallback registry off the UI thread');
assert.match(worker, /BASE64_CHUNK = 256 \* 1024/, 'worker decoding must be chunked');
assert.match(worker, /normalizeDrugRow/, 'worker must normalize registry rows');
assert.match(worker, /importScripts\(QUALITY_URL\)/, 'worker must load the registry quality audit');
assert.match(worker, /MedIndexRegistryQuality\?\.applyRows/, 'worker must apply clinical quality rules');
assert.doesNotMatch(worker, /fetch\(/, 'parser worker must not perform independent network requests');

assert.match(dosageLoader, /medindex:registry-ready/, 'dosage enrichment must remain compatible with the full fallback registry');
assert.match(dosageLoader, /requestIdleCallback\(run, \{ timeout:5000 \}\)/, 'dosage enrichment must start during idle time');
assert.match(dosageLoader, /registry-dosage-columns-v3\.js/, 'idle loader must inject the visible-row dosage runtime');
assert.match(dosage, /MEDINDEX_REGISTRY_ROWS/, 'dosage columns must reuse the shared current-page registry');
assert.match(dosage, /medindex:registry-page-ready/, 'dosage index must refresh as lightweight pages change');
assert.match(dosage, /view=cards/, 'dosage columns must use the bounded visible-row card endpoint');
assert.match(dosage, /REQUEST_BATCH_SIZE = 100/, 'visible-row dosage reads must remain bounded');
assert.doesNotMatch(dosage, /fetch\('\/api\/dosage'\s*,/, 'desktop dosage columns must not fetch the full dosage payload');
assert.doesNotMatch(dosage, /DRUG_DATA_PARTS|\batob\s*\(|DecompressionStream|Uint8Array/, 'dosage columns must never parse the registry again');
assert.doesNotMatch(dosage, /subtree\s*:\s*true/, 'dosage observers must not watch their own subtree mutations');

assert.match(unified, /registry-canonical-main-table-v1/, 'canonical single table controller must be active');
assert.doesNotMatch(unified, /observe\(document\.body|subtree\s*:\s*true/, 'single controller must not scan the whole page or table subtree');
assert.match(unified, /observer\.observe\(tbody, \{ childList:true \}\)/, 'table body observer must react only to page-row replacement');

assert.match(middleware, /'\/registry-parser-worker-v2\.js'/, 'v2 parser worker must pass through auth middleware');
assert.match(index, /registry-mobile-lite\.js\?v=20260812-2/, 'index must load the current phone lightweight client');
assert.match(index, /registry-desktop-lite\.js\?v=20260812-1/, 'index must load the desktop lightweight client');
assert.match(index, /registry-runtime-loader\.js\?v=20260813-10/, 'index must request the single-owner mobile-and-desktop aware bootstrap');
assert.ok(index.indexOf('registry-mobile-lite.js') < index.indexOf('registry-desktop-lite.js'), 'mobile lightweight client must register before desktop lightweight startup');
assert.ok(index.indexOf('registry-desktop-lite.js') < index.indexOf('registry-runtime-loader.js'), 'desktop lightweight client must register before the full loader');
assert.match(index, /registry-unified-table\.js\?v=registry-canonical-main-table-v1/, 'index must load the canonical single table controller');
assert.doesNotMatch(index, /(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.js/, 'legacy table controllers must not load');
assert.doesNotMatch(index, /<script src="app-performance\.js"/, 'heavy registry application must not be parser ordered');
assert.doesNotMatch(index, /rel="preload" href="app-runtime-performance\.js/, 'normal lightweight startup must not preload the full generated runtime');
assert.match(index, /registry-dosage-loader\.js\?v=20260812-1/, 'index must load the cache-busted idle dosage loader');
assert.doesNotMatch(index, /src="registry-dosage-columns-v3\.js/, 'visible-row dosage integration must not be in the critical parser path');
assert.match(builder, /app-runtime-performance\.js/, 'build must still generate the cache-isolated full fallback runtime artifact');

console.log('Registry interaction resilience, request-owned loading states, canonical single-owner mobile + desktop lightweight paths and visible-row dosage audit passed.');
