'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');

// Make this focused test runnable on its own as well as through build:runtime.
require('../scripts/patch-registry-shell-favorites-stability.js');

for (const file of [
  'tailadmin-shell-core.js',
  'tailadmin-professional.js',
  'registry-user-personalization.js',
  'offline-runtime.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}
if (fs.existsSync(path.join(ROOT, 'offline-runtime-performance.js'))) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'offline-runtime-performance.js')], { stdio:'pipe' });
}

const shell = read('tailadmin-shell-core.js');
const professional = read('tailadmin-professional.js');
const personal = read('registry-user-personalization.js');
const offline = read('offline-runtime.js');

// A bfcache restore must re-read the exact same persisted sidebar state used on
// fresh init. A position-only pageshow handler caused normal navigation to look
// different from a hard refresh.
const shellPageShow = shell.match(/addEventListener\('pageshow',[\s\S]{0,520}?\{ passive: true \}\);/)?.[0] || '';
assert.match(shellPageShow, /syncResponsiveSidebar\(\)/, 'bfcache restore must resync sidebar collapse state');
assert.match(shellPageShow, /resetSidebarPosition\(\)/, 'bfcache restore must keep sidebar position normalized');

// Professional CSS/runtime invariants also need to be restored because bfcache
// does not rerun stabilize().
const professionalPageShow = professional.match(/window\.addEventListener\('pageshow',[\s\S]{0,760}?\{ passive:true \}\);/)?.[0] || '';
assert.match(professionalPageShow, /orderStylesheets\(\)/, 'pageshow must restore professional stylesheet precedence');
assert.match(professionalPageShow, /syncResponsiveState\(\)/, 'pageshow must restore responsive professional state');
assert.match(professionalPageShow, /scheduleNavigation\(\)/, 'pageshow must restore navigation state');

// Favorites must not set a permanent latch when the full-registry loader has not
// been defined yet. It must retry with a bounded backoff and recover on runtime
// readiness / bfcache restore.
assert.match(personal, /const PERSONAL_RUNTIME_RETRY_MAX = 6/);
assert.match(personal, /const PERSONAL_RUNTIME_WATCHDOG_MS = 8000/);
assert.match(personal, /const loader = window\.MEDINDEX_LOAD_FULL_REGISTRY/);
assert.match(personal, /if \(typeof loader !== 'function'\) \{[\s\S]*?personalRuntimeRequested = false;[\s\S]*?schedulePersonalRuntimeRetry\(\)/,
  'missing loader must release the Favorites request latch and retry');
assert.match(personal, /if \(personalRuntimeRetryCount >= PERSONAL_RUNTIME_RETRY_MAX\) return;/,
  'Favorites retry must be bounded');
assert.match(personal, /personalRuntimeWatchdogTimer = window\.setTimeout\([\s\S]*?personalRuntimeRequested = false;[\s\S]*?schedulePersonalRuntimeRetry\(\)/,
  'stalled full-runtime handoff must be recoverable');
assert.match(personal, /window\.addEventListener\('medindex:registry-ready',[\s\S]*?clearPersonalRuntimeRecovery\(\{ resetCount:true \}\);[\s\S]*?applyRuntimeView\(\)/,
  'runtime ready must clear recovery state before applying Favorites');
assert.match(personal, /window\.addEventListener\('pageshow',[\s\S]*?viewFromLocation\(\)[\s\S]*?loadFavorites\(\)[\s\S]*?requestPersonalRuntime\(\)/,
  'bfcache restore must rehydrate the personal view and retry the runtime when needed');
assert.match(personal, /document\.addEventListener\('click',[\s\S]*?\[data-nav="favorites"\],[\s\S]*?setView\(VIEW_FAVORITES\)/,
  'Favorites navigation must remain delegated across shell rerenders');

// A worker upgrade during boot may otherwise leave the previous DOM with a new
// controller. Reload only when there was already a controller at page start,
// only in the short boot window, and only once per build/path in this session.
assert.match(offline, /const HAD_CONTROLLER_AT_START = Boolean\(navigator\.serviceWorker\?\.controller\)/);
assert.match(offline, /CONTROLLER_BOOT_RELOAD_WINDOW_MS = 20000/);
assert.match(offline, /Date\.now\(\) - RUNTIME_STARTED_AT > CONTROLLER_BOOT_RELOAD_WINDOW_MS/);
assert.match(offline, /sessionStorage\.getItem\(CONTROLLER_RELOAD_KEY\) === token/);
assert.match(offline, /sessionStorage\.setItem\(CONTROLLER_RELOAD_KEY, token\)/);
assert.match(offline, /if \(reloadForFreshControllerDuringBoot\(\)\)/);
assert.match(offline, /Përditësimi është aktiv · kliko për rifreskim/,
  'late worker updates must preserve the explicit refresh path instead of interrupting work');

// The fix is UI/runtime-only. Guard against accidental clinical-data changes in
// this stability patch/test.
const patch = read('scripts/patch-registry-shell-favorites-stability.js');
for (const forbidden of [
  'primaryCareSteps', 'secondaryCareSteps', 'pediatricDose', 'adultDose',
  'mg/kg', 'dosage-engine', 'clinical-editor',
]) {
  assert.equal(patch.includes(forbidden), false, `stability patch must not modify clinical content: ${forbidden}`);
}

console.log('✓ Registry shell + Favorites stability contract passed');
