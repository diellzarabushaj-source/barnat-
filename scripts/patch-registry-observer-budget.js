'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CELL_PREVIEW = path.join(ROOT, 'registry-cell-preview.js');
const DOSE_COLUMNS = path.join(ROOT, 'registry-dosage-columns-v3.js');
const DOSE_CALCULATOR = path.join(ROOT, 'registry-dose-calculator.js');
const DOSE_TABLE = path.join(ROOT, 'registry-dose-table-button.js');
const MARKER = 'registry-observer-budget-v1';
const normalize = value => value.replace(/\r\n?/g, '\n');

function read(file) { return normalize(fs.readFileSync(file, 'utf8')); }
function write(file, source) { fs.writeFileSync(file, source, 'utf8'); }
function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Observer budget patch could not find ${label}.`);
  return source.replace(needle, replacement);
}

let calculator = read(DOSE_CALCULATOR);
if (!calculator.includes(`// ${MARKER}: calculator activation publishes one explicit downstream invalidation.`)) {
  const activation = `      .then(() => {\n        observe();\n        scheduleEnhance();\n        return { registry, catalog };\n      })`;
  calculator = replaceOnce(calculator, activation, `      .then(() => {
        observe();
        scheduleEnhance();
        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent('medindex:dose-calculator-activated', {
            detail:{ reason, version:STARTUP_VERSION },
          }));
        }
        // ${MARKER}: calculator activation publishes one explicit downstream invalidation.
        return { registry, catalog };
      })`, 'dose calculator activation completion');
}
write(DOSE_CALCULATOR, calculator);

let dosage = read(DOSE_COLUMNS);
if (!dosage.includes(`// ${MARKER}: nested dosage DOM writes publish one explicit refresh event.`)) {
  const applyAnchor = `      applyVisibility();\n      document.documentElement.dataset.registryDosagePerformance = VERSION;`;
  dosage = replaceOnce(dosage, applyAnchor, `      applyVisibility();
      document.documentElement.dataset.registryDosagePerformance = VERSION;
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('medindex:registry-content-changed', {
          detail:{ source:'dosage', version:VERSION },
        }));
      }
      // ${MARKER}: nested dosage DOM writes publish one explicit refresh event.`, 'dosage enhance event');
}
write(DOSE_COLUMNS, dosage);

let preview = read(CELL_PREVIEW);
if (!preview.includes(`// ${MARKER}: only direct row replacement is observed; nested updates are explicit events.`)) {
  const observerBlock = `    tableObserver.observe(tbody, {\n      childList:true,\n      subtree:true,\n      characterData:true,\n      attributes:true,\n      attributeFilter:['class', 'data-registry-row-expanded'],\n    });`;
  preview = replaceOnce(preview, observerBlock, `    // ${MARKER}: only direct row replacement is observed; nested updates are explicit events.
    tableObserver.observe(tbody, { childList:true });`, 'cell-preview broad tbody observer');

  const eventAnchor = `    window.addEventListener('medindex:registry-table-stable', activate);`;
  preview = replaceOnce(preview, eventAnchor, `${eventAnchor}
    window.addEventListener('medindex:registry-content-changed', scheduleEnhance);
    window.addEventListener('medindex:registry-row-expanded-change', scheduleEnhance);`, 'cell-preview explicit refresh events');
}
write(CELL_PREVIEW, preview);

let doseTable = read(DOSE_TABLE);
if (!doseTable.includes(`// ${MARKER}: dose-table observers are armed only after calculator activation.`)) {
  doseTable = replaceOnce(doseTable, `  let maxRunMs = 0;`, `  let maxRunMs = 0;
  let active = false;`, 'dose-table active state');

  const startBlock = `  function start() {\n    observeTable();\n    scanVisiblePage();\n    document.documentElement.dataset.doseTableButtonAudit = VERSION;\n  }`;
  doseTable = replaceOnce(doseTable, startBlock, `  function activate() {
    if (active) return;
    active = true;
    observeTable();
    scanVisiblePage();
    document.documentElement.dataset.doseTableButtonAudit = VERSION;
  }

  function start() {
    // ${MARKER}: dose-table observers are armed only after calculator activation.
    window.addEventListener('medindex:dose-calculator-activated', activate);
    if (document.documentElement.dataset.doseCalculatorActivation) activate();
    else document.documentElement.dataset.doseTableButtonAudit = VERSION + '-deferred';
  }`, 'dose-table eager start');
}
write(DOSE_TABLE, doseTable);

execFileSync(process.execPath, [path.join(ROOT, 'tests', 'registry-observer-budget-test.js')], {
  cwd:ROOT,
  stdio:'inherit',
});
console.log('Registry observer budget applied: direct-row preview observation, explicit dosage invalidation, and deferred dose-table observers replace broad startup churn.');
