(() => {
  'use strict';

  const VERSION = 'registry-row-expand-20260801-3';
  const FINAL_STYLE_ID = 'registryColumnsFiltersStyles';
  const EXPANDABLE_KEYS = new Set([
    'trade-name',
    'active-substance',
    'drug-class',
    'use',
    'form',
    'dosage-adult',
    'dosage-pediatric',
  ]);
  const THRESHOLDS = Object.freeze({
    'trade-name':34,
    'active-substance':42,
    'drug-class':46,
    use:52,
    form:34,
    'dosage-adult':66,
    'dosage-pediatric':66,
  });

  const expandedRows = new Set();
  let tableObserver = null;
  let headObserver = null;
  let scheduled = false;
  let stabilizing = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function rowKey(row) {
    const registryNumber = clean(row?.dataset?.registryNumber);
    if (registryNumber) return `nr:${registryNumber}`;
    const drugKey = clean(row?.querySelector('.drug-select')?.dataset?.drugKey);
    if (drugKey) return `drug:${drugKey}`;
    return '';
  }

  function stabilizeCascade() {
    if (stabilizing) return;
    stabilizing = true;
    try {
      const integrity = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .find(link => /registry-table-integrity\.css/i.test(link.getAttribute('href') || ''));
      integrity?.removeAttribute('data-registry-table-integrity-css');

      const finalStyle = document.getElementById(FINAL_STYLE_ID);
      if (finalStyle && document.head.lastElementChild !== finalStyle) {
        document.head.appendChild(finalStyle);
      }
      document.documentElement.dataset.registryFinalCascade = VERSION;
    } finally {
      stabilizing = false;
    }
  }

  function restoreLegacyCompactMarkup(cell) {
    const single = cell.querySelector(':scope > details.registry-dosage-single');
    const expanded = single?.querySelector(':scope > .registry-dosage-expanded');
    if (single && expanded) {
      cell.replaceChildren(...Array.from(expanded.childNodes));
    }

    cell.querySelectorAll(':scope > details.registry-dosage-details').forEach(details => {
      details.classList.remove('registry-dosage-compact', 'registry-dosage-single', 'registry-dosage-multiple');
      const summary = details.querySelector(':scope > summary');
      if (!summary) return;
      const preview = clean(summary.querySelector('.registry-dosage-preview')?.textContent || summary.textContent)
        .replace(/\s*Më shumë\s*$/i, '');
      summary.replaceChildren(document.createTextNode(preview || 'Shfaq skemat'));
      summary.setAttribute('aria-label', 'Zgjero rreshtin për ta parë dozimin e plotë');
    });
  }

  function rowShouldExpand(cell, key) {
    if (!cell || !EXPANDABLE_KEYS.has(key)) return false;
    if (cell.querySelector('.registry-dosage-details')) return true;
    const text = clean(cell.textContent);
    return text.length > (THRESHOLDS[key] || 48);
  }

  function syncRowState(row) {
    const key = rowKey(row);
    const expanded = Boolean(key && expandedRows.has(key));
    row.classList.toggle('registry-row-expanded', expanded);
    row.dataset.registryRowExpanded = String(expanded);
    row.querySelectorAll('td[data-registry-expandable="true"]:not([data-registry-cell-preview="true"])').forEach(cell => {
      cell.setAttribute('aria-expanded', String(expanded));
      cell.title = expanded ? 'Kliko për ta mbyllur rreshtin' : 'Kliko për ta zgjeruar rreshtin';
    });
    row.querySelectorAll('.registry-dosage-details').forEach(details => {
      details.open = expanded;
    });
  }

  function enhanceRows() {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;

    tbody.querySelectorAll(':scope > tr').forEach(row => {
      if (row.querySelector('.empty-state')) return;

      row.querySelectorAll('td.registry-dosage-column').forEach(restoreLegacyCompactMarkup);

      row.querySelectorAll(':scope > td').forEach(cell => {
        const key = cell.dataset.registryColumnKey || '';
        const expandable = rowShouldExpand(cell, key);
        const previewManaged = cell.dataset.registryCellPreview === 'true';
        cell.toggleAttribute('data-registry-expandable', expandable);
        if (expandable) {
          cell.dataset.registryExpandable = 'true';
          if (previewManaged) {
            cell.removeAttribute('tabindex');
            cell.removeAttribute('role');
            cell.removeAttribute('aria-expanded');
            if (/Kliko për ta (?:zgjeruar|mbyllur) rreshtin/i.test(cell.title || '')) cell.removeAttribute('title');
          } else {
            cell.tabIndex = 0;
            cell.setAttribute('role', 'button');
            cell.setAttribute('aria-label', `${clean(cell.dataset.label || key || 'Përmbajtja')}. Kliko për ta zgjeruar rreshtin.`);
          }
        } else {
          delete cell.dataset.registryExpandable;
          cell.removeAttribute('tabindex');
          cell.removeAttribute('role');
          cell.removeAttribute('aria-expanded');
        }
      });

      syncRowState(row);
    });

    document.querySelectorAll('.registry-dose-dialog').forEach(dialog => {
      try { if (dialog.open) dialog.close(); } catch {}
      dialog.remove();
    });

    document.documentElement.dataset.registryRowExpand = VERSION;
    stabilizeCascade();
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceRows();
    });
  }

  function toggleRow(row, force) {
    if (!row || row.querySelector('.empty-state')) return false;
    const key = rowKey(row);
    if (!key) return false;
    const next = typeof force === 'boolean' ? force : !expandedRows.has(key);
    if (next) expandedRows.add(key);
    else expandedRows.delete(key);
    syncRowState(row);
    return next;
  }

  function interactiveTarget(target) {
    return target.closest('a, button, input, select, textarea, [role="button"], .clinical-editor-open, .drug-actions-trigger, .favorite-marker, .registry-cell-preview-trigger');
  }

  function onClick(event) {
    const summary = event.target.closest?.('.registry-dosage-details > summary');
    if (summary) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleRow(summary.closest('tr'));
      return;
    }

    const nameButton = event.target.closest?.('.drug-name-text');
    if (nameButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleRow(nameButton.closest('tr'));
      return;
    }

    const cell = event.target.closest?.('td[data-registry-expandable="true"]');
    if (!cell || cell.dataset.registryCellPreview === 'true' || interactiveTarget(event.target)) return;
    event.preventDefault();
    toggleRow(cell.closest('tr'));
  }

  function onKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const cell = event.target.closest?.('td[data-registry-expandable="true"]');
    if (!cell || cell.dataset.registryCellPreview === 'true' || interactiveTarget(event.target)) return;
    event.preventDefault();
    toggleRow(cell.closest('tr'));
  }

  function observe() {
    const tbody = document.getElementById('tbody');
    if (tbody) {
      tableObserver?.disconnect();
      tableObserver = new MutationObserver(scheduleEnhance);
      tableObserver.observe(tbody, { childList:true, subtree:true });
    }

    if (document.head) {
      headObserver?.disconnect();
      headObserver = new MutationObserver(() => queueMicrotask(stabilizeCascade));
      headObserver.observe(document.head, { childList:true });
    }
  }

  function init() {
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    observe();
    queueMicrotask(() => {
      stabilizeCascade();
      scheduleEnhance();
    });

    ['medindex:registry-ready', 'medindex:registry-data-ready', 'medindex:registry-table-stable', 'medindex:tailadmin-ready']
      .forEach(eventName => window.addEventListener(eventName, scheduleEnhance));
    window.addEventListener('pageshow', scheduleEnhance, { passive:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.MedIndexRegistryRows = {
    version:VERSION,
    toggleRow,
    refresh:scheduleEnhance,
  };
})();
