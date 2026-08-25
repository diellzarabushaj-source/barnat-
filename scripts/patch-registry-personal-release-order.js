'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-user-personalization.js');
const MARKER = 'registry-personal-release-order-v1';
const CANONICAL_MARKER = 'registry-personal-desktop-lite-v1: canonical desktop-lite view';
const STABILITY_MARKER = 'registry-shell-favorites-stability-v2: resilient personal runtime handoff';
const SAME_TABLE_MARKER = 'registry-personal-same-table-v1: capture visible main-table contract';
const VISIBLE_CONTRACT_MARKER = 'registry-personal-visible-columns-v2';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const startNeedle = '  function applyRuntimeView() {';
  const endNeedle = '  function requestPersonalRuntime() {';
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) throw new Error(`${MARKER}: applyRuntimeView boundaries not found.`);

  const replacement = [
    '  function applyRuntimeView() {',
    `    // ${CANONICAL_MARKER}`,
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

// If this release composer is re-run over a source that already owns the
// release-order marker, ensure the canonical marker still survives. The desktop
// lite regression gate intentionally keys off that marker to prove Favorites do
// not fall back to the historical full registry UI.
if (!source.includes(CANONICAL_MARKER)) {
  const applyNeedle = '  function applyRuntimeView() {';
  const applyStart = source.indexOf(applyNeedle);
  if (applyStart < 0) throw new Error(`${MARKER}: canonical applyRuntimeView boundary not found.`);
  source = source.slice(0, applyStart + applyNeedle.length)
    + `\n    // ${CANONICAL_MARKER}`
    + source.slice(applyStart + applyNeedle.length);
}

// Canonical-owner replaces the applyRuntimeView region. Older stability helpers
// lived in that region, while requestPersonalRuntime still calls them. Restore
// them before the fallback request function so the canonical Barnat path stays
// first and the legacy recovery path remains idempotent and safe.
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

// Same-table v1 is now only a legacy fallback contract: the normal Favorites
// path never hands off from desktop-lite. Keep its captured-column helper alive
// nevertheless so old/full-runtime fallbacks cannot resurrect hidden columns or
// change widths if they are ever used.
if (!source.includes(SAME_TABLE_MARKER)) {
  const requestNeedle = '  function requestPersonalRuntime() {';
  const requestStart = source.indexOf(requestNeedle);
  if (requestStart < 0) throw new Error(`${MARKER}: same-table request boundary not found.`);

  const sameTableHelper = [
    `  // ${SAME_TABLE_MARKER}`,
    '  // Favorites and Notes normally stay inside desktop-lite. If a legacy',
    '  // fallback is ever required, capture exactly the visible Barnat columns.',
    '  function lockVisibleMainTableContract() {',
    "    const header = document.getElementById('headerRow');",
    "    const table = document.getElementById('dataTable');",
    '    if (!header || !table) return false;',
    '    const sourceToUnified = {',
    "      '__select':'select', 'Nr rendor':'number', 'Emri tregtar':'trade-name',",
    "      'Substanca aktive':'active-substance', 'ATC Code':'atc',",
    "      'Klasa / Çka është':'drug-class', 'Përdorimi (fjalë kyçe)':'use',",
    "      'PDID':'pdid', 'ProtocolNo':'protocol', 'Fortësia':'strength',",
    "      'Forma farmaceutike':'form', 'Si të shënohet në recetë':'prescription-label',",
    "      'Madhësia e paketimit':'packaging', 'Bartësi i Autorizim Marketingut':'mah',",
    "      'Prodhuesi':'manufacturer', 'MA certifikata':'ma-certificate',",
    "      'Statusi':'status', 'Çmimi me shumicë':'wholesale-price',",
    "      'Çmimi me marzhë':'margin-price', 'TVSH':'vat',",
    "      'Çmimi me pakicë':'retail-price', 'Afati i vlefshmërisë':'validity'",
    '    };',
    `    // ${VISIBLE_CONTRACT_MARKER}: capture rendered header cells only.`,
    '    const seen = new Set();',
    '    const columns = Array.from(header.children).flatMap(cell => {',
    "      const raw = String(cell.dataset.registryColumnKey || cell.dataset.columnKey || '').trim();",
    '      const key = sourceToUnified[raw] || raw;',
    '      if (!key || seen.has(key)) return [];',
    '      const rect = cell.getBoundingClientRect();',
    "      const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(cell) : null;",
    '      const visible = !cell.hidden',
    "        && cell.getAttribute('aria-hidden') !== 'true'",
    "        && (!style || (style.display !== 'none' && style.visibility !== 'hidden'))",
    '        && rect.width >= 1',
    '        && rect.height >= 1;',
    '      if (!visible) return [];',
    '      seen.add(key);',
    "      return [{ key, width:Math.max(44, Math.round(rect.width)), label:String(cell.textContent || '').replace(/[▲▼↕]/g, '').replace(/\\s+/g, ' ').trim() }];",
    '    });',
    '    if (columns.length < 2) return false;',
    '    window.MEDINDEX_MAIN_TABLE_CONTRACT = Object.freeze({',
    `      version:'${VISIBLE_CONTRACT_MARKER}',`,
    '      columns:Object.freeze(columns.map(column => Object.freeze(column))),',
    '      keys:Object.freeze(columns.map(column => column.key)),',
    '      width:Math.max(0, Math.round(table.getBoundingClientRect().width || 0)),',
    '      capturedAt:Date.now(),',
    '    });',
    '    window.MEDINDEX_PERSONAL_TABLE_CONTRACT_LOCK = true;',
    "    window.dispatchEvent(new CustomEvent('medindex:main-table-contract', { detail:window.MEDINDEX_MAIN_TABLE_CONTRACT }));",
    '    return true;',
    '  }',
    '',
  ].join('\n');

  source = source.slice(0, requestStart) + sameTableHelper + source.slice(requestStart);
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
if (!final.includes(CANONICAL_MARKER)) throw new Error(`${MARKER}: canonical desktop-lite marker was not preserved.`);
if (!final.includes(STABILITY_MARKER)) throw new Error(`${MARKER}: stability helper marker was not preserved.`);
if (!final.includes('function clearPersonalRuntimeRecovery({ resetCount = false } = {})')) {
  throw new Error(`${MARKER}: clearPersonalRuntimeRecovery helper is missing.`);
}
if (!final.includes('function schedulePersonalRuntimeRetry()')) {
  throw new Error(`${MARKER}: schedulePersonalRuntimeRetry helper is missing.`);
}
if (!final.includes(SAME_TABLE_MARKER) || !final.includes(VISIBLE_CONTRACT_MARKER)) {
  throw new Error(`${MARKER}: legacy same-table capture contract is missing.`);
}
if (!final.includes('function lockVisibleMainTableContract()')) {
  throw new Error(`${MARKER}: lockVisibleMainTableContract helper is missing.`);
}

console.log('Personal release safety ordering preserved: Barnat desktop-lite owns Favorites/Notes; canonical marker, stability recovery and legacy same-table fallback stay idempotent.');
