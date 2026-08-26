const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['registry-fast-start.js', 'registry-mobile-lite.js', 'registry-desktop-lite.js', 'registry-runtime-loader.js', 'index.html', 'app-parts/part-01.txt', 'app-performance.js']) {
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
}
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-fast-start.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-mobile-lite.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-desktop-lite.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-runtime-loader.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'app-performance.js')], { stdio:'pipe' });

const fast = read('registry-fast-start.js');
assert.match(fast, /MAX_BLOCKING_MS = 2200/, 'blocking loader window must remain bounded');
assert.match(fast, /PREFETCH_TTL_MS = 10000/, 'startup registry prefetch must have a short bounded reuse window');
assert.match(fast, /initialRegistryPageUrl/, 'fast-start must prefetch only the bounded initial registry page');
assert.match(fast, /\/api\/drug-search/, 'startup prefetch must use the bounded drug-search gateway');
assert.match(fast, /view:'registry-page'/, 'startup prefetch must use the registry-page contract');
assert.match(fast, /pageSize:mobile \? '25' : '50'/, 'startup prefetch must preserve mobile and desktop page budgets');
assert.match(fast, /registry-prefetch-reused/, 'the initial lightweight renderer must be able to reuse the in-flight prefetch');
assert.match(fast, /abortableClone/, 'prefetch reuse must preserve AbortSignal cancellation semantics');
assert.match(fast, /contentType\.includes\('application\/json'\)/, 'only successful JSON responses may be reused');
assert.match(fast, /DEDUP_PATHS = new Set\(\['\/api\/auth', '\/api\/icd', '\/api\/user-library'\]\)/, 'critical same-origin GET endpoints must have a bounded browser in-flight dedup set');
assert.match(fast, /function dedupDescriptor/, 'browser request dedup must validate request identity before sharing work');
assert.match(fast, /method !== 'GET'/, 'browser request dedup must never merge writes');
assert.match(fast, /headers\.has\('Authorization'\)/, 'authorization-bearing requests must never be merged');
assert.match(fast, /url\.searchParams\.sort\(\)/, 'equivalent query strings must share a stable dedup key');
assert.match(fast, /networkInit:\{ \.\.\.init, signal:undefined \}/, 'shared network work must not inherit a single consumer AbortSignal');
assert.match(fast, /abortableClone\(pending, descriptor\.signal\)/, 'each deduplicated caller must retain independent abort semantics and a cloned response');
assert.match(fast, /requestDedupHits/, 'dedup hits must remain observable in performance telemetry');
assert.match(fast, /browser-inflight-v1/, 'the request coordinator must expose a versioned runtime contract');
assert.doesNotMatch(fast, /setTimeout\([^\n]*requestDedup|requestDedupCache|responseCache/, 'browser dedup must remain in-flight only and must not become a stale response cache');
assert.match(fast, /MEDINDEX_PERFORMANCE/, 'startup performance telemetry must remain locally observable');
assert.match(fast, /PerformanceObserver/, 'startup must collect browser performance entries when supported');
assert.match(fast, /largest-contentful-paint/, 'LCP telemetry must be collected');
assert.match(fast, /layout-shift/, 'CLS telemetry must be collected');
assert.match(fast, /longtask/, 'long-task telemetry must be collected');
assert.match(fast, /medindex:performance-mark/, 'startup milestones must publish a local performance event');
assert.match(fast, /first-registry-row/, 'time to first registry row must be measured');
assert.match(fast, /releaseLoader\('background'\)/, 'loader must retain a bounded fallback release');
assert.match(fast, /releaseInteractiveShell/, 'loader must release as soon as authentication and shell are ready');
assert.match(fast, /classList\.contains\('auth-ready'\)/, 'interactive release must wait for authentication');
assert.match(fast, /querySelector\('\.mi-app-shell'\)/, 'interactive release must wait for the mounted shell');
assert.match(fast, /loader\.style\.pointerEvents = 'none'/, 'loader must stop intercepting input before removal');
assert.match(fast, /Regjistri po përgatitet në sfond/, 'background loading state must remain visible');
assert.match(fast, /MutationObserver/, 'fast-start must detect the first rendered registry rows');
assert.match(fast, /observer\.observe\(tbody, \{ childList:true \}\)/, 'fast-start must observe only direct row replacement');
assert.doesNotMatch(fast, /observer\.observe\(tbody, \{[^}]*subtree\s*:\s*true|observer\.observe\(tbody, \{[^}]*characterData\s*:\s*true/, 'fast-start must not observe nested row/cell text churn');
assert.doesNotMatch(fast, /location\.reload|caches\.delete|unregister\(/, 'fast-start must not reset the browser or force a reload');

const index = read('index.html');
assert.match(index, /registry-fast-start\.js\?v=registry-fast-start-v2/);
assert.match(index, /registry-mobile-lite\.js\?v=20260812-2/);
assert.match(index, /registry-desktop-lite\.js\?v=20260812-1/);
assert.match(index, /registry-runtime-loader\.js\?v=20260813-10/);
assert.ok(index.indexOf('registry-fast-start.js') < index.indexOf('registry-mobile-lite.js'), 'fast-start must execute before mobile lightweight startup');
assert.ok(index.indexOf('registry-mobile-lite.js') < index.indexOf('registry-desktop-lite.js'), 'mobile lightweight path must register before desktop lightweight startup');
assert.ok(index.indexOf('registry-desktop-lite.js') < index.indexOf('registry-runtime-loader.js'), 'desktop lightweight path must register before the full runtime loader');
assert.doesNotMatch(index, /<script src="app-performance\.js"/, 'heavy registry startup must remain dynamically loaded');
assert.doesNotMatch(index, /rel="preload" href="app-runtime-performance\.js/, 'deferred full-registry runtime must not be preloaded during normal lightweight startup');
assert.doesNotMatch(index, /rel="preload" href="data\/registry-quality\.js/, 'fallback-only quality runtime must not compete with normal lightweight startup bandwidth');

const mobile = read('registry-mobile-lite.js');
assert.match(mobile, /registry-mobile-lite-v2/, 'built mobile lightweight runtime must include the current server-filter contract');
assert.match(mobile, /\(max-width: 767px\)/, 'mobile lightweight path must be phone-only');
assert.match(mobile, /DEFAULT_PAGE_SIZE = 25/, 'mobile lightweight path must default to 25 rows');
assert.match(mobile, /MAX_PAGE_SIZE = 50/, 'mobile lightweight path must cap requests at 50 rows');
assert.match(mobile, /view:'registry-page'/, 'mobile lightweight path must use the bounded registry gateway');
assert.match(mobile, /SEARCH_DEBOUNCE_MS = 250/, 'mobile search must be debounced');
assert.match(mobile, /fatal-mobile-lite-recovery/, 'mobile must retain explicit fatal recovery without ordinary renderer handoff');
assert.match(mobile, /medindex:request-full-registry/, 'fatal/viewport mobile recovery still needs an observable full-runtime transition');
assert.doesNotMatch(mobile, /requestFullRegistry\('mobile-lite-error'\)/, 'ordinary mobile API failure must not replace the lightweight renderer');
assert.doesNotMatch(mobile, /requestFullRegistry\('drug-full-detail'\)/, 'targeted mobile detail must not wake the full registry renderer');

const desktop = read('registry-desktop-lite.js');
assert.match(desktop, /registry-desktop-lite-v1/, 'desktop lightweight runtime must be active');
assert.match(desktop, /\(min-width: 768px\)/, 'desktop lightweight path must be desktop-only');
assert.match(desktop, /DEFAULT_PAGE_SIZE = 50/, 'desktop lightweight path must default to 50 rows');
assert.match(desktop, /view:'registry-page'/, 'desktop lightweight path must use bounded server pagination');
assert.match(desktop, /medindex:request-full-registry/, 'advanced desktop features need a safe full-runtime handoff');
assert.doesNotMatch(desktop, /\/api\/registry(?:\?|['"`])/, 'normal desktop lightweight startup must not request the full registry endpoint');

const loader = read('registry-runtime-loader.js');
assert.match(loader, /registry-runtime-loader-v10/, 'single-owner mobile and bounded desktop loader version must be current');
assert.match(loader, /app-performance\.js\?v=20260801-2/, 'loader must retain the current full registry application for explicit fatal/desktop fallback');
assert.match(loader, /classList\.contains\('auth-ready'\)/, 'registry startup must wait for the authenticated shell');
assert.match(loader, /MOBILE_LITE_STALL_MS = 12000/, 'mobile lightweight startup needs a diagnostic stall watch without renderer takeover');
assert.match(loader, /DESKTOP_LITE_GRACE_MS = 5000/, 'desktop lightweight startup needs a bounded fallback grace period');
assert.match(loader, /mobile-lite-deferred/, 'full runtime must be deferred while the mobile lightweight path starts');
assert.match(loader, /mobile-lite-stalled/, 'slow mobile startup must remain observable without waking the full renderer');
assert.match(loader, /medindex:mobile-lite-stalled/, 'mobile stall state must publish an observable diagnostic event');
assert.match(loader, /mobile-full-registry-blocked/, 'nonfatal mobile attempts to wake the full registry must be blocked and observable');
assert.match(loader, /isExplicitMobileFullRequest/, 'mobile full-runtime transition must be restricted to explicit fatal/viewport recovery');
assert.doesNotMatch(loader, /scheduleRuntime\('mobile-lite-timeout'\)/, 'mobile timeout must never replace the mobile-lite list owner');
assert.match(loader, /desktop-lite-deferred/, 'full runtime must be deferred while the desktop lightweight path starts');
assert.match(loader, /desktop-lite-timeout/, 'desktop lightweight mode must retain a bounded full-runtime fallback');
assert.match(loader, /legacy-no-lite/, 'non-lightweight environments must retain a safe legacy fallback');
assert.match(loader, /medindex:request-full-registry/, 'loader must support explicit fatal/desktop lightweight handoff');
assert.match(loader, /requestAnimationFrame\(\(\) => \{[\s\S]*loadRuntime\(/, 'registry startup must yield one frame before loading');
assert.doesNotMatch(loader, /scheduleRuntime\('desktop-or-legacy'\)/, 'authenticated desktop must not eagerly launch the full registry runtime');
assert.doesNotMatch(loader, /FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|INTERACTION_EVENTS/, 'obsolete interaction delays must stay removed');
assert.doesNotMatch(loader, /MEDINDEX_REGISTRY_UI_READY\s*=\s*new Promise/, 'loader must not create a circular UI-ready promise');

const part = read('app-parts/part-01.txt');
assert.match(part, /const timeout = setTimeout\(finish, 2600\)/, 'quality fallback bootstrap must have a bounded wait');
assert.match(part, /if\(existing\)[\s\S]*existing\.addEventListener\('load', finish/, 'existing quality runtime must settle safely');
assert.match(part, /script\.async = true/, 'quality fallback runtime must not block document parsing');
assert.doesNotMatch(part, /existing\.addEventListener\('error', reject/, 'quality bootstrap must not remain rejected or unresolved');

console.log('Registry fast-start prefetch, browser in-flight request dedup, performance telemetry, bandwidth-aware quality fallback, single-owner mobile lightweight v2, desktop lightweight and authenticated loader v10 audit passed.');
