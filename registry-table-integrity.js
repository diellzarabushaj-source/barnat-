(() => {
  'use strict';

  const VERSION = 'registry-table-integrity-v1';
  const COLUMN_ORDER = Object.freeze([
    '[data-clinical-editor-column="clinical-status"]',
    '[data-clinical-editor-column="clinical-action"]',
    '[data-registry-dosage-column="adult"]',
    '[data-registry-dosage-column="pediatric"]',
  ]);

  let observer = null;
  let scheduled = false;
  let enforcing = false;

  function directMatches(container, selector) {
    return Array.from(container?.children || []).filter(node => node.matches?.(selector));
  }

  function canonicalize(container) {
    if (!container) return;
    const ordered = [];

    COLUMN_ORDER.forEach(selector => {
      const matches = directMatches(container, selector);
      matches.slice(1).forEach(node => node.remove());
      if (matches[0]) ordered.push(matches[0]);
    });

    ordered.forEach(node => {
      if (container.lastElementChild !== node) container.appendChild(node);
    });
  }

  function auditRow(row, expectedCount) {
    if (!row || row.querySelector('.empty-state')) return;
    const actualCount = row.children.length;
    row.dataset.registryColumnCount = String(actualCount);
    row.dataset.registryColumnIntegrity = actualCount === expectedCount ? 'ok' : 'mismatch';
  }

  function enforce() {
    if (enforcing) return;
    enforcing = true;
    observer?.disconnect();

    try {
      const header = document.getElementById('headerRow');
      const tbody = document.getElementById('tbody');
      if (!header || !tbody) return;

      canonicalize(header);
      const expectedCount = header.children.length;
      Array.from(tbody.children).forEach(row => {
        canonicalize(row);
        auditRow(row, expectedCount);
      });

      document.documentElement.dataset.registryTableIntegrity = VERSION;
    } finally {
      enforcing = false;
      observe();
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enforce();
    });
  }

  function observe() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (!header || !tbody) return;
    if (!observer) observer = new MutationObserver(schedule);
    observer.observe(header, { childList:true });
    observer.observe(tbody, { childList:true, subtree:true });
  }

  ['medindex:registry-ready', 'medindex:registry-data-ready'].forEach(eventName => {
    window.addEventListener(eventName, schedule);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once:true });
  } else {
    schedule();
  }
})();
