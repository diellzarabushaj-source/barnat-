'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'registry-v2.js');
const STABILITY_MARKER = 'registry-column-picker-stability-v1';

let source = fs.readFileSync(target, 'utf8');
if (source.includes(STABILITY_MARKER)) {
  console.log('Registry v2 column picker stability patch already applied.');
  return;
}

function replaceOnce(pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`Registry column picker stability anchor missing: ${label}`);
  source = source.replace(pattern, replacement);
}

replaceOnce(
  "  'use strict';\n",
  "  'use strict';\n\n  const COLUMN_PICKER_STABILITY = 'registry-column-picker-stability-v1';\n",
  'runtime marker',
);

replaceOnce(
  /    visibleColumns: new Set\(DEFAULT_VISIBLE_COLUMNS\),\n    preferenceSaveTimer: 0,/,
  `    visibleColumns: new Set(DEFAULT_VISIBLE_COLUMNS),
    preferenceSaveTimer: 0,
    preferenceRevision: 0,
    preferenceSaveInFlight: false,
    preferenceSavePending: false,`,
  'preference state',
);

replaceOnce(
  /    updateColumnPickerSummary\(\);\n  \}\n\n  function applyColumnVisibility\(\) \{/,
  `    updateColumnPickerSummary();
  }

  function syncColumnPickerState() {
    if (!el.columnPickerList) return;
    for (const item of COLUMN_DEFS) {
      const input = el.columnPickerList.querySelector(\`[data-column-toggle="\${CSS.escape(item.id)}"]\`);
      if (input) input.checked = state.visibleColumns.has(item.id);
    }
    updateColumnPickerSummary();
  }

  function applyColumnVisibility() {`,
  'picker state sync',
);

replaceOnce(
  /    if \(el\.registryTable\) el\.registryTable\.style\.minWidth = `\$\{Math\.max\(720, visibleWidth\)\}px`;\n\n    renderColumnPicker\(\);\n  \}\n\n  function setColumnSaveStatus/,
  `    if (el.registryTable) el.registryTable.style.minWidth = \`\${Math.max(720, visibleWidth)}px\`;

    // Do not rebuild the picker DOM on every checkbox click. Replacing the
    // focused input caused focus loss and visible jumpiness in the open panel.
    syncColumnPickerState();
  }

  function setColumnSaveStatus`,
  'visibility render path',
);

replaceOnce(
  /  async function persistColumnPreferences\(\) \{[\s\S]*?\n  \}\n\n  function scheduleColumnSave\(\) \{/,
  `  async function persistColumnPreferences() {
    if (state.preferenceSaveInFlight) {
      state.preferenceSavePending = true;
      return;
    }

    const revision = state.preferenceRevision;
    const snapshot = [...state.visibleColumns];
    state.preferenceSaveInFlight = true;
    state.preferenceSavePending = false;
    cacheColumns();
    setColumnSaveStatus('Duke ruajtur…');

    try {
      const { payload } = await fetchJson(PREFERENCES_API, {
        method:'PUT',
        body:JSON.stringify({ registryColumns:snapshot }),
        headers:{ 'Content-Type':'application/json' },
      }, 6000);

      // A slower response from an older checkbox state must never roll the UI
      // back. If the doctor changed columns while this write was in flight,
      // keep the current local state and queue the newest snapshot below.
      if (revision === state.preferenceRevision) {
        const normalized = ensureClinicalColumns(payload.registryColumns);
        state.visibleColumns = new Set(normalized);
        cacheColumns();
        applyColumnVisibility();
        markClinicalColumnMigration();
        setColumnSaveStatus('Ruajtur në profil', 'success');
      }
    } catch (error) {
      console.warn('Column preferences save failed:', error);
      if (revision === state.preferenceRevision) {
        setColumnSaveStatus('Ruajtur në këtë pajisje', 'local');
      }
    } finally {
      state.preferenceSaveInFlight = false;
      if (state.preferenceSavePending || revision !== state.preferenceRevision) {
        state.preferenceSavePending = false;
        clearTimeout(state.preferenceSaveTimer);
        state.preferenceSaveTimer = setTimeout(() => {
          state.preferenceSaveTimer = 0;
          void persistColumnPreferences();
        }, 0);
      }
    }
  }

  function scheduleColumnSave() {`,
  'preference persistence',
);

replaceOnce(
  /    state\.preferenceSaveTimer = setTimeout\(\(\) => \{ void persistColumnPreferences\(\); \}, 260\);/,
  `    state.preferenceSaveTimer = setTimeout(() => {
      state.preferenceSaveTimer = 0;
      void persistColumnPreferences();
    }, 260);`,
  'save debounce',
);

replaceOnce(
  /    if \(visible\) state\.visibleColumns\.add\(id\);\n    else state\.visibleColumns\.delete\(id\);\n    applyColumnVisibility\(\);\n    scheduleColumnSave\(\);/,
  `    if (visible) state.visibleColumns.add(id);
    else state.visibleColumns.delete(id);
    state.preferenceRevision += 1;
    applyColumnVisibility();
    scheduleColumnSave();`,
  'single-column toggle revision',
);

replaceOnce(
  /    el\.columnPickerPanel\.addEventListener\('click', event => \{\n      event\.stopPropagation\(\);\n      const input = event\.target\.closest\('\[data-column-toggle\]'\);\n      if \(input\) toggleColumn\(input\.dataset\.columnToggle, input\.checked\);\n    \}\);/,
  `    el.columnPickerPanel.addEventListener('click', event => {
      event.stopPropagation();
    });
    el.columnPickerPanel.addEventListener('change', event => {
      const input = event.target.closest('[data-column-toggle]');
      if (input) toggleColumn(input.dataset.columnToggle, input.checked);
    });`,
  'checkbox event handling',
);

replaceOnce(
  /    el\.resetColumnsButton\.addEventListener\('click', \(\) => \{\n      state\.visibleColumns = new Set\(DEFAULT_VISIBLE_COLUMNS\);\n      applyColumnVisibility\(\);/,
  `    el.resetColumnsButton.addEventListener('click', () => {
      state.visibleColumns = new Set(DEFAULT_VISIBLE_COLUMNS);
      state.preferenceRevision += 1;
      applyColumnVisibility();`,
  'reset revision',
);

const required = [
  STABILITY_MARKER,
  'function syncColumnPickerState()',
  'preferenceSaveInFlight: false',
  'state.preferenceRevision += 1;',
  "el.columnPickerPanel.addEventListener('change'",
  'registryColumns:snapshot',
];
for (const needle of required) {
  if (!source.includes(needle)) throw new Error(`Registry column picker stability output missing: ${needle}`);
}

fs.writeFileSync(target, source, 'utf8');
console.log('Stabilized Registry v2 column picker: DOM continuity + serialized preference writes.');
