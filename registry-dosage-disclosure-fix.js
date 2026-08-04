(() => {
  'use strict';

  const VERSION = 'registry-dosage-disclosure-fix-20260803-2';
  const TRIGGER_SELECTOR = '.registry-dosage-dose';
  const ROW_CLASS = 'registry-dose-inline-expanded';
  const CELL_CLASS = 'registry-dosage-cell-expanded';

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const setImportant = (element, property, value) => element?.style?.setProperty(property, value, 'important');
  const clearStyle = (element, property) => element?.style?.removeProperty(property);

  const RELEASED_PROPERTIES = Object.freeze({
    row:['height', 'max-height'],
    cell:['height', 'max-height', 'overflow', 'vertical-align'],
    regimen:['display', 'height', 'max-height', 'overflow'],
    trigger:['display', 'height', 'max-height', 'overflow', 'white-space'],
    text:['display', 'height', 'max-height', 'overflow', 'text-overflow', 'white-space', '-webkit-box-orient', '-webkit-line-clamp'],
  });

  function clearProperties(element, properties) {
    properties.forEach(property => clearStyle(element, property));
  }

  function releaseRegimen(regimen, expanded) {
    const trigger = regimen?.querySelector?.(':scope > .registry-dosage-dose');
    const text = trigger?.querySelector?.('.registry-dosage-dose-text');

    if (!expanded) {
      clearProperties(regimen, RELEASED_PROPERTIES.regimen);
      clearProperties(trigger, RELEASED_PROPERTIES.trigger);
      clearProperties(text, RELEASED_PROPERTIES.text);
      return;
    }

    setImportant(regimen, 'display', 'grid');
    setImportant(regimen, 'height', 'auto');
    setImportant(regimen, 'max-height', 'none');
    setImportant(regimen, 'overflow', 'visible');

    setImportant(trigger, 'display', 'block');
    setImportant(trigger, 'height', 'auto');
    setImportant(trigger, 'max-height', 'none');
    setImportant(trigger, 'overflow', 'visible');
    setImportant(trigger, 'white-space', 'normal');

    setImportant(text, 'display', 'block');
    setImportant(text, 'height', 'auto');
    setImportant(text, 'max-height', 'none');
    setImportant(text, 'overflow', 'visible');
    setImportant(text, 'text-overflow', 'clip');
    setImportant(text, 'white-space', 'normal');
    setImportant(text, '-webkit-box-orient', 'initial');
    setImportant(text, '-webkit-line-clamp', 'unset');
  }

  function syncCell(cell) {
    if (!cell) return false;
    const regimens = [...cell.querySelectorAll('.registry-dosage-regimen')];
    regimens.forEach(regimen => releaseRegimen(regimen, regimen.classList.contains('is-expanded')));

    const expanded = regimens.some(regimen => regimen.classList.contains('is-expanded'));
    cell.classList.toggle(CELL_CLASS, expanded);
    cell.dataset.registryDosageExpanded = String(expanded);

    if (expanded) {
      setImportant(cell, 'height', 'auto');
      setImportant(cell, 'max-height', 'none');
      setImportant(cell, 'overflow', 'visible');
      setImportant(cell, 'vertical-align', 'top');
    } else {
      clearProperties(cell, RELEASED_PROPERTIES.cell);
    }
    return expanded;
  }

  function syncRow(row) {
    if (!row) return false;
    row.querySelectorAll('td.registry-dosage-column').forEach(syncCell);
    const expanded = Boolean(row.querySelector('.registry-dosage-regimen.is-expanded'));
    row.classList.toggle(ROW_CLASS, expanded);
    row.dataset.registryDoseInlineExpanded = String(expanded);

    if (expanded) {
      setImportant(row, 'height', 'auto');
      setImportant(row, 'max-height', 'none');
      [...row.cells].forEach(cell => {
        setImportant(cell, 'height', 'auto');
        setImportant(cell, 'max-height', 'none');
      });
    } else {
      clearProperties(row, RELEASED_PROPERTIES.row);
      [...row.cells].forEach(cell => {
        clearStyle(cell, 'height');
        clearStyle(cell, 'max-height');
      });
    }
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
