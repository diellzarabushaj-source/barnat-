(() => {
  'use strict';

  const VERSION = 'dose-table-button-manual-qa-v5';
  const COLUMN_KEY = 'dose-calculator';
  const CELL_SELECTOR = `[data-registry-dose-calculator-column="${COLUMN_KEY}"]`;
  const ROW_SELECTOR = '#tbody > tr';
  const IDENTITY_SELECTOR = '[data-column-key="Emri tregtar"], .drug-select';
  const IDLE_TIMEOUT_MS = 120;
  const FRAME_BUDGET_MS = 7;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const pendingRows = new Set();
  let scheduled = false;
  let headerDirty = true;
  let tbodyObserver = null;
  let headerObserver = null;
  let processedCells = 0;
  let openedCalculators = 0;
  let queueRuns = 0;
  let tableScans = 0;
  let headerUpdates = 0;
  let observedMutations = 0;
  let ignoredMutations = 0;
  let lastRunMs = 0;
  let maxRunMs = 0;

  function groupForCell(cell) {
    if (cell.querySelector('.dose-calculator-group-pediatric_only')) return 'pediatric_only';
    if (cell.querySelector('.dose-calculator-group-adult_only')) return 'adult_only';
    if (cell.querySelector('.dose-calculator-group-pediatric_and_adult')) return 'pediatric_and_adult';
    return '';
  }

  function clearRowState(row) {
    if (!row) return;
    row.removeAttribute('data-dose-calculator-available');
    row.classList.remove(
      'has-verified-dose-calculator',
      'has-pediatric-only-dose-calculator',
      'has-adult-only-dose-calculator',
      'has-all-ages-dose-calculator',
    );
  }

  function setRowState(row, group) {
    if (!row) return;
    row.dataset.doseCalculatorAvailable = 'true';
    row.classList.add('has-verified-dose-calculator');
    row.classList.toggle('has-pediatric-only-dose-calculator', group === 'pediatric_only');
    row.classList.toggle('has-adult-only-dose-calculator', group === 'adult_only');
    row.classList.toggle('has-all-ages-dose-calculator', group === 'pediatric_and_adult');
  }

  function stateForCell(cell) {
    if (cell.querySelector('.dose-calculator-open')) return 'ready';
    return /duke u lidhur/i.test(clean(cell.textContent)) ? 'loading' : 'unavailable';
  }

  function enhanceCell(cell) {
    if (!(cell instanceof HTMLElement)) return;
    const row = cell.closest('tr');
    const state = stateForCell(cell);
    const group = groupForCell(cell);
    const productKey = clean(cell.querySelector('.dose-calculator-open')?.dataset?.doseProductKey);
    const signature = [VERSION, state, productKey, group].join('|');
    if (cell.dataset.doseTableSignature === signature) return;

    cell.dataset.doseTableSignature = signature;
    cell.dataset.doseTableState = state;
    cell.classList.toggle('dose-table-cell-ready', state === 'ready');
    cell.classList.toggle('dose-table-cell-loading', state === 'loading');
    cell.classList.toggle('dose-table-cell-empty', state === 'unavailable');
    if (state === 'ready') setRowState(row, group);
    else clearRowState(row);
    processedCells += 1;
  }

  function currentRows() {
    tableScans += 1;
    return Array.from(document.querySelectorAll(ROW_SELECTOR))
      .filter(row => !row.querySelector('.empty-state'));
  }

  function updateHeader() {
    const header = document.querySelector(`#headerRow > ${CELL_SELECTOR}`);
    if (!(header instanceof HTMLElement)) return;
    const rows = currentRows();
    let readyCount = 0;
    let loading = false;
    rows.forEach(row => {
      const cell = row.querySelector(CELL_SELECTOR);
      if (!cell) return;
      if (cell.querySelector('.dose-calculator-open')) readyCount += 1;
      if (stateForCell(cell) === 'loading') loading = true;
    });
    const state = loading ? 'loading' : readyCount > 0 ? 'ready' : 'empty';
    const meta = loading ? 'Duke u ngarkuar' : readyCount > 0 ? `${readyCount} në këtë faqe` : 'Vetëm të verifikuara';
    const signature = `${VERSION}|${state}|${readyCount}|${rows.length}`;
    if (header.dataset.doseHeaderSignature === signature) return;
    header.dataset.doseHeaderSignature = signature;
    header.dataset.doseTableState = state;
    header.dataset.doseHeaderMeta = meta;
    header.classList.add('dose-table-header');
    header.setAttribute(
      'aria-label',
      loading ? 'Kolona e dozës po ngarkohet' : `${readyCount} preparate me kalkulator të verifikuar në këtë faqe`,
    );
    headerUpdates += 1;
  }

  function enqueueRow(row) {
    if (!(row instanceof HTMLTableRowElement) || row.querySelector('.empty-state')) return;
    pendingRows.add(row);
    headerDirty = true;
  }

  function enqueueRowsFromNode(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(ROW_SELECTOR)) enqueueRow(node);
    node.querySelectorAll?.(ROW_SELECTOR).forEach(enqueueRow);
  }

  function nodeTouchesRelevantUi(node) {
    if (!(node instanceof Element)) return false;
    return node.matches(CELL_SELECTOR)
      || Boolean(node.closest(CELL_SELECTOR))
      || Boolean(node.querySelector?.(CELL_SELECTOR))
      || node.matches(IDENTITY_SELECTOR)
      || Boolean(node.closest(IDENTITY_SELECTOR))
      || Boolean(node.querySelector?.(IDENTITY_SELECTOR));
  }

  function processQueue(deadline) {
    scheduled = false;
    queueRuns += 1;
    const startedAt = performance.now();
    while (pendingRows.size) {
      const row = pendingRows.values().next().value;
      pendingRows.delete(row);
      const cell = row.querySelector(CELL_SELECTOR);
      if (cell) enhanceCell(cell);
      const elapsed = performance.now() - startedAt;
      const idleRemaining = typeof deadline?.timeRemaining === 'function' ? deadline.timeRemaining() : 0;
      if (elapsed >= FRAME_BUDGET_MS && idleRemaining < 2) break;
    }
    if (!pendingRows.size && headerDirty) {
      headerDirty = false;
      updateHeader();
    }
    lastRunMs = performance.now() - startedAt;
    maxRunMs = Math.max(maxRunMs, lastRunMs);
    if (pendingRows.size || headerDirty) scheduleProcessing();
  }

  function scheduleProcessing() {
    if (scheduled) return;
    scheduled = true;
    if ('requestIdleCallback' in window) window.requestIdleCallback(processQueue, { timeout:IDLE_TIMEOUT_MS });
    else window.requestAnimationFrame(() => processQueue(null));
  }

  function scanVisiblePage() {
    currentRows().forEach(enqueueRow);
    headerDirty = true;
    scheduleProcessing();
  }

  function observeTable() {
    const tbody = document.getElementById('tbody');
    const header = document.getElementById('headerRow');
    if (tbody && !tbodyObserver) {
      tbodyObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          observedMutations += 1;
          if (mutation.target === tbody) {
            mutation.addedNodes.forEach(enqueueRowsFromNode);
            if (mutation.removedNodes.length) headerDirty = true;
            return;
          }
          const relevant = [...mutation.addedNodes, ...mutation.removedNodes].some(nodeTouchesRelevantUi)
            || (mutation.target instanceof Element && nodeTouchesRelevantUi(mutation.target));
          if (!relevant) {
            ignoredMutations += 1;
            return;
          }
          const row = mutation.target instanceof Element ? mutation.target.closest(ROW_SELECTOR) : null;
          if (row) enqueueRow(row);
        });
        if (pendingRows.size || headerDirty) scheduleProcessing();
      });
      tbodyObserver.observe(tbody, { childList:true, subtree:true });
      tbody.addEventListener('click', event => {
        if (event.target.closest('.dose-calculator-open')) openedCalculators += 1;
      });
    }
    if (header && !headerObserver) {
      headerObserver = new MutationObserver(() => {
        headerDirty = true;
        scheduleProcessing();
      });
      headerObserver.observe(header, { childList:true });
    }
  }

  function start() {
    observeTable();
    scanVisiblePage();
    document.documentElement.dataset.doseTableButtonAudit = VERSION;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.MedIndexDoseTableUx = Object.freeze({
    version:VERSION,
    refresh:scanVisiblePage,
    metrics:() => Object.freeze({
      queuedRows:pendingRows.size,
      processedCells,
      openedCalculators,
      queueRuns,
      tableScans,
      headerUpdates,
      observedMutations,
      ignoredMutations,
      lastRunMs:Number(lastRunMs.toFixed(2)),
      maxRunMs:Number(maxRunMs.toFixed(2)),
    }),
  });
})();
