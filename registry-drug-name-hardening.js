(() => {
  'use strict';

  const VERSION = 'registry-drug-name-hardening-v1';
  const UI_ONLY_SELECTOR = '.drug-actions-trigger,.favorite-marker,.registry-row-details-toggle,.dose-calculator-open,[data-insulin-smart-open],[data-registry-ui-only]';
  let observer = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function canonicalNameFromRow(row) {
    const rawKey = String(row?.querySelector('.drug-select')?.dataset?.drugKey || '');
    const firstSeparator = rawKey.indexOf('|');
    const lastSeparator = rawKey.lastIndexOf('|');
    if (firstSeparator < 0 || lastSeparator <= firstSeparator) return '';
    return rawKey.slice(firstSeparator + 1, lastSeparator).trim();
  }

  function hardenRow(row) {
    if (!(row instanceof HTMLTableRowElement) || row.querySelector('.empty-state')) return;
    const canonicalName = canonicalNameFromRow(row);
    if (canonicalName) row.dataset.drugName = canonicalName;
    row.querySelectorAll(UI_ONLY_SELECTOR).forEach(node => {
      node.dataset.registryUiOnly = 'true';
    });
    const action = row.querySelector('.drug-actions-trigger');
    if (action && canonicalName) action.setAttribute('aria-label', `Veprimet për ${canonicalName}`);
  }

  function scan(root = document) {
    if (root instanceof HTMLTableRowElement) hardenRow(root);
    root.querySelectorAll?.('#tbody > tr').forEach(hardenRow);
  }

  function start() {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    scan(tbody);
    if (!observer) {
      observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (!(node instanceof Element)) return;
            const row = node.matches('#tbody > tr') ? node : node.closest?.('#tbody > tr');
            if (row) hardenRow(row);
            scan(node);
          });
          const row = mutation.target instanceof Element ? mutation.target.closest?.('#tbody > tr') : null;
          if (row) hardenRow(row);
        });
      });
      observer.observe(tbody, { childList:true, subtree:true });
    }
    document.documentElement.dataset.registryDrugNameHardening = VERSION;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
  window.addEventListener('medindex:registry-data-ready', start);

  window.MedIndexDrugNameHardening = Object.freeze({ version:VERSION, refresh:start, canonicalNameFromRow });
})();