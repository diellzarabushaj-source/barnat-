'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'registry-v2.js');
const MARKER = 'registry-dose-autoload-retry-v2';

let source = fs.readFileSync(target, 'utf8');

if (source.includes(MARKER)) {
  console.log('Registry v2 dosage cache-isolated autoload patch already applied.');
  return;
}

const block = (...lines) => lines.join('\n');
const pattern = /  async function loadDosageForVisibleRows\(requestId\) \{[\s\S]*?\n  \}\n\n  function doseMarkup/;

if (!pattern.test(source)) {
  throw new Error('Registry dosage autoload anchor is missing.');
}

source = source.replace(pattern, block(
  `  const REGISTRY_DOSE_AUTOLOAD = '${MARKER}';`,
  "  const LEGACY_DOSAGE_CACHE = 'medindex-private-resilient-v2';",
  '  let dosageWorkerRefreshRequested = false;',
  '',
  '  const waitForDoseRetry = ms => new Promise(resolve => setTimeout(resolve, ms));',
  '',
  '  function setDoseLoadMessage(text, status = \'loading\') {',
  '    document.querySelectorAll(\'[data-dose-status="loading"]\').forEach(node => {',
  '      node.innerHTML = `<span class="dose-missing">${escapeHtml(text)}</span>`;',
  '      node.dataset.doseStatus = status;',
  '    });',
  '  }',
  '',
  '  async function clearLegacySharedDosageCache() {',
  "    if (!('caches' in window)) return;",
  '    try {',
  '      const cache = await caches.open(LEGACY_DOSAGE_CACHE);',
  '      const keys = await cache.keys();',
  '      const legacyKeys = keys.filter(request => {',
  '        try {',
  '          const cachedUrl = new URL(request.url);',
  "          return cachedUrl.origin === location.origin && cachedUrl.pathname === '/api/dosage' && !cachedUrl.search;",
  '        } catch { return false; }',
  '      });',
  '      await Promise.all(legacyKeys.map(request => cache.delete(request)));',
  '    } catch (error) {',
  "      console.debug('Legacy dosage cache cleanup skipped:', error);",
  '    }',
  '  }',
  '',
  '  async function refreshDosageServiceWorker() {',
  "    if (dosageWorkerRefreshRequested || !('serviceWorker' in navigator)) return;",
  '    dosageWorkerRefreshRequested = true;',
  '    try {',
  '      const registration = await navigator.serviceWorker.getRegistration();',
  '      if (registration) await registration.update();',
  '    } catch (error) {',
  "      console.debug('Service worker dosage cache refresh skipped:', error);",
  '    }',
  '  }',
  '',
  '  async function loadDosageForVisibleRows(requestId) {',
  '    const numbers = [...new Set(state.rows.map(row => clean(row.registryNumber)).filter(value => /^\\d{1,6}$/.test(value)))];',
  '    if (!numbers.length) return;',
  '',
  '    // Older service workers cached every /api/dosage request under the same bare',
  '    // pathname. That could return page 2 dosage cards while page 3 was visible.',
  '    // Remove that one legacy key before every hydration and ask the registration',
  '    // to update in the background. Query-specific caches are left untouched.',
  '    void refreshDosageServiceWorker();',
  '    await clearLegacySharedDosageCache();',
  '    if (requestId !== state.requestId) return;',
  '',
  '    const requested = new Set(numbers);',
  '    const url = `/api/dosage?view=cards&nrs=${encodeURIComponent(numbers.join(\',\'))}`;',
  '    const maxAttempts = 3;',
  '    let lastError = null;',
  '',
  '    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {',
  '      if (requestId !== state.requestId) return;',
  '      try {',
  '        const { payload } = await fetchJson(url, {}, 14000);',
  '        if (requestId !== state.requestId) return;',
  '',
  '        const cards = Array.isArray(payload.cards) ? payload.cards : [];',
  "        if (!cards.length) throw new Error('Dosage batch returned no cards');",
  '        const foreignCards = cards.filter(card => !requested.has(clean(card.registryNumber)));',
  "        if (foreignCards.length) throw new Error('Stale dosage cache returned cards from another registry page');",
  '',
  '        state.dosageByRegistry.clear();',
  '        for (const card of cards) state.dosageByRegistry.set(clean(card.registryNumber), card);',
  '        patchDosageCells();',
  '        return;',
  '      } catch (error) {',
  '        if (requestId !== state.requestId) return;',
  '        lastError = error;',
  '        if (attempt < maxAttempts) {',
  "          setDoseLoadMessage('Duke ringarkuar dozën…');",
  '          await clearLegacySharedDosageCache();',
  '          await waitForDoseRetry(260 * attempt);',
  '          continue;',
  '        }',
  '      }',
  '    }',
  '',
  "    console.warn('Dosage cards unavailable after cache-safe automatic retry:', lastError);",
  '    // A transport/cache failure is not the same thing as “no published dose”.',
  "    setDoseLoadMessage('Doza s’u ngarkua', 'error');",
  '  }',
  '',
  '  function doseMarkup',
));

const required = [
  `const REGISTRY_DOSE_AUTOLOAD = '${MARKER}'`,
  "const LEGACY_DOSAGE_CACHE = 'medindex-private-resilient-v2'",
  'async function clearLegacySharedDosageCache()',
  'navigator.serviceWorker.getRegistration()',
  'const maxAttempts = 3;',
  'fetchJson(url, {}, 14000)',
  "Stale dosage cache returned cards from another registry page",
  "setDoseLoadMessage('Duke ringarkuar dozën…')",
  "setDoseLoadMessage('Doza s’u ngarkua', 'error')",
  'clearLegacySharedDosageCache();',
];
for (const needle of required) {
  if (!source.includes(needle)) throw new Error(`Registry dosage autoload output missing: ${needle}`);
}

fs.writeFileSync(target, source, 'utf8');
console.log('Hardened Registry v2 dosage autoload: legacy cache purge + query identity guard + automatic retry.');
