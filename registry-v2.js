(() => {
  'use strict';

  const state = {
    page: 1,
    pageSize: 50,
    total: null,
    totalPages: null,
    q: '',
    status: '',
    form: '',
    sort: 'registry',
    direction: 'asc',
    rows: [],
    dosageByRegistry: new Map(),
    selected: new Map(),
    currentDetail: null,
    requestId: 0,
    searchTimer: 0,
  };

  const $ = id => document.getElementById(id);
  const el = {
    appShell: $('appShell'), sidebar: $('sidebar'), sidebarBackdrop: $('sidebarBackdrop'), menuButton: $('menuButton'), sidebarClose: $('sidebarClose'),
    logoutButton: $('logoutButton'), sourceStatus: $('sourceStatus'), syncText: $('syncText'), avatarInitials: $('avatarInitials'),
    refreshButton: $('refreshButton'), openPrescriptionButton: $('openPrescriptionButton'), selectedCount: $('selectedCount'),
    metricTotal: $('metricTotal'), metricPage: $('metricPage'), metricPageSize: $('metricPageSize'), metricSource: $('metricSource'), metricFilters: $('metricFilters'),
    searchInput: $('searchInput'), filterToggle: $('filterToggle'), filterPanel: $('filterPanel'), filterCountBadge: $('filterCountBadge'),
    statusFilter: $('statusFilter'), formFilter: $('formFilter'), formSuggestions: $('formSuggestions'), sortSelect: $('sortSelect'), directionSelect: $('directionSelect'), clearFiltersButton: $('clearFiltersButton'),
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
    if (state.status) params.set('status', state.status);
    if (state.form) params.set('form', state.form);
    return `/api/drug-search?${params.toString()}`;
  }

  function renderSkeleton() {
    el.emptyState.hidden = true;
    el.tableScroll.hidden = false;
    el.registryRows.innerHTML = Array.from({ length: Math.min(10, state.pageSize) }, () => `
      <tr aria-hidden="true">
        <td><span class="skeleton sm"></span></td><td><span class="skeleton sm"></span></td><td><span class="skeleton lg"></span></td><td><span class="skeleton md"></span></td>
        <td><span class="skeleton sm"></span></td><td><span class="skeleton md"></span></td><td><span class="skeleton sm"></span></td><td><span class="skeleton lg"></span></td>
        <td><span class="skeleton lg"></span></td><td><span class="skeleton sm"></span></td><td><span class="skeleton sm"></span></td><td></td>
      </tr>`).join('');
    el.resultSummary.textContent = 'Duke ngarkuar regjistrin…';
    el.requestTiming.textContent = '';
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
      el.sourceStatus.textContent = response.headers.get('X-MedIndex-Data-Source') || 'Neon · aktiv';
      el.syncText.textContent = response.headers.get('X-MedIndex-Data-Source') || 'Supabase';
      state.dosageByRegistry.clear();
      renderRows();
      updateSummary(Math.round(performance.now() - startedAt));
      updateSortHeaders();
      updateFormSuggestions();
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
    return `<div class="dose-cell"><span class="dose-text">${escapeHtml(dose)}</span>${clean(route) ? `<span class="route-chip">${escapeHtml(route)}</span>` : ''}</div>`;
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
      return `<tr data-row-id="${escapeHtml(key)}" class="${selected ? 'is-selected' : ''}" tabindex="0" aria-selected="${selected ? 'true' : 'false'}">
        <td><input class="row-check" type="checkbox" data-select-row="${escapeHtml(key)}" aria-label="Zgjidh ${escapeHtml(row.tradeName)}" ${selected ? 'checked' : ''}></td>
        <td><span class="price">${escapeHtml(number || '—')}</span></td>
        <td><span class="drug-name">${escapeHtml(row.tradeName || 'Pa emër')}</span><span class="drug-meta">${escapeHtml(row.pdid || row.productStatus || '')}</span></td>
        <td><span class="cell-clamp">${escapeHtml(row.activeSubstance || '—')}</span></td>
        <td>${escapeHtml(row.strength || '—')}</td>
        <td><span class="cell-clamp">${escapeHtml(row.form || '—')}</span></td>
        <td>${row.atc ? `<span class="atc-chip">${escapeHtml(row.atc)}</span>` : '—'}</td>
        <td data-dose-adult="${escapeHtml(number)}" data-dose-status="loading"><span class="skeleton lg"></span></td>
        <td data-dose-pediatric="${escapeHtml(number)}" data-dose-status="loading"><span class="skeleton lg"></span></td>
        <td>${statusBadge(row.productStatus)}</td>
        <td><span class="price">${euros(row.retailPrice)}</span></td>
        <td><button class="row-action" type="button" data-open-row="${escapeHtml(key)}" aria-label="Hap detajet e ${escapeHtml(row.tradeName)}">›</button></td>
      </tr>`;
    }).join('');
    syncPageSelection();
  }

  function updateSummary(durationMs) {
    const first = state.rows.length ? (state.page - 1) * state.pageSize + 1 : 0;
    const last = state.rows.length ? first + state.rows.length - 1 : 0;
    const totalText = Number.isFinite(state.total) ? state.total.toLocaleString('sq-XK') : '—';
    el.resultSummary.textContent = state.rows.length ? `${first.toLocaleString('sq-XK')}–${last.toLocaleString('sq-XK')} nga ${totalText} rezultate` : '0 rezultate';
    el.requestTiming.textContent = `${durationMs} ms`;
    el.metricTotal.textContent = totalText;
    el.metricPage.textContent = String(state.page);
    el.metricPageSize.textContent = `${state.pageSize} për faqe`;
    el.paginationSummary.textContent = state.rows.length ? `Duke shfaqur ${first}–${last}${Number.isFinite(state.total) ? ` nga ${state.total.toLocaleString('sq-XK')}` : ''}` : 'Asnjë rezultat';
    el.pageIndicator.textContent = `${state.page} / ${Number.isFinite(state.totalPages) ? state.totalPages : '—'}`;
    el.prevPageButton.disabled = state.page <= 1;
    el.nextPageButton.disabled = Number.isFinite(state.totalPages) ? state.page >= state.totalPages : state.rows.length < state.pageSize;
  }

  function updateFormSuggestions() {
    const forms = [...new Set(state.rows.map(row => clean(row.form)).filter(Boolean))].sort((a,b) => a.localeCompare(b,'sq'));
    el.formSuggestions.innerHTML = forms.map(form => `<option value="${escapeHtml(form)}"></option>`).join('');
  }

  function activeFilterCount() { return [state.q, state.status, state.form].filter(Boolean).length; }

  function updateFilterUi() {
    const count = activeFilterCount();
    el.metricFilters.textContent = String(count);
    el.filterCountBadge.textContent = String(count);
    el.filterCountBadge.hidden = count === 0;
    el.pageSizeSelect.value = String(state.pageSize);
    el.sortSelect.value = state.sort;
    el.directionSelect.value = state.direction;
    el.statusFilter.value = state.status;
    el.formFilter.value = state.form;
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
      ['Forma', detail.form], ['Paketimi', detail.packaging], ['Prodhuesi', detail.manufacturer], ['MAH', detail.marketingAuthorizationHolder],
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
      if (event.key === 'Escape') { closeDrawer(); closeSidebar(); }
    });
    el.filterToggle.addEventListener('click', () => { const open = el.filterPanel.hidden; el.filterPanel.hidden = !open; el.filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    el.statusFilter.addEventListener('change', () => { state.status = el.statusFilter.value; state.page = 1; loadPage(); });
    el.formFilter.addEventListener('change', () => { state.form = clean(el.formFilter.value); state.page = 1; loadPage(); });
    el.formFilter.addEventListener('keydown', event => { if (event.key === 'Enter') { state.form = clean(el.formFilter.value); state.page = 1; loadPage(); } });
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
    state.q = ''; state.status = ''; state.form = ''; state.page = 1;
    el.searchInput.value = ''; el.statusFilter.value = ''; el.formFilter.value = '';
    loadPage();
  }

  async function init() {
    bindEvents();
    updateSelectedCount();
    try {
      await ensureAuth();
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
