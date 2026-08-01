(() => {
  'use strict';

  const VERSION = 'registry-final-controller-20260801-2';
  const FILTER_STORAGE_KEY = 'medindex.registry.filters.open.v2';
  const VIEW_STORAGE_KEY = 'medindex.registry.view.v1';

  const ORDER = Object.freeze([
    'select', 'number', 'trade-name', 'active-substance', 'atc', 'drug-class', 'use',
    'pdid', 'protocol', 'strength', 'form', 'prescription-label', 'packaging', 'mah',
    'manufacturer', 'ma-certificate', 'status', 'wholesale-price', 'margin-price', 'vat',
    'retail-price', 'validity', 'dosage-adult', 'dosage-pediatric', 'clinical-status',
    'clinical-action', 'registry-number-probe',
  ]);
  const ORDER_INDEX = new Map(ORDER.map((key, index) => [key, index]));
  const VALID_KEYS = new Set(ORDER);
  const CLINICAL_KEYS = new Set([
    'select', 'trade-name', 'active-substance', 'strength', 'form',
    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action',
  ]);
  const CLINICAL_BASE_KEYS = Object.freeze([
    'trade-name', 'active-substance', 'strength', 'form',
  ]);

  const LABEL_BY_KEY = Object.freeze({
    select:'Për recetë',
    number:'Nr',
    'trade-name':'Emri tregtar',
    'active-substance':'Substanca aktive',
    atc:'ATC',
    'drug-class':'Klasa / Çka është',
    use:'Përdorimi (fjalë kyçe)',
    pdid:'PDID',
    protocol:'Protokolli',
    strength:'Fortësia',
    form:'Forma',
    'prescription-label':'Si shënohet në recetë',
    packaging:'Paketimi',
    mah:'Bartësi i Autorizimit',
    manufacturer:'Prodhuesi',
    'ma-certificate':'Certifikata MA',
    status:'Statusi',
    'wholesale-price':'Çmimi me shumicë',
    'margin-price':'Çmimi me marzhë',
    vat:'TVSH',
    'retail-price':'Çmimi me pakicë',
    validity:'Afati i vlefshmërisë',
    'dosage-adult':'1. Dozimi për të rritur',
    'dosage-pediatric':'2. Dozimi për fëmijë',
    'clinical-status':'Verifikimi',
    'clinical-action':'Redakto',
    'registry-number-probe':'Nr',
  });

  const RAW_FIELD_BY_KEY = Object.freeze({
    'trade-name':'Emri tregtar',
    'active-substance':'Substanca aktive',
    strength:'Fortësia',
    form:'Forma farmaceutike',
  });

  const LABEL_KEYS = Object.freeze({
    perrecete:'select', zgjidh:'select', select:'select',
    nr:'number', nrrendor:'number', number:'number',
    emritregtar:'trade-name', emri:'trade-name', tradename:'trade-name',
    substancaaktive:'active-substance', substanca:'active-substance', activesubstance:'active-substance',
    atc:'atc', atccode:'atc', kodiatc:'atc',
    klasackaeshte:'drug-class', klasa:'drug-class', ckaeshte:'drug-class', drugclass:'drug-class',
    perdorimifjalekyce:'use', perdorimi:'use', indikacioni:'use', indikacionet:'use', uses:'use',
    pdid:'pdid',
    protokolli:'protocol', protocol:'protocol', protocolno:'protocol',
    fortesia:'strength', strength:'strength',
    forma:'form', formafarmaceutike:'form', dosageform:'form',
    sishenohetnerecete:'prescription-label', sheniminerecete:'prescription-label',
    shenimi:'prescription-label', prescriptionlabel:'prescription-label',
    paketimi:'packaging', madhesiaepaketimit:'packaging',
    bartesiiautorizimit:'mah', bartesiiautorizimmarketingut:'mah', mah:'mah',
    prodhuesi:'manufacturer', manufacturer:'manufacturer',
    certifikatama:'ma-certificate', macertifikata:'ma-certificate', macertificate:'ma-certificate',
    statusi:'status', status:'status',
    cmimimeshumice:'wholesale-price', cmshumice:'wholesale-price',
    cmimimemarzhe:'margin-price', cmmarzhe:'margin-price',
    tvsh:'vat', vat:'vat',
    cmimimepakice:'retail-price', cmpakice:'retail-price',
    afatiivlefshmerise:'validity', afati:'validity', validity:'validity',
    dozimiipertetritur:'dosage-adult', dozimiiperritur:'dosage-adult',
    dozimiiperfemije:'dosage-pediatric', dozimipediatrik:'dosage-pediatric',
    verifikimi:'clinical-status', redakto:'clinical-action',
  });

  const CLINICAL_WIDTHS = Object.freeze({
    select:52,
    'trade-name':238,
    'active-substance':180,
    strength:88,
    form:158,
    'dosage-adult':258,
    'dosage-pediatric':258,
    'clinical-status':178,
    'clinical-action':102,
  });
  const FULL_WIDTHS = Object.freeze({
    select:52, number:74, 'trade-name':270, 'active-substance':230, atc:96,
    'drug-class':235, use:270, pdid:108, protocol:130, strength:118, form:210,
    'prescription-label':270, packaging:180, mah:220, manufacturer:210,
    'ma-certificate':150, status:128, 'wholesale-price':126, 'margin-price':126,
    vat:92, 'retail-price':126, validity:150, 'dosage-adult':292,
    'dosage-pediatric':292, 'clinical-status':184, 'clinical-action':102,
    'registry-number-probe':0,
  });

  let tableObserver = null;
  let shellObserver = null;
  let countObserver = null;
  let formButtonObserver = null;
  let scheduled = false;
  let shellScheduled = false;
  let reconciling = false;
  let controlsBound = false;
  let rawRowsSource = null;
  let rawRowsByKey = new Map();
  let resetScroll = true;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .replace(/[▲▼↕]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '');

  function currentView() {
    const value = document.documentElement.dataset.registryUxView;
    return value === 'full' ? 'full' : 'clinical';
  }

  function sameNodes(left, right) {
    return left.length === right.length && left.every((node, index) => node === right[index]);
  }

  function specialKey(cell) {
    if (!cell) return '';
    if (cell.hasAttribute('data-registry-number-probe')) return 'registry-number-probe';
    if (cell.dataset.registryDosageColumn === 'adult') return 'dosage-adult';
    if (cell.dataset.registryDosageColumn === 'pediatric') return 'dosage-pediatric';
    if (cell.dataset.clinicalEditorColumn === 'clinical-status') return 'clinical-status';
    if (cell.dataset.clinicalEditorColumn === 'clinical-action') return 'clinical-action';
    if (cell.classList?.contains('select-col')) return 'select';
    return '';
  }

  function keyForCell(cell, index = 0) {
    if (!cell) return `column-${index}`;
    const special = specialKey(cell);
    if (special) return special;

    const labelKey = LABEL_KEYS[normalize(cell.dataset.sourceLabel || cell.dataset.label || '')];
    if (labelKey) return labelKey;

    if (cell.tagName === 'TH') {
      const textKey = LABEL_KEYS[normalize(cell.textContent || '')];
      if (textKey) return textKey;
    }

    if (cell.classList?.contains('name')) return 'trade-name';
    if (cell.classList?.contains('quality-substance')) return 'active-substance';

    const existing = cell.dataset.registryColumnKey;
    if (VALID_KEYS.has(existing)) return existing;
    return `column-${index}`;
  }

  function stampCell(cell, key) {
    if (!cell || cell.tagName === 'COL') return;
    cell.dataset.registryColumnKey = key;
    const canonicalLabel = LABEL_BY_KEY[key];
    if (canonicalLabel && key !== 'registry-number-probe') {
      cell.dataset.sourceLabel = canonicalLabel;
      cell.dataset.label = canonicalLabel;
    }
    if (cell.tagName === 'TH' && key !== 'registry-number-probe') cell.scope = 'col';
  }

  function drugKey(row) {
    return [row?.PDID, row?.['Emri tregtar'], row?.['Fortësia']].map(clean).join('|');
  }

  function refreshRawIndex() {
    const rows = Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];
    if (rows === rawRowsSource) return;
    rawRowsSource = rows;
    rawRowsByKey = new Map();
    rows.forEach(row => {
      const key = drugKey(row);
      if (key && !rawRowsByKey.has(key)) rawRowsByKey.set(key, row);
    });
  }

  function rawForTableRow(row) {
    refreshRawIndex();
    const key = clean(row?.querySelector('.drug-select')?.dataset?.drugKey);
    return key ? rawRowsByKey.get(key) || null : null;
  }

  function makeHeaderCell(key) {
    const cell = document.createElement('th');
    cell.dataset.registrySyntheticClinical = 'true';
    stampCell(cell, key);
    cell.textContent = LABEL_BY_KEY[key] || key;
    return cell;
  }

  function makeRowCell(key, raw) {
    const cell = document.createElement('td');
    cell.dataset.registrySyntheticClinical = 'true';
    stampCell(cell, key);
    const field = RAW_FIELD_BY_KEY[key];
    const value = clean(raw?.[field]);
    cell.title = value;

    if (key === 'trade-name') {
      cell.className = 'name';
      const span = document.createElement('span');
      span.className = 'drug-name-text';
      span.textContent = value || '—';
      cell.appendChild(span);
    } else if (key === 'active-substance') {
      cell.className = 'quality-substance';
      const span = document.createElement('span');
      span.textContent = value || '—';
      cell.appendChild(span);
    } else if (key === 'form') {
      cell.className = 'wrap registry-form-cell';
      const dot = document.createElement('span');
      dot.className = 'cat-dot';
      dot.setAttribute('aria-hidden', 'true');
      const span = document.createElement('span');
      span.className = 'registry-cell-value';
      span.textContent = value || '—';
      cell.append(dot, span);
    } else {
      cell.textContent = value || '—';
    }
    return cell;
  }

  function removeSyntheticClinicalCells() {
    document.querySelectorAll('#dataTable [data-registry-synthetic-clinical="true"]').forEach(node => node.remove());
  }

  function ensureClinicalColumns(header, tbody) {
    if (currentView() !== 'clinical') {
      removeSyntheticClinicalCells();
      return;
    }

    CLINICAL_BASE_KEYS.forEach(key => {
      const existing = Array.from(header.children).find((cell, index) => keyForCell(cell, index) === key);
      if (!existing) header.appendChild(makeHeaderCell(key));
    });

    Array.from(tbody.children).forEach(row => {
      if (row.querySelector('.empty-state')) return;
      const raw = rawForTableRow(row);
      CLINICAL_BASE_KEYS.forEach(key => {
        const existing = Array.from(row.children).find((cell, index) => keyForCell(cell, index) === key);
        if (!existing) row.appendChild(makeRowCell(key, raw));
      });
    });
  }

  function canonicalizeHeader(header) {
    const items = Array.from(header.children).map((node, index) => {
      const key = keyForCell(node, index);
      stampCell(node, key);
      return { node, key, index };
    });

    const preferredByKey = new Map();
    items.forEach(item => {
      if (!VALID_KEYS.has(item.key)) return;
      const current = preferredByKey.get(item.key);
      if (!current || (current.node.dataset.registrySyntheticClinical === 'true'
        && item.node.dataset.registrySyntheticClinical !== 'true')) {
        preferredByKey.set(item.key, item);
      }
    });

    items.forEach(item => {
      const preferred = preferredByKey.get(item.key);
      if (preferred && preferred !== item && item.node.dataset.registrySyntheticClinical === 'true') {
        item.node.remove();
      }
    });

    const currentItems = Array.from(header.children).map((node, index) => {
      const key = keyForCell(node, index);
      stampCell(node, key);
      return { node, key, index };
    });

    currentItems.sort((a, b) => {
      const ai = ORDER_INDEX.has(a.key) ? ORDER_INDEX.get(a.key) : 1000 + a.index;
      const bi = ORDER_INDEX.has(b.key) ? ORDER_INDEX.get(b.key) : 1000 + b.index;
      return ai - bi || a.index - b.index;
    });

    const desired = currentItems.map(item => item.node);
    if (!sameNodes(Array.from(header.children), desired)) header.replaceChildren(...desired);
    return Array.from(header.children).map((cell, index) => keyForCell(cell, index));
  }

  function alignRow(row, keys) {
    if (row.querySelector('.empty-state')) {
      const empty = row.querySelector('td');
      if (empty) empty.colSpan = Math.max(1, keys.filter(key => key !== 'registry-number-probe').length);
      return;
    }

    const buckets = new Map();
    Array.from(row.children).forEach((cell, index) => {
      const key = keyForCell(cell, index);
      stampCell(cell, key);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(cell);
    });

    buckets.forEach((cells, key) => {
      if (cells.length < 2) return;
      const original = cells.find(cell => cell.dataset.registrySyntheticClinical !== 'true');
      if (!original) return;
      cells.filter(cell => cell !== original && cell.dataset.registrySyntheticClinical === 'true')
        .forEach(cell => cell.remove());
      buckets.set(key, [original, ...cells.filter(cell => cell !== original && cell.isConnected)]);
    });

    const desired = [];
    keys.forEach(key => {
      const cells = buckets.get(key);
      if (!cells?.length) return;
      desired.push(cells.shift());
      if (!cells.length) buckets.delete(key);
    });
    buckets.forEach(cells => desired.push(...cells.filter(cell => cell.isConnected)));

    if (!sameNodes(Array.from(row.children), desired)) row.replaceChildren(...desired);
    row.dataset.registryColumnIntegrity = 'ok';
  }

  function keyIsVisible(key, headerCell) {
    if (key === 'registry-number-probe') return false;
    if (currentView() === 'clinical') return CLINICAL_KEYS.has(key);
    return Boolean(headerCell && !headerCell.hidden && getComputedStyle(headerCell).display !== 'none');
  }

  function rebuildColgroup(table, header, keys, wrapper) {
    let colgroup = table.querySelector(':scope > colgroup[data-registry-colgroup]');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      const anchor = table.querySelector(':scope > thead');
      table.insertBefore(colgroup, anchor || table.firstChild);
    }

    const desktop = matchMedia('(min-width:761px)').matches;
    const widths = currentView() === 'clinical' ? CLINICAL_WIDTHS : FULL_WIDTHS;
    let total = 0;
    const columns = keys.map(key => {
      const headerCell = Array.from(header.children).find(cell => cell.dataset.registryColumnKey === key);
      const visible = keyIsVisible(key, headerCell);
      const width = visible ? (widths[key] || 184) : 0;
      total += width;
      const col = document.createElement('col');
      col.dataset.registryColumnKey = key;
      col.style.setProperty('width', `${width}px`, 'important');
      if (!visible) col.style.setProperty('display', 'none', 'important');
      return col;
    });
    colgroup.dataset.registryColgroup = VERSION;
    colgroup.replaceChildren(...columns);

    const visibleKeys = keys.filter(key => {
      const headerCell = Array.from(header.children).find(cell => cell.dataset.registryColumnKey === key);
      return keyIsVisible(key, headerCell);
    });
    table.dataset.registryVisibleColumns = visibleKeys.join(',');
    table.dataset.registryPerfectLayout = VERSION;

    if (desktop) {
      const width = Math.max(total, Math.round(wrapper.clientWidth || 0));
      table.style.setProperty('--registry-table-width', `${width}px`);
      table.style.setProperty('width', `${width}px`, 'important');
      table.style.setProperty('min-width', `${width}px`, 'important');
    } else {
      table.style.removeProperty('--registry-table-width');
      table.style.removeProperty('width');
      table.style.removeProperty('min-width');
    }
  }

  function reconcileTable() {
    if (reconciling) return;
    const table = document.getElementById('dataTable');
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    const wrapper = table?.closest('.table-wrap');
    if (!table || !header || !tbody || !wrapper) return;

    reconciling = true;
    tableObserver?.disconnect();
    try {
      ensureClinicalColumns(header, tbody);
      const keys = canonicalizeHeader(header);
      Array.from(tbody.children).forEach(row => alignRow(row, keys));
      rebuildColgroup(table, header, keys, wrapper);
      document.documentElement.dataset.registryPerfectLayout = VERSION;
    } finally {
      reconciling = false;
      observeTable();
    }

    if (resetScroll) {
      resetScroll = false;
      requestAnimationFrame(() => { wrapper.scrollLeft = 0; });
    }
    window.MedIndexRegistryRows?.refresh?.();
    window.MedIndexRegistryClinicalView?.refresh?.();
  }

  function scheduleReconcile({ reset = false } = {}) {
    resetScroll = resetScroll || reset;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      reconcileTable();
    });
  }

  function storedFiltersOpen() {
    try {
      const value = localStorage.getItem(FILTER_STORAGE_KEY);
      if (value === 'true' || value === 'false') return value === 'true';
    } catch {}
    return false;
  }

  function filtersOpen() {
    return document.documentElement.dataset.registryFiltersOpen === 'true';
  }

  function setFiltersOpen(open, { focus = false } = {}) {
    const next = Boolean(open);
    document.documentElement.dataset.registryFiltersOpen = String(next);
    try { localStorage.setItem(FILTER_STORAGE_KEY, String(next)); } catch {}
    const button = document.querySelector('[data-registry-filter-toggle]');
    button?.setAttribute('aria-expanded', String(next));
    button?.classList.toggle('is-active', next);
    if (!next) {
      document.getElementById('formPanel')?.classList.remove('open');
      document.getElementById('colPanel')?.classList.remove('open');
    } else if (focus) {
      requestAnimationFrame(() => document.getElementById('statusFilter')?.focus({ preventScroll:true }));
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
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    button?.classList.toggle('has-active-filters', count > 0);
  }

  function buildToolbar() {
    const toolbar = document.createElement('section');
    toolbar.id = 'registryViewToolbar';
    toolbar.className = 'registry-view-toolbar registry-view-toolbar-final';
    toolbar.setAttribute('aria-label', 'Kontrollet e regjistrit të barnave');
    toolbar.innerHTML = `
      <div class="registry-view-heading">
        <span class="registry-view-heading-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 5.5h16M4 12h16M4 18.5h16M8 3v18"/></svg>
        </span>
        <div class="registry-view-copy">
          <strong>Regjistri i barnave</strong>
          <span data-registry-view-description>Dozat dhe verifikimi janë në fokus.</span>
        </div>
      </div>
      <div class="registry-view-meta-slot"></div>
      <div class="registry-view-actions-wrap">
        <button type="button" class="registry-filter-toggle" data-registry-filter-toggle aria-controls="registryFilterPanel" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 12h10M10 19h4"/></svg>
          <span>Filtrat</span><span class="registry-filter-count" data-registry-filter-count hidden>0</span>
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
    return toolbar;
  }

  function ensureToolbar() {
    const tableWrap = document.querySelector('.table-wrap');
    if (!tableWrap) return null;
    let toolbar = document.getElementById('registryViewToolbar');
    if (!toolbar || !toolbar.classList.contains('registry-view-toolbar-final')) {
      const replacement = buildToolbar();
      if (toolbar) toolbar.replaceWith(replacement);
      else tableWrap.before(replacement);
      toolbar = replacement;
    }
    return toolbar;
  }

  function updateViewState(toolbar) {
    const view = currentView();
    toolbar?.querySelectorAll('[data-registry-view]').forEach(button => {
      const active = button.dataset.registryView === view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const description = toolbar?.querySelector('[data-registry-view-description]');
    if (description) {
      const countText = clean(document.getElementById('countBadge')?.textContent);
      const count = countText.match(/[\d.,]+/)?.[0];
      const prefix = count ? `${count} barna · ` : '';
      description.textContent = view === 'clinical'
        ? `${prefix}dozat, rruga dhe verifikimi janë të prioritizuara.`
        : `${prefix}kolonat e zgjedhura shfaqen në rend të qëndrueshëm.`;
    }
  }

  function setupShell() {
    const panel = document.querySelector('.toolbar.registry-toolbar');
    const tableWrap = document.querySelector('.table-wrap');
    if (!panel || !tableWrap || !panel.querySelector('.registry-search-block')) return false;

    const toolbar = ensureToolbar();
    if (!toolbar) return false;

    document.querySelectorAll('.registry-overview, .registry-table-bar').forEach(node => {
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
    });

    panel.id = 'registryFilterPanel';
    panel.classList.add('registry-filter-panel', 'registry-filter-panel-final');
    panel.hidden = false;
    if (toolbar.nextElementSibling !== panel) toolbar.after(panel);

    const meta = toolbar.querySelector('.registry-view-meta-slot');
    const tableActions = document.querySelector('.registry-table-actions');
    if (meta && tableActions && tableActions.parentElement !== meta) meta.appendChild(tableActions);

    const filterButton = toolbar.querySelector('[data-registry-filter-toggle]');
    filterButton?.setAttribute('aria-expanded', String(filtersOpen()));
    filterButton?.classList.toggle('is-active', filtersOpen());
    updateViewState(toolbar);
    updateFilterState();

    shellObserver?.disconnect();
    shellObserver = null;
    return true;
  }

  function scheduleShell() {
    if (shellScheduled) return;
    shellScheduled = true;
    requestAnimationFrame(() => {
      shellScheduled = false;
      setupShell();
    });
  }

  function setView(view) {
    const next = view === 'full' ? 'full' : 'clinical';
    if (window.MedIndexRegistryClinicalView?.setView) {
      window.MedIndexRegistryClinicalView.setView(next);
    } else {
      document.documentElement.dataset.registryUxView = next;
      try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch {}
    }
    document.documentElement.dataset.registryUxView = next;
    window.dispatchEvent(new CustomEvent('medindex:registry-view-change', { detail:{ view:next } }));
    scheduleShell();
    scheduleReconcile({ reset:true });
  }

  function switchToFullView() {
    setView('full');
    requestAnimationFrame(() => scheduleReconcile({ reset:true }));
  }

  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;

    document.addEventListener('click', event => {
      const filterButton = event.target.closest?.('[data-registry-filter-toggle]');
      if (filterButton) {
        event.preventDefault();
        const next = !filtersOpen();
        setFiltersOpen(next, { focus:next });
        return;
      }

      const viewButton = event.target.closest?.('#registryViewToolbar [data-registry-view]');
      if (viewButton) {
        event.preventDefault();
        setView(viewButton.dataset.registryView);
        return;
      }

      if (event.target.closest?.('#colPanel label, #colPanel .col-panel-actions button')) {
        setTimeout(switchToFullView, 0);
      }
      if (event.target.closest?.('#formList, #formPanel')) setTimeout(updateFilterState, 0);
    }, true);

    document.addEventListener('input', event => {
      if (event.target.matches?.('#search, #formSearch')) updateFilterState();
    }, true);

    document.addEventListener('change', event => {
      if (event.target.closest?.('#colPanel')) setTimeout(switchToFullView, 0);
      if (event.target.matches?.('#statusFilter, #formPanel input')) updateFilterState();
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      document.getElementById('formPanel')?.classList.remove('open');
      document.getElementById('colPanel')?.classList.remove('open');
    }, true);
  }

  function observeTable() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (!header || !tbody) return;
    if (!tableObserver) tableObserver = new MutationObserver(() => scheduleReconcile());
    tableObserver.observe(header, { childList:true });
    tableObserver.observe(tbody, { childList:true, subtree:true });
  }

  function observeShell() {
    if (setupShell() || shellObserver || !document.body) return;
    shellObserver = new MutationObserver(scheduleShell);
    shellObserver.observe(document.body, { childList:true, subtree:true });
    setTimeout(() => {
      shellObserver?.disconnect();
      shellObserver = null;
    }, 15000);
  }

  function observeMeta() {
    const count = document.getElementById('countBadge');
    if (count && !countObserver) {
      countObserver = new MutationObserver(() => {
        updateFilterState();
        updateViewState(document.getElementById('registryViewToolbar'));
      });
      countObserver.observe(count, { childList:true, characterData:true, subtree:true });
    }

    const formButton = document.getElementById('formPickerBtn');
    if (formButton && !formButtonObserver) {
      formButtonObserver = new MutationObserver(updateFilterState);
      formButtonObserver.observe(formButton, { childList:true, characterData:true, subtree:true });
    }
  }

  function init() {
    document.documentElement.dataset.registryFiltersOpen = String(storedFiltersOpen());
    bindControls();
    observeShell();
    observeTable();
    observeMeta();
    scheduleReconcile({ reset:true });

    [
      'medindex:registry-ready',
      'medindex:registry-data-ready',
      'medindex:registry-table-stable',
      'medindex:tailadmin-ready',
      'medindex:first-page-audit-ready',
    ].forEach(name => window.addEventListener(name, () => {
      observeShell();
      observeTable();
      observeMeta();
      scheduleReconcile();
    }));

    window.addEventListener('medindex:registry-view-change', () => {
      scheduleShell();
      scheduleReconcile({ reset:true });
    });
    window.addEventListener('resize', () => scheduleReconcile(), { passive:true });
    window.addEventListener('pageshow', () => {
      scheduleShell();
      scheduleReconcile({ reset:true });
    }, { passive:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.MedIndexRegistryColumnsFilters = {
    version:VERSION,
    refresh:scheduleReconcile,
    setFiltersOpen,
    setView,
  };
})();