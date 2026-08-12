'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'registry-dosage-columns-v3.js');
const TEST = path.join(ROOT, 'tests/registry-dosage-columns-test.js');

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes('function dosageCellSignature(')) {
  const before = `  function createDosageCell(column, row, card) {\n    const cell = document.createElement('td');\n    cell.className = \`registry-dosage-column registry-dosage-\${column.key}\`;\n    cell.dataset.registryDosageColumn = column.key;\n    cell.dataset.label = column.label;\n    if (registry.status === 'loading') cell.innerHTML = '<span class="registry-dosage-muted">Duke e lidhur me barin…</span>';\n    else if (!row) cell.innerHTML = '<span class="registry-dosage-muted">Bari nuk u identifikua në mënyrë unike.</span>';\n    else cell.innerHTML = cellContent(row, card, column.key, column.empty);\n    return cell;\n  }`;

  const after = `  function dosageCellSignature(column, row, card) {\n    const population = clean(column?.key);\n    if (registry.status === 'loading') return [VERSION, population, 'registry-loading'].join('|');\n    if (!row) return [VERSION, population, 'unidentified'].join('|');\n\n    const number = clean(row?.['Nr rendor']);\n    if (card) {\n      const dose = clean(population === 'adult' ? card.adultDose : card.pediatricDose);\n      const route = clean(population === 'adult' ? card.adultRoute : card.pediatricRoute);\n      if (!dose) return [VERSION, population, number, 'empty'].join('|');\n      const sources = (Array.isArray(card.sourceUrls) ? card.sourceUrls : []).map(clean).filter(Boolean).join('~');\n      return [VERSION, population, number, 'dose', dose, route, sources].join('|');\n    }\n\n    if (!number || clinical.pendingNumbers.has(number) || (!clinical.loadedNumbers.has(number) && !clinical.failedNumbers.has(number))) {\n      return [VERSION, population, number, 'pending'].join('|');\n    }\n    if (clinical.failedNumbers.has(number)) return [VERSION, population, number, 'failed'].join('|');\n    return [VERSION, population, number, 'empty'].join('|');\n  }\n\n  function createDosageCell(column, row, card, signature = dosageCellSignature(column, row, card)) {\n    const cell = document.createElement('td');\n    cell.className = \`registry-dosage-column registry-dosage-\${column.key}\`;\n    cell.dataset.registryDosageColumn = column.key;\n    cell.dataset.registryDosageSignature = signature;\n    cell.dataset.label = column.label;\n    if (registry.status === 'loading') cell.innerHTML = '<span class="registry-dosage-muted">Duke e lidhur me barin…</span>';\n    else if (!row) cell.innerHTML = '<span class="registry-dosage-muted">Bari nuk u identifikua në mënyrë unike.</span>';\n    else cell.innerHTML = cellContent(row, card, column.key, column.empty);\n    return cell;\n  }`;

  if (!source.includes(before)) throw new Error('Dosage signature patch: createDosageCell anchor missing.');
  source = source.replace(before, after);
}

const oldReconcile = `        const existing = matches[0];\n        const desired = createDosageCell(column, row, card);\n        if (!existing) tableRow.appendChild(desired);\n        else if (existing.innerHTML !== desired.innerHTML) existing.replaceWith(desired);`;
const newReconcile = `        const existing = matches[0];\n        const signature = dosageCellSignature(column, row, card);\n        const desired = createDosageCell(column, row, card, signature);\n        if (!existing) tableRow.appendChild(desired);\n        else if (existing.dataset.registryDosageSignature !== signature) existing.replaceWith(desired);`;

if (!source.includes(newReconcile)) {
  if (!source.includes(oldReconcile)) throw new Error('Dosage signature patch: ensureRows reconciliation anchor missing.');
  source = source.replace(oldReconcile, newReconcile);
}

if (!source.includes('cell.dataset.registryDosageSignature = signature;')) {
  throw new Error('Dosage signature patch: signature is not stamped on dosage cells.');
}
if (source.includes('existing.innerHTML !== desired.innerHTML')) {
  throw new Error('Dosage signature patch: unstable innerHTML reconciliation is still active.');
}

fs.writeFileSync(TARGET, source, 'utf8');

if (fs.existsSync(TEST)) {
  let test = fs.readFileSync(TEST, 'utf8').replace(/\r\n?/g, '\n');
  const marker = `assert.match(source, /REQUEST_BATCH_SIZE = 100/, 'visible-row dosage requests must remain bounded');`;
  const assertions = `${marker}\nassert.match(source, /registryDosageSignature/, 'dosage cells must carry a deterministic clinical signature');\nassert.match(source, /existing\\.dataset\\.registryDosageSignature !== signature/, 'dosage reconciliation must compare signatures');\nassert.doesNotMatch(source, /existing\\.innerHTML !== desired\\.innerHTML/, 'dosage reconciliation must not compare mutable innerHTML');`;
  if (!test.includes('dosage cells must carry a deterministic clinical signature')) {
    if (!test.includes(marker)) throw new Error('Dosage signature patch: regression test anchor missing.');
    test = test.replace(marker, assertions);
    fs.writeFileSync(TEST, test, 'utf8');
  }
}

console.log('Deterministic dosage cell signatures active; mutable innerHTML replace loop removed.');
