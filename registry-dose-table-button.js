(() => {
  'use strict';

  const VERSION = 'dose-table-button-deep-audit-v1';
  const COLUMN_KEY = 'dose-calculator';
  const CELL_SELECTOR = `[data-registry-dose-calculator-column="${COLUMN_KEY}"]`;
  const ROW_SELECTOR = '#tbody > tr';
  const IDLE_TIMEOUT_MS = 160;
  const FRAME_BUDGET_MS = 7;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const shortText = (value, max = 96) => {
    const text = clean(value);
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };

  const pendingRows = new Set();
  let scheduled = false;
  let tbodyObserver = null;
  let headerObserver = null;
  let processedCells = 0;
  let openedCalculators = 0;
  let lastRunMs = 0;

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
    const text = clean(cell.textContent);
    if (/duke u lidhur/i.test(text)) return 'loading';
    return 'unavailable';
  }

  function enhanceCell(cell) {
    if (!(cell instanceof HTMLElement)) return;
    const row = cell.closest('tr');
    const button = cell.querySelector('.dose-calculator-open');
    const group = groupForCell(cell);
    const productName = productNameForRow(row);
    const state = button ? 'ready' : emptyState(cell);
    const signature = [state, clean(button?.dataset?.doseProductKey), group, productName].join('|');

    if (cell.dataset.doseTableSignature === signature) return;
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
    button.setAttribute(
      'aria-label',
      `Kalkulo dozën për ${productName}${groupText ? `, ${groupText}` : ''}`,
    );
    button.title = `Hap kalkulatorin e dozës për ${productName}`;
    button.dataset.doseTableEnhanced = VERSION;
    processedCells += 1;
  }

  function currentRows() {
    return Array.from(document.querySelectorAll(ROW_SELECTOR))
      .filter(row => !row.querySelector('.empty-state'));
  }

  function updateHeader() {
    const header = document.querySelector(`#headerRow > ${CELL_SELECTOR}`);
    if (!(header instanceof HTMLElement)) return;

    const rows = currentRows();
    const readyCount = rows.reduce((count, row) => (
      count + (row.querySelector(`${CELL_SELECTOR} .dose-calculator-open`) ? 1 : 0)
    ), 0);
    const loading = rows.some(row => row.querySelector(`${CELL_SELECTOR}.dose-table-cell-loading`));
    const state = loading ? 'loading' : readyCount > 0 ? 'ready' : 'empty';
    const signature = `${state}|${readyCount}|${rows.length}`;

    if (header.dataset.doseHeaderSignature === signature) return;
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
        ? `${readyCount} të verifikuara`
        : 'Vetëm të verifikuara';

    header.append(title, meta);
    header.setAttribute(
      'aria-label',
      loading
        ? 'Kolona e dozës po ngarkohet'
        : `${readyCount} preparate me kalkulator të verifikuar në këtë faqe`,
    );
  }

  function enqueueRow(row) {
    if (!(row instanceof HTMLTableRowElement) || row.querySelector('.empty-state')) return;
    pendingRows.add(row);
  }

  function enqueueFromNode(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(ROW_SELECTOR)) enqueueRow(node);
    node.querySelectorAll?.(ROW_SELECTOR).forEach(enqueueRow);
    const ownerRow = node.closest?.(ROW_SELECTOR);
    if (ownerRow) enqueueRow(ownerRow);
  }

  function processQueue(deadline) {
    scheduled = false;
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

    updateHeader();
    lastRunMs = performance.now() - startedAt;
    if (pendingRows.size) scheduleProcessing();
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
    scheduleProcessing();
  }

  function observeTable() {
    const tbody = document.getElementById('tbody');
    const header = document.getElementById('headerRow');

    if (tbody && !tbodyObserver) {
      tbodyObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(enqueueFromNode);
          if (mutation.target instanceof Element) enqueueFromNode(mutation.target);
        });
        scheduleProcessing();
      });
      tbodyObserver.observe(tbody, { childList:true, subtree:true });
      tbody.addEventListener('click', event => {
        if (event.target.closest('.dose-calculator-open')) openedCalculators += 1;
      });
    }

    if (header && !headerObserver) {
      headerObserver = new MutationObserver(() => {
        updateHeader();
        scanVisiblePage();
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
      lastRunMs:Number(lastRunMs.toFixed(2)),
    }),
  });
})();
