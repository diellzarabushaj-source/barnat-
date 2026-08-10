(() => {
  'use strict';

  const VERSION = 'registry-cell-preview-20260805-8';
  const TRIGGER_CLASS = 'registry-cell-preview-trigger';
  const PREVIEW_ATTR = 'data-registry-cell-preview';
  const THRESHOLDS = Object.freeze({
    'active-substance':34,
    'drug-class':40,
    use:44,
    form:30,
    'dosage-adult':54,
    'dosage-pediatric':54,
  });

  // Lineicons Basic (MIT): expand-square-4.
  const EXPAND_ICON = `
    <svg viewBox="0 0 25 24" fill="none" aria-hidden="true" data-lineicons-icon="expand-square-4">
      <path d="M3.5625 5.5C3.5625 4.25736 4.56986 3.25 5.8125 3.25H8.31213C8.72635 3.25 9.06213 3.58579 9.06213 4C9.06213 4.41421 8.72635 4.75 8.31213 4.75H5.8125C5.39829 4.75 5.0625 5.08579 5.0625 5.5V8C5.0625 8.41421 4.72671 8.75 4.3125 8.75C3.89829 8.75 3.5625 8.41421 3.5625 8V5.5Z" fill="currentColor"/>
      <path d="M15.5614 4C15.5614 3.58579 15.8972 3.25 16.3114 3.25H18.811C20.0537 3.25 21.061 4.25736 21.061 5.5L21.061 8C21.061 8.41421 20.7253 8.75 20.311 8.75C19.8968 8.75 19.561 8.41421 19.561 8L19.561 5.5C19.561 5.08579 19.2253 4.75 18.811 4.75H16.3114C15.8972 4.75 15.5614 4.41421 15.5614 4Z" fill="currentColor"/>
      <path d="M4.3125 15.25C4.72671 15.25 5.0625 15.5858 5.0625 16V18.5C5.0625 18.9142 5.39829 19.25 5.8125 19.25H8.31214C8.72635 19.25 9.06214 19.5858 9.06214 20C9.06214 20.4142 8.72635 20.75 8.31214 20.75H5.8125C4.56986 20.75 3.5625 19.7426 3.5625 18.5V16C3.5625 15.5858 3.89829 15.25 4.3125 15.25Z" fill="currentColor"/>
      <path d="M20.3111 15.25C20.7253 15.25 21.0611 15.5858 21.0611 16L21.0611 18.5C21.0611 19.7426 20.0537 20.75 18.8111 20.75H16.3114C15.8972 20.75 15.5614 20.4142 15.5614 20C15.5614 19.5858 15.8972 19.25 16.3114 19.25H18.8111C19.2253 19.25 19.5611 18.9142 19.5611 18.5L19.5611 16C19.5611 15.5858 19.8968 15.25 20.3111 15.25Z" fill="currentColor"/>
    </svg>`;

  let tableObserver = null;
  let scheduled = false;
  let active = false;
  let fallbackTimer = 0;

  const cleanInline = value => String(value ?? '').replace(/[\t ]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
  const cleanMultiline = value => String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  function columnKey(cell) {
    return cleanInline(cell?.dataset?.registryColumnKey || '');
  }

  function columnLabel(cell) {
    const explicit = cleanInline(cell?.dataset?.label);
    if (explicit) return explicit;
    const key = columnKey(cell);
    const header = Array.from(document.querySelectorAll('#headerRow > th'))
      .find(item => item.dataset.registryColumnKey === key);
    return cleanInline(header?.textContent).replace(/[↕↑↓]+$/g, '').trim() || key || 'Përmbajtja e qelizës';
  }

  function prepareCloneForText(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll(`.${TRIGGER_CLASS},input,select,textarea,.drug-actions-trigger,.favorite-marker,.clinical-editor-open,.dose-calculator-open,[data-registry-ui-only]`)
      .forEach(element => element.remove());
    clone.querySelectorAll('details').forEach(details => {
      details.open = true;
      const summary = details.querySelector(':scope > summary');
      if (summary && details.children.length > 1) summary.remove();
    });
    clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
    clone.querySelectorAll('li,p').forEach(item => item.append(document.createTextNode('\n')));
    return clone;
  }

  function extractCellText(cell) {
    if (!cell) return '';
    const clone = prepareCloneForText(cell);
    return cleanMultiline(clone.innerText || clone.textContent || '')
      .replace(/\s*Më shumë\s*$/i, '')
      .replace(/\s*Shfaq skemat\s*$/i, '')
      .trim();
  }

  function hasExistingControl(cell) {
    if (!cell) return true;
    const key = columnKey(cell);
    if (['select', 'trade-name', 'clinical-status', 'clinical-action', 'dose-calculator'].includes(key)) return true;
    // Dosage cells may contain an editor action and still need an independent full-text control.
    if (['dosage-adult', 'dosage-pediatric'].includes(key)) return false;
    return Boolean(cell.querySelector('.drug-select,.drug-actions-trigger,.favorite-marker,.dose-calculator-open'));
  }

  function elementIsClipped(element) {
    return element instanceof HTMLElement
      && element.clientWidth > 0
      && element.clientHeight > 0
      && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2);
  }

  function cellIsVisuallyClipped(cell) {
    return [cell, ...cell.querySelectorAll('.drug-name-text,.registry-dosage-preview,.registry-cell-value,[class*="truncate"],[class*="clamp"]')]
      .some(elementIsClipped);
  }

  function shouldPreviewCell(cell, text) {
    if (!cell || !text || hasExistingControl(cell)) return false;
    return cellIsVisuallyClipped(cell) || text.length > (THRESHOLDS[columnKey(cell)] || 58);
  }

  function rowIsExpanded(row) {
    return Boolean(row?.classList.contains('registry-row-expanded') || row?.dataset?.registryRowExpanded === 'true');
  }

  function ensureExpandIcon(trigger) {
    if (!trigger?.querySelector?.('[data-lineicons-icon="expand-square-4"]')) trigger.innerHTML = EXPAND_ICON;
  }

  function syncTriggerState(trigger) {
    ensureExpandIcon(trigger);
    const cell = trigger?.closest?.(`td[${PREVIEW_ATTR}="true"]`);
    if (!cell) return;
    const expanded = rowIsExpanded(cell.closest('tr'));
    const label = columnLabel(cell).toLocaleLowerCase('sq');
    trigger.setAttribute('aria-expanded', String(expanded));
    trigger.setAttribute('aria-label', expanded ? `Mbyll ${label}` : `Zgjero ${label} për ta parë tekstin e plotë`);
    trigger.title = expanded ? 'Mbyll tekstin e plotë' : 'Shfaq tekstin e plotë në rresht';
  }

  function removePreview(cell) {
    cell.querySelector(`:scope > .${TRIGGER_CLASS}`)?.remove();
    cell.removeAttribute(PREVIEW_ATTR);
    delete cell.dataset.registryCellPreviewText;
  }

  function createTrigger(cell) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = TRIGGER_CLASS;
    button.innerHTML = EXPAND_ICON;
    button.dataset.lineiconsSource = 'Lineicons Basic / expand-square-4';
    cell.appendChild(button);
    return button;
  }

  function enhanceCell(cell) {
    if (!(cell instanceof HTMLTableCellElement)) return;
    const text = extractCellText(cell);
    if (!shouldPreviewCell(cell, text)) {
      if (cell.hasAttribute(PREVIEW_ATTR)) removePreview(cell);
      return;
    }
    cell.setAttribute(PREVIEW_ATTR, 'true');
    cell.dataset.registryCellPreviewText = text;
    const trigger = cell.querySelector(`:scope > .${TRIGGER_CLASS}`) || createTrigger(cell);
    syncTriggerState(trigger);
  }

  function connectObserver() {
    const tbody = document.getElementById('tbody');
    if (!tbody || !tableObserver) return;
    tableObserver.observe(tbody, {
      childList:true,
      subtree:true,
      characterData:true,
      attributes:true,
      attributeFilter:['class', 'data-registry-row-expanded'],
    });
  }

  function enhanceVisibleCells() {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    tableObserver?.disconnect();
    try {
      tbody.querySelectorAll(':scope > tr:not([hidden]) > td').forEach(cell => {
        if (!cell.classList.contains('empty-state')) enhanceCell(cell);
      });
      tbody.querySelectorAll(`.${TRIGGER_CLASS}`).forEach(syncTriggerState);
      document.documentElement.dataset.registryCellPreview = VERSION;
    } finally {
      connectObserver();
    }
  }

  function scheduleEnhance() {
    if (!active || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceVisibleCells();
    });
  }

  function activate() {
    if (!active) {
      active = true;
      clearTimeout(fallbackTimer);
    }
    scheduleEnhance();
  }

  function refreshNow() {
    active = true;
    clearTimeout(fallbackTimer);
    scheduled = false;
    enhanceVisibleCells();
  }

  function toggleInline(trigger) {
    const cell = trigger?.closest?.(`td[${PREVIEW_ATTR}="true"]`);
    const row = cell?.closest('tr');
    if (!row) return false;
    let expanded;
    const rowController = window.MedIndexRegistryRows;
    if (typeof rowController?.toggleRow === 'function') {
      expanded = rowController.toggleRow(row);
    } else {
      expanded = !rowIsExpanded(row);
      row.classList.toggle('registry-row-expanded', expanded);
      row.dataset.registryRowExpanded = String(expanded);
      row.querySelectorAll('.registry-dosage-details').forEach(details => { details.open = expanded; });
    }
    row.querySelectorAll(`.${TRIGGER_CLASS}`).forEach(syncTriggerState);
    return expanded;
  }

  function onClick(event) {
    const trigger = event.target.closest?.(`.${TRIGGER_CLASS}`);
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleInline(trigger);
  }

  function init() {
    document.addEventListener('click', onClick, true);
    tableObserver = new MutationObserver(() => { if (active) scheduleEnhance(); });
    connectObserver();
    window.addEventListener('medindex:registry-ready', activate, { once:true });
    window.addEventListener('medindex:registry-table-stable', activate);
    ['medindex:registry-data-ready', 'medindex:tailadmin-ready']
      .forEach(eventName => window.addEventListener(eventName, scheduleEnhance));
    window.addEventListener('resize', scheduleEnhance, { passive:true });
    window.addEventListener('pageshow', scheduleEnhance, { passive:true });
    const armFallback = () => { fallbackTimer = setTimeout(activate, 1800); };
    if (document.readyState === 'complete') armFallback();
    else window.addEventListener('load', armFallback, { once:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.MedIndexCellPreview = {
    version:VERSION,
    refresh:refreshNow,
    openForCell(cell) {
      enhanceCell(cell);
      const trigger = cell?.querySelector?.(`:scope > .${TRIGGER_CLASS}`);
      return trigger ? toggleInline(trigger) : false;
    },
    toggleForCell(cell) {
      enhanceCell(cell);
      const trigger = cell?.querySelector?.(`:scope > .${TRIGGER_CLASS}`);
      return trigger ? toggleInline(trigger) : false;
    },
  };
})();
