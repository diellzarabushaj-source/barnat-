(() => {
  'use strict';

  const VERSION = 'registry-clinical-view-20260801-6';
  const STORAGE_KEY = 'medindex.registry.view.v1';
  const VALID_VIEWS = new Set(['clinical', 'full']);
  const COMPACT_WIDTHS = Object.freeze({
    select:48,
    'trade-name':238,
    'active-substance':254,
    strength:122,
    form:198,
    'dosage-adult':314,
    'dosage-pediatric':314,
    'clinical-status':196,
    'clinical-action':118,
  });

  let active = false;
  let activationScheduled = false;
  let resizeObserver = null;
  let refreshScheduled = false;
  let lastWidthSignature = '';

  function storedView() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return VALID_VIEWS.has(value) ? value : 'clinical';
    } catch {
      return 'clinical';
    }
  }

  function persistView(view) {
    try { localStorage.setItem(STORAGE_KEY, view); } catch { /* Storage may be blocked. */ }
  }

  function currentView() {
    const value = document.documentElement.dataset.registryUxView;
    return VALID_VIEWS.has(value) ? value : storedView();
  }

  function setView(view, { persist = true } = {}) {
    const next = VALID_VIEWS.has(view) ? view : 'clinical';
    document.documentElement.dataset.registryUxView = next;
    if (persist) persistView(next);
    if (!active) activate();
    updateToolbarState();
    lastWidthSignature = '';
    scheduleRefresh();
    window.dispatchEvent(new Event('resize'));
  }

  function createToolbar() {
    const tableWrap = document.querySelector('.table-wrap');
    if (!tableWrap || document.getElementById('registryViewToolbar')) return;

    const toolbar = document.createElement('section');
    toolbar.id = 'registryViewToolbar';
    toolbar.className = 'registry-view-toolbar';
    toolbar.setAttribute('aria-label', 'Kontrollet e tabelës së barnave');
    toolbar.innerHTML = `
      <div class="registry-view-heading">
        <span class="registry-view-heading-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 5.5h16M4 12h16M4 18.5h16M8 3v18"/></svg>
        </span>
        <div class="registry-view-copy">
          <strong>Regjistri i barnave</strong>
          <span data-registry-view-description>Të dhënat kryesore klinike janë në fokus.</span>
        </div>
      </div>
      <div class="registry-view-actions" role="group" aria-label="Zgjidh pamjen e tabelës">
        <button type="button" data-registry-view="clinical" aria-pressed="true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="7"/></svg>
          <span>Fokus klinik</span>
        </button>
        <button type="button" data-registry-view="full" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/></svg>
          <span>Tabela e plotë</span>
        </button>
      </div>
    `;

    toolbar.addEventListener('click', event => {
      const button = event.target.closest('button[data-registry-view]');
      if (button) setView(button.dataset.registryView);
    });

    tableWrap.before(toolbar);
  }

  function updateToolbarState() {
    const view = currentView();
    document.querySelectorAll('#registryViewToolbar button[data-registry-view]').forEach(button => {
      const selected = button.dataset.registryView === view;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });

    const description = document.querySelector('[data-registry-view-description]');
    if (!description) return;
    const countText = String(document.getElementById('countBadge')?.textContent || '').trim();
    const count = countText.match(/[\d.,]+/)?.[0];
    const prefix = count ? `${count} barna · ` : '';
    description.textContent = view === 'clinical'
      ? `${prefix}dozat, verifikimi dhe redaktimi janë të prioritizuara.`
      : `${prefix}të gjitha kolonat e regjistrit janë të dukshme.`;
  }

  function headerFor(key) {
    return document.querySelector(`#headerRow > th[data-registry-column-key="${key}"]`);
  }

  function columnIsVisible(key) {
    const header = headerFor(key);
    return Boolean(header && !header.hidden && getComputedStyle(header).display !== 'none');
  }

  function applyCompactWidths() {
    const table = document.getElementById('dataTable');
    const wrapper = table?.closest('.table-wrap');
    const colgroup = table?.querySelector(':scope > colgroup[data-registry-colgroup]');
    if (!table || !wrapper || !colgroup) return;

    const view = currentView();
    const viewport = Math.max(0, Math.round(wrapper.clientWidth));
    const signature = `${view}|${viewport}|${table.dataset.registryVisibleColumns || ''}`;
    if (signature === lastWidthSignature) return;
    lastWidthSignature = signature;

    if (view !== 'clinical') {
      colgroup.querySelectorAll('col').forEach(col => col.style.removeProperty('width'));
      table.style.removeProperty('--registry-table-width');
      table.removeAttribute('data-registry-clinical-width');
      return;
    }

    let total = 0;
    colgroup.querySelectorAll('col[data-registry-column-key]').forEach(col => {
      const key = col.dataset.registryColumnKey;
      if (!columnIsVisible(key)) {
        col.style.setProperty('width', '0px', 'important');
        return;
      }
      const width = COMPACT_WIDTHS[key] || 184;
      col.style.setProperty('width', `${width}px`, 'important');
      total += width;
    });
    table.style.setProperty('--registry-table-width', `${Math.max(total, viewport)}px`);
    table.dataset.registryClinicalWidth = String(total);
  }

  function refresh() {
    if (!active) return;
    createToolbar();
    updateToolbarState();
    applyCompactWidths();
    document.documentElement.dataset.registryClinicalView = VERSION;
  }

  function scheduleRefresh() {
    if (!active || refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      refresh();
    });
  }

  function observeWidth() {
    const wrapper = document.querySelector('.table-wrap');
    if (!wrapper || !('ResizeObserver' in window)) return;
    resizeObserver?.disconnect();
    let last = Math.round(wrapper.clientWidth);
    resizeObserver = new ResizeObserver(entries => {
      const width = Math.round(entries[0]?.contentRect?.width || wrapper.clientWidth);
      if (Math.abs(width - last) < 2) return;
      last = width;
      lastWidthSignature = '';
      scheduleRefresh();
    });
    resizeObserver.observe(wrapper);
  }

  function activate() {
    if (active) return;
    active = true;
    activationScheduled = false;
    createToolbar();
    observeWidth();
    refresh();
  }

  function scheduleActivation() {
    if (active || activationScheduled) return;
    activationScheduled = true;
    requestAnimationFrame(activate);
  }

  function dataIsReady() {
    return Array.isArray(window.MEDINDEX_REGISTRY_ROWS) && window.MEDINDEX_REGISTRY_ROWS.length > 0;
  }

  function initializeViewState() {
    document.documentElement.dataset.registryUxView = storedView();
    if (dataIsReady()) scheduleActivation();
  }

  window.addEventListener('medindex:registry-data-ready', scheduleActivation, { once:true });
  window.addEventListener('medindex:registry-ready', scheduleActivation, { once:true });
  window.addEventListener('medindex:registry-table-stable', () => {
    if (!active) scheduleActivation();
    lastWidthSignature = '';
    scheduleRefresh();
  });
  window.addEventListener('medindex:tailadmin-ready', () => {
    if (dataIsReady()) scheduleActivation();
  });
  window.addEventListener('resize', scheduleRefresh, { passive:true });
  window.addEventListener('pageshow', () => {
    if (dataIsReady()) scheduleActivation();
    scheduleRefresh();
  }, { passive:true });

  initializeViewState();

  window.MedIndexRegistryClinicalView = {
    version:VERSION,
    refresh:scheduleRefresh,
    activate:scheduleActivation,
    setView,
    getView:currentView,
  };
})();
