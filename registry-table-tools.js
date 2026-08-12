(() => {
  'use strict';

  const VERSION = 'registry-table-tools-v1';
  const DOSE_STORAGE_KEY = 'medindex.registry.dose-calculator.visible.v1';
  const ROOT = document.documentElement;
  const NOTE_MAX = 2000;
  let pickerObserver = null;
  let pickerQueued = false;
  let activeSource = null;
  let returnFocus = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeSelector = value => window.CSS?.escape
    ? CSS.escape(String(value ?? ''))
    : String(value ?? '').replace(/["\\]/g, '\\$&');

  function storedDoseVisibility() {
    try { return localStorage.getItem(DOSE_STORAGE_KEY) === 'true'; }
    catch { return false; }
  }

  function applyDoseVisibility(visible, { persist = false } = {}) {
    const next = Boolean(visible);
    ROOT.dataset.registryDoseColumnVisible = String(next);
    if (persist) {
      try { localStorage.setItem(DOSE_STORAGE_KEY, String(next)); } catch {}
    }
    document.querySelectorAll('[data-registry-dose-column-toggle]').forEach(input => {
      input.checked = next;
    });
    window.dispatchEvent(new CustomEvent('medindex:registry-dose-column-changed', {
      detail:{ visible:next },
    }));
  }

  function dosePreferenceLabel() {
    const label = document.createElement('label');
    label.className = 'registry-dose-column-preference';
    label.dataset.registryDoseColumnPreference = 'true';
    label.innerHTML = `
      <input type="checkbox" data-registry-dose-column-toggle aria-label="Shfaq kalkulatorin e dozës">
      <span class="registry-dose-column-preference-copy">
        <strong>Kalkulatori i dozës</strong>
        <small>Kolonë opsionale · vetëm doza të verifikuara</small>
      </span>`;
    const input = label.querySelector('input');
    input.checked = storedDoseVisibility();
    input.addEventListener('change', event => {
      applyDoseVisibility(event.currentTarget.checked, { persist:true });
      if (event.currentTarget.checked && window.MEDINDEX_DESKTOP_LITE_ACTIVE) {
        window.MEDINDEX_DESKTOP_LITE?.handoff?.('column-dose-calculator');
      }
    });
    return label;
  }

  function removeDeprecatedPickerOptions(panel) {
    let removed = false;
    panel.querySelectorAll('label').forEach(label => {
      if (label.dataset.registryDoseColumnPreference) return;
      const text = clean(label.textContent).toLocaleLowerCase('sq');
      const removedColumn = text === 'verifikimi'
        || text === 'redakto'
        || text.startsWith('shënime personale');
      if (removedColumn) {
        label.remove();
        removed = true;
      }
    });
    return removed;
  }

  function ensureDosePreference() {
    pickerQueued = false;
    const panel = document.getElementById('colPanel');
    if (!panel) return;
    const removed = removeDeprecatedPickerOptions(panel);
    const existing = panel.querySelector('[data-registry-dose-column-preference]');
    if (existing) {
      const input = existing.querySelector('[data-registry-dose-column-toggle]');
      if (input) input.checked = storedDoseVisibility();
      if (removed) window.MedIndexColumnPicker?.refresh?.();
      return;
    }
    const label = dosePreferenceLabel();
    const dosageGroup = panel.querySelector('.registry-dosage-picker-group');
    if (dosageGroup) dosageGroup.insertAdjacentElement('afterend', label);
    else {
      const actions = panel.querySelector('.col-panel-actions');
      actions?.insertAdjacentElement('afterend', label) || panel.prepend(label);
    }
    window.MedIndexColumnPicker?.refresh?.();
  }

  function scheduleDosePreference() {
    if (pickerQueued) return;
    pickerQueued = true;
    requestAnimationFrame(ensureDosePreference);
  }

  function observePicker() {
    const panel = document.getElementById('colPanel');
    if (!panel) return;
    pickerObserver?.disconnect();
    pickerObserver = new MutationObserver(scheduleDosePreference);
    pickerObserver.observe(panel, { childList:true, subtree:true });
    scheduleDosePreference();
  }

  function noteDialog() {
    let overlay = document.getElementById('registryPersonalNoteDialog');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'registryPersonalNoteDialog';
    overlay.className = 'registry-note-dialog-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="registry-note-dialog" role="dialog" aria-modal="true" aria-labelledby="registryNoteDialogTitle">
        <header class="registry-note-dialog-head">
          <span class="registry-note-dialog-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
          </span>
          <span class="registry-note-dialog-heading">
            <strong id="registryNoteDialogTitle">Shënim personal</strong>
            <small data-note-dialog-drug>Bar i zgjedhur</small>
          </span>
          <button type="button" class="registry-note-dialog-close" data-note-dialog-close aria-label="Mbylle">×</button>
        </header>
        <div class="registry-note-dialog-body">
          <label for="registryNoteDialogEditor">Shënimi yt</label>
          <textarea id="registryNoteDialogEditor" rows="7" maxlength="${NOTE_MAX}" data-note-dialog-editor placeholder="Shkruaj shënimin personal…"></textarea>
          <div class="registry-note-dialog-meta">
            <span data-note-dialog-state>Ruhet automatikisht</span>
            <span data-note-dialog-count>0 / ${NOTE_MAX}</span>
          </div>
        </div>
        <footer class="registry-note-dialog-foot">
          <button type="button" class="registry-note-dialog-clear" data-note-dialog-clear>Fshije shënimin</button>
          <button type="button" class="registry-note-dialog-done" data-note-dialog-close>Mbyll</button>
        </footer>
      </section>`;
    document.body.appendChild(overlay);
    bindDialog(overlay);
    return overlay;
  }

  function sourceByKey(key) {
    const selector = `[data-personal-note="${escapeSelector(key)}"]`;
    return document.querySelector(selector);
  }

  function rowDrugLabel(row, fallback = '') {
    const name = clean(row?.dataset?.drugName)
      || clean(row?.querySelector?.('.drug-name-text')?.textContent)
      || clean(fallback)
      || 'Bar i zgjedhur';
    const strength = clean(row?.querySelector?.('[data-registry-column-key="strength"]')?.textContent);
    return strength && strength !== '—' ? `${name} · ${strength}` : name;
  }

  function updateDialogMeta(overlay, state = '') {
    const editor = overlay.querySelector('[data-note-dialog-editor]');
    const value = String(editor?.value || '');
    const count = overlay.querySelector('[data-note-dialog-count]');
    if (count) count.textContent = `${value.length} / ${NOTE_MAX}`;
    const clear = overlay.querySelector('[data-note-dialog-clear]');
    if (clear) clear.hidden = !value.trim();
    const status = overlay.querySelector('[data-note-dialog-state]');
    if (status && state) status.textContent = state;
  }

  function syncSource({ flush = false } = {}) {
    const overlay = document.getElementById('registryPersonalNoteDialog');
    const editor = overlay?.querySelector('[data-note-dialog-editor]');
    if (!activeSource || !editor) return;
    activeSource.value = editor.value.slice(0, NOTE_MAX);
    activeSource.dispatchEvent(new Event('input', { bubbles:true }));
    if (flush) activeSource.dispatchEvent(new FocusEvent('blur'));
  }

  function openSource(source, { fallbackName = '', opener = null } = {}) {
    if (!(source instanceof HTMLTextAreaElement)) return false;
    const overlay = noteDialog();
    const editor = overlay.querySelector('[data-note-dialog-editor]');
    const row = source.closest('tr');
    activeSource = source;
    returnFocus = opener instanceof HTMLElement ? opener : document.activeElement;
    overlay.dataset.noteKey = clean(source.dataset.personalNote);
    const drug = overlay.querySelector('[data-note-dialog-drug]');
    if (drug) drug.textContent = rowDrugLabel(row, fallbackName);
    editor.value = String(source.value || '').slice(0, NOTE_MAX);
    overlay.hidden = false;
    document.body.classList.add('registry-note-dialog-open');
    updateDialogMeta(overlay, editor.value.trim() ? 'Ruajtur' : 'Ruhet automatikisht');
    requestAnimationFrame(() => {
      editor.focus({ preventScroll:true });
      const end = editor.value.length;
      try { editor.setSelectionRange(end, end); } catch {}
    });
    return true;
  }

  function closeDialog({ restoreFocus = true } = {}) {
    const overlay = document.getElementById('registryPersonalNoteDialog');
    if (!overlay || overlay.hidden) return;
    syncSource({ flush:true });
    overlay.hidden = true;
    delete overlay.dataset.noteKey;
    document.body.classList.remove('registry-note-dialog-open');
    activeSource = null;
    const target = returnFocus;
    returnFocus = null;
    if (restoreFocus && target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll:true });
  }

  function bindDialog(overlay) {
    const editor = overlay.querySelector('[data-note-dialog-editor]');
    editor.addEventListener('input', () => {
      syncSource();
      updateDialogMeta(overlay, 'Duke ruajtur…');
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-note-dialog-close]')) {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.target.closest('[data-note-dialog-clear]')) {
        event.preventDefault();
        editor.value = '';
        syncSource({ flush:true });
        updateDialogMeta(overlay, 'Shënimi u fshi');
        editor.focus({ preventScroll:true });
      }
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        closeDialog();
      } else if (event.key === 'Tab') {
        const focusable = [...overlay.querySelectorAll('button:not([hidden]),textarea')];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    });
  }

  function openByKey(key, options = {}) {
    const source = sourceByKey(clean(key));
    return openSource(source, options);
  }

  function openForRow(row, options = {}) {
    const source = row?.querySelector?.('[data-personal-note]');
    const opener = options.opener || row?.querySelector?.('[data-row-note-jump]');
    return openSource(source, { ...options, opener });
  }

  function start() {
    applyDoseVisibility(storedDoseVisibility());
    observePicker();
    document.getElementById('colPickerBtn')?.addEventListener('click', scheduleDosePreference);
    window.addEventListener('medindex:personal-note-saved', event => {
      const overlay = document.getElementById('registryPersonalNoteDialog');
      if (!overlay || overlay.hidden || clean(event.detail?.key) !== clean(overlay.dataset.noteKey)) return;
      updateDialogMeta(overlay, event.detail?.hasText ? 'Ruajtur' : 'Ruhet automatikisht');
    });
    ROOT.dataset.registryTableTools = VERSION;
  }

  window.MedIndexPersonalNoteComponent = Object.freeze({
    version:VERSION,
    openByKey,
    openForRow,
    close:closeDialog,
    isOpen:() => {
      const overlay = document.getElementById('registryPersonalNoteDialog');
      return Boolean(overlay && !overlay.hidden);
    },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
