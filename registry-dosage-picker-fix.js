(() => {
  'use strict';

  if (window.__MEDINDEX_DOSAGE_PICKER_FIX_ACTIVE__) return;
  window.__MEDINDEX_DOSAGE_PICKER_FIX_ACTIVE__ = true;

  const PANEL_ID = 'colPanel';
  const GROUP_ID = 'registryDosagePickerGroup';
  const STORAGE_KEY = 'medindex-registry-dosage-columns-v1';
  const OPTIONS = [
    { key: 'adult', label: '1. Dozimi për të rritur' },
    { key: 'pediatric', label: '2. Dozimi për fëmijë' },
  ];

  let syncing = false;
  let syncTimer = 0;

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        adult: saved.adult !== false,
        pediatric: saved.pediatric !== false,
      };
    } catch {
      return { adult: true, pediatric: true };
    }
  }

  function writeState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function applyState(state) {
    document.documentElement.classList.toggle('hide-registry-dosage-adult', !state.adult);
    document.documentElement.classList.toggle('hide-registry-dosage-pediatric', !state.pediatric);
  }

  function currentState() {
    return {
      adult: !document.documentElement.classList.contains('hide-registry-dosage-adult'),
      pediatric: !document.documentElement.classList.contains('hide-registry-dosage-pediatric'),
    };
  }

  function createOption(option, state) {
    const label = document.createElement('label');
    label.className = 'registry-dosage-picker-option';
    label.dataset.registryDosagePicker = option.key;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(state[option.key]);
    checkbox.setAttribute('aria-label', option.label);
    checkbox.addEventListener('change', () => {
      const next = currentState();
      next[option.key] = checkbox.checked;
      writeState(next);
      applyState(next);
    });

    const span = document.createElement('span');
    span.textContent = option.label;
    label.append(checkbox, span);
    return label;
  }

  function validExistingGroup(group) {
    if (!group) return false;
    const options = group.querySelectorAll('[data-registry-dosage-picker]');
    if (options.length !== OPTIONS.length) return false;
    return OPTIONS.every(option => group.querySelector(`[data-registry-dosage-picker="${option.key}"]`));
  }

  function syncPicker() {
    if (syncing) return;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    syncing = true;
    try {
      const state = readState();
      applyState(state);

      const groups = Array.from(panel.querySelectorAll(`#${GROUP_ID}`));
      const group = groups[0] || null;
      groups.slice(1).forEach(node => node.remove());

      panel.querySelectorAll(':scope > [data-registry-dosage-picker]').forEach(node => node.remove());

      if (validExistingGroup(group)) {
        OPTIONS.forEach(option => {
          const checkbox = group.querySelector(`[data-registry-dosage-picker="${option.key}"] input[type="checkbox"]`);
          if (checkbox) checkbox.checked = Boolean(state[option.key]);
        });
        return;
      }

      group?.remove();
      const nextGroup = document.createElement('div');
      nextGroup.id = GROUP_ID;
      nextGroup.className = 'registry-dosage-picker-group';
      nextGroup.setAttribute('role', 'group');
      nextGroup.setAttribute('aria-label', 'Kolonat e dozimit');

      const title = document.createElement('div');
      title.className = 'registry-dosage-picker-title';
      title.textContent = 'Dozimi';
      nextGroup.appendChild(title);
      OPTIONS.forEach(option => nextGroup.appendChild(createOption(option, state)));

      const actions = panel.querySelector('.col-panel-actions');
      if (actions?.nextSibling) panel.insertBefore(nextGroup, actions.nextSibling);
      else panel.appendChild(nextGroup);
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPicker, 20);
  }

  function handlePanelAction(event) {
    const button = event.target.closest?.('.col-panel-actions button');
    if (!button) return;
    const buttons = Array.from(button.parentElement.querySelectorAll('button'));
    const index = buttons.indexOf(button);
    if (index !== 0 && index !== 1) return;
    const visible = index === 0;
    const state = { adult: visible, pediatric: visible };
    writeState(state);
    applyState(state);
    scheduleSync();
  }

  const observer = new MutationObserver(mutations => {
    if (syncing) return;
    if (mutations.some(mutation => {
      const target = mutation.target;
      return target?.id === PANEL_ID || target?.closest?.(`#${PANEL_ID}`);
    })) scheduleSync();
  });

  document.addEventListener('click', event => {
    const panel = document.getElementById(PANEL_ID);
    if (panel?.contains(event.target)) handlePanelAction(event);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  applyState(readState());
  scheduleSync();
})();