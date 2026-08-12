(() => {
  'use strict';

  const VERSION = 'mobile-server-registry-v2';
  const MOBILE_QUERY = '(max-width: 767px)';
  const API = '/api/registry-page';
  const DEFAULT_PAGE_SIZE = 25;
  const MAX_PAGE_SIZE = 50;
  const SEARCH_DEBOUNCE_MS = 250;

  if (!window.matchMedia?.(MOBILE_QUERY).matches) return;

  const html = document.documentElement;
  const state = {
    page:1,
    pageSize:DEFAULT_PAGE_SIZE,
    q:'',
    status:'',
    formQuery:'',
    atc:'',
    sort:'registry',
    direction:'asc',
    total:0,
    totalPages:1,
    loading:false,
    ready:false,
  };
  let requestController = null;
  let searchTimer = 0;
  let detailController = null;
  let disabled = false;
  let activeDetailId = '';

  html.dataset.registryMobileServer = VERSION;
  window.MEDINDEX_MOBILE_SERVER_ACTIVE = true;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));

  function authReady() {
    return html.classList.contains('auth-ready');
  }

  function snapshot() {
    return {
      page:state.page,
      pageSize:state.pageSize,
      q:state.q,
      status:state.status,
      formQuery:state.formQuery,
      atc:state.atc,
      sort:state.sort,
      direction:state.direction,
      total:state.total,
      totalPages:state.totalPages,
      loading:state.loading,
      ready:state.ready,
      activeDetailId,
      disabled,
    };
  }

  function emitState(reason = 'update') {
    window.dispatchEvent(new CustomEvent('medindex:mobile-registry-state', {
      detail:{ ...snapshot(), reason }
    }));
  }

  function canonical(row) {
    return {
      'Nr rendor':row.registryNumber ?? '',
      PDID:clean(row.pdid),
      ProtocolNo:'',
      'Emri tregtar':clean(row.tradeName),
      'Substanca aktive':clean(row.activeSubstance),
      'ATC Code':clean(row.atc),
      'Klasa / Çka është':clean(row.drugClass),
      'Përdorimi (fjalë kyçe)':clean(row.use),
      Fortësia:clean(row.strength),
      'Forma farmaceutike':clean(row.form),
      'Madhësia e paketimit':'',
      'Si të shënohet në recetë':'',
      'Bartësi i Autorizim Marketingut':'',
      Prodhuesi:'',
      'MA certifikata':'',
      Statusi:clean(row.productStatus),
      'Çmimi me shumicë':'',
      'Çmimi me marzhë':'',
      TVSH:'',
      'Çmimi me pakicë':row.retailPrice ?? '',
      'Afati i vlefshmërisë':'',
      __neonDrugId:clean(row.id),
      __serverPartial:true,
      __qualityStatus:'verified',
    };
  }

  function requestFullRegistry(reason) {
    if (disabled) return;
    disabled = true;
    window.MEDINDEX_MOBILE_SERVER_ACTIVE = false;
    html.dataset.registryMobileServerState = 'handoff';
    emitState('handoff');
    window.dispatchEvent(new CustomEvent('medindex:request-full-registry', { detail:{ reason } }));
  }

  function hideLoader() {
    const loader = document.getElementById('pageLoader');
    if (!loader) return;
    loader.classList.add('is-hidden');
    loader.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => loader.remove(), 180);
  }

  function buildUrl() {
    const params = new URLSearchParams({
      page:String(state.page),
      pageSize:String(state.pageSize),
      sort:state.sort,
      direction:state.direction,
    });
    if (state.q.length >= 2) params.set('q', state.q);
    if (state.status) params.set('status', state.status);
    if (state.formQuery) params.set('formQuery', state.formQuery);
    if (state.atc) params.set('atc', state.atc);
    return `${API}?${params.toString()}`;
  }

  function setBusy(value) {
    state.loading = value;
    const table = document.getElementById('dataTable');
    const search = document.getElementById('search');
    const pagination = document.getElementById('pagination');
    table?.setAttribute('aria-busy', value ? 'true' : 'false');
    search?.classList.toggle('is-server-loading', value);
    pagination?.classList.toggle('is-server-loading', value);
    emitState(value ? 'loading' : 'idle');
  }

  function renderHeader() {
    const header = document.getElementById('headerRow');
    if (!header) return;
    const columns = [
      ['name','Emri Tregtar'],
      ['substance','Substanca Aktive'],
      ['atc','ATC'],
      ['strength','Fortësia'],
      ['form','Forma'],
      ['status','Statusi'],
    ];
    header.innerHTML = columns.map(([key,label]) => {
      const active = state.sort === key;
      const arrow = active ? (state.direction === 'asc' ? '▲' : '▼') : '↕';
      return `<th scope="col" data-column-key="${key}"><button type="button" class="registry-sort-trigger" data-mobile-server-sort="${key}" aria-label="Rendit sipas ${escapeHtml(label)}">${escapeHtml(label)} <span class="arrow">${arrow}</span></button></th>`;
    }).join('');
    header.querySelectorAll('[data-mobile-server-sort]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.mobileServerSort;
        if (state.sort === key) state.direction = state.direction === 'asc' ? 'desc' : 'asc';
        else { state.sort = key; state.direction = 'asc'; }
        state.page = 1;
        void loadPage({ scroll:false, reason:'sort' });
      });
    });
  }

  function renderRows(rows) {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Asnjë barnë nuk u gjet për këtë kërkim.</div></td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(row => {
      const id = escapeHtml(row.id);
      const status = clean(row.productStatus);
      const statusClass = status === 'Gjenerik' ? 'gjenerik' : status === 'Origjinator' ? 'origjinator' : '';
      return `<tr data-mobile-server-row="${id}" data-mobile-drug-name="${escapeHtml(row.tradeName)}" data-mobile-drug-substance="${escapeHtml(row.activeSubstance)}">
        <td data-column-key="Emri tregtar" data-label="Emri tregtar" class="name"><strong>${escapeHtml(row.tradeName)}</strong><span class="registry-mobile-row-actions"><button type="button" class="registry-mobile-more" data-mobile-server-detail="${id}">Më shumë</button></span></td>
        <td data-column-key="Substanca aktive" data-label="Substanca aktive">${escapeHtml(row.activeSubstance)}</td>
        <td data-column-key="ATC Code" data-label="ATC" class="code">${escapeHtml(row.atc)}</td>
        <td data-column-key="Fortësia" data-label="Fortësia">${escapeHtml(row.strength)}</td>
        <td data-column-key="Forma farmaceutike" data-label="Forma" class="wrap">${escapeHtml(row.form)}</td>
        <td data-column-key="Statusi" data-label="Statusi">${status ? `<span class="badge ${statusClass}">${escapeHtml(status)}</span>` : ''}</td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-mobile-server-detail]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        void openDetail(button.dataset.mobileServerDetail, button);
      });
    });
    window.dispatchEvent(new CustomEvent('medindex:mobile-registry-rows-rendered', { detail:{ rows } }));
  }

  function renderCount() {
    const badge = document.getElementById('countBadge');
    if (!badge) return;
    badge.dataset.visible = String(state.total);
    badge.dataset.total = String(state.total);
    const filtered = Boolean(state.q || state.status || state.formQuery || state.atc);
    badge.textContent = filtered ? `${state.total} rezultate` : `${state.total} barna`;
    badge.title = `${state.total} rezultate · server-side pagination`;
  }

  function renderPagination() {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    const totalPages = Math.max(1, Number(state.totalPages || 1));
    const current = Math.min(totalPages, Math.max(1, state.page));
    const pages = [];
    for (let page = 1; page <= totalPages; page += 1) {
      if (page === 1 || page === totalPages || Math.abs(page - current) <= 2) pages.push(page);
    }
    const button = (label, page, isDisabled, active = false) => `<button type="button" data-mobile-server-page="${page}" ${isDisabled ? 'disabled' : ''} class="${active ? 'active' : ''}">${escapeHtml(label)}</button>`;
    const htmlParts = [button('« Para', current - 1, current <= 1)];
    let last = 0;
    pages.forEach(page => {
      if (last && page - last > 1) htmlParts.push('<span class="registry-page-dots" aria-hidden="true">…</span>');
      htmlParts.push(button(String(page), page, false, page === current));
      last = page;
    });
    htmlParts.push(button('Pas »', current + 1, current >= totalPages));
    pagination.innerHTML = htmlParts.join('');
    pagination.querySelectorAll('[data-mobile-server-page]').forEach(control => {
      control.addEventListener('click', () => {
        const page = Number(control.dataset.mobileServerPage);
        if (!Number.isFinite(page) || page < 1 || page > totalPages || page === state.page) return;
        state.page = page;
        void loadPage({ scroll:true, reason:'pagination' });
      });
    });
  }

  function updateGlobalRows(rows) {
    const canonicalRows = rows.map(canonical);
    window.MEDINDEX_REGISTRY_ROWS = canonicalRows;
    window.MEDINDEX_REGISTRY_QUALITY = {
      version:VERSION,
      partial:true,
      summary:{ total:state.total, corrected:0, blocked:0, warning:0, verified:canonicalRows.length },
      rows:canonicalRows,
    };
    window.dispatchEvent(new CustomEvent('medindex:registry-data-ready', {
      detail:{ rows:canonicalRows, quality:window.MEDINDEX_REGISTRY_QUALITY, partial:true, source:'neon-page' }
    }));
  }

  async function loadPage({ scroll = false, reason = 'reload' } = {}) {
    if (disabled) return;
    requestController?.abort();
    requestController = new AbortController();
    setBusy(true);
    try {
      const response = await fetch(buildUrl(), {
        credentials:'same-origin',
        cache:'no-store',
        signal:requestController.signal,
        headers:{ Accept:'application/json' },
      });
      if (response.status === 401) throw new Error('Sesioni ka skaduar.');
      if (!response.ok) throw new Error(`Lista e barnave nuk u ngarkua (${response.status}).`);
      const payload = await response.json();
      if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Përgjigjja e listës është e pavlefshme.');
      state.total = Number(payload.pagination?.total ?? payload.rows.length);
      state.totalPages = Number(payload.pagination?.totalPages ?? 1) || 1;
      state.page = Number(payload.pagination?.page ?? state.page) || state.page;
      state.pageSize = Math.min(MAX_PAGE_SIZE, Number(payload.pagination?.pageSize ?? state.pageSize) || state.pageSize);
      renderHeader();
      renderRows(payload.rows);
      renderCount();
      renderPagination();
      updateGlobalRows(payload.rows);
      state.ready = true;
      html.dataset.registryMobileServerReady = '1';
      html.dataset.registryMobileServerState = 'ready';
      hideLoader();
      emitState(reason);
      window.dispatchEvent(new CustomEvent('medindex:mobile-registry-ready', {
        detail:{ ...snapshot(), source:'neon-page', rows:payload.rows }
      }));
      if (scroll) document.getElementById('registryContent')?.scrollIntoView({ block:'start', behavior:'smooth' });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Mobile server registry failed:', error);
      html.dataset.registryMobileServerState = 'error';
      if (!state.ready) requestFullRegistry('mobile-server-error');
      else {
        const badge = document.getElementById('countBadge');
        if (badge) badge.textContent = 'Gabim në ngarkim · provo përsëri';
      }
    } finally {
      setBusy(false);
    }
  }

  function ensureDetailDialog() {
    let dialog = document.getElementById('registryMobileServerDetail');
    if (dialog) return dialog;
    dialog = document.createElement('div');
    dialog.id = 'registryMobileServerDetail';
    dialog.className = 'registry-mobile-server-detail';
    dialog.hidden = true;
    dialog.innerHTML = '<div class="registry-mobile-server-backdrop" data-mobile-server-close></div><section class="registry-mobile-server-sheet" role="dialog" aria-modal="true" aria-labelledby="registryMobileServerDetailTitle"><div class="registry-mobile-server-sheet-head"><div><span class="registry-mobile-server-sheet-eyebrow">MedIndex</span><h2 id="registryMobileServerDetailTitle">Detajet e barit</h2></div><button type="button" data-mobile-server-close aria-label="Mbyll detajet">×</button></div><div class="registry-mobile-server-detail-actions" data-mobile-detail-actions></div><div class="registry-mobile-server-sheet-body" data-mobile-server-detail-body></div></section>';
    document.body.appendChild(dialog);
    dialog.querySelectorAll('[data-mobile-server-close]').forEach(control => control.addEventListener('click', () => closeDetail({ source:'button' })));
    return dialog;
  }

  function closeDetail({ source = 'api' } = {}) {
    detailController?.abort();
    const dialog = document.getElementById('registryMobileServerDetail');
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    document.body.classList.remove('registry-mobile-server-detail-open');
    const previousId = activeDetailId;
    activeDetailId = '';
    emitState('detail-close');
    window.dispatchEvent(new CustomEvent('medindex:mobile-detail-closed', { detail:{ id:previousId, source } }));
  }

  async function openDetail(id, trigger, options = {}) {
    if (!id || disabled) return null;
    const dialog = ensureDetailDialog();
    const body = dialog.querySelector('[data-mobile-server-detail-body]');
    const title = dialog.querySelector('#registryMobileServerDetailTitle');
    const actions = dialog.querySelector('[data-mobile-detail-actions]');
    if (!body || !title || !actions) return null;
    activeDetailId = clean(id);
    dialog.hidden = false;
    document.body.classList.add('registry-mobile-server-detail-open');
    body.innerHTML = '<div class="registry-mobile-server-detail-loading">Duke i ngarkuar detajet…</div>';
    actions.innerHTML = '';
    detailController?.abort();
    detailController = new AbortController();
    emitState('detail-open');
    try {
      const response = await fetch(`${API}?view=detail&id=${encodeURIComponent(id)}`, {
        credentials:'same-origin', cache:'no-store', signal:detailController.signal, headers:{ Accept:'application/json' }
      });
      if (!response.ok) throw new Error(`Detajet nuk u ngarkuan (${response.status}).`);
      const payload = await response.json();
      const row = payload?.row;
      if (!row) throw new Error('Detajet mungojnë.');
      title.textContent = clean(row.tradeName) || 'Detajet e barit';
      const clinical = [
        ['Substanca aktive', row.activeSubstance], ['ATC', row.atc], ['Fortësia', row.strength], ['Forma', row.form],
        ['Klasa', row.drugClass], ['Përdorimi', row.use], ['Paketimi', row.packaging],
      ].filter(([,value]) => value !== null && value !== undefined && clean(value) !== '');
      const regulatory = [
        ['Prodhuesi', row.manufacturer], ['Bartësi i autorizimit', row.marketingAuthorizationHolder], ['Statusi', row.productStatus],
        ['PDID', row.pdid], ['Protokolli', row.protocolNo], ['Certifikata MA', row.maCertificate], ['TVSH', row.vat], ['Afati', row.validity],
      ].filter(([,value]) => value !== null && value !== undefined && clean(value) !== '');
      if (row.retailPrice !== null && row.retailPrice !== undefined) regulatory.push(['Çmimi me pakicë', `${row.retailPrice} €`]);
      const section = (label, items) => items.length ? `<section class="registry-mobile-server-detail-section"><h3>${escapeHtml(label)}</h3>${items.map(([itemLabel,value]) => `<div class="registry-mobile-server-detail-item"><span>${escapeHtml(itemLabel)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</section>` : '';
      body.innerHTML = section('Përmbledhje klinike', clinical) + section('Të dhënat e produktit', regulatory);
      const advanced = document.createElement('button');
      advanced.type = 'button';
      advanced.className = 'registry-mobile-server-advanced';
      advanced.textContent = 'Hap funksionet e plota';
      advanced.addEventListener('click', () => requestFullRegistry('detail-advanced'));
      body.appendChild(advanced);
      trigger?.setAttribute('aria-expanded', 'true');
      window.dispatchEvent(new CustomEvent('medindex:mobile-detail-opened', {
        detail:{ id:activeDetailId, row, dialog, actions, source:options.source || 'user' }
      }));
      return row;
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      body.innerHTML = `<div class="registry-mobile-server-detail-error">${escapeHtml(error.message || 'Detajet nuk u ngarkuan.')}</div>`;
      return null;
    }
  }

  function applyFilters(next = {}, options = {}) {
    if (disabled) return;
    if (Object.hasOwn(next, 'q')) state.q = clean(next.q);
    if (Object.hasOwn(next, 'status')) state.status = clean(next.status);
    if (Object.hasOwn(next, 'formQuery')) state.formQuery = clean(next.formQuery);
    if (Object.hasOwn(next, 'atc')) state.atc = clean(next.atc).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (Object.hasOwn(next, 'pageSize')) {
      const size = Number(next.pageSize);
      if (Number.isFinite(size)) state.pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, size));
    }
    if (Object.hasOwn(next, 'sort') && ['registry','name','substance','atc','strength','form','status','price'].includes(next.sort)) state.sort = next.sort;
    if (Object.hasOwn(next, 'direction')) state.direction = next.direction === 'desc' ? 'desc' : 'asc';
    if (Object.hasOwn(next, 'page')) {
      const page = Number(next.page);
      state.page = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    } else state.page = 1;
    const search = document.getElementById('search');
    const status = document.getElementById('statusFilter');
    const pageSize = document.getElementById('pageSize');
    if (search && search.value !== state.q) search.value = state.q;
    if (status && status.value !== state.status) status.value = state.status;
    if (pageSize && pageSize.value !== String(state.pageSize)) pageSize.value = String(state.pageSize);
    if (options.reload !== false) void loadPage({ scroll:Boolean(options.scroll), reason:options.reason || 'filters' });
    else emitState(options.reason || 'filters-no-reload');
  }

  function configureControls() {
    const search = document.getElementById('search');
    const status = document.getElementById('statusFilter');
    const pageSize = document.getElementById('pageSize');
    const formPicker = document.getElementById('formPickerBtn');
    const columnPicker = document.getElementById('colPickerBtn');
    const protocols = document.getElementById('protocolsBtn');

    if (pageSize) {
      if (!pageSize.querySelector('option[value="25"]')) {
        const option = document.createElement('option');
        option.value = '25';
        option.textContent = '25 / faqe';
        pageSize.prepend(option);
      }
      [...pageSize.options].forEach(option => {
        const value = Number(option.value);
        if (Number.isFinite(value) && value > MAX_PAGE_SIZE) {
          option.hidden = true;
          option.disabled = true;
          option.dataset.mobileServerHidden = '1';
        }
      });
      pageSize.value = String(DEFAULT_PAGE_SIZE);
      pageSize.addEventListener('change', () => {
        const next = Number(pageSize.value);
        if (!Number.isFinite(next) || next > MAX_PAGE_SIZE) return requestFullRegistry('large-page-size');
        applyFilters({ pageSize:next }, { reason:'page-size' });
      });
    }

    search?.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => applyFilters({ q:search.value }, { reason:'search' }), SEARCH_DEBOUNCE_MS);
    });

    status?.addEventListener('change', () => applyFilters({ status:status.value }, { reason:'status' }));

    formPicker?.addEventListener('click', event => {
      if (disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('medindex:open-mobile-registry-filters'));
    }, { capture:true });

    [columnPicker, protocols].forEach(control => {
      control?.addEventListener('click', event => {
        if (disabled) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        requestFullRegistry(control === protocols ? 'prescription' : 'columns');
      }, { capture:true });
    });
  }

  function restoreAdvancedControls() {
    const pageSize = document.getElementById('pageSize');
    if (pageSize) {
      [...pageSize.options].forEach(option => {
        if (option.dataset.mobileServerHidden === '1') {
          option.hidden = false;
          option.disabled = false;
          delete option.dataset.mobileServerHidden;
        }
      });
    }
    closeDetail({ source:'full-runtime' });
  }

  function start() {
    if (disabled) return;
    configureControls();
    emitState('start');
    void loadPage({ reason:'initial' });
  }

  window.MedIndexMobileRegistry = Object.freeze({
    version:VERSION,
    getState:snapshot,
    setFilters:applyFilters,
    reload:options => loadPage({ ...(options || {}), reason:options?.reason || 'manual' }),
    openDetail,
    closeDetail,
    requestFullRegistry,
  });
  window.dispatchEvent(new CustomEvent('medindex:mobile-registry-api-ready', { detail:{ version:VERSION } }));

  window.addEventListener('medindex:full-registry-started', () => {
    disabled = true;
    window.MEDINDEX_MOBILE_SERVER_ACTIVE = false;
    html.dataset.registryMobileServerState = 'full-runtime';
    restoreAdvancedControls();
    requestController?.abort();
    emitState('full-runtime');
  });

  window.matchMedia(MOBILE_QUERY).addEventListener?.('change', event => {
    if (!event.matches && !disabled) requestFullRegistry('viewport-desktop');
  });

  if (authReady()) start();
  else {
    const observer = new MutationObserver(() => {
      if (!authReady()) return;
      observer.disconnect();
      start();
    });
    observer.observe(html, { attributes:true, attributeFilter:['class'] });
  }
})();
