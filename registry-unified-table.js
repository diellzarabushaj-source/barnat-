(() => {
  'use strict';

  const VERSION = 'registry-unified-table-20260801-1';
  const VIEW_STORAGE_KEY = 'medindex.registry.view.v2';
  const FILTER_STORAGE_KEY = 'medindex.registry.filters.open.v3';
  const MOBILE_BREAKPOINT = 760;

  const FULL_ORDER = Object.freeze([
    'select', 'number', 'trade-name', 'active-substance', 'atc', 'drug-class', 'use',
    'pdid', 'protocol', 'strength', 'form', 'prescription-label', 'packaging', 'mah',
    'manufacturer', 'ma-certificate', 'status', 'wholesale-price', 'margin-price', 'vat',
    'retail-price', 'validity', 'dosage-adult', 'dosage-pediatric', 'clinical-status',
    'clinical-action', 'dose-calculator',
  ]);
  const CLINICAL_ORDER = Object.freeze([
    'select', 'trade-name', 'active-substance', 'strength', 'form',
    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator',
  ]);
  const VALID_KEYS = new Set(FULL_ORDER);
  const DYNAMIC_KEYS = new Set([
    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator',
  ]);
  const CLINICAL_BASE_KEYS = Object.freeze(['trade-name', 'active-substance', 'strength', 'form']);

  const LABEL_BY_KEY = Object.freeze({
    select:'Për recetë', number:'Nr', 'trade-name':'Emri tregtar',
    'active-substance':'Substanca aktive', atc:'ATC', 'drug-class':'Klasa / Çka është',
    use:'Përdorimi / fjalë kyçe', pdid:'PDID', protocol:'Protokolli', strength:'Fortësia',
    form:'Forma', 'prescription-label':'Si shënohet në recetë', packaging:'Paketimi',
    mah:'Bartësi i Autorizimit', manufacturer:'Prodhuesi', 'ma-certificate':'Certifikata MA',
    status:'Statusi', 'wholesale-price':'Çmimi me shumicë', 'margin-price':'Çmimi me marzhë',
    vat:'TVSH', 'retail-price':'Çmimi me pakicë', validity:'Afati i vlefshmërisë',
    'dosage-adult':'1. Dozimi për të rritur', 'dosage-pediatric':'2. Dozimi për fëmijë',
    'clinical-status':'Verifikimi', 'clinical-action':'Redakto', 'dose-calculator':'Doza',
  });
  const RAW_FIELD_BY_KEY = Object.freeze({
    'trade-name':'Emri tregtar', 'active-substance':'Substanca aktive', strength:'Fortësia',
    form:'Forma farmaceutike', number:'Nr rendor', atc:'ATC Code', 'drug-class':'Klasa / Çka është',
    use:'Përdorimi (fjalë kyçe)', pdid:'PDID', protocol:'ProtocolNo',
    'prescription-label':'Si të shënohet në recetë', packaging:'Madhësia e paketimit',
    mah:'Bartësi i Autorizim Marketingut', manufacturer:'Prodhuesi',
    'ma-certificate':'MA certifikata', status:'Statusi', 'wholesale-price':'Çmimi me shumicë',
    'margin-price':'Çmimi me marzhë', vat:'TVSH', 'retail-price':'Çmimi me pakicë',
    validity:'Afati i vlefshmërisë',
  });
  const WIDTHS = Object.freeze({
    select:44, number:68, 'trade-name':210, 'active-substance':172, atc:88,
    'drug-class':210, use:230, pdid:98, protocol:122, strength:82, form:142,
    'prescription-label':235, packaging:150, mah:190, manufacturer:180,
    'ma-certificate':138, status:112, 'wholesale-price':116, 'margin-price':116,
    vat:78, 'retail-price':116, validity:140, 'dosage-adult':250,
    'dosage-pediatric':250, 'clinical-status':150, 'clinical-action':54,
    'dose-calculator':128,
  });
  const LABEL_KEYS = Object.freeze({
    perrecete:'select', zgjidh:'select', nr:'number', nrrendor:'number',
    emritregtar:'trade-name', emri:'trade-name', substancaaktive:'active-substance',
    atc:'atc', atccode:'atc', klasackaeshte:'drug-class', klasa:'drug-class',
    perdorimifjalekyce:'use', perdorimi:'use', pdid:'pdid', protokolli:'protocol',
    protocol:'protocol', fortesia:'strength', forma:'form', formafarmaceutike:'form',
    sishenohetnerecete:'prescription-label', paketimi:'packaging', madhesiaepaketimit:'packaging',
    bartesiiautorizimit:'mah', bartesiiautorizimmarketingut:'mah', prodhuesi:'manufacturer',
    certifikatama:'ma-certificate', macertifikata:'ma-certificate', statusi:'status',
    cmimimeshumice:'wholesale-price', cmshumice:'wholesale-price',
    cmimimemarzhe:'margin-price', cmmarzhe:'margin-price', tvsh:'vat',
    cmimimepakice:'retail-price', cmpakice:'retail-price', afatiivlefshmerise:'validity',
    afati:'validity', dozimiipertetritur:'dosage-adult', dozimiiperritur:'dosage-adult',
    dozimiiperfemije:'dosage-pediatric', dozimipediatrik:'dosage-pediatric',
    verifikimi:'clinical-status', redakto:'clinical-action', doza:'dose-calculator',
    kalkulatori:'dose-calculator', kalkulatoridozes:'dose-calculator',
  });

  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const PLACEHOLDER = '<span class="registry-unified-skeleton" aria-hidden="true"></span>';

  let scheduled = false;
  let reconciling = false;
  let observer = null;
  let resizeObserver = null;
  let shellAttempts = 0;
  let rawRowsSource = null;
  let rawRowsByDrugKey = new Map();
  let lastGeometry = '';
  let controlsBound = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .replace(/[▲▼↕]/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '');
  const currentView = () => document.documentElement.dataset.registryUxView === 'full' ? 'full' : 'clinical';
  const currentOrder = () => currentView() === 'full' ? FULL_ORDER : CLINICAL_ORDER;
  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

  function directKey(cell) {
    if (!cell) return '';
    const existing = clean(cell.dataset.registryColumnKey);
    if (VALID_KEYS.has(existing)) return existing;
    if (cell.dataset.registryDosageColumn === 'adult') return 'dosage-adult';
    if (cell.dataset.registryDosageColumn === 'pediatric') return 'dosage-pediatric';
    if (cell.dataset.registryDoseCalculatorColumn === 'dose-calculator') return 'dose-calculator';
    if (cell.dataset.clinicalEditorColumn === 'clinical-status') return 'clinical-status';
    if (cell.dataset.clinicalEditorColumn === 'clinical-action') return 'clinical-action';
    if (cell.classList?.contains('select-col')) return 'select';
    return '';
  }

  function headerKey(cell) {
    const direct = directKey(cell);
    if (direct) return direct;
    return LABEL_KEYS[normalize(cell.dataset.sourceLabel || cell.dataset.label || cell.textContent)] || '';
  }

  function stamp(cell, key) {
    if (!cell || !VALID_KEYS.has(key)) return;
    cell.dataset.registryColumnKey = key;
    if (cell.tagName !== 'COL') {
      cell.dataset.label = LABEL_BY_KEY[key] || key;
      if (cell.tagName === 'TH') {
        cell.scope = 'col';
        cell.setAttribute('aria-label', LABEL_BY_KEY[key] || key);
      }
    }
  }

  function refreshRawIndex() {
    const rows = Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];
    if (rows === rawRowsSource) return;
    rawRowsSource = rows;
    rawRowsByDrugKey = new Map();
    rows.forEach(row => {
      const key = [row?.PDID, row?.['Emri tregtar'], row?.['Fortësia']].map(clean).join('|');
      if (key && !rawRowsByDrugKey.has(key)) rawRowsByDrugKey.set(key, row);
    });
  }

  function rawForRow(row) {
    refreshRawIndex();
    const key = clean(row?.querySelector('.drug-select')?.dataset.drugKey);
    return key ? rawRowsByDrugKey.get(key) || null : null;
  }

  function makeHeader(key, synthetic = true) {
    const cell = document.createElement('th');
    if (synthetic) cell.dataset.registryUnifiedSynthetic = 'true';
    stamp(cell, key);
    if (key === 'dose-calculator') {
      cell.dataset.registryDoseCalculatorColumn = 'dose-calculator';
      cell.className = 'registry-dose-calculator-column';
      cell.innerHTML = 'Kalkulatori<span class="registry-dosage-subhead">Doza individuale</span>';
    } else if (key === 'dosage-adult' || key === 'dosage-pediatric') {
      const population = key === 'dosage-adult' ? 'adult' : 'pediatric';
      cell.dataset.registryDosageColumn = population;
      cell.className = `registry-dosage-column registry-dosage-${population}`;
      cell.innerHTML = `${LABEL_BY_KEY[key]}<span class="registry-dosage-subhead">Doza e plotë · Rruga</span>`;
    } else if (key === 'clinical-status') {
      cell.dataset.clinicalEditorColumn = 'clinical-status';
      cell.className = 'clinical-editor-status-column';
      cell.textContent = LABEL_BY_KEY[key];
    } else if (key === 'clinical-action') {
      cell.dataset.clinicalEditorColumn = 'clinical-action';
      cell.className = 'clinical-editor-action-column';
      cell.innerHTML = PENCIL;
      cell.title = 'Redakto';
    } else {
      cell.textContent = LABEL_BY_KEY[key] || key;
    }
    return cell;
  }

  function makeCell(key, row, synthetic = true) {
    const cell = document.createElement('td');
    if (synthetic) cell.dataset.registryUnifiedSynthetic = 'true';
    stamp(cell, key);
    const raw = rawForRow(row);
    const value = clean(raw?.[RAW_FIELD_BY_KEY[key]]);

    if (key === 'dose-calculator') {
      cell.dataset.registryDoseCalculatorColumn = 'dose-calculator';
      cell.className = 'registry-dose-calculator-column registry-unified-placeholder';
      cell.innerHTML = '<span class="registry-dosage-muted">Duke u lidhur…</span>';
    } else if (key === 'dosage-adult' || key === 'dosage-pediatric') {
      const population = key === 'dosage-adult' ? 'adult' : 'pediatric';
      cell.dataset.registryDosageColumn = population;
      cell.className = `registry-dosage-column registry-dosage-${population} registry-unified-placeholder`;
      cell.innerHTML = PLACEHOLDER;
    } else if (key === 'clinical-status') {
      cell.dataset.clinicalEditorColumn = 'clinical-status';
      cell.className = 'clinical-editor-status-column registry-unified-placeholder';
      cell.innerHTML = PLACEHOLDER;
    } else if (key === 'clinical-action') {
      cell.dataset.clinicalEditorColumn = 'clinical-action';
      cell.className = 'clinical-editor-action-column registry-unified-placeholder';
      cell.innerHTML = PLACEHOLDER;
    } else if (key === 'trade-name') {
      cell.className = 'name';
      cell.innerHTML = `<span class="drug-name-text"></span>`;
      cell.querySelector('span').textContent = value || '—';
    } else if (key === 'active-substance') {
      cell.className = 'quality-substance';
      cell.innerHTML = '<span></span>';
      cell.querySelector('span').textContent = value || '—';
    } else if (key === 'form') {
      cell.className = 'wrap registry-form-cell';
      cell.innerHTML = '<span class="cat-dot" aria-hidden="true"></span><span class="registry-cell-value"></span>';
      cell.querySelector('.registry-cell-value').textContent = value || '—';
    } else {
      cell.textContent = value || '—';
    }
    cell.title = value;
    return cell;
  }

  function stampHeader(header) {
    Array.from(header.children).forEach(cell => {
      const key = headerKey(cell);
      if (key) stamp(cell, key);
    });
  }

  function stampRow(row, header) {
    if (row.querySelector('.empty-state')) return;
    const baseKeys = Array.from(header.children)
      .map(headerKey)
      .filter(key => VALID_KEYS.has(key) && !DYNAMIC_KEYS.has(key));
    const used = new Set();
    const pending = [];

    Array.from(row.children).forEach(cell => {
      const key = directKey(cell);
      if (key) {
        stamp(cell, key);
        used.add(key);
      } else {
        pending.push(cell);
      }
    });

    const remaining = baseKeys.filter(key => !used.has(key));
    pending.forEach((cell, index) => {
      const key = remaining[index];
      if (key) stamp(cell, key);
    });

    const raw = rawForRow(row);
    const number = Number(raw?.['Nr rendor']);
    if (Number.isInteger(number) && number > 0) row.dataset.registryNumber = String(number);
  }

  function preferredCell(cells) {
    return cells.find(cell => cell.dataset.registryUnifiedSynthetic !== 'true') || cells[0] || null;
  }

  function dedupe(container) {
    const buckets = new Map();
    Array.from(container.children).forEach(cell => {
      const key = directKey(cell) || (cell.tagName === 'TH' ? headerKey(cell) : '');
      if (!VALID_KEYS.has(key)) {
        cell.remove();
        return;
      }
      stamp(cell, key);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(cell);
    });
    buckets.forEach(cells => {
      const keep = preferredCell(cells);
      cells.forEach(cell => { if (cell !== keep) cell.remove(); });
    });
  }

  function ensureRequiredColumns(header, tbody) {
    const required = new Set(DYNAMIC_KEYS);
    if (currentView() === 'clinical') CLINICAL_BASE_KEYS.forEach(key => required.add(key));

    required.forEach(key => {
      if (!Array.from(header.children).some(cell => directKey(cell) === key || headerKey(cell) === key)) {
        header.appendChild(makeHeader(key));
      }
    });

    Array.from(tbody.children).forEach(row => {
      if (row.querySelector('.empty-state')) return;
      required.forEach(key => {
        if (!Array.from(row.children).some(cell => directKey(cell) === key)) row.appendChild(makeCell(key, row));
      });
    });
  }

  function orderContainer(container, order) {
    const byKey = new Map();
    Array.from(container.children).forEach(cell => {
      const key = directKey(cell) || (cell.tagName === 'TH' ? headerKey(cell) : '');
      if (VALID_KEYS.has(key) && !byKey.has(key)) byKey.set(key, cell);
    });
    const desired = order.map(key => byKey.get(key)).filter(Boolean);
    if (desired.length !== container.children.length || desired.some((node, index) => container.children[index] !== node)) {
      container.replaceChildren(...desired);
    }
  }

  function keyVisible(key) {
    if (currentView() === 'clinical' && !CLINICAL_ORDER.includes(key)) return false;
    if (key === 'dosage-adult' && document.documentElement.classList.contains('hide-registry-dosage-adult')) return false;
    if (key === 'dosage-pediatric' && document.documentElement.classList.contains('hide-registry-dosage-pediatric')) return false;
    return true;
  }

  function rebuildColgroup(table, wrapper, order) {
    if (isMobile()) {
      table.querySelectorAll(':scope > colgroup').forEach(group => group.remove());
      table.style.removeProperty('--registry-unified-width');
      table.style.removeProperty('width');
      table.style.removeProperty('min-width');
      lastGeometry = 'mobile';
      return;
    }

    const visible = order.filter(key => keyVisible(key));
    const width = Math.max(
      visible.reduce((sum, key) => sum + (WIDTHS[key] || 150), 0),
      Math.round(wrapper.clientWidth || 0),
    );
    const signature = `${currentView()}|${Math.round(wrapper.clientWidth || 0)}|${visible.join(',')}|${width}`;
    if (signature === lastGeometry && table.querySelector(':scope > colgroup[data-registry-unified-colgroup]')) return;
    lastGeometry = signature;

    table.querySelectorAll(':scope > colgroup').forEach(group => group.remove());
    const group = document.createElement('colgroup');
    group.dataset.registryUnifiedColgroup = VERSION;
    order.forEach(key => {
      const col = document.createElement('col');
      col.dataset.registryColumnKey = key;
      if (keyVisible(key)) col.style.width = `${WIDTHS[key] || 150}px`;
      else col.style.display = 'none';
      group.appendChild(col);
    });
    table.prepend(group);
    table.style.setProperty('--registry-unified-width', `${width}px`);
    table.style.setProperty('width', `${width}px`, 'important');
    table.style.setProperty('min-width', `${width}px`, 'important');
  }

  function normalizePencils(tbody) {
    tbody.querySelectorAll('.clinical-editor-open').forEach(button => {
      button.dataset.registryUnifiedPencil = VERSION;
      button.setAttribute('aria-label', 'Redakto barin');
      button.title = 'Redakto';
      if (!button.querySelector('svg') || clean(button.textContent)) button.innerHTML = PENCIL;
    });
  }

  function updateCellLabels(header, tbody) {
    const labels = new Map(Array.from(header.children).map(cell => [directKey(cell), LABEL_BY_KEY[directKey(cell)] || clean(cell.textContent)]));
    Array.from(tbody.children).forEach(row => {
      Array.from(row.children).forEach(cell => {
        const key = directKey(cell);
        if (key && labels.has(key)) cell.dataset.label = labels.get(key);
      });
    });
  }

  function exposeAudit(header, tbody, order) {
    const expected = order.filter(key => keyVisible(key));
    let mismatches = 0;
    let unresolved = 0;
    Array.from(tbody.children).forEach(row => {
      if (row.querySelector('.empty-state')) return;
      const actual = Array.from(row.children).map(directKey).filter(keyVisible);
      const ok = actual.length === expected.length && actual.every((key, index) => key === expected[index]);
      row.dataset.registryUnifiedIntegrity = ok ? 'ok' : 'mismatch';
      if (!ok) mismatches += 1;
      if (!Number(row.dataset.registryNumber)) unresolved += 1;
    });
    const audit = {
      version:VERSION,
      view:currentView(),
      columns:expected,
      rows:Array.from(tbody.children).filter(row => !row.querySelector('.empty-state')).length,
      mismatches,
      unresolved,
      stable:mismatches === 0,
    };
    window.MEDINDEX_REGISTRY_TABLE_AUDIT = audit;
    document.documentElement.dataset.registryUnifiedIntegrity = audit.stable ? 'ok' : 'mismatch';
    window.dispatchEvent(new CustomEvent('medindex:registry-table-stable', { detail:audit }));
  }

  function reconcile() {
    scheduled = false;
    if (reconciling) return;
    const table = document.getElementById('dataTable');
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    const wrapper = document.getElementById('registryContent');
    if (!table || !header || !tbody || !wrapper) return;

    reconciling = true;
    observer?.disconnect();
    try {
      stampHeader(header);
      Array.from(tbody.children).forEach(row => stampRow(row, header));
      ensureRequiredColumns(header, tbody);
      stampHeader(header);
      Array.from(tbody.children).forEach(row => stampRow(row, header));
      dedupe(header);
      Array.from(tbody.children).forEach(dedupe);

      const order = currentOrder().filter(key => Array.from(header.children).some(cell => directKey(cell) === key));
      orderContainer(header, order);
      Array.from(tbody.children).forEach(row => {
        if (row.querySelector('.empty-state')) {
          const cell = row.querySelector('td');
          if (cell) cell.colSpan = Math.max(1, order.filter(keyVisible).length);
          return;
        }
        orderContainer(row, order);
      });

      updateCellLabels(header, tbody);
      normalizePencils(tbody);
      rebuildColgroup(table, wrapper, order);
      table.dataset.registryUnifiedTable = VERSION;
      wrapper.dataset.registryUnifiedTable = VERSION;
      document.documentElement.dataset.registryUnifiedTable = VERSION;
      exposeAudit(header, tbody, order);
    } finally {
      reconciling = false;
      observeTable();
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(reconcile);
  }

  function observeTable() {
    const header = document.getElementById('headerRow');
    const tbody = document.getElementById('tbody');
    if (!header || !tbody) return;
    if (!observer) observer = new MutationObserver(schedule);
    observer.observe(header, { childList:true });
    observer.observe(tbody, { childList:true });
  }

  function buildToolbar() {
    const toolbar = document.createElement('section');
    toolbar.id = 'registryViewToolbar';
    toolbar.className = 'registry-view-toolbar registry-view-toolbar-unified';
    toolbar.setAttribute('aria-label', 'Kontrollet e regjistrit të barnave');
    toolbar.innerHTML = `
      <div class="registry-view-heading">
        <strong>Regjistri i barnave</strong>
        <span data-registry-view-description>Dozat dhe rruga e përdorimit janë në fokus.</span>
      </div>
      <div class="registry-view-actions-wrap">
        <button type="button" class="registry-filter-toggle" data-registry-filter-toggle aria-controls="registryFilterPanel" aria-expanded="false">Filtrat <span data-registry-filter-count hidden>0</span></button>
        <div class="registry-view-actions" role="group" aria-label="Pamja e tabelës">
          <button type="button" data-registry-view="clinical">Fokus klinik</button>
          <button type="button" data-registry-view="full">Tabela e plotë</button>
        </div>
      </div>`;
    return toolbar;
  }

  function filtersOpen() {
    return document.documentElement.dataset.registryFiltersOpen === 'true';
  }

  function setFiltersOpen(open) {
    const next = Boolean(open);
    document.documentElement.dataset.registryFiltersOpen = String(next);
    try { localStorage.setItem(FILTER_STORAGE_KEY, String(next)); } catch {}
    const button = document.querySelector('[data-registry-filter-toggle]');
    button?.setAttribute('aria-expanded', String(next));
    button?.classList.toggle('is-active', next);
    if (!next) {
      document.getElementById('formPanel')?.classList.remove('open');
      document.getElementById('colPanel')?.classList.remove('open');
    }
  }

  function activeFilterCount() {
    const search = Boolean(document.getElementById('search')?.value.trim());
    const status = Boolean(document.getElementById('statusFilter')?.value);
    const form = clean(document.getElementById('formPickerBtn')?.textContent).replace(/▾/g, '');
    return [search, status, Boolean(form && !/të gjitha/i.test(form))].filter(Boolean).length;
  }

  function updateToolbar() {
    const toolbar = document.getElementById('registryViewToolbar');
    if (!toolbar) return;
    toolbar.querySelectorAll('[data-registry-view]').forEach(button => {
      const active = button.dataset.registryView === currentView();
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const count = activeFilterCount();
    const badge = toolbar.querySelector('[data-registry-filter-count]');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    const description = toolbar.querySelector('[data-registry-view-description]');
    const countText = clean(document.getElementById('countBadge')?.textContent).match(/[\d.,]+/)?.[0];
    if (description) description.textContent = currentView() === 'clinical'
      ? `${countText ? `${countText} barna · ` : ''}dozat dhe rruga e përdorimit janë të prioritizuara.`
      : `${countText ? `${countText} barna · ` : ''}kolonat e zgjedhura shfaqen në rend të qëndrueshëm.`;
  }

  function ensureShell() {
    const tableWrap = document.getElementById('registryContent');
    const panel = document.querySelector('.toolbar.registry-toolbar, body > .toolbar, .registry-page-workspace > .toolbar');
    if (!tableWrap || !panel) {
      shellAttempts += 1;
      if (shellAttempts < 40) setTimeout(ensureShell, 120);
      return;
    }

    let toolbar = document.getElementById('registryViewToolbar');
    if (!toolbar || !toolbar.classList.contains('registry-view-toolbar-unified')) {
      const replacement = buildToolbar();
      toolbar?.remove();
      tableWrap.before(replacement);
      toolbar = replacement;
    }

    panel.id = 'registryFilterPanel';
    panel.classList.add('registry-filter-panel-unified');
    if (toolbar.nextElementSibling !== panel) toolbar.after(panel);
    document.querySelectorAll('.registry-overview,.registry-table-bar').forEach(node => {
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
    });
    updateToolbar();
  }

  function setView(view) {
    const next = view === 'full' ? 'full' : 'clinical';
    document.documentElement.dataset.registryUxView = next;
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch {}
    lastGeometry = '';
    updateToolbar();
    schedule();
    requestAnimationFrame(() => {
      const wrapper = document.getElementById('registryContent');
      if (wrapper) wrapper.scrollLeft = 0;
    });
  }

  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;
    document.addEventListener('click', event => {
      const filter = event.target.closest?.('[data-registry-filter-toggle]');
      if (filter) {
        event.preventDefault();
        setFiltersOpen(!filtersOpen());
        return;
      }
      const view = event.target.closest?.('#registryViewToolbar [data-registry-view]');
      if (view) {
        event.preventDefault();
        setView(view.dataset.registryView);
        return;
      }
      if (event.target.closest?.('#colPanel label,#colPanel .col-panel-actions button')) {
        setTimeout(() => setView('full'), 0);
      }
    }, true);
    document.addEventListener('input', event => {
      if (event.target.matches?.('#search,#formSearch')) updateToolbar();
    }, true);
    document.addEventListener('change', event => {
      if (event.target.matches?.('#statusFilter,#formPanel input')) updateToolbar();
      if (event.target.closest?.('#colPanel')) setTimeout(() => setView('full'), 0);
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      document.getElementById('formPanel')?.classList.remove('open');
      document.getElementById('colPanel')?.classList.remove('open');
    }, true);
  }

  function start() {
    let storedView = 'clinical';
    let storedFilters = false;
    try {
      storedView = localStorage.getItem(VIEW_STORAGE_KEY) === 'full' ? 'full' : 'clinical';
      storedFilters = localStorage.getItem(FILTER_STORAGE_KEY) === 'true';
    } catch {}
    document.documentElement.dataset.registryUxView = storedView;
    document.documentElement.dataset.registryFiltersOpen = String(storedFilters);
    bindControls();
    ensureShell();
    observeTable();
    schedule();

    if ('ResizeObserver' in window) {
      const wrapper = document.getElementById('registryContent');
      if (wrapper) {
        resizeObserver = new ResizeObserver(() => {
          lastGeometry = '';
          schedule();
        });
        resizeObserver.observe(wrapper);
      }
    }

    [
      'medindex:registry-data-ready', 'medindex:registry-ready', 'medindex:registry-dosage-ready',
      'medindex:population-verification-ready', 'medindex:tailadmin-ready',
    ].forEach(name => window.addEventListener(name, () => {
      ensureShell();
      lastGeometry = '';
      schedule();
    }));
    window.addEventListener('resize', () => {
      lastGeometry = '';
      schedule();
    }, { passive:true });
    window.addEventListener('pageshow', () => {
      ensureShell();
      lastGeometry = '';
      schedule();
    }, { passive:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.MedIndexRegistryUnified = Object.freeze({
    version:VERSION,
    refresh:schedule,
    setView,
    setFiltersOpen,
  });
})();
