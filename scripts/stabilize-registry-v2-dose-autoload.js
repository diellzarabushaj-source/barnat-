'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'registry-v2.js');
const MARKER = 'registry-dose-autoload-retry-v1';

let source = fs.readFileSync(target, 'utf8');

if (source.includes(MARKER)) {
  console.log('Registry v2 dose autoload retry patch already applied.');
  return;
}

const block = (...lines) => lines.join('\n');
const pattern = /  async function loadDosageForVisibleRows\(requestId\) \{[\s\S]*?\n  \}\n\n  function doseMarkup/;

if (!pattern.test(source)) {
  throw new Error('Registry dosage autoload anchor is missing.');
}

source = source.replace(pattern, block(
  `  const REGISTRY_DOSE_AUTOLOAD = '${MARKER}';`,
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
  '  async function loadDosageForVisibleRows(requestId) {',
  '    const numbers = [...new Set(state.rows.map(row => clean(row.registryNumber)).filter(value => /^\\d{1,6}$/.test(value)))];',
  '    if (!numbers.length) return;',
  '',
  '    const url = `/api/dosage?view=cards&nrs=${encodeURIComponent(numbers.join(\',\'))}`;',
  '    const maxAttempts = 2;',
  '    let lastError = null;',
  '',
  '    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {',
  '      if (requestId !== state.requestId) return;',
  '      try {',
  '        // The backend can perform two sequential Supabase reads, each with its',
  '        // own timeout. The old 8s client deadline could abort first-page dosage',
  '        // hydration while the same request succeeded immediately after Refresh.',
  '        const { payload } = await fetchJson(url, {}, 12000);',
  '        if (requestId !== state.requestId) return;',
  '',
  '        const cards = Array.isArray(payload.cards) ? payload.cards : [];',
  '        if (!cards.length) throw new Error(\'Dosage batch returned no cards\');',
  '',
  '        state.dosageByRegistry.clear();',
  '        for (const card of cards) state.dosageByRegistry.set(clean(card.registryNumber), card);',
  '        patchDosageCells();',
  '        return;',
  '      } catch (error) {',
  '        if (requestId !== state.requestId) return;',
  '        lastError = error;',
  '        if (attempt < maxAttempts) {',
  '          setDoseLoadMessage(\'Duke ringarkuar dozën…\');',
  '          await waitForDoseRetry(240);',
  '          continue;',
  '        }',
  '      }',
  '    }',
  '',
  '    console.warn(\'Dosage cards unavailable after automatic retry:\', lastError);',
  '    // A transport/backend failure is not the same thing as “no published dose”.',
  '    // Keep that clinical distinction explicit instead of showing a false missing-dose state.',
  '    setDoseLoadMessage(\'Doza s’u ngarkua\', \'error\');',
  '  }',
  '',
  '  function doseMarkup',
));

const required = [
  `const REGISTRY_DOSE_AUTOLOAD = '${MARKER}'`,
  'const maxAttempts = 2;',
  'fetchJson(url, {}, 12000)',
  "setDoseLoadMessage('Duke ringarkuar dozën…')",
  "setDoseLoadMessage('Doza s’u ngarkua', 'error')",
  "Dosage cards unavailable after automatic retry:",
];
for (const needle of required) {
  if (!source.includes(needle)) throw new Error(`Registry dosage autoload output missing: ${needle}`);
}

if (source.includes('Dosage cards unavailable:', source.indexOf(`const REGISTRY_DOSE_AUTOLOAD = '${MARKER}'`))) {
  throw new Error('Legacy one-shot dosage failure handler is still present after the autoload patch.');
}

fs.writeFileSync(target, source, 'utf8');
console.log('Hardened Registry v2 dosage autoload: 12s deadline + automatic retry + truthful error state.');
