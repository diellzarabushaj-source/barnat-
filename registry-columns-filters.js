(() => {
  'use strict';

  const VERSION = 'registry-columns-filters-20260801-1';
  const FILTER_STORAGE_KEY = 'medindex.registry.filters.open.v1';
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
  const FULL_WIDTHS = Object.freeze({
    select:52, number:74, 'trade-name':270, 'active-substance':246, atc:96,
    'drug-class':240, use:270, pdid:108, protocol:130, strength:126, form:244,
    'prescription-label':270, packaging:180, mah:220, manufacturer:210,
    'ma-certificate':150, status:128, 'wholesale-price':126, 'margin-price':126,
    vat:92, 'retail-price':126, validity:150, 'dosage-adult':292,
    'dosage-pediatric':292, 'clinical-status':184, 'clinical-action':100,
    'registry-number-probe':0,
  });

  let tableObserver = null;
  let shellObserver = null;
  let countObserver = null;
  let scheduled = false;
  let reordering = false;
  let controlsBound = false;
  let resetScroll = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .replace(/[▲▼↕]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '');

  function sameNodes(left, right) {
    return left.length === right.length && left.every((node, index) => node === right[index]);
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
    return LABEL_KEYS[normalize(cell.dataset.label || cell.textContent || '')] || `column-${index}`;
  }

  function canonicalHeader(header) {
    const known = [];
    const unknown = [];
    const dynamic = [];
    Array.from(header.children).forEach((node, index) => {
      const key = keyForCell(node, index);
      node.dataset.registryColumnKey = key;
      const item = { node, key, index };
      if (DYNAMIC_KEYS.has(key)) dynamic.push(item);
      else if (ORDER_INDEX.has(key)) known.push(item);
      else unknown.push(item);
    });
    known.sort((a, b) => ORDER_INDEX.get(a.key) - ORDER_INDEX.get(b.key) || a.index - b.index);
    dynamic.sort((a, b) => ORDER_INDEX.get(a.key) - ORDER_INDEX.get(b.key) || a.index - b.index);
    return [...known, ...unknown, ...dynamic].map(item => item.node);
  }

  function alignContainer(container, keys) {
    const buckets = new Map();
    Array.from(container.children).forEach((node, index) => {
      const key = node.tagName === 'COL'
        ? node.dataset.registryColumnKey || `column-${index}`
        : keyForCell(node, index);
      if (node.tagName !== 'COL') node.dataset.registryColumnKey = key;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(node);
    });
    const desired = [];
    keys.forEach(key => {
      const nodes = buckets.get(key);
      if (!nodes?.length) return;
      desired.push(nodes.shift());
      if (!nodes.length) buckets.delete(key);
    });
    buckets.forEach(nodes => desired.push(...nodes));
    if (!sameNodes(Array.from(container.children), desired)) container.replaceChildren(...desired);
  }

  function applyFullWidths(table, header, wrapper) {
    if (document.documentElement.dataset.registryUxView !== 'full') return;
    const colgroup = table.querySelector(':scope > colgroup[data-registry-colgroup]');
    if (!colgroup) return;
    let total = 0;
    Array.from(colgroup.children).forEach((col, index) => {
      const key = col.dataset.registryColumnKey || `column-${index}`;
      const cell = header.querySelector(`:scope > [data-registry-column-key="${key}"]`);
      const visible = Boolean(cell && !cell.hidden && getComputedStyle(cell).display !== 'none' && key !== 'registry-number-probe');
      if (!visible) {
        col.style.setProperty('display', 'none', 'important');
        col.style.setProperty('width', '0px', 'important');
        return;
      }
      const width = FULL_WIDTHS[key] ?? 184;
      col.style.removeProperty('display');
      col.style.setProperty('width', `${width}px`, 'important');
      total += width;
    });
    table.style.setProperty('--registry-table-width', `${Math.max(total, Math.round(wrapper.clientWidth))}px`);
    table.dataset.registryLayoutMode = 'full';
  }

  function canonicalize() {
    if (reordering) return;
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    const table = document.getElementById('dataTable');
    const wrapper = table?.closest('.table-wrap');
    if (!header || !tbody || !table || !wrapper) return;

    reordering = true;
    tableObserver?.disconnect();
    try {
      const desiredHeader = canonicalHeader(header);
      if (!sameNodes(Array.from(header.children), desiredHeader)) header.replaceChildren(...desiredHeader);
      const keys = Array.from(header.children).map((cell, index) => keyForCell(cell, index));
      Array.from(tbody.children).forEach(row => {
        if (row.querySelector('.empty-state')) {
          const empty = row.querySelector('td');
          if (empty) empty.colSpan = Math.max(1, keys.filter(key => key !== 'registry-number-probe').length);
          return;
        }
        alignContainer(row, keys);
      });
      const colgroup = table.querySelector(':scope > colgroup[data-registry-colgroup]');
      if (colgroup) alignContainer(colgroup, keys);
      applyFullWidths(table, header, wrapper);
      table.dataset.registryCanonicalColumns = VERSION;
    } finally {
      reordering = false;
      observeTable();
    }

    if (resetScroll) {
      resetScroll = false;
      requestAnimationFrame(() => { wrapper.scrollLeft = 0; });
    }
    window.MedIndexRegistryRows?.refresh?.();
  }

  function scheduleCanonicalize({ reset = false } = {}) {
    resetScroll = resetScroll || reset;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      canonicalize();
    });
  }

  function storedFiltersOpen() {
    try {
      const value = localStorage.getItem(FILTER_STORAGE_KEY);
      if (value === 'true' || value === 'false') return value === 'true';
    } catch {}
    return !matchMedia('(max-width:900px)').matches;
  }

  function filtersOpen() {
    return document.documentElement.dataset.registryFiltersOpen !== 'false';
  }

  function setFiltersOpen(open, { focus = false } = {}) {
    const next = Boolean(open);
    document.documentElement.dataset.registryFiltersOpen = String(next);
    try { localStorage.setItem(FILTER_STORAGE_KEY, String(next)); } catch {}
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
    } else if (focus) {
      requestAnimationFrame(() => document.getElementById('search')?.focus({ preventScroll:true }));
    }
  }

  function activeFilterCount() {
    const search = Boolean(document.getElementById('search')?.value.trim());
    const status = Boolean(document.getElementById('statusFilter')?.value);
    const form = clean(document.getElementById('formPickerBtn')?.textContent).replace(/▾/g, '').trim();
    return [search, status, Boolean(form && !/të gjitha/i.test(form))].filter(Boolean).length;
  }

  function updateFilterState() {
    const count = activeFilterCount();
    const badge = document.querySelector('[data-registry-filter-count]');
    const button = document.querySelector('[data-registry-filter-toggle]');
    if (badge) {
      const value = String(count);
      if (badge.textContent !== value) badge.textContent = value;
      badge.hidden = count === 0;
    }
    button?.classList.toggle('has-active-filters', count > 0);
  }

  function buildFilterButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'registry-filter-toggle';
    button.dataset.registryFilterToggle = '1';
    button.setAttribute('aria-controls', 'registryFilterPanel');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 12h10M10 19h4"/></svg><span>Filtrat</span><span class="registry-filter-count" data-registry-filter-count hidden>0</span>';
    return button;
  }

  function setupShell() {
    const toolbar = document.getElementById('registryViewToolbar');
    const filterPanel = document.querySelector('.toolbar.registry-toolbar') || document.querySelector('.toolbar');
    if (!toolbar || !filterPanel) return false;

    let actionsWrap = toolbar.querySelector('.registry-view-actions-wrap');
    const viewActions = toolbar.querySelector('.registry-view-actions');
    if (!actionsWrap && viewActions) {
      actionsWrap = document.createElement('div');
      actionsWrap.className = 'registry-view-actions-wrap';
      viewActions.before(actionsWrap);
      actionsWrap.append(buildFilterButton(), viewActions);
    }

    let meta = toolbar.querySelector('.registry-view-meta-slot');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'registry-view-meta-slot';
      actionsWrap?.before(meta) || toolbar.appendChild(meta);
    }

    filterPanel.id = 'registryFilterPanel';
    filterPanel.classList.add('registry-filter-panel');
    if (toolbar.nextElementSibling !== filterPanel) toolbar.after(filterPanel);
    filterPanel.hidden = !filtersOpen();

    const tableActions = document.querySelector('.registry-table-actions');
    if (tableActions && tableActions.parentElement !== meta) meta.appendChild(tableActions);
    const tableBar = document.querySelector('.registry-table-bar');
    if (tableBar) {
      tableBar.classList.add('registry-table-bar-integrated');
      tableBar.hidden = true;
    }

    const button = toolbar.querySelector('[data-registry-filter-toggle]');
    button?.setAttribute('aria-expanded', String(filtersOpen()));
    button?.classList.toggle('is-active', filtersOpen());
    updateFilterState();

    if (tableActions) {
      shellObserver?.disconnect();
      shellObserver = null;
      return true;
    }
    return false;
  }

  function switchToFullView() {
    window.MedIndexRegistryClinicalView?.setView?.('full');
    requestAnimationFrame(() => requestAnimationFrame(() => scheduleCanonicalize({ reset:true })));
  }

  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;
    document.addEventListener('click', event => {
      const filterButton = event.target.closest?.('[data-registry-filter-toggle]');
      if (filterButton) {
        const next = !filtersOpen();
        setFiltersOpen(next, { focus:next });
        return;
      }
      if (event.target.closest?.('#colPanel label, #colPanel .col-panel-actions button')) setTimeout(switchToFullView, 0);
      if (event.target.closest?.('#formList, #formPanel')) setTimeout(updateFilterState, 0);
      if (event.target.closest?.('#registryViewToolbar [data-registry-view]')) scheduleCanonicalize({ reset:true });
    }, true);
    document.addEventListener('input', event => {
      if (event.target.matches?.('#search')) updateFilterState();
    }, true);
    document.addEventListener('change', event => {
      if (event.target.closest?.('#colPanel')) switchToFullView();
      if (event.target.matches?.('#statusFilter, #formPanel input, #colPanel input')) updateFilterState();
    }, true);
  }

  function observeTable() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (!header || !tbody) return;
    if (!tableObserver) tableObserver = new MutationObserver(() => scheduleCanonicalize());
    tableObserver.observe(header, { childList:true });
    tableObserver.observe(tbody, { childList:true, subtree:true });
  }

  function observeShell() {
    if (setupShell() || shellObserver || !document.body) return;
    shellObserver = new MutationObserver(setupShell);
    shellObserver.observe(document.body, { childList:true, subtree:true });
    setTimeout(() => {
      shellObserver?.disconnect();
      shellObserver = null;
    }, 12000);
  }

  function observeCount() {
    const count = document.getElementById('countBadge');
    if (!count || countObserver) return;
    countObserver = new MutationObserver(updateFilterState);
    countObserver.observe(count, { childList:true, characterData:true, subtree:true });
  }

  function init() {
    document.documentElement.dataset.registryFiltersOpen = String(storedFiltersOpen());
    bindControls();
    observeShell();
    observeTable();
    observeCount();
    scheduleCanonicalize({ reset:true });
    ['medindex:registry-ready', 'medindex:registry-data-ready', 'medindex:registry-table-stable', 'medindex:tailadmin-ready']
      .forEach(name => window.addEventListener(name, () => {
        observeShell();
        observeTable();
        observeCount();
        scheduleCanonicalize();
      }));
    window.addEventListener('medindex:registry-view-change', () => scheduleCanonicalize({ reset:true }));
    window.addEventListener('resize', () => scheduleCanonicalize(), { passive:true });
    window.addEventListener('pageshow', () => scheduleCanonicalize({ reset:true }), { passive:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.MedIndexRegistryColumnsFilters = {
    version:VERSION,
    refresh:scheduleCanonicalize,
    setFiltersOpen,
  };
})();