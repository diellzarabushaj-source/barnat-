(() => {
  'use strict';

  const VERSION = 'registry-dosage-disclosure-fix-20260803-1';
  const TRIGGER_SELECTOR = '.registry-dosage-dose';
  const ROW_CLASS = 'registry-dose-inline-expanded';
  const CELL_CLASS = 'registry-dosage-cell-expanded';

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function syncCell(cell) {
    if (!cell) return false;
    const expanded = Boolean(cell.querySelector('.registry-dosage-regimen.is-expanded'));
    cell.classList.toggle(CELL_CLASS, expanded);
    cell.dataset.registryDosageExpanded = String(expanded);
    return expanded;
  }

  function syncRow(row) {
    if (!row) return false;
    row.querySelectorAll('td.registry-dosage-column').forEach(syncCell);
    const expanded = Boolean(row.querySelector('.registry-dosage-regimen.is-expanded'));
    row.classList.toggle(ROW_CLASS, expanded);
    row.dataset.registryDoseInlineExpanded = String(expanded);
    return expanded;
  }

  function setExpanded(trigger, expanded) {
    const regimen = trigger?.closest?.('.registry-dosage-regimen');
    const row = trigger?.closest?.('tr');
    if (!regimen || !row) return false;

    regimen.classList.toggle('is-expanded', expanded);
    trigger.setAttribute('aria-expanded', String(expanded));

    const toggle = trigger.querySelector('.registry-dosage-toggle');
    if (toggle) toggle.textContent = expanded ? 'Më pak' : 'Më shumë';

    const dose = clean(trigger.querySelector('.registry-dosage-dose-text')?.textContent);
    trigger.setAttribute('aria-label', `${expanded ? 'Mbyll' : 'Shfaq'} dozimin e plotë${dose ? `: ${dose}` : ''}`);
    trigger.title = expanded ? 'Mbyll tekstin e plotë' : (dose || 'Shfaq tekstin e plotë');

    syncRow(row);
    requestAnimationFrame(() => {
      if (expanded) trigger.scrollIntoView({ block:'nearest', inline:'nearest' });
    });

    window.dispatchEvent(new CustomEvent('medindex:dosage-disclosure-change', {
      detail:{ expanded, row, regimen },
    }));
    return true;
  }

  function onClick(event) {
    const trigger = event.target.closest?.(TRIGGER_SELECTOR);
    if (!trigger) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const expanded = trigger.getAttribute('aria-expanded') !== 'true';
    setExpanded(trigger, expanded);
  }

  function syncExisting() {
    document.querySelectorAll('#tbody > tr').forEach(syncRow);
    document.documentElement.dataset.registryDosageDisclosureFix = VERSION;
  }

  function init() {
    document.addEventListener('click', onClick, true);

    const tbody = document.getElementById('tbody');
    if (tbody) {
      new MutationObserver(syncExisting).observe(tbody, { childList:true, subtree:true });
    }

    ['medindex:registry-ready', 'medindex:registry-data-ready', 'medindex:registry-table-stable']
      .forEach(eventName => window.addEventListener(eventName, syncExisting));

    syncExisting();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.MedIndexDosageDisclosure = {
    version:VERSION,
    setExpanded,
    refresh:syncExisting,
  };
})();
