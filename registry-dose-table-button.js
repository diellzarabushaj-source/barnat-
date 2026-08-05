(() => {
  'use strict';

  const VERSION = 'dose-table-button-deep-audit-v3';
  const COLUMN_KEY = 'dose-calculator';
  const CELL_SELECTOR = `[data-registry-dose-calculator-column="${COLUMN_KEY}"]`;
  const ROW_SELECTOR = '#tbody > tr';
  const IDENTITY_SELECTOR = '[data-column-key="Emri tregtar"], .drug-select';
  const IDLE_TIMEOUT_MS = 120;
  const FRAME_BUDGET_MS = 7;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const shortText = (value, max = 96) => {
    const text = clean(value);
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };

  const pendingRows = new Set();
  const internalCells = new WeakSet();
  const internalHeaders = new WeakSet();
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

  function productNameForRow(row) {
    if (!row) return 'këtë preparat';
    const namedCell = row.querySelector('[data-column-key="Emri tregtar"]');
    const namedText = shortText(namedCell?.textContent);
    if (namedText) return namedText;
    const selectable = row.querySelector('.drug-select');
    const fallback = shortText(selectable?.getAttribute('aria-label') || selectable?.dataset?.drugKey);
    return fallback || 'këtë preparat';
  }

  function groupForCell(cell) {
    if (cell.querySelector('.dose-calculator-group-pediatric_only')) return 'pediatric_only';
    if (cell.querySelector('.dose-calculator-group-adult_only')) return 'adult_only';
    if (cell.querySelector('.dose-calculator-group-pediatric_and_adult')) return 'pediatric_and_adult';
    return '';
  }

  function compactGroupLabel(group) {
    if (group === 'pediatric_only') return 'PEDIATRIK';
    if (group === 'adult_only') return 'TË RRITUR';
    if (group === 'pediatric_and_adult') return 'FËMIJË + TË RRITUR';
    return '';
  }

  function accessibleGroupLabel(group) {
    if (group === 'pediatric_only') return 'vetëm për fëmijë';
    if (group === 'adult_only') return 'vetëm për të rritur';
    if (group === 'pediatric_and_adult') return 'për fëmijë dhe të rritur';
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

  function emptyState(cell) {
    return /duke u lidhur/i.test(clean(cell.textContent)) ? 'loading' : 'unavailable';
  }

  function beginInternalCellWrite(cell) {
    internalCells.add(cell);
  }

  function endInternalCellWrite(cell) {
    queueMicrotask(() => internalCells.delete(cell));
  }

  function beginInternalHeaderWrite(header) {
    internalHeaders.add(header);
  }

  function endInternalHeaderWrite(header) {
    queueMicrotask(() => internalHeaders.delete(header));
  }

  function enhanceCell(cell) {
    if (!(cell instanceof HTMLElement)) return;
    const row = cell.closest('tr');
    const button = cell.querySelector('.dose-calculator-open');
    const group = groupForCell(cell);
    const productName = productNameForRow(row);
    const state = button ? 'ready' : emptyState(cell);
    const signature = [VERSION, state, clean(button?.dataset?.doseProductKey), group, productName].join('|');

    if (cell.dataset.doseTableSignature === signature) return;
    beginInternalCellWrite(cell);
    try {
      cell.dataset.doseTableSignature = signature;
      cell.dataset.doseTableState = state;
      cell.classList.toggle('dose-table-cell-ready', state === 'ready');
      cell.classList.toggle('dose-table-cell-loading', state === 'loading');
      cell.classList.toggle('dose-table-cell-empty', state === 'unavailable');

      if (!button) {
        clearRowState(row);
        const muted = cell.querySelector('.registry-dosage-muted');
        if (muted) {
          muted.textContent = state === 'loading' ? '…' : '—';
          muted.setAttribute(
            'aria-label',
            state === 'loading' ? 'Kalkulatori i dozës po ngarkohet' : 'Nuk ka kalkulim të verifikuar',
          );
          muted.title = state === 'loading'
            ? 'Kalkulatori i dozës po ngarkohet'
            : 'Ky preparat nuk ka ende rregull të verifikuar për kalkulim.';
        }
        processedCells += 1;
        return;
      }

      setRowState(row, group);
      const groupNode = cell.querySelector('.dose-calculator-group');
      if (groupNode) {
        groupNode.textContent = compactGroupLabel(group);
        groupNode.title = accessibleGroupLabel(group);
        groupNode.setAttribute('aria-label', accessibleGroupLabel(group));
      }

      button.classList.add('dose-table-button');
      button.replaceChildren();

      const desktopLabel = document.createElement('span');
      desktopLabel.className = 'dose-table-button-label dose-table-button-label-desktop';
      desktopLabel.textContent = 'Kalkulo';

      const mobileLabel = document.createElement('span');
      mobileLabel.className = 'dose-table-button-label dose-table-button-label-mobile';
      mobileLabel.textContent = 'Doza';

      const verifiedMark = document.createElement('span');
      verifiedMark.className = 'dose-table-verified-mark';
      verifiedMark.setAttribute('aria-hidden', 'true');
      verifiedMark.textContent = '✓';

      button.append(verifiedMark, desktopLabel, mobileLabel);
      const groupText = accessibleGroupLabel(group);
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'doseCalculatorModal');
      button.setAttribute(
        'aria-label',
        `Kalkulo dozën për ${productName}${groupText ? `, ${groupText}` : ''}`,
      );
      button.title = `Hap kalkulatorin e dozës për ${productName}`;
      button.dataset.doseTableEnhanced = VERSION;
      processedCells += 1;
    } finally {
      endInternalCellWrite(cell);
    }
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
      if (cell.dataset.doseTableState === 'loading' || /duke u lidhur/i.test(clean(cell.textContent))) loading = true;
    });

    const state = loading ? 'loading' : readyCount > 0 ? 'ready' : 'empty';
    const signature = `${VERSION}|${state}|${readyCount}|${rows.length}`;
    if (header.dataset.doseHeaderSignature === signature) return;

    beginInternalHeaderWrite(header);
    try {
      header.dataset.doseHeaderSignature = signature;
      header.dataset.doseTableState = state;
      header.classList.add('dose-table-header');
      header.replaceChildren();

      const title = document.createElement('span');
      title.className = 'dose-table-header-title';
      title.textContent = 'Doza';

      const meta = document.createElement('span');
      meta.className = 'dose-table-header-meta';
      meta.textContent = loading
        ? 'Duke u ngarkuar'
        : readyCount > 0
          ? `${readyCount} në këtë faqe`
          : 'Vetëm të verifikuara';

      header.append(title, meta);
      header.setAttribute(
        'aria-label',
        loading
          ? 'Kolona e dozës po ngarkohet'
          : `${readyCount} preparate me kalkulator të verifikuar në këtë faqe`,
      );
      headerUpdates += 1;
    } finally {
      endInternalHeaderWrite(header);
    }
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

  function nodeTouchesDoseUi(node) {
    if (!(node instanceof Element)) return false;
    return node.matches(CELL_SELECTOR)
      || Boolean(node.closest(CELL_SELECTOR))
      || Boolean(node.querySelector?.(CELL_SELECTOR));
  }

  function nodeTouchesIdentity(node) {
    if (!(node instanceof Element)) return false;
    return node.matches(IDENTITY_SELECTOR)
      || Boolean(node.closest(IDENTITY_SELECTOR))
      || Boolean(node.querySelector?.(IDENTITY_SELECTOR));
  }

  function mutationOwnerRow(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : null;
    return target?.closest(ROW_SELECTOR) || null;
  }

  function mutationTouchesRelevantUi(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : null;
    const targetCell = target?.closest(CELL_SELECTOR);
    if (targetCell && internalCells.has(targetCell)) return false;
    if (targetCell || target?.closest(IDENTITY_SELECTOR)) return true;
    return [...mutation.addedNodes, ...mutation.removedNodes]
      .some(node => nodeTouchesDoseUi(node) || nodeTouchesIdentity(node));
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
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(processQueue, { timeout:IDLE_TIMEOUT_MS });
    } else {
      window.requestAnimationFrame(() => processQueue(null));
    }
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
          if (!mutationTouchesRelevantUi(mutation)) {
            ignoredMutations += 1;
            return;
          }
          const row = mutationOwnerRow(mutation);
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
      headerObserver = new MutationObserver(mutations => {
        const internalOnly = mutations.every(mutation => internalHeaders.has(mutation.target));
        if (internalOnly) return;
        const doseHeaderChanged = mutations.some(mutation =>
          [...mutation.addedNodes, ...mutation.removedNodes].some(node => nodeTouchesDoseUi(node)),
        );
        headerDirty = true;
        if (doseHeaderChanged) currentRows().forEach(enqueueRow);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once:true });
  } else {
    start();
  }

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
