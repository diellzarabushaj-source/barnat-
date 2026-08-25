'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-user-personalization.js');
const MARKER = 'registry-personal-release-order-v1';
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
  fs.writeFileSync(FILE, source, 'utf8');
}

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

console.log('Personal release safety ordering preserved: legacy fallback remains gated; Barnat desktop-lite still owns Favorites/Notes.');
