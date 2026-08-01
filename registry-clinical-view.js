(() => {
  'use strict';

  const VERSION = 'registry-clinical-view-20260801-8';
  const STORAGE_KEY = 'medindex.registry.view.v1';
  const FILTER_STORAGE_KEY = 'medindex.registry.filters.open.v1';
  const VALID_VIEWS = new Set(['clinical', 'full']);
  const DYNAMIC_KEYS = new Set([
    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'registry-number-probe',
  ]);
  const COLUMN_ORDER = Object.freeze([
    'select', 'number', 'trade-name', 'active-substance', 'atc', 'drug-class', 'use',
    'pdid', 'protocol', 'strength', 'form', 'prescription-label', 'packaging', 'mah',
    'manufacturer', 'ma-certificate', 'status', 'wholesale-price', 'margin-price', 'vat',
    'retail-price', 'validity', 'dosage-adult', 'dosage-pediatric', 'clinical-status',
    'clinical-action', 'registry-number-probe',
  ]);
  const ORDER_INDEX = new Map(COLUMN_ORDER.map((key, index) => [key, index]));
  const LABEL_KEYS = Object.freeze({
    perrecete:'select', nr:'number', emritregtar:'trade-name', substancaaktive:'active-substance',
    atc:'atc', atccode:'atc', klasackaeshte:'drug-class', perdorimifjalekyce:'use',
    pdid:'pdid', protokolli:'protocol', fortesia:'strength', forma:'form', formafarmaceutike:'form',
    sishenohetnerecete:'prescription-label', paketimi:'packaging', bartesiiautorizimit:'mah',
    prodhuesi:'manufacturer', certifikatama:'ma-certificate', statusi:'status',
    cmshumice:'wholesale-price', cmmarzhe:'margin-price', tvsh:'vat', cmpakice:'retail-price',
    afati:'validity', verifikimi:'clinical-status', redakto:'clinical-action',
  });
  const COMPACT_WIDTHS = Object.freeze({
    select:48, 'trade-name':250, 'active-substance':220, strength:92, form:180,
    'dosage-adult':270, 'dosage-pediatric':270, 'clinical-status':170, 'clinical-action':100,
  });
  const FULL_WIDTHS = Object.freeze({
    select:52, number:74, 'trade-name':270, 'active-substance':246, atc:96,
    'drug-class':240, use:270, pdid:108, protocol:130, strength:126, form:244,
    'prescription-label':270, packaging:180, mah:220, manufacturer:210,
    'ma-certificate':150, status:128, 'wholesale-price':126, 'margin-price':126,
    vat:92, 'retail-price':126, validity:150, 'dosage-adult':292,
    'dosage-pediatric':292, 'clinical-status':184, 'clinical-action':100,
    'registry-number-probe':0,
  });

  let active = false;
  let activationScheduled = false;
  let resizeObserver = null;
  let tableObserver = null;
  let chromeObserver = null;
  let refreshScheduled = false;
  let reorderScheduled = false;
  let reordering = false;
  let controlsBound = false;
  let lastWidthSignature = '';
  let initialScrollReset = false;
  let resetScrollAfterLayout = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .replace(/[▲▼↕]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '');

  function storedView() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return VALID_VIEWS.has(value) ? value : 'clinical';
    } catch {
      return 'clinical';
    }
  }

  function persistView(view) {
    try { localStorage.setItem(STORAGE_KEY, view); } catch {}
  }

  function storedFiltersOpen() {
    try {
      const value = localStorage.getItem(FILTER_STORAGE_KEY);
      if (value === 'true' || value === 'false') return value === 'true';
    } catch {}
    return !matchMedia('(max-width: 900px)').matches;
  }

  function persistFiltersOpen(open) {
    try { localStorage.setItem(FILTER_STORAGE_KEY, String(open)); } catch {}
  }

  function currentView() {
    const value = document.documentElement.dataset.registryUxView;
    return VALID_VIEWS.has(value) ? value : storedView();
  }

  function filtersOpen() {
    return document.documentElement.dataset.registryFiltersOpen !== 'false';
  }

  function keyForCell(cell, index = 0) {
    if (!cell) return `column-${index}`;
    if (cell.dataset.registryColumnKey) return cell.dataset.registryColumnKey;
    if (cell.hasAttribute('data-registry-number-probe')) return 'registry-number-probe';
    if (cell.dataset.registryDosageColumn === 'adult') return 'dosage-adult';
    if (cell.dataset.registryDosageColumn === 'pediatric') return 'dosage-pediatric';
    if (cell.dataset.clinicalEditorColumn === 'clinical-status') return 'clinical-status';
    if (cell.dataset.clinicalEditorColumn === 'clinical-action') return 'clinical-action';
    if (cell.classList.contains('select-col')) return 'select';
    const token = normalize(cell.dataset.label || cell.textContent || '');
    return LABEL_KEYS[token] || `column-${index}`;
  }

  function sameNodes(left, right) {
    return left.length === right.length && left.every((node, index) => node === right[index]);
  }

  function canonicalHeaderNodes(header) {
    const source = Array.from(header?.children || []);
    const staticKnown = [];
    const staticUnknown = [];
    const dynamic = [];

    source.forEach((node, index) => {
      const key = keyForCell(node, index);
      node.dataset.registryColumnKey = key;
      const item = { node, key, index };
      if (DYNAMIC_KEYS.has(key)) dynamic.push(item);
      else if (ORDER_INDEX.has(key)) staticKnown.push(item);
      else staticUnknown.push(item);
    });

    staticKnown.sort((a, b) => ORDER_INDEX.get(a.key) - ORDER_INDEX.get(b.key) || a.index - b.index);
    dynamic.sort((a, b) => ORDER_INDEX.get(a.key) - ORDER_INDEX.get(b.key) || a.index - b.index);
    return [...staticKnown, ...staticUnknown, ...dynamic].map(item => item.node);
  }

  function alignRowToHeader(row, headerKeys) {
    if (!row || row.querySelector('.empty-state')) {
      const empty = row?.querySelector('td');
      if (empty) empty.colSpan = Math.max(1, headerKeys.filter(key => key !== 'registry-number-probe').length);
      return;
    }

    const buckets = new Map();
    Array.from(row.children).forEach((cell, index) => {
      const key = keyForCell(cell, index);
      cell.dataset.registryColumnKey = key;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(cell);
    });

    const desired = [];
    headerKeys.forEach(key => {
      const cells = buckets.get(key);
      if (!cells?.length) return;
      desired.push(cells.shift());
      if (!cells.length) buckets.delete(key);
    });
    buckets.forEach(cells => desired.push(...cells));

    const current = Array.from(row.children);
    if (!sameNodes(current, desired)) row.replaceChildren(...desired);
  }

  function alignColgroupToHeader(table, headerKeys) {
    const colgroup = table?.querySelector(':scope > colgroup[data-registry-colgroup]');
    if (!colgroup) return;
    const buckets = new Map();
    Array.from(colgroup.children).forEach((col, index) => {
      const key = col.dataset.registryColumnKey || `column-${index}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(col);
    });
    const desired = [];
    headerKeys.forEach(key => {
      const cols = buckets.get(key);
      if (!cols?.length) return;
      desired.push(cols.shift());
      if (!cols.length) buckets.delete(key);
    });
    buckets.forEach(cols => desired.push(...cols));
    const current = Array.from(colgroup.children);
    if (!sameNodes(current, desired)) colgroup.replaceChildren(...desired);
  }

  function canonicalizeColumns() {
    if (reordering) return;
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    const table = document.getElementById('dataTable');
    if (!header || !tbody || !table) return;

    reordering = true;
    tableObserver?.disconnect();
    try {
      const desiredHeader = canonicalHeaderNodes(header);
      if (!sameNodes(Array.from(header.children), desiredHeader)) header.replaceChildren(...desiredHeader);
      const headerKeys = Array.from(header.children).map((cell, index) => keyForCell(cell, index));
      Array.from(tbody.children).forEach(row => alignRowToHeader(row, headerKeys));
      alignColgroupToHeader(table, headerKeys);
      table.dataset.registryCanonicalColumns = VERSION;
    } finally {
      reordering = false;
      observeTable();
    }

    lastWidthSignature = '';
    applyColumnWidths();
    if (resetScrollAfterLayout) {
      resetScrollAfterLayout = false;
      resetClinicalScroll({ force:true });
    }
  }

  function scheduleCanonicalize({ resetScroll = false } = {}) {
    resetScrollAfterLayout = resetScrollAfterLayout || resetScroll;
    if (reorderScheduled) return;
    reorderScheduled = true;
    requestAnimationFrame(() => {
      reorderScheduled = false;
      canonicalizeColumns();
    });
  }

  function resetClinicalScroll({ force = false } = {}) {
    const wrapper = document.querySelector('.table-wrap');
    if (!wrapper) return;
    if (!force && currentView() === 'clinical' && initialScrollReset) return;
    if (currentView() === 'clinical') initialScrollReset = true;
    requestAnimationFrame(() => {
      if (Math.abs(wrapper.scrollLeft) > 1) wrapper.scrollLeft = 0;
    });
  }

  function setView(view, { persist = true, resetScroll = true } = {}) {
    const next = VALID_VIEWS.has(view) ? view : 'clinical';
    document.documentElement.dataset.registryUxView = next;
    if (persist) persistView(next);
    if (!active) activate();
    updateToolbarState();
    lastWidthSignature = '';
    scheduleCanonicalize({ resetScroll });
    scheduleRefresh();
    if (resetScroll) resetClinicalScroll({ force:true });
    window.dispatchEvent(new CustomEvent('medindex:registry-view-change', { detail:{ view:next } }));
  }

  function setFiltersOpen(open, { persist = true, focusSearch = false } = {}) {
    const next = Boolean(open);
    document.documentElement.dataset.registryFiltersOpen = String(next);
    if (persist) persistFiltersOpen(next);
    const panel = document.getElementById('registryFilterPanel');
    if (panel) panel.hidden = !next;
    const button = document.querySelector('[data-registry-filter-toggle]');
    if (button) {
      button.setAttribute('aria-expanded', String(next));
      button.classList.toggle('is-active', next);
    }
    if (!next) {
      document.getElementById('formPanel')?.classList.remove('open');
      document.getElementById('colPanel')?.classList.remove('open');
    } else if (focusSearch) {
      requestAnimationFrame(() => document.getElementById('search')?.focus({ preventScroll:true }));
    }
  }

  function createToolbar() {
    const tableWrap = document.querySelector('.table-wrap');
    if (!tableWrap) return;
    let toolbar = document.getElementById('registryViewToolbar');
    if (!toolbar) {
      toolbar = document.createElement('section');
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
        <div class="registry-view-meta-slot" aria-live="polite"></div>
        <div class="registry-view-actions-wrap">
          <button type="button" class="registry-filter-toggle" data-registry-filter-toggle aria-controls="registryFilterPanel" aria-expanded="true">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 12h10M10 19h4"/></svg>
            <span>Filtrat</span>
            <span class="registry-filter-count" data-registry-filter-count hidden>0</span>
          </button>
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
        </div>`;

      toolbar.addEventListener('click', event => {
        const viewButton = event.target.closest('button[data-registry-view]');
        if (viewButton) {
          setView(viewButton.dataset.registryView);
          return;
        }
        const filterButton = event.target.closest('[data-registry-filter-toggle]');
        if (filterButton) {
          const next = !filtersOpen();
          setFiltersOpen(next, { focusSearch:next });
        }
      });
      tableWrap.before(toolbar);
    }
    setupRegistryChrome();
  }

  function setupRegistryChrome() {
    const toolbar = document.getElementById('registryViewToolbar');
    if (!toolbar) return;

    const filterPanel = document.querySelector('.toolbar.registry-toolbar') || document.querySelector('.toolbar');
    if (filterPanel) {
      filterPanel.id = 'registryFilterPanel';
      filterPanel.classList.add('registry-filter-panel');
      if (toolbar.nextElementSibling !== filterPanel) toolbar.after(filterPanel);
      filterPanel.hidden = !filtersOpen();
    }

    const tableActions = document.querySelector('.registry-table-actions');
    const metaSlot = toolbar.querySelector('.registry-view-meta-slot');
    if (tableActions && metaSlot && tableActions.parentElement !== metaSlot) metaSlot.appendChild(tableActions);

    const tableBar = document.querySelector('.registry-table-bar');
    if (tableBar) {
      tableBar.classList.add('registry-table-bar-integrated');
      tableBar.hidden = true;
    }
  }

  function activeFilterCount() {
    const searchActive = Boolean(document.getElementById('search')?.value.trim());
    const statusActive = Boolean(document.getElementById('statusFilter')?.value);
    const formText = clean(document.getElementById('formPickerBtn')?.textContent).replace(/▾/g, '').trim();
    const formActive = Boolean(formText && !/të gjitha/i.test(formText));
    return [searchActive, statusActive, formActive].filter(Boolean).length;
  }

  function updateToolbarState() {
    const view = currentView();
    document.querySelectorAll('#registryViewToolbar button[data-registry-view]').forEach(button => {
      const selected = button.dataset.registryView === view;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });

    const description = document.querySelector('[data-registry-view-description]');
    const countText = clean(document.getElementById('countBadge')?.textContent);
    const count = countText.match(/[\d.,]+/)?.[0];
    const prefix = count ? `${count} barna · ` : '';
    if (description) {
      description.textContent = view === 'clinical'
        ? `${prefix}dozat, verifikimi dhe redaktimi janë të prioritizuara.`
        : `${prefix}kolonat e zgjedhura shfaqen në rend të qëndrueshëm.`;
    }

    const activeCount = activeFilterCount();
    const filterCount = document.querySelector('[data-registry-filter-count]');
    const filterButton = document.querySelector('[data-registry-filter-toggle]');
    if (filterCount) {
      filterCount.textContent = String(activeCount);
      filterCount.hidden = activeCount === 0;
    }
    filterButton?.classList.toggle('has-active-filters', activeCount > 0);
  }

  function headerFor(key) {
    return document.querySelector(`#headerRow > th[data-registry-column-key="${key}"]`);
  }

  function columnIsVisible(key) {
    const header = headerFor(key);
    return Boolean(header && !header.hidden && getComputedStyle(header).display !== 'none');
  }

  function applyColumnWidths() {
    const table = document.getElementById('dataTable');
    const wrapper = table?.closest('.table-wrap');
    const colgroup = table?.querySelector(':scope > colgroup[data-registry-colgroup]');
    if (!table || !wrapper || !colgroup) return;

    const view = currentView();
    const viewport = Math.max(0, Math.round(wrapper.clientWidth));
    const signature = `${view}|${viewport}|${table.dataset.registryVisibleColumns || ''}|${Array.from(colgroup.children).map(col => `${col.dataset.registryColumnKey}:${col.style.display}`).join(',')}`;
    if (signature === lastWidthSignature) return;
    lastWidthSignature = signature;

    const widths = view === 'clinical' ? COMPACT_WIDTHS : FULL_WIDTHS;
    let total = 0;
    colgroup.querySelectorAll('col[data-registry-column-key]').forEach(col => {
      const key = col.dataset.registryColumnKey;
      const visible = columnIsVisible(key) && key !== 'registry-number-probe';
      if (!visible) {
        col.style.setProperty('width', '0px', 'important');
        col.style.setProperty('display', 'none', 'important');
        return;
      }
      const width = widths[key] ?? 184;
      col.style.removeProperty('display');
      col.style.setProperty('width', `${width}px`, 'important');
      total += width;
    });
    table.style.setProperty('--registry-table-width', `${Math.max(total, viewport)}px`);
    table.dataset.registryLayoutMode = view;
    table.dataset.registryClinicalWidth = String(total);
  }

  function refresh() {
    if (!active) return;
    createToolbar();
    setupRegistryChrome();
    updateToolbarState();
    scheduleCanonicalize();
    applyColumnWidths();
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

  function observeTable() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (!header || !tbody) return;
    if (!tableObserver) tableObserver = new MutationObserver(() => scheduleCanonicalize());
    tableObserver.observe(header, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden', 'style', 'class'] });
    tableObserver.observe(tbody, { childList:true });
  }

  function observeChrome() {
    if (chromeObserver || !document.body) return;
    chromeObserver = new MutationObserver(() => {
      setupRegistryChrome();
      updateToolbarState();
    });
    chromeObserver.observe(document.body, { childList:true, subtree:true });
  }

  function manualColumnChange() {
    setView('full', { persist:true, resetScroll:true });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scheduleCanonicalize({ resetScroll:true });
      scheduleRefresh();
    }));
  }

  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;
    document.addEventListener('input', event => {
      if (event.target.matches?.('#search')) updateToolbarState();
    }, true);
    document.addEventListener('change', event => {
      if (event.target.matches?.('#statusFilter, #formPanel input, #colPanel input')) {
        if (event.target.closest?.('#colPanel')) manualColumnChange();
        updateToolbarState();
      }
    }, true);
    document.addEventListener('click', event => {
      if (event.target.closest?.('#formList, #formPanel')) setTimeout(updateToolbarState, 0);
      if (event.target.closest?.('#colPanel label, #colPanel .col-panel-actions button')) setTimeout(manualColumnChange, 0);
    }, true);
  }

  function activate() {
    if (active) return;
    active = true;
    activationScheduled = false;
    createToolbar();
    observeWidth();
    observeTable();
    observeChrome();
    bindControls();
    refresh();
  }

  function scheduleActivation() {
    if (active || activationScheduled) return;
    activationScheduled = true;
    requestAnimationFrame(activate);
  }

  function initializeViewState() {
    document.documentElement.dataset.registryUxView = storedView();
    document.documentElement.dataset.registryFiltersOpen = String(storedFiltersOpen());
    scheduleActivation();
  }

  ['medindex:registry-data-ready', 'medindex:registry-ready', 'medindex:registry-table-stable']
    .forEach(eventName => window.addEventListener(eventName, () => {
      if (!active) scheduleActivation();
      lastWidthSignature = '';
      scheduleCanonicalize();
      scheduleRefresh();
    }));
  window.addEventListener('medindex:tailadmin-ready', scheduleActivation);
  window.addEventListener('resize', scheduleRefresh, { passive:true });
  window.addEventListener('pageshow', () => {
    scheduleActivation();
    lastWidthSignature = '';
    scheduleCanonicalize({ resetScroll:true });
    scheduleRefresh();
  }, { passive:true });

  initializeViewState();

  window.MedIndexRegistryClinicalView = {
    version:VERSION,
    refresh:scheduleRefresh,
    activate:scheduleActivation,
    setView,
    getView:currentView,
    setFiltersOpen,
    canonicalize:scheduleCanonicalize,
  };
})();