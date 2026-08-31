(() => {
  'use strict';


  const FORM_GROUPS = [
    { source:'Tableta & pilula', label:'TABLETA & PILULA', short:'Tab.', color:'#2f7d5c', icon:'pill', forms:['Chewable tablet','Coated tablet','Compressed lozenge','Dispersible tablet','Effervescent tablet','Film coated tablet','Gastro-resistant coated tablet','Gastro-resistant tablet','Lozenge','Modified-release film-coated tablet','Modified-release tablet','Orodispersible tablet','Pastille','Prolonged-release tablet','Soluble tablet','Sublingual tablet','Tablet'] },
    { source:'Kapsula', label:'KAPSULA', short:'Caps.', color:'#b1502f', icon:'capsule', forms:['Capsule','Capsule, hard','Capsule, soft','Gastro-resistant capsule','Gastro-resistant capsule, hard','Inhalation powder, hard capsule','Modified release capsule, hard','Prolonged release capsule, hard','Prolonged-release capsule','Vaginal capsule','Vaginal capsule, soft'] },
    { source:'Shurupe & solucione orale', label:'SHURUPE & SOLUCIONE ORALE', short:'Sir. / Sol.', color:'#2f6f9e', icon:'bottle', forms:['Granules for oral solution','Granules for oral suspension','Granules for syrup','Oral drops','Oral drops, solution','Oral drops, suspension','Oral emulsion','Oral gel','Oral jelly','Oral lyophilisate','Oral powder','Oral solution','Oral suspension','Powder for oral solution','Powder for oral suspension','Syrup'] },
    { source:'Injeksione & Infuzione', label:'AMPULA, INJEKSIONE & INFUZIONE', short:'Amp. / Inf.', color:'#8a3e6b', icon:'syringe', forms:['Ampoule','Concentrate for solution for infusion','Concentrate for solution for injection','Concentrate for solution for injection/infusion','Emulsion for infusion','Emulsion for injection/infusion','Injection','Lyophilisate for solution for infusion','Lyophilisate for solution for injection','Lyophilisate for suspension for injection','Powder and solvent for solution for infusion','Powder and solvent for solution for injection','Powder and solvent for solution for injection/infusion','Powder and solvent for suspension for injection','Powder for concentrate for solution for infusion','Powder for injection','Powder for solution for infusion','Powder for solution for injection','Powder for solution for injection or infusion','Powder for suspension for injection','Solution for infusion','Solution for infusion and oral solution','Solution for injection','Solution for injection/infusion','Suspension for injection'] },
    { source:'Kremra, xhel & pomada', label:'KREMRA, XHEL & POMADA', short:'Krem. / Ung.', color:'#b98a1e', icon:'tube', forms:['Cream','Cutaneous emulsion','Cutaneous liquid','Cutaneous paste','Cutaneous powder','Cutaneous solution','Gel','Nasal ointment','Ointment'] },
    { source:'Pika (sy, veshë, hundë)', label:'PIKA PËR SY, VESHË & HUNDË', short:'Gtt.', color:'#3f9a8f', icon:'drop', forms:['Ear drops, emulsion','Ear drops, solution','Ear/eye drops, solution','Eye drops','Eye drops, solution','Eye drops, suspension','Eye gel','Eye ointment','Nasal drops, solution'] },
    { source:'Sprej & Inhalim', label:'SPREJ & INHALIM', short:'Spray / Inh.', color:'#6d5aa6', icon:'lungs', forms:['Cutaneous spray','Cutaneous spray, solution','Inhalation powder','Inhalation vapour, liquid','Inhalation vapour, solution','Medicinal gas, compressed','Medicinal gas, liquefied','Nasal spray','Nasal spray, solution','Nasal spray, suspension','Nebuliser solution','Nebuliser suspension','Oral solution/concentrate for nebuliser solution','Oromucosal spray','Powder for nebuliser solution','Pressurised inhalation, solution','Pressurised inhalation, suspension','Sublingual spray'] },
    { source:'Pluhur & granula', label:'PLUHUR & GRANULA', short:'Pulv. / Gran.', color:'#9c6b3f', icon:'powder', forms:['Effervescent granules','Effervescent powder','Granules','Oromucosal gel','Oromucosal solution'] },
    { source:'Supozitorë & forma vaginale', label:'SUPOZITORË & FORMA VAGINALE', short:'Supp.', color:'#c2547e', icon:'suppository', forms:['Endocervical gel','Pessary','Rectal cream','Rectal ointment','Rectal solution','Rectal suspension','Suppository','Vaginal cream','Vaginal gel','Vaginal solution','Vaginal tablet'] },
    { source:'Forma të tjera speciale', label:'FORMA TË TJERA SPECIALE', short:'Tjera', color:'#6b6f76', icon:'special', forms:['Applicator','Bladder irrigation','Dental solution','Gargle','Gargle/mouth wash','Implant','Impregnated dressing','Intraarticular use','Medicated chewing-gum','Medicated nail laquer','Mouth wash','Shampoo','Solution for peritonel dialysis','Solvent for parenteral use','Transdermal patch'] },
  ];

  const FORM_ALIASES = {
    kapsul:['capsule'], tablet:['tablet'], 'tabletë':['tablet'], shurup:['syrup'], sirup:['syrup'],
    injeksion:['injection'], infuzion:['infusion'], 'kremë':['cream'], kreme:['cream'], pika:['drops'], 'pikë':['drops'],
    supozitor:['suppository'], pomad:['ointment'], 'pomadë':['ointment'], xhel:['gel'], zhel:['gel'], pluhur:['powder'],
    granula:['granules'], 'granulë':['granules'], inhalim:['inhalation'], inhalator:['inhalation'], spraj:['spray'], sprej:['spray'],
    shampo:['shampoo'], implant:['implant'], ampul:['ampoule'], 'ampulë':['ampoule'], suspension:['suspension'],
    'tretësirë':['solution'], tretesire:['solution'], 'lëng':['solution','liquid'], leng:['solution','liquid'], pilul:['tablet','pill'],
  };

  /* E njëjta gjuhë vizatimi si `FORM_ICONS` dhe si ikonat në `index.html`:
     24×24, pa mbushje, vijë 1.7 me `currentColor`. Shenja tipografike `›` që
     rrinte këtu merrte formën e vet nga fonti, jo nga sistemi. */
  const CHEVRON_RIGHT = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';

  const FORM_ICONS = {
    all:'<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    pill:'<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/>',
    capsule:'<path d="M7.1 16.9a5 5 0 0 1 0-7.1l2.7-2.7a5 5 0 1 1 7.1 7.1l-2.7 2.7a5 5 0 0 1-7.1 0Z"/><path d="m9 9 6 6"/>',
    bottle:'<path d="M9 3h6v4l2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-2V3Z"/><path d="M8 12h8M10 3h4"/>',
    syringe:'<path d="m14 4 6 6M16 2l6 6M7 11l6 6M4 20l4-4M3 21l3-1"/><path d="m8 10 6-6 6 6-6 6-6-6Z"/>',
    tube:'<path d="m8 3 8 2-1 4 3 2-4 10-8-3 4-9-3-2 1-4Z"/><path d="m10 9 5 2"/>',
    drop:'<path d="M12 3S6 10 6 15a6 6 0 0 0 12 0c0-5-6-12-6-12Z"/><path d="M9.5 16.5c.5 1 1.3 1.5 2.5 1.5"/>',
    lungs:'<path d="M11 4v8c-2-3-4-5-6-5-2 0-3 4-3 8 0 4 3 6 7 6 2 0 2-2 2-4V4ZM13 4v8c2-3 4-5 6-5 2 0 3 4 3 8 0 4-3 6-7 6-2 0-2-2-2-4V4Z"/>',
    powder:'<path d="M8 3h8l-1 5 4 9a3 3 0 0 1-3 4H8a3 3 0 0 1-3-4l4-9-1-5Z"/><path d="M7 16h10M9 3h6"/>',
    suppository:'<path d="M12 3c3 3 5 6 5 10a5 5 0 0 1-10 0c0-4 2-7 5-10Z"/><path d="M9 17h6"/>',
    special:'<path d="M12 3 9.8 8.2 4 9l4.2 4.1-1 5.8L12 16.2l4.8 2.7-1-5.8L20 9l-5.8-.8L12 3Z"/>',
  };

  const COLUMN_DEFS = Object.freeze([
    { id:'registry', label:'Nr. regjistri', hint:'Numri zyrtar i regjistrimit' },
    { id:'name', label:'Bari', hint:'Emri tregtar', required:true },
    { id:'substance', label:'Substanca aktive', hint:'Përbërësi aktiv' },
    { id:'strength', label:'Fortësia', hint:'Doza / përqendrimi' },
    { id:'form', label:'Forma', hint:'Forma farmaceutike' },
    { id:'drugClass', label:'Grupi / Klasa', hint:'Grupi farmakologjik / terapeutik' },
    { id:'use', label:'Për çka përdoret', hint:'Indikacionet / përdorimi' },
    { id:'population', label:'Popullata', hint:'Adult / pediatrik' },
    { id:'atc', label:'ATC', hint:'Kodi ATC' },
    { id:'adultDose', label:'Doza e të rriturit', hint:'Dozologjia e të rriturit' },
    { id:'pediatricDose', label:'Doza pediatrike', hint:'Dozologjia pediatrike' },
    { id:'status', label:'Statusi', hint:'Gjenerik / origjinator' },
    { id:'price', label:'Çmimi', hint:'Çmimi me pakicë' },
  ]);
  const DEFAULT_VISIBLE_COLUMNS = Object.freeze(COLUMN_DEFS.map(item => item.id));
  const PREFERENCES_API = '/api/auth?scope=ui-preferences';
  const COLUMN_CACHE_PREFIX = 'drx_registry_columns_v2:';
  const COLUMN_SCHEMA_VERSION = 'registry-columns-v3-clinical';
  const COLUMN_SCHEMA_PREFIX = 'drx_registry_column_schema:';
  const CLINICAL_COLUMN_IDS = Object.freeze(['drugClass', 'use', 'population']);

  const state = {
    page: 1,
    pageSize: 50,
    total: null,
    totalPages: null,
    q: '',
    atc: '',
    formType: '',
    formValue: '',
    sort: 'registry',
    direction: 'asc',
    rows: [],
    dosageByRegistry: new Map(),
    selected: new Map(),
    currentDetail: null,
    requestId: 0,
    searchTimer: 0,
    preferenceOwner: '',
    visibleColumns: new Set(DEFAULT_VISIBLE_COLUMNS),
    preferenceSaveTimer: 0,
  };

  const $ = id => document.getElementById(id);
  const el = {
    appShell: $('appShell'), sidebar: $('sidebar'), sidebarBackdrop: $('sidebarBackdrop'), menuButton: $('menuButton'), sidebarClose: $('sidebarClose'),
    logoutButton: $('logoutButton'), sourceStatus: $('sourceStatus'), syncText: $('syncText'), avatarInitials: $('avatarInitials'),
    refreshButton: $('refreshButton'), openPrescriptionButton: $('openPrescriptionButton'), selectedCount: $('selectedCount'),
    metricTotal: $('metricTotal'), metricPage: $('metricPage'), metricPageSize: $('metricPageSize'), metricSource: $('metricSource'), metricFilters: $('metricFilters'),
    searchInput: $('searchInput'), filterToggle: $('filterToggle'), filterPanel: $('filterPanel'), filterCountBadge: $('filterCountBadge'),
    columnPicker: $('columnPicker'), columnPickerButton: $('columnPickerButton'), columnPickerPanel: $('columnPickerPanel'), columnPickerList: $('columnPickerList'), columnPickerSummary: $('columnPickerSummary'), columnSaveStatus: $('columnSaveStatus'), resetColumnsButton: $('resetColumnsButton'),
    formPicker: $('formPicker'), formPickerButton: $('formPickerButton'), formPickerPanel: $('formPickerPanel'), formPickerSearch: $('formPickerSearch'), formPickerList: $('formPickerList'), formPickerValue: $('formPickerValue'), formPickerHint: $('formPickerHint'), sortSelect: $('sortSelect'), directionSelect: $('directionSelect'), clearFiltersButton: $('clearFiltersButton'),
    pageSizeSelect: $('pageSizeSelect'), resultSummary: $('resultSummary'), requestTiming: $('requestTiming'), registryRows: $('registryRows'), registryTable: $('registryTable'), tableScroll: $('tableScroll'),
    emptyState: $('emptyState'), emptyClearButton: $('emptyClearButton'), selectPageCheckbox: $('selectPageCheckbox'), paginationSummary: $('paginationSummary'), pageIndicator: $('pageIndicator'), prevPageButton: $('prevPageButton'), nextPageButton: $('nextPageButton'),
    drawerBackdrop: $('drawerBackdrop'), detailDrawer: $('detailDrawer'), drawerClose: $('drawerClose'), drawerCloseButton: $('drawerCloseButton'), drawerTitle: $('drawerTitle'), drawerBody: $('drawerBody'), drawerPrescriptionButton: $('drawerPrescriptionButton'),
    toast: $('toast'),
  };

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => clean(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const euros = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('sq-XK', { style:'currency', currency:'EUR', maximumFractionDigits:2 }).format(number);
  };

  function normalizeColumns(value) {
    const requested = Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
    const allowed = new Set(COLUMN_DEFS.map(item => item.id));
    const next = [...new Set(requested)].filter(id => allowed.has(id));
    for (const item of COLUMN_DEFS) {
      if (item.required && !next.includes(item.id)) next.unshift(item.id);
    }
    return next.length ? next : [...DEFAULT_VISIBLE_COLUMNS];
  }

  function columnCacheKey() {
    return state.preferenceOwner ? `${COLUMN_CACHE_PREFIX}${state.preferenceOwner}` : '';
  }

  function columnSchemaKey() {
    return state.preferenceOwner ? `${COLUMN_SCHEMA_PREFIX}${state.preferenceOwner}` : '';
  }

  function needsClinicalColumnMigration() {
    const key = columnSchemaKey();
    if (!key) return false;
    try { return localStorage.getItem(key) !== COLUMN_SCHEMA_VERSION; }
    catch { return true; }
  }

  function ensureClinicalColumns(value) {
    const normalized = normalizeColumns(value);
    if (!needsClinicalColumnMigration()) return normalized;
    const next = [...normalized];
    for (const id of CLINICAL_COLUMN_IDS) {
      if (!next.includes(id)) next.push(id);
    }
    return normalizeColumns(next);
  }

  function markClinicalColumnMigration() {
    const key = columnSchemaKey();
    if (!key) return;
    try { localStorage.setItem(key, COLUMN_SCHEMA_VERSION); }
    catch {}
  }

  function readCachedColumns() {
    const key = columnCacheKey();
    if (!key) return null;
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) ? normalizeColumns(value) : null;
    } catch { return null; }
  }

  function cacheColumns() {
    const key = columnCacheKey();
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify([...state.visibleColumns])); }
    catch {}
  }

  function updateColumnPickerSummary() {
    const visible = COLUMN_DEFS.filter(item => state.visibleColumns.has(item.id)).length;
    if (el.columnPickerSummary) el.columnPickerSummary.textContent = `${visible} nga ${COLUMN_DEFS.length} të dukshme`;
  }

  function renderColumnPicker() {
    if (!el.columnPickerList) return;
    el.columnPickerList.innerHTML = COLUMN_DEFS.map(item => {
      const checked = state.visibleColumns.has(item.id);
      return `<label class="column-option${item.required ? ' is-required' : ''}">
        <input type="checkbox" data-column-toggle="${escapeHtml(item.id)}" ${checked ? 'checked' : ''} ${item.required ? 'disabled' : ''}>
        <span class="column-option-check" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="m3.2 8.1 2.8 2.8 6-6"/></svg></span>
        <span class="column-option-copy"><strong>${escapeHtml(item.label)}</strong><small>${item.required ? 'Gjithmonë e dukshme' : escapeHtml(item.hint)}</small></span>
      </label>`;
    }).join('');
    updateColumnPickerSummary();
  }

  function applyColumnVisibility() {
    for (const item of COLUMN_DEFS) {
      const visible = state.visibleColumns.has(item.id);
      document.querySelectorAll(`[data-col="${CSS.escape(item.id)}"]`).forEach(node => {
        node.hidden = !visible;
        node.setAttribute('aria-hidden', visible ? 'false' : 'true');
      });
    }

    // The drug name remains the stable clinical anchor. When "Nr. regjistri"
    // is hidden, move that frozen name column next to the selection checkbox
    // instead of leaving a 68px blank gutter.
    const registryVisible = state.visibleColumns.has('registry');
    document.querySelectorAll('[data-col="registry"]').forEach(node => {
      node.style.left = registryVisible ? '44px' : '';
    });
    document.querySelectorAll('[data-col="name"]').forEach(node => {
      node.style.left = registryVisible ? '112px' : '44px';
    });

    const widths = {
      registry:68, name:225, substance:190, strength:105, form:145,
      drugClass:180, use:220, population:150, atc:90,
      adultDose:190, pediatricDose:190, status:105, price:92,
    };
    const visibleWidth = COLUMN_DEFS.reduce((sum, item) => {
      return state.visibleColumns.has(item.id) ? sum + (widths[item.id] || 100) : sum;
    }, 44 + 48);
    if (el.registryTable) el.registryTable.style.minWidth = `${Math.max(720, visibleWidth)}px`;

    renderColumnPicker();
  }

  function setColumnSaveStatus(text, tone = '') {
    if (!el.columnSaveStatus) return;
    el.columnSaveStatus.textContent = text;
    if (tone) el.columnSaveStatus.dataset.tone = tone;
    else el.columnSaveStatus.removeAttribute('data-tone');
  }

  async function persistColumnPreferences() {
    cacheColumns();
    setColumnSaveStatus('Duke ruajtur…');
    try {
      const { payload } = await fetchJson(PREFERENCES_API, {
        method:'PUT',
        body:JSON.stringify({ registryColumns:[...state.visibleColumns] }),
        headers:{ 'Content-Type':'application/json' },
      }, 6000);
      const normalized = ensureClinicalColumns(payload.registryColumns);
      state.visibleColumns = new Set(normalized);
      cacheColumns();
      applyColumnVisibility();
      markClinicalColumnMigration();
      setColumnSaveStatus('Ruajtur në profil', 'success');
    } catch (error) {
      console.warn('Column preferences save failed:', error);
      setColumnSaveStatus('Ruajtur në këtë pajisje', 'local');
    }
  }

  function scheduleColumnSave() {
    clearTimeout(state.preferenceSaveTimer);
    cacheColumns();
    setColumnSaveStatus('Duke ruajtur…');
    state.preferenceSaveTimer = setTimeout(() => { void persistColumnPreferences(); }, 260);
  }

  async function loadColumnPreferences(authPayload) {
    state.preferenceOwner = clean(authPayload?.authUser?.id || authPayload?.user?.email || '').toLowerCase();
    const cached = readCachedColumns();
    if (cached) state.visibleColumns = new Set(ensureClinicalColumns(cached));
    applyColumnVisibility();
    setColumnSaveStatus(cached ? 'Preferenca lokale u ngarkua' : 'Duke sinkronizuar…');
    try {
      const { payload } = await fetchJson(PREFERENCES_API, {}, 6000);
      state.preferenceOwner = clean(payload.userId || state.preferenceOwner).toLowerCase();
      const migrate = needsClinicalColumnMigration();
      state.visibleColumns = new Set(ensureClinicalColumns(payload.registryColumns));
      cacheColumns();
      applyColumnVisibility();
      if (migrate) await persistColumnPreferences();
      else setColumnSaveStatus('Sinkronizuar me profilin', 'success');
    } catch (error) {
      console.warn('Column preferences load failed:', error);
      setColumnSaveStatus(cached ? 'Nga kjo pajisje' : 'Standardi DRx', cached ? 'local' : '');
    }
  }

  function openColumnPicker() {
    if (!el.columnPickerPanel) return;
    closeFormPicker();
    el.columnPickerPanel.hidden = false;
    el.columnPickerButton.setAttribute('aria-expanded', 'true');
    renderColumnPicker();
    requestAnimationFrame(() => el.columnPickerList.querySelector('input:not(:disabled)')?.focus({ preventScroll:true }));
  }

  function closeColumnPicker({ focusButton = false } = {}) {
    if (!el.columnPickerPanel || el.columnPickerPanel.hidden) return;
    el.columnPickerPanel.hidden = true;
    el.columnPickerButton.setAttribute('aria-expanded', 'false');
    if (focusButton) el.columnPickerButton.focus({ preventScroll:true });
  }

  function toggleColumn(id, visible) {
    const item = COLUMN_DEFS.find(entry => entry.id === id);
    if (!item || item.required) return;
    if (visible) state.visibleColumns.add(id);
    else state.visibleColumns.delete(id);
    applyColumnVisibility();
    scheduleColumnSave();
  }

  function loadProfileChrome() {
    if (window.MedIndexProfile) return Promise.resolve(window.MedIndexProfile);
    const existing = document.querySelector('script[data-drx-profile-runtime]');
    if (existing) {
      return new Promise(resolve => {
        if (window.MedIndexProfile) return resolve(window.MedIndexProfile);
        existing.addEventListener('load', () => resolve(window.MedIndexProfile || null), { once:true });
        setTimeout(() => resolve(window.MedIndexProfile || null), 1800);
      });
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = '/medindex-brand-runtime.js?v=drx-brand-v5';
      script.defer = true;
      script.dataset.drxProfileRuntime = '1';
      script.addEventListener('load', () => resolve(window.MedIndexProfile || null), { once:true });
      script.addEventListener('error', () => resolve(null), { once:true });
      document.head.appendChild(script);
    });
  }

  async function syncProfileChrome(payload) {
    await loadProfileChrome();
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function loadSharedSidebarTaxonomy() {
    if (document.querySelector('script[data-drx-sidebar-taxonomy]')) return;
    const script = document.createElement('script');
    script.src = '/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v3';
    script.defer = true;
    script.dataset.drxSidebarTaxonomy = '1';
    document.head.appendChild(script);
  }

  function debounceSearch() {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.q = clean(el.searchInput.value);
      state.page = 1;
      loadPage();
    }, 220);
  }

  async function fetchJson(url, options = {}, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { credentials:'same-origin', cache:'no-store', ...options, signal:controller.signal, headers:{ Accept:'application/json', ...(options.headers || {}) } });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        throw new Error('Sesioni nuk është aktiv.');
      }
      if (!response.ok) throw new Error(payload.error || `Gabim ${response.status}`);
      return { payload, response };
    } finally { clearTimeout(timer); }
  }

  function redirectToLogin() {
    const returnPath = location.pathname + location.search + location.hash;
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', returnPath.startsWith('/') ? returnPath : '/index.html');
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    try {
      const { payload } = await fetchJson('/api/auth', {}, 4200);
      if (!payload.authenticated) return redirectToLogin();
      const name = clean(payload.user?.name || payload.authUser?.name || payload.user?.email || 'DR');
      const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'DR';
      el.avatarInitials.textContent = initials;
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') showToast('Verifikimi i sesionit zgjati tepër.');
      throw error;
    }
  }

  function queryUrl() {
    const params = new URLSearchParams({
      view:'registry-page', page:String(state.page), pageSize:String(state.pageSize), includeTotal:'true', sort:state.sort, direction:state.direction,
    });
    if (state.q) params.set('q', state.q);
    if (state.atc) params.set('atc', state.atc);
    if (state.formType === 'form' && state.formValue) params.set('formExact', state.formValue);
    else if (state.formType === 'category' && state.formValue) params.set('formCategory', state.formValue);
    return `/api/drug-search?${params.toString()}`;
  }

  function renderSkeleton() {
    el.emptyState.hidden = true;
    el.tableScroll.hidden = false;
    el.registryRows.innerHTML = Array.from({ length: Math.min(10, state.pageSize) }, () => `
      <tr aria-hidden="true">
        <td><span class="skeleton sm"></span></td>
        <td data-col="registry"><span class="skeleton sm"></span></td>
        <td data-col="name"><span class="skeleton lg"></span></td>
        <td data-col="substance"><span class="skeleton md"></span></td>
        <td data-col="strength"><span class="skeleton sm"></span></td>
        <td data-col="form"><span class="skeleton md"></span></td>
        <td data-col="drugClass"><span class="skeleton md"></span></td>
        <td data-col="use"><span class="skeleton lg"></span></td>
        <td data-col="population"><span class="skeleton md"></span></td>
        <td data-col="atc"><span class="skeleton sm"></span></td>
        <td data-col="adultDose"><span class="skeleton lg"></span></td>
        <td data-col="pediatricDose"><span class="skeleton lg"></span></td>
        <td data-col="status"><span class="skeleton sm"></span></td>
        <td data-col="price"><span class="skeleton sm"></span></td>
        <td></td>
      </tr>`).join('');
    el.resultSummary.textContent = 'Duke ngarkuar regjistrin…';
    el.requestTiming.textContent = '';
    applyColumnVisibility();
  }

  async function loadPage({ preserveScroll = false } = {}) {
    const requestId = ++state.requestId;
    const startedAt = performance.now();
    renderSkeleton();
    setBusy(true);
    try {
      const { payload, response } = await fetchJson(queryUrl());
      if (requestId !== state.requestId) return;
      state.rows = Array.isArray(payload.rows) ? payload.rows : [];
      state.page = Number(payload.pagination?.page || state.page);
      state.pageSize = Number(payload.pagination?.pageSize || state.pageSize);
      state.total = Number.isFinite(Number(payload.pagination?.total)) ? Number(payload.pagination.total) : null;
      state.totalPages = Number.isFinite(Number(payload.pagination?.totalPages)) ? Number(payload.pagination.totalPages) : null;
      el.sourceStatus.textContent = `${response.headers.get('X-MedIndex-Data-Source') || 'Supabase'} · aktiv`;
      el.syncText.textContent = response.headers.get('X-MedIndex-Data-Source') || 'Supabase';
      state.dosageByRegistry.clear();
      renderRows();
      updateSummary(Math.round(performance.now() - startedAt));
      updateSortHeaders();
      updateFilterUi();
      if (!preserveScroll) el.tableScroll.scrollLeft = 0;
      void loadDosageForVisibleRows(requestId);
    } catch (error) {
      if (requestId !== state.requestId) return;
      if (error?.name === 'AbortError') renderError('Kërkesa zgjati tepër. Provo përsëri.');
      else renderError(error?.message || 'Regjistri nuk u ngarkua.');
    } finally {
      if (requestId === state.requestId) setBusy(false);
    }
  }

  async function loadDosageForVisibleRows(requestId) {
    const numbers = state.rows.map(row => clean(row.registryNumber)).filter(value => /^\d{1,6}$/.test(value));
    if (!numbers.length) return;
    try {
      const { payload } = await fetchJson(`/api/dosage?view=cards&nrs=${encodeURIComponent(numbers.join(','))}`, {}, 8000);
      if (requestId !== state.requestId) return;
      for (const card of Array.isArray(payload.cards) ? payload.cards : []) state.dosageByRegistry.set(clean(card.registryNumber), card);
      patchDosageCells();
    } catch (error) {
      if (requestId !== state.requestId) return;
      console.warn('Dosage cards unavailable:', error);
      document.querySelectorAll('[data-dose-status="loading"]').forEach(node => { node.innerHTML = '<span class="dose-missing">Pa dozë të publikuar</span>'; node.dataset.doseStatus = 'missing'; });
    }
  }

  function doseMarkup(dose, route) {
    if (!clean(dose)) return '<span class="dose-missing">Pa dozë të publikuar</span>';
    return `<div class="dose-cell"><span class="dose-text">${escapeHtml(dose)}</span><button class="dose-toggle" type="button" data-dose-toggle aria-expanded="false" hidden>Më shumë</button>${clean(route) ? `<span class="route-chip">${escapeHtml(route)}</span>` : ''}</div>`;
  }

  function syncDoseToggle(cell) {
    const text = cell?.querySelector('.dose-text');
    const toggle = cell?.querySelector('[data-dose-toggle]');
    if (!text || !toggle) return;
    if (cell.classList.contains('is-expanded')) { toggle.hidden = false; return; }
    toggle.hidden = text.scrollHeight <= text.clientHeight + 1;
  }

  function syncAllDoseToggles() {
    document.querySelectorAll('.dose-cell').forEach(syncDoseToggle);
  }

  function toggleDose(button) {
    const cell = button.closest('.dose-cell');
    const text = cell?.querySelector('.dose-text');
    if (!cell || !text) return;
    const expanded = !cell.classList.contains('is-expanded');
    cell.classList.toggle('is-expanded', expanded);
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Më pak' : 'Më shumë';
    if (!expanded) syncDoseToggle(cell);
  }

  function patchDosageCells() {
    for (const row of state.rows) {
      const number = clean(row.registryNumber);
      const card = state.dosageByRegistry.get(number);
      const adult = document.querySelector(`[data-dose-adult="${CSS.escape(number)}"]`);
      const pediatric = document.querySelector(`[data-dose-pediatric="${CSS.escape(number)}"]`);
      if (adult) { adult.innerHTML = doseMarkup(card?.adultDose, card?.adultRoute); adult.dataset.doseStatus = 'ready'; }
      if (pediatric) { pediatric.innerHTML = doseMarkup(card?.pediatricDose, card?.pediatricRoute); pediatric.dataset.doseStatus = 'ready'; }
    }
    requestAnimationFrame(syncAllDoseToggles);
  }

  function populationMeta(value) {
    const raw = clean(value);
    const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized === 'pediatric only' || normalized === 'paediatric only') {
      return { key:'pediatric-only', label:'Vetëm pediatrik' };
    }
    if (normalized === 'adult only') {
      return { key:'adult-only', label:'Vetëm të rritur' };
    }
    if (
      normalized === 'pediatric and adult both'
      || normalized === 'paediatric and adult both'
      || normalized === 'adult and pediatric'
      || normalized === 'adult and paediatric'
    ) {
      return { key:'adult-pediatric', label:'Të rritur + pediatrik' };
    }
    return { key:'unknown', label:raw || '—' };
  }

  function populationBadge(value) {
    const population = populationMeta(value);
    return `<span class="population-badge is-${population.key}">${escapeHtml(population.label)}</span>`;
  }

  function statusBadge(value) {
    const label = clean(value) || '—';
    const normalized = label.toLowerCase();
    const cls = normalized.includes('gjener') ? 'is-generic' : normalized.includes('orig') ? 'is-originator' : 'is-neutral';
    return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
  }

  function rowKey(row) { return clean(row.id || row.registryNumber || row.pdid); }

  function renderRows() {
    if (!state.rows.length) {
      el.registryRows.innerHTML = '';
      el.tableScroll.hidden = true;
      el.emptyState.hidden = false;
      syncPageSelection();
      return;
    }
    el.tableScroll.hidden = false;
    el.emptyState.hidden = true;
    el.registryRows.innerHTML = state.rows.map(row => {
      const key = rowKey(row);
      const selected = state.selected.has(key);
      const number = clean(row.registryNumber);
      const population = populationMeta(row.approvedPopulation);
      const rowClasses = [selected ? 'is-selected' : '', population.key === 'pediatric-only' ? 'is-pediatric-only' : ''].filter(Boolean).join(' ');
      return `<tr data-row-id="${escapeHtml(key)}" data-population="${escapeHtml(population.key)}" class="${rowClasses}" tabindex="0" aria-selected="${selected ? 'true' : 'false'}">
        <td><input class="row-check" type="checkbox" data-select-row="${escapeHtml(key)}" aria-label="Zgjidh ${escapeHtml(row.tradeName)}" ${selected ? 'checked' : ''}></td>
        <td data-col="registry"><span class="price">${escapeHtml(number || '—')}</span></td>
        <td data-col="name"><span class="drug-name">${escapeHtml(row.tradeName || 'Pa emër')}</span><span class="drug-meta">${escapeHtml(row.pdid || row.productStatus || '')}</span></td>
        <td data-col="substance"><span class="cell-clamp">${escapeHtml(row.activeSubstance || '—')}</span></td>
        <td data-col="strength">${escapeHtml(row.strength || '—')}</td>
        <td data-col="form"><span class="cell-clamp">${escapeHtml(row.form || '—')}</span></td>
        <td data-col="drugClass"><span class="cell-clamp">${escapeHtml(row.drugClass || '—')}</span></td>
        <td data-col="use"><span class="cell-clamp">${escapeHtml(row.use || '—')}</span></td>
        <td data-col="population">${populationBadge(row.approvedPopulation)}</td>
        <td data-col="atc">${row.atc ? `<span class="atc-chip">${escapeHtml(row.atc)}</span>` : '—'}</td>
        <td data-col="adultDose" data-dose-adult="${escapeHtml(number)}" data-dose-status="loading"><span class="skeleton lg"></span></td>
        <td data-col="pediatricDose" data-dose-pediatric="${escapeHtml(number)}" data-dose-status="loading"><span class="skeleton lg"></span></td>
        <td data-col="status">${statusBadge(row.productStatus)}</td>
        <td data-col="price"><span class="price">${euros(row.retailPrice)}</span></td>
        <td><button class="row-action" type="button" data-open-row="${escapeHtml(key)}" aria-label="Hap detajet e ${escapeHtml(row.tradeName)}">${CHEVRON_RIGHT}</button></td>
      </tr>`;
    }).join('');
    applyColumnVisibility();
    syncPageSelection();
  }

  function updateSummary(durationMs) {
    const first = state.rows.length ? (state.page - 1) * state.pageSize + 1 : 0;
    const last = state.rows.length ? first + state.rows.length - 1 : 0;
    const totalText = Number.isFinite(state.total) ? state.total.toLocaleString('sq-XK') : '—';
    el.resultSummary.textContent = state.rows.length ? `${state.atc ? `ATC ${state.atc} · ` : ''}${first.toLocaleString('sq-XK')}–${last.toLocaleString('sq-XK')} nga ${totalText} rezultate` : `${state.atc ? `ATC ${state.atc} · ` : ''}0 rezultate`;
    el.requestTiming.textContent = `${durationMs} ms`;
    el.metricTotal.textContent = totalText;
    el.metricPage.textContent = String(state.page);
    el.metricPageSize.textContent = `${state.pageSize} për faqe`;
    el.paginationSummary.textContent = state.rows.length ? `Duke shfaqur ${first}–${last}${Number.isFinite(state.total) ? ` nga ${state.total.toLocaleString('sq-XK')}` : ''}` : 'Asnjë rezultat';
    el.pageIndicator.textContent = `${state.page} / ${Number.isFinite(state.totalPages) ? state.totalPages : '—'}`;
    el.prevPageButton.disabled = state.page <= 1;
    el.nextPageButton.disabled = Number.isFinite(state.totalPages) ? state.page >= state.totalPages : state.rows.length < state.pageSize;
  }

  const normalizeFormText = value => clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq');

  function formIcon(name) {
    const body = FORM_ICONS[name] || FORM_ICONS.special;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function formGroupForValue(value) {
    return FORM_GROUPS.find(group => group.source === value || group.forms.includes(value)) || null;
  }

  function formMatches(value, rawQuery) {
    const query = normalizeFormText(rawQuery);
    if (!query) return true;
    const text = normalizeFormText(value);
    if (text.includes(query)) return true;
    return Object.entries(FORM_ALIASES).some(([alias, targets]) =>
      query.includes(normalizeFormText(alias)) && targets.some(target => text.includes(normalizeFormText(target)))
    );
  }

  function renderFormPicker() {
    const query = clean(el.formPickerSearch.value);
    const allSelected = !state.formType || !state.formValue;
    const blocks = [`
      <button class="form-picker-all ${allSelected ? 'is-selected' : ''}" type="button" role="option" aria-selected="${allSelected ? 'true' : 'false'}" data-form-all>
        <span class="form-picker-all-icon">${formIcon('all')}</span>
        <span class="form-picker-all-copy"><strong>Të gjitha format</strong><small>Shfaq regjistrin pa filtër farmaceutik</small></span>
        <span class="form-picker-all-count">${FORM_GROUPS.length} kategori</span>
      </button>`];

    let visibleGroupCount = 0;
    for (const group of FORM_GROUPS) {
      const categoryMatches = formMatches(group.source, query) || formMatches(group.label, query);
      const visibleForms = group.forms.filter(form => categoryMatches || formMatches(form, query));
      if (query && !categoryMatches && !visibleForms.length) continue;
      visibleGroupCount += 1;
      const groupSelected = state.formType === 'category' && state.formValue === group.source;
      blocks.push(`
        <section class="form-picker-group" style="--form-accent:${group.color}" data-form-group="${escapeHtml(group.source)}">
          <button class="form-category ${groupSelected ? 'is-selected' : ''}" type="button" role="option" aria-selected="${groupSelected ? 'true' : 'false'}" data-form-category="${escapeHtml(group.source)}">
            <span class="form-category-icon">${formIcon(group.icon)}</span>
            <span class="form-category-copy"><strong>${escapeHtml(group.label)}</strong><small>Forma në recetë: <b>${escapeHtml(group.short)}</b></small></span>
            <span class="form-category-count">${group.forms.length}</span>
          </button>
          <div class="form-options">
            ${(query && !categoryMatches ? visibleForms : group.forms).map(form => {
              const selected = state.formType === 'form' && state.formValue === form;
              return `<button class="form-option ${selected ? 'is-selected' : ''}" type="button" role="option" aria-selected="${selected ? 'true' : 'false'}" data-form-value="${escapeHtml(form)}">
                <span class="form-option-dot" aria-hidden="true"></span>
                <span class="form-option-label">${escapeHtml(form)}</span>
                <span class="form-option-short">${escapeHtml(group.short)}</span>
              </button>`;
            }).join('')}
          </div>
        </section>`);
    }
    if (!visibleGroupCount) blocks.push('<div class="form-picker-empty">Asnjë formë farmaceutike nuk u gjet.</div>');
    el.formPickerList.innerHTML = blocks.join('');
  }

  function syncFormPickerTrigger() {
    const group = formGroupForValue(state.formValue);
    if (!state.formType || !state.formValue) {
      el.formPickerValue.textContent = 'Të gjitha format';
      el.formPickerHint.textContent = `${FORM_GROUPS.length} kategori farmaceutike`;
      el.formPickerButton.style.removeProperty('--form-accent');
      return;
    }
    el.formPickerValue.textContent = state.formValue;
    el.formPickerHint.textContent = group ? `Forma në recetë: ${group.short}` : 'Formë farmaceutike';
    if (group) el.formPickerButton.style.setProperty('--form-accent', group.color);
  }

  function openFormPicker() {
    el.formPickerPanel.hidden = false;
    el.formPickerButton.setAttribute('aria-expanded', 'true');
    renderFormPicker();
    requestAnimationFrame(() => {
      el.formPickerSearch.focus({ preventScroll:true });
      const selected = el.formPickerList.querySelector('[aria-selected="true"]');
      if (selected) selected.scrollIntoView({ block:'nearest' });
    });
  }

  function closeFormPicker({ focusButton = false } = {}) {
    if (el.formPickerPanel.hidden) return;
    el.formPickerPanel.hidden = true;
    el.formPickerButton.setAttribute('aria-expanded', 'false');
    el.formPickerSearch.value = '';
    if (focusButton) el.formPickerButton.focus({ preventScroll:true });
  }

  function selectFormFilter(type, value) {
    state.formType = type || '';
    state.formValue = type ? clean(value) : '';
    state.page = 1;
    syncFormPickerTrigger();
    closeFormPicker();
    loadPage();
  }

  function activeFilterCount() { return [state.q, state.atc, state.formValue].filter(Boolean).length; }

  function updateFilterUi() {
    const count = activeFilterCount();
    el.metricFilters.textContent = String(count);
    el.filterCountBadge.textContent = String(count);
    el.filterCountBadge.hidden = count === 0;
    el.pageSizeSelect.value = String(state.pageSize);
    el.sortSelect.value = state.sort;
    el.directionSelect.value = state.direction;
    syncFormPickerTrigger();
  }

  function updateSortHeaders() {
    document.querySelectorAll('.sort-head[data-sort]').forEach(button => {
      const active = button.dataset.sort === state.sort;
      button.dataset.active = active ? 'true' : 'false';
      button.dataset.direction = active ? state.direction : '';
    });
  }

  function renderError(message) {
    el.registryRows.innerHTML = '';
    el.tableScroll.hidden = true;
    el.emptyState.hidden = false;
    el.emptyState.querySelector('h2').textContent = 'Regjistri nuk u ngarkua';
    el.emptyState.querySelector('p').textContent = message;
    el.resultSummary.textContent = 'Gabim gjatë ngarkimit';
    el.requestTiming.textContent = '';
  }

  function setBusy(busy) {
    el.appShell.setAttribute('aria-busy', busy ? 'true' : 'false');
    el.refreshButton.disabled = busy;
  }

  function findRow(key) { return state.rows.find(row => rowKey(row) === key) || state.selected.get(key) || null; }

  function toggleSelection(row, selected) {
    if (!row) return;
    const key = rowKey(row);
    if (selected) state.selected.set(key, row); else state.selected.delete(key);
    const tr = document.querySelector(`tr[data-row-id="${CSS.escape(key)}"]`);
    if (tr) { tr.classList.toggle('is-selected', selected); tr.setAttribute('aria-selected', selected ? 'true' : 'false'); }
    const checkbox = document.querySelector(`[data-select-row="${CSS.escape(key)}"]`);
    if (checkbox) checkbox.checked = selected;
    updateSelectedCount();
    syncPageSelection();
  }

  function updateSelectedCount() {
    const count = state.selected.size;
    el.selectedCount.textContent = String(count);
    el.openPrescriptionButton.disabled = count === 0;
  }

  function syncPageSelection() {
    const visibleKeys = state.rows.map(rowKey);
    const selectedVisible = visibleKeys.filter(key => state.selected.has(key)).length;
    el.selectPageCheckbox.checked = visibleKeys.length > 0 && selectedVisible === visibleKeys.length;
    el.selectPageCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visibleKeys.length;
  }

  function storePrescriptionSelection() {
    const selected = [...state.selected.values()];
    try {
      sessionStorage.setItem('medindexPrescriptionSelection', JSON.stringify(selected));
      sessionStorage.setItem('drx_registry_v2_selection', JSON.stringify(selected));
    } catch {}
    location.href = '/recetat.html';
  }

  function openDrawer() {
    el.drawerBackdrop.hidden = false;
    el.detailDrawer.classList.add('is-open');
    el.detailDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    el.detailDrawer.classList.remove('is-open');
    el.detailDrawer.setAttribute('aria-hidden', 'true');
    el.drawerBackdrop.hidden = true;
    document.body.style.overflow = '';
  }

  async function showDetail(row) {
    if (!row) return;
    state.currentDetail = row;
    openDrawer();
    el.drawerTitle.textContent = row.tradeName || 'Detajet';
    el.drawerBody.innerHTML = '<div class="drawer-loading">Duke ngarkuar kartelën klinike…</div>';
    try {
      const [detailResult, cardResult] = await Promise.all([
        fetchJson(`/api/drug-search?view=registry-detail&id=${encodeURIComponent(row.id)}`),
        fetchJson(`/api/dosage?view=card&id=${encodeURIComponent(row.id)}`).catch(() => ({ payload:{ ok:false } })),
      ]);
      const detail = detailResult.payload.row || row;
      const card = cardResult.payload || {};
      el.drawerBody.innerHTML = detailMarkup(detail, card);
    } catch (error) {
      el.drawerBody.innerHTML = `<div class="drawer-loading">${escapeHtml(error?.message || 'Detajet nuk u ngarkuan.')}</div>`;
    }
  }

  function detailMarkup(detail, card) {
    const profile = card.profile || {};
    const sources = Array.isArray(card.sources) ? card.sources : [];
    const info = [
      ['Nr. regjistri', detail.registryNumber], ['PDID', detail.pdid], ['ATC', detail.atc], ['Klasa', detail.drugClass],
      ['Popullata', populationMeta(detail.approvedPopulation).label], ['Forma', detail.form], ['Paketimi', detail.packaging], ['Prodhuesi', detail.manufacturer], ['MAH', detail.marketingAuthorizationHolder],
      ['Certifikata', detail.maCertificate], ['Vlefshmëria', detail.validity], ['Çmimi me pakicë', euros(detail.retailPrice)],
    ].filter(([,value]) => clean(value) && value !== '—');
    const clinicalBlocks = [
      ['Përmbledhje', profile.summary], ['Indikacionet', profile.indications], ['Kundërindikacionet', profile.contraindications], ['Paralajmërimet', profile.warnings],
      ['Interaksionet', profile.interactions], ['Shtatzënia & gjidhënia', profile.pregnancyLactation], ['Rregullimi renal', profile.renalAdjustment], ['Rregullimi hepatik', profile.hepaticAdjustment],
      ['Monitorimi', profile.monitoring], ['Administrimi', profile.administrationNotes],
    ].filter(([,value]) => clean(value));
    return `
      <section class="detail-hero"><h3>${escapeHtml(detail.tradeName || 'Pa emër')}</h3><p>${escapeHtml(detail.activeSubstance || '—')} · ${escapeHtml(detail.strength || '—')}</p><div class="detail-badges">${detail.atc ? `<span class="atc-chip">${escapeHtml(detail.atc)}</span>` : ''}${statusBadge(detail.productStatus)}</div></section>
      <section class="detail-section"><h4>Identiteti</h4><dl class="detail-grid">${info.map(([label,value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl></section>
      <section class="detail-section"><h4>Dozologjia</h4>
        <article class="dose-card"><div class="dose-card-head"><strong>Të rritur</strong>${card.adult?.route ? `<span class="route-chip">${escapeHtml(card.adult.route)}</span>` : ''}</div><p>${escapeHtml(card.adult?.dose || 'Pa dozë të publikuar.')}</p>${card.adult?.maximum ? `<small>Maksimumi: ${escapeHtml(card.adult.maximum)}</small>` : ''}</article>
        <article class="dose-card"><div class="dose-card-head"><strong>Pediatrike</strong>${card.pediatric?.route ? `<span class="route-chip">${escapeHtml(card.pediatric.route)}</span>` : ''}</div><p>${escapeHtml(card.pediatric?.dose || 'Pa dozë të publikuar.')}</p>${card.pediatric?.maximum ? `<small>Maksimumi: ${escapeHtml(card.pediatric.maximum)}</small>` : ''}</article>
      </section>
      ${detail.use ? `<section class="detail-section"><h4>Përdorimi</h4><p class="clinical-copy">${escapeHtml(detail.use)}</p></section>` : ''}
      ${clinicalBlocks.map(([title,value]) => `<section class="detail-section"><h4>${escapeHtml(title)}</h4><p class="clinical-copy">${escapeHtml(value)}</p></section>`).join('')}
      ${sources.length ? `<section class="detail-section"><h4>Burimet</h4>${sources.map(url => `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`).join('')}</section>` : ''}`;
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { el.toast.hidden = true; }, 3600);
  }

  function openSidebar() { el.sidebar.classList.add('is-open'); el.sidebarBackdrop.hidden = false; }
  function closeSidebar() { el.sidebar.classList.remove('is-open'); el.sidebarBackdrop.hidden = true; }

  async function logout() {
    el.logoutButton.disabled = true;
    try {
      await fetch('/api/auth', { method:'DELETE', credentials:'same-origin', headers:{ Accept:'application/json' } });
      try { sessionStorage.removeItem('drx_registry_v2_selection'); } catch {}
      location.replace('/landing.html');
    } catch {
      el.logoutButton.disabled = false;
      showToast('Dalja nuk u krye. Provo përsëri.');
    }
  }

  function bindEvents() {
    el.searchInput.addEventListener('input', debounceSearch);
    el.searchInput.addEventListener('keydown', event => { if (event.key === 'Escape' && el.searchInput.value) { el.searchInput.value = ''; state.q = ''; state.page = 1; loadPage(); } });
    window.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); el.searchInput.focus(); el.searchInput.select(); }
      if (event.key === 'Escape') { closeDrawer(); closeSidebar(); closeFormPicker(); closeColumnPicker(); }
    });
    el.filterToggle.addEventListener('click', () => {
      const open = el.filterPanel.hidden;
      if (!open) closeFormPicker();
      el.filterPanel.hidden = !open;
      el.filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    el.columnPickerButton.addEventListener('click', event => {
      event.stopPropagation();
      if (el.columnPickerPanel.hidden) openColumnPicker(); else closeColumnPicker();
    });
    el.columnPickerPanel.addEventListener('click', event => {
      event.stopPropagation();
      const input = event.target.closest('[data-column-toggle]');
      if (input) toggleColumn(input.dataset.columnToggle, input.checked);
    });
    el.columnPickerPanel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeColumnPicker({ focusButton:true }); }
    });
    el.resetColumnsButton.addEventListener('click', () => {
      state.visibleColumns = new Set(DEFAULT_VISIBLE_COLUMNS);
      applyColumnVisibility();
      scheduleColumnSave();
    });
    el.formPickerButton.addEventListener('click', event => {
      event.stopPropagation();
      if (el.formPickerPanel.hidden) openFormPicker(); else closeFormPicker();
    });
    el.formPickerSearch.addEventListener('input', renderFormPicker);
    el.formPickerPanel.addEventListener('click', event => {
      event.stopPropagation();
      const all = event.target.closest('[data-form-all]');
      if (all) return selectFormFilter('', '');
      const category = event.target.closest('[data-form-category]');
      if (category) return selectFormFilter('category', category.dataset.formCategory);
      const option = event.target.closest('[data-form-value]');
      if (option) return selectFormFilter('form', option.dataset.formValue);
    });
    el.formPickerPanel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeFormPicker({ focusButton:true }); return; }
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      const options = [...el.formPickerList.querySelectorAll('button[role="option"]')].filter(node => node.offsetParent !== null);
      if (!options.length) return;
      event.preventDefault();
      const current = Math.max(0, options.indexOf(document.activeElement));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? Math.min(options.length - 1, current + 1) : Math.max(0, current - 1);
      options[next].focus({ preventScroll:true });
      options[next].scrollIntoView({ block:'nearest' });
    });
    document.addEventListener('click', event => {
      if (!el.formPicker.contains(event.target)) closeFormPicker();
      if (!el.columnPicker.contains(event.target)) closeColumnPicker();
    });
    let doseResizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(doseResizeTimer);
      doseResizeTimer = setTimeout(syncAllDoseToggles, 160);
    });
    el.sortSelect.addEventListener('change', () => { state.sort = el.sortSelect.value; state.page = 1; loadPage(); });
    el.directionSelect.addEventListener('change', () => { state.direction = el.directionSelect.value; state.page = 1; loadPage(); });
    el.pageSizeSelect.addEventListener('change', () => { state.pageSize = Number(el.pageSizeSelect.value) || 50; state.page = 1; loadPage(); });
    el.clearFiltersButton.addEventListener('click', clearFilters);
    el.emptyClearButton.addEventListener('click', clearFilters);
    el.refreshButton.addEventListener('click', () => loadPage({ preserveScroll:true }));
    el.prevPageButton.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadPage(); } });
    el.nextPageButton.addEventListener('click', () => { if (!el.nextPageButton.disabled) { state.page += 1; loadPage(); } });
    document.querySelectorAll('.sort-head[data-sort]').forEach(button => button.addEventListener('click', () => { const next = button.dataset.sort; if (state.sort === next) state.direction = state.direction === 'asc' ? 'desc' : 'asc'; else { state.sort = next; state.direction = 'asc'; } state.page = 1; loadPage(); }));
    el.registryRows.addEventListener('click', event => {
      const doseToggle = event.target.closest('[data-dose-toggle]');
      if (doseToggle) { event.stopPropagation(); toggleDose(doseToggle); return; }
      const checkbox = event.target.closest('[data-select-row]');
      if (checkbox) { event.stopPropagation(); const row = findRow(checkbox.dataset.selectRow); toggleSelection(row, checkbox.checked); return; }
      const button = event.target.closest('[data-open-row]');
      if (button) { event.stopPropagation(); showDetail(findRow(button.dataset.openRow)); return; }
      const tr = event.target.closest('tr[data-row-id]');
      if (tr) showDetail(findRow(tr.dataset.rowId));
    });
    el.registryRows.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { const tr = event.target.closest('tr[data-row-id]'); if (tr && event.target === tr) { event.preventDefault(); showDetail(findRow(tr.dataset.rowId)); } } });
    el.selectPageCheckbox.addEventListener('change', () => state.rows.forEach(row => toggleSelection(row, el.selectPageCheckbox.checked)));
    el.openPrescriptionButton.addEventListener('click', storePrescriptionSelection);
    el.drawerPrescriptionButton.addEventListener('click', () => { if (state.currentDetail) { toggleSelection(state.currentDetail, true); showToast('Bari u shtua në përzgjedhjen e recetës.'); } });
    el.drawerClose.addEventListener('click', closeDrawer); el.drawerCloseButton.addEventListener('click', closeDrawer); el.drawerBackdrop.addEventListener('click', closeDrawer);
    el.menuButton.addEventListener('click', openSidebar); el.sidebarClose.addEventListener('click', closeSidebar); el.sidebarBackdrop.addEventListener('click', closeSidebar);
    el.logoutButton.addEventListener('click', logout);
  }

  function clearFilters() {
    state.q = ''; state.atc = ''; state.formType = ''; state.formValue = ''; state.page = 1;
    const url = new URL(location.href); url.searchParams.delete('atc'); history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    el.searchInput.value = ''; el.formPickerSearch.value = ''; syncFormPickerTrigger(); closeFormPicker();
    loadPage();
  }

  async function init() {
    loadSharedSidebarTaxonomy();
    const incomingAtc = clean(new URLSearchParams(location.search).get('atc')).toUpperCase().replace(/\s+/g, '');
    state.atc = /^(?:[A-Z]|[A-Z]\d{2}(?:[A-Z]{1,2})?)$/.test(incomingAtc) ? incomingAtc : '';
    bindEvents();
    renderFormPicker();
    syncFormPickerTrigger();
    updateSelectedCount();
    try {
      const authPayload = await ensureAuth();
      await syncProfileChrome(authPayload);
      await loadColumnPreferences(authPayload);
      el.appShell.setAttribute('aria-busy', 'false');
      await loadPage();
    } catch (error) {
      console.error('DRx registry v2 bootstrap failed:', error);
      renderError(error?.message || 'Aplikacioni nuk u inicializua.');
      el.appShell.setAttribute('aria-busy', 'false');
    }
  }

  init();
})();
