'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'registry-dosage-columns-v3.js');
const TEST = path.join(ROOT, 'tests/registry-dosage-columns-test.js');

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

const retryLoopFilter = `.filter(number => !clinical.loadedNumbers.has(number) && !clinical.pendingNumbers.has(number));`;
const stableFailureFilter = `.filter(number => !clinical.loadedNumbers.has(number) && !clinical.pendingNumbers.has(number) && !clinical.failedNumbers.has(number));`;
if (!source.includes(stableFailureFilter)) {
  if (!source.includes(retryLoopFilter)) throw new Error('Dosage signature patch: visible-batch retry filter anchor missing.');
  source = source.replace(retryLoopFilter, stableFailureFilter);
}

if (!source.includes('function dosageCellSignature(')) {
  const before = `  function createDosageCell(column, row, card) {\n    const cell = document.createElement('td');\n    cell.className = \`registry-dosage-column registry-dosage-\${column.key}\`;\n    cell.dataset.registryDosageColumn = column.key;\n    cell.dataset.label = column.label;\n    if (registry.status === 'loading') cell.innerHTML = '<span class="registry-dosage-muted">Duke e lidhur me barin…</span>';\n    else if (!row) cell.innerHTML = '<span class="registry-dosage-muted">Bari nuk u identifikua në mënyrë unike.</span>';\n    else cell.innerHTML = cellContent(row, card, column.key, column.empty);\n    return cell;\n  }`;

  const after = `  function dosageCellSignature(column, row, card) {\n    const population = clean(column?.key);\n    if (registry.status === 'loading') return [VERSION, population, 'registry-loading'].join('|');\n    if (!row) return [VERSION, population, 'unidentified'].join('|');\n\n    const number = clean(row?.['Nr rendor']);\n    if (card) {\n      const dose = clean(population === 'adult' ? card.adultDose : card.pediatricDose);\n      const route = clean(population === 'adult' ? card.adultRoute : card.pediatricRoute);\n      if (!dose) return [VERSION, population, number, 'empty'].join('|');\n      const sources = (Array.isArray(card.sourceUrls) ? card.sourceUrls : []).map(clean).filter(Boolean).join('~');\n      return [VERSION, population, number, 'dose', dose, route, sources].join('|');\n    }\n\n    if (!number || clinical.pendingNumbers.has(number) || (!clinical.loadedNumbers.has(number) && !clinical.failedNumbers.has(number))) {\n      return [VERSION, population, number, 'pending'].join('|');\n    }\n    if (clinical.failedNumbers.has(number)) return [VERSION, population, number, 'failed'].join('|');\n    return [VERSION, population, number, 'empty'].join('|');\n  }\n\n  function createDosageCell(column, row, card, signature = dosageCellSignature(column, row, card)) {\n    const cell = document.createElement('td');\n    cell.className = \`registry-dosage-column registry-dosage-\${column.key}\`;\n    cell.dataset.registryDosageColumn = column.key;\n    cell.dataset.registryDosageSignature = signature;\n    cell.dataset.label = column.label;\n    if (registry.status === 'loading') cell.innerHTML = '<span class="registry-dosage-muted">Duke e lidhur me barin…</span>';\n    else if (!row) cell.innerHTML = '<span class="registry-dosage-muted">Bari nuk u identifikua në mënyrë unike.</span>';\n    else cell.innerHTML = cellContent(row, card, column.key, column.empty);\n    return cell;\n  }`;

  if (!source.includes(before)) throw new Error('Dosage signature patch: createDosageCell anchor missing.');
  source = source.replace(before, after);
}

if (!source.includes('let rowContentChanged = false;')) {
  const before = `  function ensureRows() {\n    const headerIndex = buildHeaderIndex();`;
  const after = `  function ensureRows() {\n    let rowContentChanged = false;\n    const headerIndex = buildHeaderIndex();`;
  if (!source.includes(before)) throw new Error('Dosage signature patch: ensureRows change-tracking anchor missing.');
  source = source.replace(before, after);
}

const oldReconcile = `        const existing = matches[0];\n        const desired = createDosageCell(column, row, card);\n        if (!existing) tableRow.appendChild(desired);\n        else if (existing.innerHTML !== desired.innerHTML) existing.replaceWith(desired);`;
const signatureReplaceReconcile = `        const existing = matches[0];\n        const signature = dosageCellSignature(column, row, card);\n        const desired = createDosageCell(column, row, card, signature);\n        if (!existing) tableRow.appendChild(desired);\n        else if (existing.dataset.registryDosageSignature !== signature) existing.replaceWith(desired);`;
const stableReconcile = `        const existing = matches[0];\n        const signature = dosageCellSignature(column, row, card);\n        const desired = createDosageCell(column, row, card, signature);\n        if (!existing) {\n          tableRow.appendChild(desired);\n          rowContentChanged = true;\n        } else if (existing.dataset.registryDosageSignature !== signature) {\n          existing.className = desired.className;\n          existing.dataset.registryDosageColumn = column.key;\n          existing.dataset.registryDosageSignature = signature;\n          existing.dataset.label = column.label;\n          existing.innerHTML = desired.innerHTML;\n          existing.title = desired.title || '';\n          rowContentChanged = true;\n        }`;

if (!source.includes(stableReconcile)) {
  if (source.includes(signatureReplaceReconcile)) source = source.replace(signatureReplaceReconcile, stableReconcile);
  else if (source.includes(oldReconcile)) source = source.replace(oldReconcile, stableReconcile);
  else throw new Error('Dosage signature patch: ensureRows reconciliation anchor missing.');
}

if (!source.includes('return rowContentChanged;')) {
  const before = `    queueVisibleClinicalData(visibleRows);\n  }\n\n  function pickerLabel(column) {`;
  const after = `    queueVisibleClinicalData(visibleRows);\n    return rowContentChanged;\n  }\n\n  function pickerLabel(column) {`;
  if (!source.includes(before)) throw new Error('Dosage signature patch: ensureRows return anchor missing.');
  source = source.replace(before, after);
}

if (!source.includes('const rowContentChanged = ensureRows();')) {
  const before = `      ensureHeader();\n      ensureRows();\n      ensurePicker();\n      applyVisibility();\n      document.documentElement.dataset.registryDosagePerformance = VERSION;`;
  const after = `      ensureHeader();\n      const rowContentChanged = ensureRows();\n      ensurePicker();\n      applyVisibility();\n      if (rowContentChanged) window.MedIndexRegistryRows?.refresh?.();\n      document.documentElement.dataset.registryDosagePerformance = VERSION;`;
  if (!source.includes(before)) throw new Error('Dosage signature patch: enhance explicit row-refresh anchor missing.');
  source = source.replace(before, after);
}

if (!source.includes('cell.dataset.registryDosageSignature = signature;')) {
  throw new Error('Dosage signature patch: signature is not stamped on dosage cells.');
}
if (source.includes('existing.innerHTML !== desired.innerHTML')) {
  throw new Error('Dosage signature patch: unstable innerHTML reconciliation is still active.');
}
if (source.includes('existing.replaceWith(desired)')) {
  throw new Error('Dosage signature patch: dosage cells must be updated in place, not replaced.');
}
if (!source.includes("existing.dataset.registryDosageColumn = column.key;")) {
  throw new Error('Dosage signature patch: stable dosage column identity is missing.');
}
if (!source.includes(stableFailureFilter)) {
  throw new Error('Dosage signature patch: failed batches can still auto-retry during idle.');
}
if (!source.includes('if (rowContentChanged) window.MedIndexRegistryRows?.refresh?.();')) {
  throw new Error('Dosage signature patch: nested dosage mutations must explicitly refresh row expansion once.');
}

fs.writeFileSync(TARGET, source, 'utf8');

if (fs.existsSync(TEST)) {
  let test = fs.readFileSync(TEST, 'utf8').replace(/\r\n?/g, '\n');
  if (!test.includes('dosage cells must carry a deterministic clinical signature')) {
    const marker = `assert.match(script, /REQUEST_BATCH_SIZE = 100/);`;
    const assertions = `${marker}\nassert.match(script, /registryDosageSignature/, 'dosage cells must carry a deterministic clinical signature');\nassert.match(script, /existing\\.dataset\\.registryDosageSignature !== signature/, 'dosage reconciliation must compare deterministic signatures');\nassert.doesNotMatch(script, /existing\\.innerHTML !== desired\\.innerHTML/, 'dosage reconciliation must not compare mutable innerHTML');\nassert.doesNotMatch(script, /existing\\.replaceWith\\(desired\\)/, 'dosage reconciliation must preserve unified-table cell identity');`;
    if (!test.includes(marker)) throw new Error('Dosage signature patch: regression test anchor missing.');
    test = test.replace(marker, assertions);
  } else if (!test.includes('dosage reconciliation must preserve unified-table cell identity')) {
    const marker = `assert.doesNotMatch(script, /existing\\.innerHTML !== desired\\.innerHTML/, 'dosage reconciliation must not compare mutable innerHTML');`;
    const assertions = `${marker}\nassert.doesNotMatch(script, /existing\\.replaceWith\\(desired\\)/, 'dosage reconciliation must preserve unified-table cell identity');`;
    if (!test.includes(marker)) throw new Error('Dosage signature patch: stable-cell regression test anchor missing.');
    test = test.replace(marker, assertions);
  }
  if (!test.includes('failed dosage batches must not auto-retry during idle')) {
    const marker = `assert.match(script, /REQUEST_BATCH_SIZE = 100/);`;
    const assertion = `${marker}\nassert.match(script, /!clinical\\.failedNumbers\\.has\\(number\\)/, 'failed dosage batches must not auto-retry during idle');`;
    if (!test.includes(marker)) throw new Error('Dosage signature patch: failed-batch regression test anchor missing.');
    test = test.replace(marker, assertion);
  }
  if (!test.includes('nested dosage changes must explicitly refresh row expansion')) {
    const marker = `assert.match(script, /REQUEST_BATCH_SIZE = 100/);`;
    const assertion = `${marker}\nassert.match(script, /if \\(rowContentChanged\\) window\\.MedIndexRegistryRows\\?\\.refresh\\?\\.\\(\\);/, 'nested dosage changes must explicitly refresh row expansion');`;
    if (!test.includes(marker)) throw new Error('Dosage signature patch: explicit row refresh regression-test anchor missing.');
    test = test.replace(marker, assertion);
  }
  fs.writeFileSync(TEST, test, 'utf8');
}

console.log('Deterministic dosage cells active; nested dosage changes explicitly refresh row expansion and failed batches stay stable.');
