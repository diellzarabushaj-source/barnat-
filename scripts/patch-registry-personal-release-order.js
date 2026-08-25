'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-user-personalization.js');
const MARKER = 'registry-personal-release-order-v1';
const STABILITY_MARKER = 'registry-shell-favorites-stability-v2: resilient personal runtime handoff';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const startNeedle = '  function applyRuntimeView() {';
  const endNeedle = '  function requestPersonalRuntime() {';
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) throw new Error(`${MARKER}: applyRuntimeView boundaries not found.`);

  const replacement = [
    '  function applyRuntimeView() {',
    `    // ${MARKER}`,
    '    // Keep the frozen fallback safety order while the normal desktop path',
    '    // remains owned by MEDINDEX_DESKTOP_LITE. The legacy API branch is',
    '    // unreachable whenever the canonical Barnat owner is active.',
    '    const lite = desktopLitePersonalRuntime();',
    '    const api = runtime();',
    '',
    '    if (!lite) {',
    '      if (!api) return activeView === VIEW_ALL;',
    '      if (api.setPersonalView) api.setPersonalView(activeView);',
    '      else {',
    '        api.setFavoritesOnly?.(activeView === VIEW_FAVORITES);',
    '        api.setNotesOnly?.(activeView === VIEW_NOTES);',
    '      }',
    "      document.body.classList.remove('medindex-personal-view-loading');",
    '      personalRuntimeRequested = false;',
    '      updateViewBanner();',
    '      updateEmptyState();',
    '      return true;',
    '    }',
    '',
    '    void lite.setPersonalView(activeView, personalIdentifiersForView()).then(() => {',
    "      document.body.classList.remove('medindex-personal-view-loading');",
    '      personalRuntimeRequested = false;',
    '      updateViewNav();',
    '      updateViewBanner();',
    '      updateEmptyState();',
    '      schedule(1);',
    '    }).catch(() => {',
    "      document.body.classList.remove('medindex-personal-view-loading');",
    '      personalRuntimeRequested = false;',
    '      updateViewNav();',
    '      updateViewBanner();',
    '    });',
    '    return true;',
    '  }',
    '',
  ].join('\n');

  source = source.slice(0, start) + replacement + source.slice(end);
}

// The canonical-owner patch intentionally replaces the applyRuntimeView region.
// Stability v2 originally placed its retry helpers in that same region, so a
// composed build can otherwise retain calls to these helpers while deleting the
// helper definitions. Restore the exact stability contract before the legacy
// request function. This keeps the canonical Barnat path first, while making
// the fallback idempotent and safe for BFCache/loader recovery tests.
if (!source.includes(STABILITY_MARKER)) {
  const requestNeedle = '  function requestPersonalRuntime() {';
  const requestStart = source.indexOf(requestNeedle);
  if (requestStart < 0) throw new Error(`${MARKER}: requestPersonalRuntime boundary not found.`);

  const stabilityHelpers = [
    `  // ${STABILITY_MARKER}`,
    '  function clearPersonalRuntimeRecovery({ resetCount = false } = {}) {',
    '    window.clearTimeout(personalRuntimeRetryTimer);',
    '    window.clearTimeout(personalRuntimeWatchdogTimer);',
    '    personalRuntimeRetryTimer = 0;',
    '    personalRuntimeWatchdogTimer = 0;',
    '    if (resetCount) personalRuntimeRetryCount = 0;',
    '  }',
    '',
    '  function schedulePersonalRuntimeRetry() {',
    '    if (activeView === VIEW_ALL || runtime() || personalRuntimeRetryTimer) return;',
    '    if (personalRuntimeRetryCount >= PERSONAL_RUNTIME_RETRY_MAX) return;',
    '    const attempt = ++personalRuntimeRetryCount;',
    '    const delay = Math.min(900, PERSONAL_RUNTIME_RETRY_MS * Math.pow(2, Math.max(0, attempt - 1)));',
    '    personalRuntimeRetryTimer = window.setTimeout(() => {',
    '      personalRuntimeRetryTimer = 0;',
    '      requestPersonalRuntime();',
    '    }, delay);',
    '  }',
    '',
  ].join('\n');

  source = source.slice(0, requestStart) + stabilityHelpers + source.slice(requestStart);
}

fs.writeFileSync(FILE, source, 'utf8');

const final = fs.readFileSync(FILE, 'utf8');
const applyStart = final.indexOf('function applyRuntimeView()');
const fallbackFilter = final.indexOf('if (api.setPersonalView) api.setPersonalView(activeView);', applyStart);
const firstReveal = final.indexOf("document.body.classList.remove('medindex-personal-view-loading');", applyStart);
const liteFilter = final.indexOf('lite.setPersonalView(activeView, personalIdentifiersForView())', applyStart);
const requestStart = final.indexOf('function requestPersonalRuntime()', applyStart);
const block = final.slice(applyStart, requestStart);

if (!(applyStart >= 0 && fallbackFilter > applyStart && firstReveal > fallbackFilter && liteFilter > firstReveal)) {
  throw new Error(`${MARKER}: frozen release safety ordering was not preserved.`);
}
if (!block.includes('if (!lite) {')) throw new Error(`${MARKER}: legacy fallback is not gated behind canonical owner absence.`);
if (block.includes('MEDINDEX_LOAD_FULL_REGISTRY')) throw new Error(`${MARKER}: canonical apply block may not invoke the full registry loader.`);
if (!final.includes(STABILITY_MARKER)) throw new Error(`${MARKER}: stability helper marker was not preserved.`);
if (!final.includes('function clearPersonalRuntimeRecovery({ resetCount = false } = {})')) {
  throw new Error(`${MARKER}: clearPersonalRuntimeRecovery helper is missing.`);
}
if (!final.includes('function schedulePersonalRuntimeRetry()')) {
  throw new Error(`${MARKER}: schedulePersonalRuntimeRetry helper is missing.`);
}

console.log('Personal release safety ordering preserved: legacy fallback remains gated; Barnat desktop-lite still owns Favorites/Notes and stability recovery stays idempotent.');
