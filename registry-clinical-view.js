(() => {
  'use strict';

  const VERSION = 'registry-clinical-view-20260801-4';
  const STYLE_ID = 'registryClinicalViewStyles';
  const STYLE_HREF = '/registry-clinical-view.css?v=20260801-2';
  const STORAGE_KEY = 'medindex.registry.view.v1';
  const VALID_VIEWS = new Set(['clinical', 'full']);
  const COMPACT_WIDTHS = Object.freeze({
    select: 44,
    'trade-name': 224,
    'active-substance': 216,
    strength: 110,
    form: 182,
    'dosage-adult': 300,
    'dosage-pediatric': 278,
  });

  let active = false;
  let activationScheduled = false;
  let resizeObserver = null;
  let scheduled = false;
  let lastWidthSignature = '';

  function ensureStyles() {
    let link = document.getElementById(STYLE_ID)
      || document.querySelector('link[data-registry-clinical-view-css]');
    if (link) {
      link.id = STYLE_ID;
      return;
    }

    link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.registryClinicalViewCss = VERSION;
    const professional = document.querySelector('link[data-tailadmin-professional-css]');
    document.head.insertBefore(link, professional || null);
  }

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
    if (!active) activate();
    document.documentElement.dataset.registryUxView = next;
    if (persist) persistView(next);
    updateToolbarState();
    scheduleRefresh();
    window.dispatchEvent(new Event('resize'));
  }

  function createToolbar() {
    const tableWrap = document.querySelector('.table-wrap');
    if (!tableWrap || document.getElementById('registryViewToolbar')) return;

    const bar = document.createElement('section');
    bar.id = 'registryViewToolbar';
    bar.className = 'registry-view-toolbar';
    bar.setAttribute('aria-label', 'Pamja e tabelës së barnave');
    bar.innerHTML = `
      <div class="registry-view-copy">
        <strong>Pamja e tabelës</strong>
        <span data-registry-view-description>Dozat dhe të dhënat kryesore janë në fokus.</span>
      </div>
      <div class="registry-view-actions" role="group" aria-label="Zgjidh pamjen e tabelës">
        <button type="button" data-registry-view="clinical" aria-pressed="true">
          <span aria-hidden="true">✦</span> Klinike
        </button>
        <button type="button" data-registry-view="full" aria-pressed="false">
          <span aria-hidden="true">▦</span> Të gjitha kolonat
        </button>
      </div>
    `;

    bar.addEventListener('click', event => {
      const button = event.target.closest('button[data-registry-view]');
      if (!button) return;
      setView(button.dataset.registryView);
    });

    tableWrap.before(bar);
  }

  function updateToolbarState() {
    const view = currentView();
    document.querySelectorAll('#registryViewToolbar button[data-registry-view]').forEach(button => {
      const selected = button.dataset.registryView === view;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });
    const description = document.querySelector('[data-registry-view-description]');
    if (description) {
      description.textContent = view === 'clinical'
        ? 'Emri, substanca, forma dhe dozat janë në fokus.'
        : 'Shfaqen të gjitha kolonat e zgjedhura.';
    }
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
    if (signature === lastWidthSignature && view !== 'clinical') return;
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
    ensureStyles();
    createToolbar();
    updateToolbarState();
    applyCompactWidths();
    document.documentElement.dataset.registryClinicalView = VERSION;
  }

  function scheduleRefresh() {
    if (!active || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
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
      scheduleRefresh();
    });
    resizeObserver.observe(wrapper);
  }

  function activate() {
    if (active) return;
    active = true;
    activationScheduled = false;
    ensureStyles();
    document.documentElement.dataset.registryUxView = storedView();
    createToolbar();
    observeWidth();
    refresh();
  }

  function scheduleActivation() {
    if (active || activationScheduled) return;
    activationScheduled = true;
    const run = () => activate();
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 500 });
    } else {
      window.setTimeout(run, 0);
    }
  }

  function dataIsReady() {
    return Array.isArray(window.MEDINDEX_REGISTRY_ROWS)
      && window.MEDINDEX_REGISTRY_ROWS.length > 0;
  }

  function boot() {
    ensureStyles();
    if (dataIsReady()) scheduleActivation();
  }

  window.addEventListener('medindex:registry-data-ready', scheduleActivation, { once: true });
  window.addEventListener('medindex:registry-ready', () => {
    if (dataIsReady()) scheduleActivation();
  });
  window.addEventListener('medindex:registry-table-stable', scheduleRefresh);
  window.addEventListener('medindex:tailadmin-ready', () => {
    if (dataIsReady()) scheduleActivation();
  });
  window.addEventListener('resize', scheduleRefresh, { passive: true });
  window.addEventListener('pageshow', () => {
    if (dataIsReady()) scheduleActivation();
  }, { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.MedIndexRegistryClinicalView = {
    version: VERSION,
    refresh: scheduleRefresh,
    activate: scheduleActivation,
    setView,
    getView: currentView,
  };
})();
