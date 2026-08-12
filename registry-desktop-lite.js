(() => {
  'use strict';

  const VERSION = 'registry-desktop-lite-v1';
  const DESKTOP_QUERY = '(min-width: 768px)';
  const API = '/api/drug-search';
  const DEFAULT_PAGE_SIZE = 50;
  const SEARCH_DEBOUNCE_MS = 250;
  const HANDOFF_TIMEOUT_MS = 45000;

  const media = window.matchMedia?.(DESKTOP_QUERY);
  if (!media?.matches) return;

  const html = document.documentElement;
  const state = {
    page:1,
    pageSize:DEFAULT_PAGE_SIZE,
    q:'',
    status:'',
    sort:'registry',
    direction:'asc',
    total:null,
    totalPages:null,
    hasNext:false,
    loading:false,
    ready:false,
    disabled:false,
    rows:[],
  };

  let pageController = null;
  let searchTimer = 0;
  let authObserver = null;
  let handoffReplay = null;

  html.dataset.registryDesktopLite = VERSION;
  window.MEDINDEX_DESKTOP_LITE_ACTIVE = true;
  window.MEDINDEX_REGISTRY_PARTIAL = true;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));

  function authReady() {
    return html.classList.contains('auth-ready');
  }

  function hidePageLoader() {
    const loader = document.getElementById('pageLoader');
    if (!loader) return;
    loader.classList.add('is-hidden');
    loader.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => loader.remove(), 180);
  }

  function canonicalRow(row) {
    return {
      'Nr rendor':row.registryNumber ?? '',
      'PDID':clean(row.pdid),
      'ProtocolNo':'',
      'Emri tregtar':clean(row.tradeName),
      'Substanca aktive':clean(row.activeSubstance),
      'ATC Code':clean(row.atc),
      'Klasa / Çka është':clean(row.drugClass),
      'Përdorimi (fjalë kyçe)':clean(row.use),
      'Fortësia':clean(row.strength),
      'Forma farmaceutike':clean(row.form),
      'Statusi':clean(row.productStatus),
      'Çmimi me pakicë':row.retailPrice ?? '',
      __neonDrugId:clean(row.id),
      __qualityStatus:'verified',
      __registryPartial:true,
    };
  }

  function drugKey(row) {
    return [row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|');
  }

  function publishVisibleRows(rows) {
    const canonical = rows.map(canonicalRow);
    state.rows = canonical;
    window.MEDINDEX_REGISTRY_ROWS = canonical;
    window.MEDINDEX_REGISTRY_PARTIAL = true;
    window.dispatchEvent(new CustomEvent('medindex:registry-page-ready', {
      detail:{ rows:canonical, partial:true, page:state.page, pageSize:state.pageSize, total:state.total }
    }));
  }

  function requestFullRegistry(reason = 'desktop-advanced-feature', replay = null) {
    if (state.disabled) return;
    state.disabled = true;
    window.MEDINDEX_DESKTOP_LITE_ACTIVE = false;
    html.dataset.registryDesktopLiteState = 'handoff';
    handoffReplay = typeof replay === 'function' ? replay : null;
    window.dispatchEvent(new CustomEvent('medindex:request-full-registry', { detail:{ reason } }));

    if (handoffReplay) {
      const timeout = window.setTimeout(() => { handoffReplay = null; }, HANDOFF_TIMEOUT_MS);
      window.addEventListener('medindex:registry-ready', () => {
        window.clearTimeout(timeout);
        const replayNow = handoffReplay;
        handoffReplay = null;
        if (replayNow) requestAnimationFrame(() => replayNow());
      }, { once:true });
    }
  }

  function buildPageUrl({ includeTotal = false } = {}) {
    const params = new URLSearchParams({
      view:'registry-page',
      page:String(state.page),
      pageSize:String(state.pageSize),
      sort:state.sort,
      direction:state.direction,
    });
    if (state.q.length >= 2) params.set('q', state.q);
    if (state.status) params.set('status', state.status);
    if (includeTotal) params.set('includeTotal', '1');
    return `${API}?${params.toString()}`;
  }

  function setBusy(value) {
    state.loading = value;
    document.getElementById('dataTable')?.setAttribute('aria-busy', value ? 'true' : 'false');
    document.getElementById('pagination')?.classList.toggle('is-loading', value);
  }

  const BASE_COLUMNS = [
    { key:'trade-name', field:'Emri tregtar', label:'Emri Tregtar', cls:'name', sort:'name' },
    { key:'active-substance', field:'Substanca aktive', label:'Substanca Aktive', cls:'', sort:'substance' },
    { key:'atc', field:'ATC Code', label:'ATC', cls:'code', sort:'atc' },
    { key:'strength', field:'Fortësia', label:'Fortësia', cls:'', sort:'strength' },
    { key:'form', field:'Forma farmaceutike', label:'Forma', cls:'wrap', sort:'form' },
    { key:'status', field:'Statusi', label:'Statusi', cls:'', sort:'status' },
  ];

  function buildHeader() {
    const header = document.getElementById('headerRow');
    if (!header) return;
    header.innerHTML = '<th class="select-col" data-registry-column-key="select" scope="col"><label class="registry-selection-control"><input type="checkbox" data-desktop-lite-select-all aria-label="Zgjidhi barnat në këtë faqe"></label></th>' + BASE_COLUMNS.map(column => {
      const active = state.sort === column.sort;
      const arrow = active ? (state.direction === 'asc' ? '▲' : '▼') : '↕';
      return `<th class="registry-column-header ${column.cls}" data-registry-column-key="${column.key}" scope="col"${active ? ` aria-sort="${state.direction === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" class="registry-sort-trigger" data-desktop-lite-sort="${column.sort}">${escapeHtml(column.label)}<span class="arrow">${arrow}</span></button></th>`;
    }).join('');

    header.querySelector('[data-desktop-lite-select-all]')?.addEventListener('change', event => {
      event.preventDefault();
      requestFullRegistry('select-page-for-prescription', () => document.querySelector('#headerRow input[type="checkbox"]')?.click());
    }, { once:true });
    header.querySelectorAll('[data-desktop-lite-sort]').forEach(button => {
      button.addEventListener('click', () => {
        if (state.loading || state.disabled) return;
        const sort = button.dataset.desktopLiteSort || 'registry';
        if (state.sort === sort) state.direction = state.direction === 'asc' ? 'desc' : 'asc';
        else { state.sort = sort; state.direction = 'asc'; }
        state.page = 1;
        void loadPage({ includeTotal:false, scroll:false });
      });
    });
  }

  function statusBadge(value) {
    const status = clean(value);
    if (!status) return '—';
    const cls = status === 'Gjenerik' ? 'gjenerik' : status === 'Origjinator' ? 'origjinator' : '';
    return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
  }

  function renderRows(rows) {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Asnjë barnë nuk u gjet për këtë kërkim.</div></td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const key = drugKey(row);
      const id = escapeHtml(row.__neonDrugId);
      return `<tr data-registry-number="${escapeHtml(row['Nr rendor'])}" data-desktop-lite-row="${id}">
        <td class="select-col" data-registry-column-key="select" data-label="Për recetë"><label class="registry-selection-control"><input class="drug-select" type="checkbox" data-drug-key="${escapeHtml(key)}" aria-label="Zgjidh ${escapeHtml(row['Emri tregtar'])}"></label></td>
        <td class="name" data-registry-column-key="trade-name" data-label="Emri tregtar"><span class="drug-name-text">${escapeHtml(row['Emri tregtar'] || '—')}</span></td>
        <td class="quality-substance" data-registry-column-key="active-substance" data-label="Substanca aktive"><span>${escapeHtml(row['Substanca aktive'] || '—')}</span></td>
        <td class="code" data-registry-column-key="atc" data-label="ATC">${escapeHtml(row['ATC Code'] || '—')}</td>
        <td data-registry-column-key="strength" data-label="Fortësia">${escapeHtml(row['Fortësia'] || '—')}</td>
        <td class="wrap registry-form-cell" data-registry-column-key="form" data-label="Forma"><span class="registry-cell-value">${escapeHtml(row['Forma farmaceutike'] || '—')}</span></td>
        <td data-registry-column-key="status" data-label="Statusi">${statusBadge(row['Statusi'])}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.drug-select').forEach(input => {
      input.addEventListener('change', event => {
        event.preventDefault();
        const key = input.dataset.drugKey;
        requestFullRegistry('prescription-selection', () => {
          const target = Array.from(document.querySelectorAll('.drug-select')).find(node => node.dataset.drugKey === key);
          if (target && !target.checked) target.click();
        });
      }, { once:true });
    });

    tbody.querySelectorAll('[data-registry-column-key="trade-name"]').forEach(cell => {
      cell.addEventListener('click', event => {
        if (event.target.closest('input,button,a')) return;
        const row = cell.closest('tr');
        const key = row?.querySelector('.drug-select')?.dataset.drugKey;
        requestFullRegistry('desktop-full-detail', () => {
          const target = Array.from(document.querySelectorAll('.drug-select')).find(node => node.dataset.drugKey === key)?.closest('tr')?.querySelector('[data-registry-column-key="trade-name"]');
          target?.click();
        });
      }, { once:true });
    });
  }

  function renderCount() {
    const badge = document.getElementById('countBadge');
    if (!badge) return;
    if (Number.isFinite(state.total)) {
      badge.textContent = `${state.total} barna`;
      badge.title = `Faqja ${state.page}${state.totalPages ? ` nga ${state.totalPages}` : ''} · Neon lightweight`;
    } else {
      badge.textContent = `Faqja ${state.page}`;
      badge.title = 'Rezultate lightweight nga Neon';
    }
  }

  function renderPagination() {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    const label = Number.isFinite(state.totalPages) ? `Faqja ${state.page} / ${state.totalPages}` : `Faqja ${state.page}`;
    pagination.innerHTML = `<button type="button" data-desktop-lite-page="prev" ${state.page <= 1 ? 'disabled' : ''}>← Para</button><span>${escapeHtml(label)}</span><button type="button" data-desktop-lite-page="next" ${state.hasNext ? '' : 'disabled'}>Pas →</button>`;
    pagination.querySelector('[data-desktop-lite-page="prev"]')?.addEventListener('click', () => {
      if (state.page <= 1 || state.loading) return;
      state.page -= 1;
      void loadPage({ includeTotal:false, scroll:true });
    });
    pagination.querySelector('[data-desktop-lite-page="next"]')?.addEventListener('click', () => {
      if (!state.hasNext || state.loading) return;
      state.page += 1;
      void loadPage({ includeTotal:false, scroll:true });
    });
  }

  function configureControls() {
    const search = document.getElementById('search');
    search?.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.q = clean(search.value).slice(0, 80);
        state.page = 1;
        void loadPage({ includeTotal:true, scroll:false });
      }, SEARCH_DEBOUNCE_MS);
    });

    const status = document.getElementById('statusFilter');
    status?.addEventListener('change', () => {
      state.status = clean(status.value);
      state.page = 1;
      void loadPage({ includeTotal:true, scroll:false });
    });

    const pageSize = document.getElementById('pageSize');
    pageSize?.addEventListener('change', event => {
      const requested = Number(event.currentTarget.value) || DEFAULT_PAGE_SIZE;
      if (requested > 50) {
        event.preventDefault();
        event.currentTarget.value = '50';
        requestFullRegistry('desktop-large-page-size', () => {
          const control = document.getElementById('pageSize');
          if (control) { control.value = String(requested); control.dispatchEvent(new Event('change', { bubbles:true })); }
        });
        return;
      }
      state.pageSize = Math.max(1, requested);
      state.page = 1;
      void loadPage({ includeTotal:true, scroll:false });
    });

    [
      ['protocolsBtn', 'prescription-builder'],
      ['colPickerBtn', 'column-picker'],
      ['formPickerBtn', 'form-picker'],
    ].forEach(([id, reason]) => {
      document.getElementById(id)?.addEventListener('click', event => {
        if (state.disabled) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        requestFullRegistry(reason, () => document.getElementById(id)?.click());
      }, true);
    });
  }

  async function loadPage({ includeTotal = false, scroll = false } = {}) {
    if (state.disabled) return;
    pageController?.abort();
    pageController = new AbortController();
    setBusy(true);
    try {
      const response = await fetch(buildPageUrl({ includeTotal }), {
        credentials:'same-origin', cache:'no-store', signal:pageController.signal,
        headers:{ Accept:'application/json' },
      });
      if (response.status === 401) throw new Error('Sesioni ka skaduar.');
      if (!response.ok) throw new Error(`Lista e barnave nuk u ngarkua (${response.status}).`);
      const payload = await response.json();
      if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Përgjigjja e regjistrit është e pavlefshme.');

      state.page = Number(payload.pagination?.page || state.page) || state.page;
      state.pageSize = Number(payload.pagination?.pageSize || state.pageSize) || state.pageSize;
      state.hasNext = Boolean(payload.pagination?.hasNext);
      if (Number.isFinite(payload.pagination?.total)) {
        state.total = Number(payload.pagination.total);
        state.totalPages = Number(payload.pagination.totalPages || 1);
      }

      publishVisibleRows(payload.rows);
      buildHeader();
      renderRows(state.rows);
      renderCount();
      renderPagination();
      state.ready = true;
      html.dataset.registryDesktopLiteReady = '1';
      html.dataset.registryDesktopLiteState = 'ready';
      window.MedIndexRegistryDosageLoader?.schedule?.();
      window.dispatchEvent(new CustomEvent('medindex:desktop-lite-ready', {
        detail:{ page:state.page, pageSize:state.pageSize, total:state.total, source:'neon' }
      }));
      hidePageLoader();
      if (scroll) document.getElementById('registryContent')?.scrollIntoView({ block:'start', behavior:'smooth' });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Desktop lightweight registry failed:', error);
      html.dataset.registryDesktopLiteState = 'error';
      if (!state.ready) requestFullRegistry('desktop-lite-error');
      else {
        const badge = document.getElementById('countBadge');
        if (badge) badge.textContent = 'Gabim · provo përsëri';
      }
    } finally {
      setBusy(false);
    }
  }

  function start() {
    if (state.disabled) return;
    configureControls();
    void loadPage({ includeTotal:true, scroll:false });
  }

  function waitForAuth() {
    if (authReady()) return start();
    authObserver = new MutationObserver(() => {
      if (!authReady()) return;
      authObserver?.disconnect();
      start();
    });
    authObserver.observe(html, { attributes:true, attributeFilter:['class'] });
  }

  window.MEDINDEX_DESKTOP_LITE = {
    version:VERSION,
    reload:() => loadPage({ includeTotal:true, scroll:false }),
    handoff:requestFullRegistry,
    getState:() => ({ ...state, rows:state.rows.map(row => ({ ...row })) }),
  };

  media.addEventListener?.('change', event => {
    if (!event.matches && !state.disabled) requestFullRegistry('viewport-mobile');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForAuth, { once:true });
  else waitForAuth();
})();
