(() => {
  'use strict';

  const VERSION = 'registry-clinical-view-20260801-1';
  const STYLE_ID = 'registryClinicalViewStyles';
  const STYLE_HREF = '/registry-clinical-view.css?v=20260801-1';
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

  let observer = null;
  let resizeObserver = null;
  let scheduled = false;
  let enhancing = false;
  let lastWidthSignature = '';

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function ensureStyles() {
    let link = document.getElementById(STYLE_ID);
    if (!link) {
      link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.dataset.registryClinicalView = VERSION;
    }
    if (link.getAttribute('href') !== STYLE_HREF) link.href = STYLE_HREF;
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
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
      const active = button.dataset.registryView === view;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    });
    const description = document.querySelector('[data-registry-view-description]');
    if (description) {
      description.textContent = view === 'clinical'
        ? 'Dozat, forma dhe substanca aktive shfaqen pa rrëshqitje horizontale.'
        : 'Shfaqen të gjitha kolonat e zgjedhura; mund të kërkohet rrëshqitje horizontale.';
    }
  }

  function headerFor(key) {
    return document.querySelector(`#headerRow > th[data-registry-column-key="${key}"]`);
  }

  function compactDoseHeaders() {
    const adult = headerFor('dosage-adult');
    const pediatric = headerFor('dosage-pediatric');
    if (adult && adult.dataset.registryClinicalHeader !== VERSION) {
      adult.innerHTML = '<span class="registry-clinical-header-title">Doza · Të rritur</span><span class="registry-dosage-subhead">Doza e plotë · Rruga</span>';
      adult.dataset.registryClinicalHeader = VERSION;
    }
    if (pediatric && pediatric.dataset.registryClinicalHeader !== VERSION) {
      pediatric.innerHTML = '<span class="registry-clinical-header-title">Doza · Fëmijë</span><span class="registry-dosage-subhead">Doza e plotë · Rruga</span>';
      pediatric.dataset.registryClinicalHeader = VERSION;
    }
  }

  function directTextList(cell) {
    if (!cell) return [];
    const checks = cell.querySelector('.clinical-dose-checks');
    const nodes = checks ? Array.from(checks.children) : [];
    const values = nodes.map(node => clean(node.textContent)).filter(Boolean);
    if (values.length) return values.slice(0, 3);
    const fallback = clean(cell.textContent);
    if (!fallback || /ngarkuar|lidhur/i.test(fallback)) return [];
    return [fallback];
  }

  function createMetaChip(className, text) {
    const chip = document.createElement('span');
    chip.className = `registry-row-chip ${className}`;
    chip.textContent = text;
    chip.title = text;
    return chip;
  }

  function enhanceNameCell(row) {
    const nameCell = row.querySelector('td[data-registry-column-key="trade-name"]');
    if (!nameCell) return;
    if (!nameCell.dataset.label) nameCell.dataset.label = 'Emri Tregtar';

    const atc = clean(row.querySelector('td[data-registry-column-key="atc"]')?.textContent);
    const status = clean(row.querySelector('td[data-registry-column-key="status"]')?.textContent);
    const checks = directTextList(row.querySelector('td[data-registry-column-key="clinical-status"]'));
    const signature = [atc, status, ...checks].join('|');

    let meta = nameCell.querySelector(':scope > .registry-row-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'registry-row-meta';
      nameCell.appendChild(meta);
    }

    if (meta.dataset.signature !== signature) {
      meta.replaceChildren();
      if (atc) meta.appendChild(createMetaChip('is-atc', atc));
      if (status) meta.appendChild(createMetaChip('is-status', status));
      checks.forEach(text => meta.appendChild(createMetaChip('is-check', text)));
      meta.dataset.signature = signature;
    }

    let editButton = nameCell.querySelector(':scope > .registry-row-clinical-edit');
    if (!editButton) {
      editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'registry-row-clinical-edit';
      editButton.innerHTML = '<span aria-hidden="true">✎</span><span class="sr-only">Redakto të dhënat klinike</span>';
      editButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const original = row.querySelector('td[data-registry-column-key="clinical-action"] .clinical-editor-open');
        original?.click();
      });
      nameCell.appendChild(editButton);
    }

    const originalEdit = row.querySelector('td[data-registry-column-key="clinical-action"] .clinical-editor-open');
    const drugName = clean(nameCell.childNodes[0]?.textContent || nameCell.textContent) || 'barin';
    editButton.disabled = !originalEdit;
    editButton.setAttribute('aria-label', `Redakto të dhënat klinike për ${drugName}`);
    editButton.title = originalEdit ? 'Redakto të dhënat klinike' : 'Redaktimi klinik nuk është ende i gatshëm';
  }

  function enhanceCellTitles(row) {
    ['active-substance', 'strength', 'form'].forEach(key => {
      const cell = row.querySelector(`td[data-registry-column-key="${key}"]`);
      if (!cell) return;
      const text = clean(cell.textContent);
      if (text) cell.title = text;
    });
  }

  function enhanceRows() {
    document.querySelectorAll('#tbody > tr').forEach(row => {
      if (row.querySelector('.empty-state')) return;
      enhanceNameCell(row);
      enhanceCellTitles(row);
    });
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
      return;
    }

    let total = 0;
    colgroup.querySelectorAll('col[data-registry-column-key]').forEach(col => {
      const key = col.dataset.registryColumnKey;
      if (!columnIsVisible(key)) {
        col.style.setProperty('width', '0px', 'important');
        return;
      }
      const width = COMPACT_WIDTHS[key] || Number.parseFloat(col.style.width) || 184;
      col.style.setProperty('width', `${width}px`, 'important');
      total += width;
    });
    table.style.setProperty('--registry-table-width', `${Math.max(total, viewport)}px`);
    table.dataset.registryClinicalWidth = String(total);
  }

  function refresh() {
    if (enhancing) return;
    enhancing = true;
    try {
      ensureStyles();
      createToolbar();
      if (!VALID_VIEWS.has(document.documentElement.dataset.registryUxView)) {
        document.documentElement.dataset.registryUxView = storedView();
      }
      compactDoseHeaders();
      enhanceRows();
      updateToolbarState();
      applyCompactWidths();
      document.documentElement.dataset.registryClinicalView = VERSION;
    } finally {
      enhancing = false;
    }
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refresh();
    });
  }

  function observeTable() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (!header || !tbody) return;
    observer?.disconnect();
    observer = new MutationObserver(records => {
      if (enhancing) return;
      if (records.some(record => record.type === 'childList' || record.type === 'attributes')) scheduleRefresh();
    });
    observer.observe(header, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'data-registry-column-key'] });
    observer.observe(tbody, { childList: true, subtree: true });
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

  function boot() {
    ensureStyles();
    if (!VALID_VIEWS.has(document.documentElement.dataset.registryUxView)) {
      document.documentElement.dataset.registryUxView = storedView();
    }
    observeTable();
    observeWidth();
    refresh();
  }

  ['medindex:registry-ready', 'medindex:registry-data-ready', 'medindex:tailadmin-ready', 'medindex:registry-table-stable']
    .forEach(eventName => window.addEventListener(eventName, scheduleRefresh));
  window.addEventListener('resize', scheduleRefresh, { passive: true });
  window.addEventListener('pageshow', scheduleRefresh, { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.MedIndexRegistryClinicalView = {
    version: VERSION,
    refresh: scheduleRefresh,
    setView,
    getView: currentView,
  };
})();
