'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'registry-v2.js');
const cssTarget = path.join(root, 'registry-v2.css');
const STABILITY_MARKER = 'registry-column-picker-stability-v2';
const CSS_STABILITY_MARKER = 'registry-column-picker-scroll-stability-v2';

let source = fs.readFileSync(target, 'utf8');
let css = fs.readFileSync(cssTarget, 'utf8');

function replaceOnce(pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`Registry column picker stability anchor missing: ${label}`);
  source = source.replace(pattern, replacement);
}

if (!source.includes(STABILITY_MARKER)) {
  replaceOnce(
    "  'use strict';\n",
    "  'use strict';\n\n  const COLUMN_PICKER_STABILITY = 'registry-column-picker-stability-v2';\n",
    'runtime marker',
  );

  replaceOnce(
    /    visibleColumns: new Set\(DEFAULT_VISIBLE_COLUMNS\),\n    preferenceSaveTimer: 0,/,
    `    visibleColumns: new Set(DEFAULT_VISIBLE_COLUMNS),
    columnPickerDraft: null,
    columnPickerDirty: false,
    preferenceInteractionVersion: 0,
    preferenceSaveTimer: 0,
    preferenceRevision: 0,
    preferenceSaveInFlight: false,
    preferenceSavePending: false,`,
    'preference state',
  );

  replaceOnce(
    /  function updateColumnPickerSummary\(\) \{[\s\S]*?\n  \}\n\n  function applyColumnVisibility\(\) \{/,
    `  function columnPickerSelection() {
    return state.columnPickerDraft instanceof Set ? state.columnPickerDraft : state.visibleColumns;
  }

  function sameColumnSelection(left, right) {
    if (!(left instanceof Set) || !(right instanceof Set) || left.size !== right.size) return false;
    for (const id of left) if (!right.has(id)) return false;
    return true;
  }

  function updateColumnPickerSummary() {
    const selection = columnPickerSelection();
    const visible = COLUMN_DEFS.filter(item => selection.has(item.id)).length;
    if (el.columnPickerSummary) el.columnPickerSummary.textContent = \`${visible} nga ${COLUMN_DEFS.length} të dukshme\`;
  }

  function renderColumnPicker() {
    if (!el.columnPickerList) return;
    const selection = columnPickerSelection();
    el.columnPickerList.innerHTML = COLUMN_DEFS.map(item => {
      const checked = selection.has(item.id);
      return \`<label class="column-option${item.required ? ' is-required' : ''}">
        <input type="checkbox" data-column-toggle="${escapeHtml(item.id)}" ${checked ? 'checked' : ''} ${item.required ? 'disabled' : ''}>
        <span class="column-option-check" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="m3.2 8.1 2.8 2.8 6-6"/></svg></span>
        <span class="column-option-copy"><strong>${escapeHtml(item.label)}</strong><small>${item.required ? 'Gjithmonë e dukshme' : escapeHtml(item.hint)}</small></span>
      </label>\`;
    }).join('');
    updateColumnPickerSummary();
  }

  function syncColumnPickerState() {
    if (!el.columnPickerList) return;
    const selection = columnPickerSelection();
    for (const item of COLUMN_DEFS) {
      const input = el.columnPickerList.querySelector(\`[data-column-toggle="${CSS.escape(item.id)}"]\`);
      if (input) input.checked = selection.has(item.id);
    }
    updateColumnPickerSummary();
  }

  function applyColumnVisibility() {`,
    'draft picker helpers',
  );

  replaceOnce(
    /    if \(el\.registryTable\) el\.registryTable\.style\.minWidth = `\$\{Math\.max\(720, visibleWidth\)\}px`;\n\n    renderColumnPicker\(\);\n  \}\n\n  function setColumnSaveStatus/,
    `    if (el.registryTable) el.registryTable.style.minWidth = \`${Math.max(720, visibleWidth)}px\`;

    // Never rebuild the open picker while the doctor is selecting columns.
    // Rebuilding or changing the table underneath the pointer was the source
    // of focus loss, scroll jumps and checkmarks that appeared to undo themselves.
    if (el.columnPickerPanel && !el.columnPickerPanel.hidden) syncColumnPickerState();
    else updateColumnPickerSummary();
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
    const snapshot = normalizeColumns([...state.visibleColumns]);
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
      if (!Array.isArray(payload.registryColumns)) throw new Error('Invalid registry column preference response');

      // The local committed selection is authoritative for this interaction.
      // A delayed server acknowledgement may confirm the save, but must never
      // repaint the checkboxes or roll a newer local selection backwards.
      if (revision === state.preferenceRevision) {
        cacheColumns();
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
    'serialized preference persistence',
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
    /  async function loadColumnPreferences\(authPayload\) \{[\s\S]*?\n  \}\n\n  function openColumnPicker\(\) \{/,
    `  async function loadColumnPreferences(authPayload) {
    state.preferenceOwner = clean(authPayload?.authUser?.id || authPayload?.user?.email || '').toLowerCase();
    const interactionVersion = state.preferenceInteractionVersion;
    const cached = readCachedColumns();
    if (cached) state.visibleColumns = new Set(ensureClinicalColumns(cached));
    applyColumnVisibility();
    setColumnSaveStatus(cached ? 'Preferenca lokale u ngarkua' : 'Duke sinkronizuar…');
    try {
      const { payload } = await fetchJson(PREFERENCES_API, {}, 6000);
      state.preferenceOwner = clean(payload.userId || state.preferenceOwner).toLowerCase();
      const migrate = needsClinicalColumnMigration();

      // A profile GET can finish after the user has already started clicking.
      // In that case it is stale relative to the live interaction and is not
      // allowed to remove a checkmark the doctor just selected.
      if (interactionVersion !== state.preferenceInteractionVersion || state.columnPickerDirty) {
        setColumnSaveStatus('Zgjedhjet e tua mbeten aktive', 'local');
        return;
      }

      const normalized = ensureClinicalColumns(payload.registryColumns);
      state.visibleColumns = new Set(normalized);
      if (state.columnPickerDraft instanceof Set) state.columnPickerDraft = new Set(normalized);
      cacheColumns();
      applyColumnVisibility();
      if (migrate) await persistColumnPreferences();
      else setColumnSaveStatus('Sinkronizuar me profilin', 'success');
    } catch (error) {
      console.warn('Column preferences load failed:', error);
      setColumnSaveStatus(cached ? 'Nga kjo pajisje' : 'Standardi DRx', cached ? 'local' : '');
    }
  }

  function openColumnPicker() {`,
    'preference load race guard',
  );

  replaceOnce(
    /  function openColumnPicker\(\) \{[\s\S]*?\n  \}\n\n  function loadProfileChrome\(\) \{/,
    `  function openColumnPicker() {
    if (!el.columnPickerPanel) return;
    closeFormPicker();
    state.columnPickerDraft = new Set(state.visibleColumns);
    state.columnPickerDirty = false;
    el.columnPickerPanel.hidden = false;
    el.columnPickerButton.setAttribute('aria-expanded', 'true');
    renderColumnPicker();
    // Always open from a deterministic position and keep pointer focus where
    // the user put it. Auto-focusing a checkbox can make WebKit scroll the
    // internal list even when preventScroll is requested.
    el.columnPickerList.scrollTop = 0;
  }

  function closeColumnPicker({ focusButton = false, commit = true } = {}) {
    if (!el.columnPickerPanel || el.columnPickerPanel.hidden) return;
    const draft = state.columnPickerDraft instanceof Set ? new Set(state.columnPickerDraft) : null;
    const shouldCommit = Boolean(commit && state.columnPickerDirty && draft);

    el.columnPickerPanel.hidden = true;
    el.columnPickerButton.setAttribute('aria-expanded', 'false');
    state.columnPickerDraft = null;
    state.columnPickerDirty = false;

    if (shouldCommit) {
      state.visibleColumns = new Set(normalizeColumns([...draft]));
      state.preferenceRevision += 1;
      cacheColumns();
      applyColumnVisibility();
      scheduleColumnSave();
    } else {
      updateColumnPickerSummary();
    }

    if (focusButton) el.columnPickerButton.focus({ preventScroll:true });
  }

  function toggleColumn(id, visible) {
    const item = COLUMN_DEFS.find(entry => entry.id === id);
    if (!item || item.required) return;
    if (!(state.columnPickerDraft instanceof Set)) state.columnPickerDraft = new Set(state.visibleColumns);

    state.preferenceInteractionVersion += 1;
    if (visible) state.columnPickerDraft.add(id);
    else state.columnPickerDraft.delete(id);
    state.columnPickerDirty = !sameColumnSelection(state.columnPickerDraft, state.visibleColumns);
    syncColumnPickerState();
    setColumnSaveStatus(state.columnPickerDirty ? 'Ndryshimet ruhen kur mbyllet' : 'Pa ndryshime', state.columnPickerDirty ? 'local' : '');
  }

  function loadProfileChrome() {`,
    'transactional open close toggle',
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
    'native checkbox change handling',
  );

  replaceOnce(
    /    el\.resetColumnsButton\.addEventListener\('click', \(\) => \{\n      state\.visibleColumns = new Set\(DEFAULT_VISIBLE_COLUMNS\);\n      applyColumnVisibility\(\);\n      scheduleColumnSave\(\);\n    \}\);/,
    `    el.resetColumnsButton.addEventListener('click', () => {
      if (!(state.columnPickerDraft instanceof Set)) state.columnPickerDraft = new Set(state.visibleColumns);
      state.preferenceInteractionVersion += 1;
      state.columnPickerDraft = new Set(DEFAULT_VISIBLE_COLUMNS);
      state.columnPickerDirty = !sameColumnSelection(state.columnPickerDraft, state.visibleColumns);
      syncColumnPickerState();
      setColumnSaveStatus(state.columnPickerDirty ? 'Ndryshimet ruhen kur mbyllet' : 'Pa ndryshime', state.columnPickerDirty ? 'local' : '');
    });`,
    'transactional reset',
  );

  const required = [
    STABILITY_MARKER,
    'columnPickerDraft: null',
    'preferenceInteractionVersion: 0',
    'function sameColumnSelection(',
    'state.columnPickerDraft = new Set(state.visibleColumns);',
    'interactionVersion !== state.preferenceInteractionVersion',
    "el.columnPickerPanel.addEventListener('change'",
    'registryColumns:snapshot',
    'el.columnPickerList.scrollTop = 0;',
    'Ndryshimet ruhen kur mbyllet',
  ];
  for (const needle of required) {
    if (!source.includes(needle)) throw new Error(`Registry column picker stability output missing: ${needle}`);
  }

  if (source.includes("querySelector('input:not(:disabled)')?.focus")) {
    throw new Error('Registry column picker still auto-focuses an internal checkbox and may scroll-jump.');
  }

  fs.writeFileSync(target, source, 'utf8');
}

if (!css.includes(CSS_STABILITY_MARKER)) {
  const before = '.column-picker-list{max-height:min(410px,calc(100vh - 270px));padding:6px;overflow:auto;overscroll-behavior:contain}';
  const after = `/* ${CSS_STABILITY_MARKER}: keep the list anchored while checkboxes change. */\n.column-picker-list{max-height:min(410px,calc(100vh - 270px));padding:6px;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-gutter:stable;scroll-behavior:auto}\n.column-option{overflow-anchor:none}`;
  if (!css.includes(before)) throw new Error('Registry column picker CSS stability anchor missing.');
  css = css.replace(before, after);
  fs.writeFileSync(cssTarget, css, 'utf8');
}

console.log('Stabilized Registry v2 column picker: draft selection, race-safe sync and fixed scroll anchoring.');
