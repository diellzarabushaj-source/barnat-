(() => {
  'use strict';

  const VERSION = 'registry-mobile-lite-v1';
  const MOBILE_QUERY = '(max-width: 767px)';
  const API = '/api/drug-search';
  const DEFAULT_PAGE_SIZE = 25;
  const MAX_PAGE_SIZE = 50;
  const SEARCH_DEBOUNCE_MS = 250;

  const media = window.matchMedia?.(MOBILE_QUERY);
  if (!media?.matches) return;

  const html = document.documentElement;
  const state = {
    page:1,
    pageSize:DEFAULT_PAGE_SIZE,
    q:'',
    status:'',
    total:null,
    totalPages:null,
    hasNext:false,
    loading:false,
    ready:false,
    disabled:false,
  };

  let pageController = null;
  let detailController = null;
  let searchTimer = 0;
  let authObserver = null;

  html.dataset.registryMobileLite = VERSION;
  window.MEDINDEX_MOBILE_LITE_ACTIVE = true;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));

  function authReady() {
    return html.classList.contains('auth-ready');
  }

  function requestFullRegistry(reason = 'fatal-mobile-lite-recovery', options = {}) {
    if (state.disabled) return false;
    const resolvedReason = clean(reason) || 'fatal-mobile-lite-recovery';
    const explicitFatal = options.fatal === true || resolvedReason === 'viewport-desktop' || resolvedReason.startsWith('fatal-');

    if (media?.matches && !explicitFatal) {
      html.dataset.registryMobileLiteBlockedHandoff = resolvedReason;
      window.dispatchEvent(new CustomEvent('medindex:mobile-lite-handoff-blocked', {
        detail:{ reason:resolvedReason, owner:'mobile-lite' },
      }));
      return false;
    }

    state.disabled = true;
    window.MEDINDEX_MOBILE_LITE_ACTIVE = false;
    html.dataset.registryMobileLiteState = 'handoff';
    window.dispatchEvent(new CustomEvent('medindex:request-full-registry', {
      detail:{ reason:resolvedReason, fatal:options.fatal === true || resolvedReason.startsWith('fatal-') },
    }));
    return true;
  }

  function buildPageUrl({ includeTotal = false } = {}) {
    const params = new URLSearchParams({
      view:'registry-page',
      page:String(state.page),
      pageSize:String(state.pageSize),
      sort:'registry',
      direction:'asc',
    });
    if (state.q.length >= 2) params.set('q', state.q);
    if (state.status) params.set('status', state.status);
    if (includeTotal) params.set('includeTotal', '1');
    return `${API}?${params.toString()}`;
  }

  function clearKnownTotal() {
    state.total = null;
    state.totalPages = null;
  }

  function setBusy(value) {
    state.loading = value;
    document.getElementById('dataTable')?.setAttribute('aria-busy', value ? 'true' : 'false');
    document.getElementById('search')?.classList.toggle('is-mobile-lite-loading', value);
    document.getElementById('pagination')?.classList.toggle('is-mobile-lite-loading', value);
  }

  function configureMobileControls() {
    const pageSize = document.getElementById('pageSize');
    if (pageSize) {
      pageSize.innerHTML = '<option value="25">25 / faqe</option><option value="50">50 / faqe</option>';
      pageSize.value = String(DEFAULT_PAGE_SIZE);
      pageSize.addEventListener('change', () => {
        const next = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize.value) || DEFAULT_PAGE_SIZE));
        state.pageSize = next;
        state.page = 1;
        clearKnownTotal();
        void loadPage({ includeTotal:true, scroll:false });
      });
    }

    const status = document.getElementById('statusFilter');
    status?.addEventListener('change', () => {
      state.status = clean(status.value);
      state.page = 1;
      clearKnownTotal();
      void loadPage({ includeTotal:true, scroll:false });
    });

    const search = document.getElementById('search');
    search?.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        const nextQuery = clean(search.value).slice(0, 80);
        if (nextQuery.length === 1) return;
        state.q = nextQuery;
        state.page = 1;
        clearKnownTotal();
        // Exact counts are intentionally skipped while typing. The bounded page
        // request fetches one look-ahead row to determine hasNext, avoiding a
        // count=exact query on every search term. Clearing search restores total.
        void loadPage({ includeTotal:nextQuery.length === 0, scroll:false });
      }, SEARCH_DEBOUNCE_MS);
    });

    // On phones, prescriptions already have a dedicated lightweight page.
    // Column/form controls are hidden by the mobile filter UI and must not wake
    // the full registry renderer just because a legacy control receives a click.
    document.getElementById('protocolsBtn')?.addEventListener('click', event => {
      if (state.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign('/recetat.html');
    }, true);
  }

  function renderRows(rows) {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr class="mobile-lite-empty-row"><td><div class="mobile-lite-empty"><strong>Asnjë bar nuk u gjet.</strong><span>Ndrysho kërkimin ose pastro filtrin.</span></div></td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const id = escapeHtml(row.id);
      const meta = [row.atc, row.strength, row.form].map(clean).filter(Boolean).join(' · ');
      return `<tr class="mobile-lite-row" data-mobile-lite-row="${id}"><td>
        <article class="mobile-lite-card">
          <button type="button" class="mobile-lite-open" data-mobile-lite-detail="${id}" aria-label="Hap ${escapeHtml(row.tradeName)}">
            <span class="mobile-lite-name">${escapeHtml(row.tradeName || 'Pa emër')}</span>
            <span class="mobile-lite-substance">${escapeHtml(row.activeSubstance || 'Substanca aktive nuk është shënuar')}</span>
            <span class="mobile-lite-meta">${escapeHtml(meta || 'Pa të dhëna shtesë')}</span>
          </button>
          <button type="button" class="mobile-lite-more" data-mobile-lite-detail="${id}">Më shumë</button>
        </article>
      </td></tr>`;
    }).join('');

    tbody.querySelectorAll('[data-mobile-lite-detail]').forEach(control => {
      control.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void openDetail(control.dataset.mobileLiteDetail, control);
      });
    });
  }

  function renderInitialLoadError(message) {
    const tbody = document.getElementById('tbody');
    const pagination = document.getElementById('pagination');
    const badge = document.getElementById('countBadge');
    if (pagination) pagination.innerHTML = '';
    if (badge) {
      badge.textContent = 'Nuk u ngarkua';
      badge.title = clean(message) || 'Lista lightweight nuk u ngarkua.';
    }
    if (!tbody) return;

    tbody.innerHTML = `<tr class="mobile-lite-empty-row"><td><div class="mobile-lite-empty">
      <strong>Lista e barnave nuk u ngarkua.</strong>
      <span>${escapeHtml(clean(message) || 'Kontrollo lidhjen dhe provo përsëri.')}</span>
      <button type="button" class="mobile-lite-more" data-mobile-lite-retry>Riprovo</button>
      <button type="button" class="mobile-lite-full-action" data-mobile-lite-fatal-recovery>Rikuperim i plotë</button>
    </div></td></tr>`;

    tbody.querySelector('[data-mobile-lite-retry]')?.addEventListener('click', () => {
      if (state.loading || state.disabled) return;
      void loadPage({ includeTotal:true, scroll:false });
    });
    tbody.querySelector('[data-mobile-lite-fatal-recovery]')?.addEventListener('click', () => {
      requestFullRegistry('fatal-mobile-lite-recovery', { fatal:true });
    });
  }

  function renderCount() {
    const badge = document.getElementById('countBadge');
    if (!badge) return;
    if (Number.isFinite(state.total)) {
      badge.textContent = `${state.total} barna`;
      badge.title = `Faqja ${state.page}${state.totalPages ? ` nga ${state.totalPages}` : ''}`;
    } else {
      badge.textContent = `Faqja ${state.page}`;
      badge.title = 'Rezultate të ngarkuara nga serveri';
    }
  }

  function renderPagination() {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    const pageLabel = Number.isFinite(state.totalPages)
      ? `Faqja ${state.page} / ${state.totalPages}`
      : `Faqja ${state.page}`;
    pagination.innerHTML = `
      <button type="button" data-mobile-lite-page="prev" ${state.page <= 1 ? 'disabled' : ''}>← Para</button>
      <span class="mobile-lite-page-label">${escapeHtml(pageLabel)}</span>
      <button type="button" data-mobile-lite-page="next" ${state.hasNext ? '' : 'disabled'}>Pas →</button>`;
    pagination.querySelector('[data-mobile-lite-page="prev"]')?.addEventListener('click', () => {
      if (state.page <= 1 || state.loading) return;
      state.page -= 1;
      void loadPage({ includeTotal:false, scroll:true });
    });
    pagination.querySelector('[data-mobile-lite-page="next"]')?.addEventListener('click', () => {
      if (!state.hasNext || state.loading) return;
      state.page += 1;
      void loadPage({ includeTotal:false, scroll:true });
    });
  }

  async function loadPage({ includeTotal = false, scroll = false } = {}) {
    if (state.disabled) return;
    pageController?.abort();
    pageController = new AbortController();
    setBusy(true);
    try {
      const response = await fetch(buildPageUrl({ includeTotal }), {
        credentials:'same-origin',
        cache:'default',
        signal:pageController.signal,
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

      renderRows(payload.rows);
      renderCount();
      renderPagination();
      state.ready = true;
      html.dataset.registryMobileLiteReady = '1';
      html.dataset.registryMobileLiteState = 'ready';
      window.dispatchEvent(new CustomEvent('medindex:mobile-lite-ready', {
        detail:{ page:state.page, pageSize:state.pageSize, total:state.total, source:'neon' }
      }));
      if (scroll) document.getElementById('registryContent')?.scrollIntoView({ block:'start', behavior:'smooth' });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Mobile lightweight registry failed:', error);
      html.dataset.registryMobileLiteState = 'error';
      window.dispatchEvent(new CustomEvent('medindex:mobile-lite-load-error', {
        detail:{ message:String(error?.message || error), initial:!state.ready, owner:'mobile-lite' },
      }));
      if (!state.ready) renderInitialLoadError(error?.message);
      else {
        const badge = document.getElementById('countBadge');
        if (badge) {
          badge.textContent = 'Lidhja dështoi · të dhënat e fundit u ruajtën';
          badge.title = String(error?.message || 'Provo përsëri.');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function ensureDetailDialog() {
    let dialog = document.getElementById('mobileLiteDrugDetail');
    if (dialog) return dialog;
    dialog = document.createElement('div');
    dialog.id = 'mobileLiteDrugDetail';
    dialog.className = 'mobile-lite-detail';
    dialog.hidden = true;
    dialog.innerHTML = `
      <div class="mobile-lite-detail-backdrop" data-mobile-lite-close></div>
      <section class="mobile-lite-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="mobileLiteDetailTitle">
        <div class="mobile-lite-detail-head">
          <h2 id="mobileLiteDetailTitle">Detajet e barit</h2>
          <button type="button" data-mobile-lite-close aria-label="Mbyll">×</button>
        </div>
        <div class="mobile-lite-detail-body" data-mobile-lite-detail-body></div>
      </section>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll('[data-mobile-lite-close]').forEach(control => control.addEventListener('click', closeDetail));
    return dialog;
  }

  function closeDetail() {
    detailController?.abort();
    const dialog = document.getElementById('mobileLiteDrugDetail');
    if (!dialog) return;
    dialog.hidden = true;
    document.body.classList.remove('mobile-lite-detail-open');
  }

  function detailItem(label, value) {
    const text = clean(value);
    if (!text) return '';
    return `<div class="mobile-lite-detail-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd></div>`;
  }

  async function openDetail(id, trigger) {
    if (!id || state.disabled) return;
    const dialog = ensureDetailDialog();
    const body = dialog.querySelector('[data-mobile-lite-detail-body]');
    const title = dialog.querySelector('#mobileLiteDetailTitle');
    if (!body || !title) return;

    dialog.hidden = false;
    document.body.classList.add('mobile-lite-detail-open');
    body.innerHTML = '<div class="mobile-lite-detail-loading">Duke i ngarkuar detajet…</div>';
    detailController?.abort();
    detailController = new AbortController();

    try {
      const params = new URLSearchParams({ view:'registry-detail', id });
      const response = await fetch(`${API}?${params.toString()}`, {
        credentials:'same-origin', cache:'default', signal:detailController.signal, headers:{ Accept:'application/json' }
      });
      if (!response.ok) throw new Error(`Detajet nuk u ngarkuan (${response.status}).`);
      const payload = await response.json();
      const row = payload?.row;
      if (!payload?.ok || !row) throw new Error('Detajet janë të pavlefshme.');

      title.textContent = row.tradeName || 'Detajet e barit';
      body.innerHTML = `
        <div class="mobile-lite-detail-hero">
          <strong>${escapeHtml(row.tradeName || '')}</strong>
          <span>${escapeHtml(row.activeSubstance || '')}</span>
          <small>${escapeHtml([row.atc, row.strength, row.form].map(clean).filter(Boolean).join(' · '))}</small>
        </div>
        <dl class="mobile-lite-detail-list">
          ${detailItem('Klasa', row.drugClass)}
          ${detailItem('Përdorimi', row.use)}
          ${detailItem('Paketimi', row.packaging)}
          ${detailItem('Prodhuesi', row.manufacturer)}
          ${detailItem('Bartësi i autorizimit', row.marketingAuthorizationHolder)}
          ${detailItem('Statusi', row.productStatus)}
          ${detailItem('Çmimi me pakicë', row.retailPrice)}
          ${detailItem('Afati i vlefshmërisë', row.validity)}
        </dl>`;
      window.dispatchEvent(new CustomEvent('medindex:mobile-lite-detail-opened', { detail:{ id, row } }));
      trigger?.setAttribute('aria-expanded', 'true');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      body.innerHTML = `<div class="mobile-lite-detail-error">${escapeHtml(error?.message || 'Detajet nuk u ngarkuan.')}</div>`;
    }
  }

  function start() {
    if (state.disabled) return;
    configureMobileControls();
    void loadPage({ includeTotal:true, scroll:false });
  }

  function waitForAuth() {
    if (authReady()) {
      start();
      return;
    }
    authObserver = new MutationObserver(() => {
      if (!authReady()) return;
      authObserver?.disconnect();
      start();
    });
    authObserver.observe(html, { attributes:true, attributeFilter:['class'] });
  }

  window.MEDINDEX_MOBILE_LITE = {
    version:VERSION,
    reload:() => loadPage({ includeTotal:true, scroll:false }),
    handoff:requestFullRegistry,
    getState:() => ({ ...state }),
  };

  media.addEventListener?.('change', event => {
    if (!event.matches && !state.disabled) requestFullRegistry('viewport-desktop');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForAuth, { once:true });
  else waitForAuth();
})();