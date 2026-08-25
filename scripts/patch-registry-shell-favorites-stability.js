'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'registry-shell-favorites-stability-v2';

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(path.join(ROOT, file), source.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Registry shell/Favorites stability patch could not find ${label}.`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Registry shell/Favorites stability patch found an ambiguous ${label}.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchShellCore() {
  const file = 'tailadmin-shell-core.js';
  let source = read(file);
  if (!source.includes(`${MARKER}: bfcache shell state`)) {
    source = replaceOnce(
      source,
      "    addEventListener('pageshow', resetSidebarPosition, { passive: true });",
      `    // ${MARKER}: bfcache shell state\n    addEventListener('pageshow', () => {\n      // A back/forward-cache restore does not rerun init(). Re-read the saved\n      // desktop collapse state so ordinary navigation matches a hard refresh.\n      syncResponsiveSidebar();\n      resetSidebarPosition();\n    }, { passive: true });`,
      'TailAdmin pageshow sidebar reset',
    );
  }
  write(file, source);
}

function patchProfessionalLayer() {
  const file = 'tailadmin-professional.js';
  let source = read(file);
  if (!source.includes(`${MARKER}: bfcache professional state`)) {
    const before = `  window.addEventListener('pageshow', () => {\n    resetRootHorizontalOffset();\n    normalizeContentScroll();\n    scheduleNavigation();\n    scheduleLayoutAudit();\n    bindCommandPaletteViewport();\n    syncPrescriptionDrugPicker();\n  }, { passive:true });`;
    const after = `  window.addEventListener('pageshow', () => {\n    // ${MARKER}: bfcache professional state\n    // Safari/Chromium can restore the DOM without rerunning stabilize(). Make\n    // the restored page obey the same stylesheet and responsive invariants as\n    // a fresh load before the doctor interacts with the table.\n    orderStylesheets();\n    syncResponsiveState();\n    resetRootHorizontalOffset();\n    normalizeContentScroll();\n    scheduleNavigation();\n    scheduleLayoutAudit();\n    bindCommandPaletteViewport();\n    syncPrescriptionDrugPicker();\n  }, { passive:true });`;
    source = replaceOnce(source, before, after, 'professional pageshow recovery');
  }
  write(file, source);
}

function patchPersonalization() {
  const file = 'registry-user-personalization.js';
  let source = read(file);

  if (!source.includes(`${MARKER}: runtime recovery constants`)) {
    source = replaceOnce(
      source,
      `  const PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1';`,
      `  const PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1';\n  // ${MARKER}: runtime recovery constants\n  const PERSONAL_RUNTIME_RETRY_MS = 120;\n  const PERSONAL_RUNTIME_RETRY_MAX = 6;\n  const PERSONAL_RUNTIME_WATCHDOG_MS = 8000;`,
      'personalization constants',
    );
    source = replaceOnce(
      source,
      `  let personalRuntimeRequested = false;\n  let libraryReady = false;`,
      `  let personalRuntimeRequested = false;\n  let personalRuntimeRetryTimer = 0;\n  let personalRuntimeWatchdogTimer = 0;\n  let personalRuntimeRetryCount = 0;\n  let libraryReady = false;`,
      'personalization runtime state',
    );
  }

  if (!source.includes(`${MARKER}: resilient personal runtime handoff`)) {
    const before = `  function requestPersonalRuntime() {\n    if (activeView === VIEW_ALL || runtime()) return;\n    document.body.classList.add('medindex-personal-view-loading');\n    updateViewBanner();\n    if (personalRuntimeRequested) return;\n    personalRuntimeRequested = true;\n    const requested = window.MEDINDEX_LOAD_FULL_REGISTRY?.(\`personal-view-\${activeView}\`);\n    if (requested === false) personalRuntimeRequested = false;\n  }`;
    const after = `  // ${MARKER}: resilient personal runtime handoff\n  function clearPersonalRuntimeRecovery({ resetCount = false } = {}) {\n    window.clearTimeout(personalRuntimeRetryTimer);\n    window.clearTimeout(personalRuntimeWatchdogTimer);\n    personalRuntimeRetryTimer = 0;\n    personalRuntimeWatchdogTimer = 0;\n    if (resetCount) personalRuntimeRetryCount = 0;\n  }\n\n  function schedulePersonalRuntimeRetry() {\n    if (activeView === VIEW_ALL || runtime() || personalRuntimeRetryTimer) return;\n    if (personalRuntimeRetryCount >= PERSONAL_RUNTIME_RETRY_MAX) return;\n    const attempt = ++personalRuntimeRetryCount;\n    const delay = Math.min(900, PERSONAL_RUNTIME_RETRY_MS * Math.pow(2, Math.max(0, attempt - 1)));\n    personalRuntimeRetryTimer = window.setTimeout(() => {\n      personalRuntimeRetryTimer = 0;\n      requestPersonalRuntime();\n    }, delay);\n  }\n\n  function requestPersonalRuntime() {\n    if (activeView === VIEW_ALL) {\n      personalRuntimeRequested = false;\n      clearPersonalRuntimeRecovery({ resetCount:true });\n      return;\n    }\n    if (runtime()) {\n      personalRuntimeRequested = false;\n      clearPersonalRuntimeRecovery({ resetCount:true });\n      applyRuntimeView();\n      return;\n    }\n\n    document.body.classList.add('medindex-personal-view-loading');\n    updateViewBanner();\n    if (personalRuntimeRequested) return;\n\n    // The lite registry and this controller are both deferred scripts. On a fast\n    // click the loader may not exist for a few frames. Never latch the request\n    // until a callable loader actually exists.\n    const loader = window.MEDINDEX_LOAD_FULL_REGISTRY;\n    if (typeof loader !== 'function') {\n      personalRuntimeRequested = false;\n      schedulePersonalRuntimeRetry();\n      return;\n    }\n\n    personalRuntimeRequested = true;\n    let requested = false;\n    try {\n      requested = loader(\`personal-view-\${activeView}\`);\n    } catch {\n      // A synchronous loader failure is transient from the user's perspective.\n      // Release the latch immediately instead of making Favorites dead until a\n      // hard refresh, then retry through the same bounded recovery path.\n      personalRuntimeRequested = false;\n      schedulePersonalRuntimeRetry();\n      return;\n    }\n    if (requested === false) {\n      personalRuntimeRequested = false;\n      schedulePersonalRuntimeRetry();\n      return;\n    }\n\n    window.clearTimeout(personalRuntimeWatchdogTimer);\n    personalRuntimeWatchdogTimer = window.setTimeout(() => {\n      personalRuntimeWatchdogTimer = 0;\n      if (activeView === VIEW_ALL || runtime()) return;\n      // A failed/aborted runtime load must not make Favorites permanently dead.\n      personalRuntimeRequested = false;\n      schedulePersonalRuntimeRetry();\n    }, PERSONAL_RUNTIME_WATCHDOG_MS);\n  }`;
    source = replaceOnce(source, before, after, 'personal runtime handoff');
  }

  if (!source.includes(`${MARKER}: personal view transition recovery`)) {
    source = replaceOnce(
      source,
      `  function setView(view) {\n    activeView = [VIEW_ALL, VIEW_FAVORITES, VIEW_NOTES].includes(view) ? view : VIEW_ALL;`,
      `  function setView(view) {\n    const previousView = activeView;\n    activeView = [VIEW_ALL, VIEW_FAVORITES, VIEW_NOTES].includes(view) ? view : VIEW_ALL;\n    // ${MARKER}: personal view transition recovery\n    if (activeView !== previousView || activeView === VIEW_ALL) {\n      personalRuntimeRequested = false;\n      clearPersonalRuntimeRecovery({ resetCount:true });\n    }`,
      'setView transition',
    );
  }

  if (!source.includes(`${MARKER}: runtime ready recovery`)) {
    source = replaceOnce(
      source,
      `    window.addEventListener('medindex:registry-ready', () => {\n      applyRuntimeView();\n      schedule(1);\n    });`,
      `    window.addEventListener('medindex:registry-ready', () => {\n      // ${MARKER}: runtime ready recovery\n      personalRuntimeRequested = false;\n      clearPersonalRuntimeRecovery({ resetCount:true });\n      applyRuntimeView();\n      schedule(1);\n    });`,
      'registry-ready recovery',
    );
  }

  if (!source.includes(`${MARKER}: bfcache personal view recovery`)) {
    source = replaceOnce(
      source,
      `    window.addEventListener('hashchange', () => setView(viewFromLocation()));`,
      `    // ${MARKER}: bfcache personal view recovery\n    window.addEventListener('pageshow', () => {\n      favorites = loadFavorites();\n      notes = loadNotes();\n      const restoredView = viewFromLocation();\n\n      // BFCache can freeze an in-flight loader flag/timer and restore it later.\n      // Always clear that stale handoff state, even when the hash/view did not\n      // change, so the same Favorites view recovers immediately without F5.\n      personalRuntimeRequested = false;\n      clearPersonalRuntimeRecovery({ resetCount:true });\n      if (restoredView !== activeView) activeView = restoredView;\n\n      updateCounts();\n      updateViewNav();\n      updateViewBanner();\n      if (activeView !== VIEW_ALL) {\n        if (!applyRuntimeView()) requestPersonalRuntime();\n      } else {\n        applyRuntimeView();\n      }\n      updateEmptyState();\n      schedule(1);\n    }, { passive:true });\n\n    // A suspended/background tab can resume with the loader script available but\n    // the old request latch still frozen. Recover on visibility as well.\n    document.addEventListener('visibilitychange', () => {\n      if (document.visibilityState !== 'visible' || activeView === VIEW_ALL || runtime()) return;\n      personalRuntimeRequested = false;\n      clearPersonalRuntimeRecovery();\n      requestPersonalRuntime();\n    }, { passive:true });\n\n    window.addEventListener('hashchange', () => setView(viewFromLocation()));`,
      'personalization hashchange anchor',
    );
  }

  write(file, source);
}

function patchOfflineRuntime() {
  const file = 'offline-runtime.js';
  let source = read(file);

  if (!source.includes(`${MARKER}: controller coherence constants`)) {
    source = replaceOnce(
      source,
      `  const NETWORK_FAILURE_REASONS = new Set(['network', 'timeout', 'offline', 'offline-no-lease', 'server-unavailable']);`,
      `  const NETWORK_FAILURE_REASONS = new Set(['network', 'timeout', 'offline', 'offline-no-lease', 'server-unavailable']);\n  // ${MARKER}: controller coherence constants\n  const CONTROLLER_BOOT_RELOAD_WINDOW_MS = 20000;\n  const CONTROLLER_RELOAD_GUARD_MS = 30000;\n  const CONTROLLER_RELOAD_KEY = 'medindex_controller_boot_reload_v2';\n  const RUNTIME_STARTED_AT = Date.now();\n  const HAD_CONTROLLER_AT_START = Boolean(navigator.serviceWorker?.controller);`,
      'offline runtime controller constants',
    );
    source = replaceOnce(
      source,
      `  let reachabilityPromise = null;`,
      `  let reachabilityPromise = null;\n  let controllerReloadScheduled = false;`,
      'offline runtime controller state',
    );
  }

  if (!source.includes(`${MARKER}: one-shot boot reload`)) {
    const listener = `    navigator.serviceWorker?.addEventListener('controllerchange', () => {\n      updateActivated = true;\n      setStatus('update', 'Përditësimi është aktiv · kliko për rifreskim');\n      window.dispatchEvent(new CustomEvent('medindex:offline-controller-ready'));\n    });`;
    const replacement = `    // ${MARKER}: one-shot boot reload\n    function reloadForFreshControllerDuringBoot() {\n      if (controllerReloadScheduled || !HAD_CONTROLLER_AT_START || !navigator.onLine) return false;\n      if (Date.now() - RUNTIME_STARTED_AT > CONTROLLER_BOOT_RELOAD_WINDOW_MS) return false;\n      if (document.visibilityState === 'hidden') return false;\n      const controllerRuntimeId = document.documentElement.dataset.miRelease\n        || document.documentElement.dataset.medindexBuildId\n        || document.documentElement.dataset.registryUiRelease\n        || 'medindex-runtime';\n      const token = \`\${controllerRuntimeId}|\${location.pathname}\`;\n      const now = Date.now();\n      try {\n        const previous = JSON.parse(sessionStorage.getItem(CONTROLLER_RELOAD_KEY) || 'null');\n        if (previous?.token === token && now - Number(previous.at || 0) < CONTROLLER_RELOAD_GUARD_MS) return false;\n        sessionStorage.setItem(CONTROLLER_RELOAD_KEY, JSON.stringify({ token, at:now }));\n      } catch {}\n      controllerReloadScheduled = true;\n      window.setTimeout(() => location.reload(), 0);\n      return true;\n    }\n\n    navigator.serviceWorker?.addEventListener('controllerchange', () => {\n      updateActivated = true;\n      window.dispatchEvent(new CustomEvent('medindex:offline-controller-ready'));\n      if (reloadForFreshControllerDuringBoot()) {\n        setStatus('update', 'Po aktivizohet versioni i ri…');\n        return;\n      }\n      // Outside the boot window we preserve the clinician's in-progress work and\n      // keep the existing explicit refresh affordance.\n      setStatus('update', 'Përditësimi është aktiv · kliko për rifreskim');\n    });`;
    source = replaceOnce(source, listener, replacement, 'offline runtime controllerchange listener');
  }

  write(file, source);
}

function verify() {
  const shell = read('tailadmin-shell-core.js');
  const professional = read('tailadmin-professional.js');
  const personal = read('registry-user-personalization.js');
  const offline = read('offline-runtime.js');

  const required = [
    [shell, `${MARKER}: bfcache shell state`, 'shell pageshow recovery'],
    [professional, `${MARKER}: bfcache professional state`, 'professional pageshow recovery'],
    [personal, `${MARKER}: resilient personal runtime handoff`, 'Favorites runtime recovery'],
    [personal, `typeof loader !== 'function'`, 'Favorites loader availability guard'],
    [personal, `requested = loader(`, 'Favorites loader exception recovery'],
    [personal, `${MARKER}: bfcache personal view recovery`, 'Favorites bfcache recovery'],
    [personal, `document.addEventListener('visibilitychange'`, 'Favorites visibility recovery'],
    [offline, `${MARKER}: one-shot boot reload`, 'service-worker boot coherence'],
    [offline, 'HAD_CONTROLLER_AT_START', 'service-worker existing-controller guard'],
    [offline, 'CONTROLLER_RELOAD_GUARD_MS', 'service-worker reload loop guard'],
  ];
  for (const [source, needle, label] of required) {
    if (!source.includes(needle)) throw new Error(`Missing ${label}.`);
  }
}

patchShellCore();
patchProfessionalLayer();
patchPersonalization();
patchOfflineRuntime();
verify();

console.log('Registry shell + Favorites stability v2 applied: bfcache state, CSS order, resilient loader retry, resume recovery and guarded controller coherence.');
