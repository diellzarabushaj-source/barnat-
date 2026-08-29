/* Dozologjia V3 — one runtime, Stripe clinical workbench, server-calculated pediatric flow. */

(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);

  async function authJson(url = '/api/auth', options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials:'same-origin',
        cache:'no-store',
        ...options,
        signal:controller.signal,
        headers:{ Accept:'application/json', ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally { clearTimeout(timer); }
  }

  function redirectToLogin() {
    const target = new URL('/landing.html', location.origin);
    target.searchParams.set('return', location.pathname + location.search + location.hash);
    location.replace(target.pathname + target.search);
  }

  async function ensureAuth() {
    const { response, payload } = await authJson();
    if (response.status === 401 || response.status === 403 || (response.ok && payload.authenticated === false)) {
      redirectToLogin();
      throw new Error('Sesioni nuk është aktiv.');
    }
    if (!response.ok || payload.authenticated !== true) throw new Error('Sesioni nuk mund të verifikohet.');
    return payload;
  }

  function loadRuntime(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute(marker, '1');
      script.addEventListener('load', resolve, { once:true });
      script.addEventListener('error', reject, { once:true });
      document.head.appendChild(script);
    });
  }

  function loadSharedSidebarTaxonomy() {
    return loadRuntime('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v3', 'data-drx-sidebar-taxonomy');
  }

  async function syncProfile(payload) {
    await loadRuntime('/medindex-brand-runtime.js?v=drx-brand-v5', 'data-drx-profile-runtime').catch(() => null);
    window.MedIndexProfile?.adoptAccount?.(payload);
    window.dispatchEvent(new CustomEvent('medindex:auth-ready', { detail:payload }));
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = false;
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('is-open');
    const backdrop = $('#sidebarBackdrop');
    if (backdrop) backdrop.hidden = true;
  }

  async function logout() {
    const button = $('#logoutButton');
    if (button) button.disabled = true;
    try {
      const { response } = await authJson('/api/auth', { method:'DELETE' });
      if (!response.ok) throw new Error('Dalja nuk u krye.');
      location.replace('/landing.html');
    } catch {
      if (button) button.disabled = false;
    }
  }

  function bindShell() {
    void loadSharedSidebarTaxonomy();
    $('#menuButton')?.addEventListener('click', openSidebar);
    $('#sidebarClose')?.addEventListener('click', closeSidebar);
    $('#sidebarBackdrop')?.addEventListener('click', closeSidebar);
    $('#logoutButton')?.addEventListener('click', logout);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeSidebar();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
          && !event.target.closest('input,select,textarea')) {
        event.preventDefault();
        $('#dosageSearch')?.focus();
      }
    });
  }

  async function boot() {
    bindShell();
    try {
      const auth = await ensureAuth();
      await syncProfile(auth);
      document.documentElement.dataset.theme = 'light';
      if ($('#syncText')) $('#syncText').textContent = 'Supabase';
      if ($('#sourceStatus')) $('#sourceStatus').textContent = 'Dozologjia pediatrike · Supabase';
      if ($('#dosageRuntimeLabel')) $('#dosageRuntimeLabel').textContent = 'Server-side';
      if ($('#dosageRuntimeDetail')) $('#dosageRuntimeDetail').textContent = 'Supabase · fail-closed';
    } catch {
      return;
    } finally {
      $('#appShell')?.setAttribute('aria-busy', 'false');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else void boot();

  window.DRxDosageShell = Object.freeze({ loadSharedSidebarTaxonomy, ensureAuth });
})();

(() => {
  'use strict';

  /* Dozologjia V3 client.
   * Browser-i kërkon, validon vetëm praninë/formatin e inputit dhe renderon.
   * Asnjë dozë, kufi, përqendrim ose indikacion nuk llogaritet/inferohet këtu.
   */
  const OWNER_FLAG = 'server-v3';
  document.documentElement.dataset.pediatricCalculator = OWNER_FLAG;

  const SEARCH_DEBOUNCE_MS = 180;
  const REQUEST_TIMEOUT_MS = 9000;
  const MIN_QUERY = 2;
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  const READINESS_LABEL = Object.freeze({
    CALCULATOR_READY:'Llogaritet',
    TEXT_ONLY:'Vetëm tekst',
    NOT_RECOMMENDED:'Nuk rekomandohet',
    CONTRAINDICATED:'Kundërindikuar',
    INSUFFICIENT_DATA:'Pa të dhëna',
  });

  const FILTER_LABEL = Object.freeze({
    all:'Të gjitha',
    ready:'Llogaritet',
    text:'Vetëm tekst',
    blocked:'Bllokuar',
  });

  const state = {
    query:'',
    results:[],
    facets:{ all:0, ready:0, text:0, blocked:0 },
    filter:'all',
    formFilter:'',
    product:null,
    calculation:null,
    selectedDrugId:'',
    searchToken:0,
    productToken:0,
    calculationToken:0,
    searchController:null,
    productController:null,
    calculationController:null,
    pendingCalculation:false,
    lastCopyText:'',
  };

  const elements = {};

  function cacheElements() {
    elements.search = $('#dosageSearch');
    elements.searchClear = $('#dosageSearchClear');
    elements.list = $('#dosageList');
    elements.status = $('#dosageStatus');
    elements.count = $('#dosageCount');
    elements.filters = [...document.querySelectorAll('[data-readiness-filter]')];
    elements.formFilter = $('#dosageFormFilter');
    elements.facetAll = $('#dosageFacetAll');
    elements.facetReady = $('#dosageFacetReady');
    elements.facetText = $('#dosageFacetText');
    elements.facetBlocked = $('#dosageFacetBlocked');
    elements.productPanel = $('#dosageProductPanel');
    elements.productEmpty = $('#dosageProductEmpty');
    elements.productBody = $('#dosageProductBody');
    elements.patientPanel = $('#pediatricInputs');
    elements.hint = $('#pediatricInputsHint');
    elements.patientState = $('#dosagePatientState');
    elements.patientActionHint = $('#dosagePatientActionHint');
    elements.weight = $('#patientWeightKg');
    elements.age = $('#patientAgeMonths');
    elements.ageUnit = $('#patientAgeUnit');
    elements.height = $('#patientHeightCm');
    elements.calculate = $('#pediatricCalculate');
    elements.calculationPanel = $('#dosageCalculationPanel');
    elements.calculationBody = $('#dosageCalculationBody');
    elements.copy = $('#dosageCopyResult');
    return Boolean(
      elements.search && elements.list && elements.status && elements.productBody
      && elements.patientPanel && elements.calculationBody
    );
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }

  function setStatus(message, tone = '') {
    if (!elements.status) return;
    elements.status.textContent = message;
    if (tone) elements.status.dataset.tone = tone;
    else delete elements.status.dataset.tone;
  }

  function effectiveReadiness(item) {
    if (typeof item === 'string') return item;
    if (item?.readiness === 'CALCULATOR_READY' && item?.calculable !== true) return 'INSUFFICIENT_DATA';
    return item?.readiness || 'INSUFFICIENT_DATA';
  }

  function normalizeReadinessGroup(item) {
    const readiness = effectiveReadiness(item);
    if (item?.calculable === true && readiness === 'CALCULATOR_READY') return 'ready';
    if (readiness === 'TEXT_ONLY') return 'text';
    return 'blocked';
  }

  function readinessBadge(readiness) {
    const badge = element('span', 'pediatric-badge', READINESS_LABEL[readiness] || readiness || 'Pa status');
    badge.dataset.readiness = readiness || 'INSUFFICIENT_DATA';
    return badge;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value ?? '');
    return new Intl.NumberFormat('sq-AL', { maximumFractionDigits:3 }).format(number);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return new Intl.DateTimeFormat('sq-AL', { year:'numeric', month:'short', day:'2-digit' }).format(date);
  }

  /* Vetëm https vlen si burim klinik, njësoj si `validHttps` te
     `lib/dose-calculator-handler.js`. Serveri e heq tashmë çdo burim jo-https
     para se ta kthejë; klienti nuk guxon ta ulë atë prag për rrugët e tjera
     që përfundojnë në të njëjtin bllok burimi. */
  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  async function requestJson(url, options = {}) {
    const controller = new AbortController();
    const upstream = options.signal;
    const abortFromUpstream = () => controller.abort();
    if (upstream) {
      if (upstream.aborted) controller.abort();
      else upstream.addEventListener('abort', abortFromUpstream, { once:true });
    }

    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs || REQUEST_TIMEOUT_MS);
    try {
      const { signal:_ignoredSignal, timeoutMs:_ignoredTimeout, ...fetchOptions } = options;
      const response = await fetch(url, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json', ...(fetchOptions.body ? { 'Content-Type':'application/json' } : {}) },
        ...fetchOptions,
        signal:controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        const target = new URL('/landing.html', location.origin);
        target.searchParams.set('return', location.pathname + location.search);
        location.replace(target.pathname + target.search);
        throw new Error('Sesioni ka skaduar.');
      }
      if (response.status === 429) throw new Error('Shumë kërkesa njëherësh. Provo përsëri pas pak.');
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Kërkesa dështoi (${response.status}).`);
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError' && timedOut && !upstream?.aborted) {
        throw new Error('Kërkesa zgjati shumë. Kontrollo lidhjen dhe provo përsëri.');
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
      if (upstream) upstream.removeEventListener('abort', abortFromUpstream);
    }
  }

  function abortController(key) {
    state[key]?.abort?.();
    const controller = new AbortController();
    state[key] = controller;
    return controller;
  }

  function updateSearchChrome() {
    const hasValue = Boolean(state.query);
    elements.searchClear.hidden = !hasValue;
    elements.search.closest('.dosage-search-field')?.classList.toggle('has-value', hasValue);
  }

  function updateFacets(facets = null) {
    const next = facets || state.results.reduce((acc, item) => {
      const group = normalizeReadinessGroup(item);
      acc.all += 1;
      acc[group] += 1;
      return acc;
    }, { all:0, ready:0, text:0, blocked:0 });
    state.facets = {
      all:Number(next.all) || 0,
      ready:Number(next.ready) || 0,
      text:Number(next.text) || 0,
      blocked:Number(next.blocked) || 0,
    };
    if (elements.facetAll) elements.facetAll.textContent = String(state.facets.all);
    if (elements.facetReady) elements.facetReady.textContent = String(state.facets.ready);
    if (elements.facetText) elements.facetText.textContent = String(state.facets.text);
    if (elements.facetBlocked) elements.facetBlocked.textContent = String(state.facets.blocked);
  }

  function visibleResults() {
    return state.results.filter(item => {
      const readinessMatch = state.filter === 'all'
        || normalizeReadinessGroup(item) === state.filter;
      const formMatch = !state.formFilter || text(item.form) === state.formFilter;
      return readinessMatch && formMatch;
    });
  }

  function updateFormOptions() {
    const select = elements.formFilter;
    if (!select) return;
    const previous = state.formFilter;
    const forms = [...new Set(state.results.map(item => text(item.form)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'sq'));

    select.textContent = '';
    const all = element('option', null, 'Të gjitha format');
    all.value = '';
    select.append(all);
    for (const form of forms) {
      const option = element('option', null, form);
      option.value = form;
      select.append(option);
    }

    state.formFilter = forms.includes(previous) ? previous : '';
    select.value = state.formFilter;
  }

  function setFormFilter(value) {
    state.formFilter = text(value);
    renderResults();
    const visible = visibleResults().length;
    const formLabel = state.formFilter || 'Të gjitha format';
    setStatus(state.query
      ? `${visible} nga ${state.results.length} rezultate · ${formLabel}`
      : 'Shkruaj së paku dy shkronja për të kërkuar.');
  }

  function setFilter(filter) {
    if (!FILTER_LABEL[filter]) return;
    state.filter = filter;
    for (const button of elements.filters) {
      const active = button.dataset.readinessFilter === filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    renderResults();
    const visible = visibleResults().length;
    setStatus(state.query
      ? `${visible} nga ${state.results.length} rezultate · ${FILTER_LABEL[filter]}`
      : 'Shkruaj së paku dy shkronja për të kërkuar.');
  }

  function renderSearchSkeleton() {
    elements.list.textContent = '';
    const wrap = element('div', 'dosage-skeleton');
    for (let index = 0; index < 5; index += 1) {
      const row = element('div', 'dosage-skeleton-row');
      row.append(element('i'), element('i'));
      wrap.append(row);
    }
    elements.list.append(wrap);
  }

  function renderListError(message) {
    elements.list.textContent = '';
    const block = element('div', 'dosage-list-error');
    block.append(element('strong', null, 'Katalogu nuk u lexua.'));
    block.append(element('span', null, message || 'Kontrollo lidhjen dhe provo përsëri.'));
    const retry = element('button', 'dosage-list-retry', 'Provo përsëri');
    retry.type = 'button';
    retry.dataset.action = 'retry-search';
    block.append(retry);
    elements.list.append(block);
  }

  function renderResults() {
    const list = elements.list;
    list.textContent = '';
    list.dataset.pediatricView = 'search';
    const results = visibleResults();
    if (elements.count) elements.count.textContent = String(results.length);

    if (state.query.length < MIN_QUERY) {
      list.append(element('p', 'pediatric-empty', 'Kërko me emër, substancë, ATC, fortësi ose formë farmaceutike.'));
      return;
    }
    if (!state.results.length) {
      list.append(element('p', 'pediatric-empty', 'Asnjë bar nuk përputhet me këtë kërkim.'));
      return;
    }
    if (!results.length) {
      list.append(element('p', 'pediatric-empty', `Nuk ka rezultate në filtrin “${FILTER_LABEL[state.filter]}”.`));
      return;
    }

    const group = element('ul', 'pediatric-result-list');
    group.setAttribute('aria-label', 'Rezultatet e kërkimit');
    for (const item of results) {
      const row = element('li', 'pediatric-result-item');
      const button = element('button', 'pediatric-result-button');
      button.type = 'button';
      button.dataset.drugId = item.drugId;
      button.setAttribute('aria-pressed', item.drugId === state.selectedDrugId ? 'true' : 'false');
      button.classList.toggle('is-selected', item.drugId === state.selectedDrugId);

      const heading = element('span', 'pediatric-result-name', item.name || '(pa emër)');
      const meta = element('span', 'pediatric-result-meta',
        [item.substance, item.strength, item.form].filter(Boolean).join(' · '));
      const detail = element('span', 'pediatric-result-detail');
      if (item.atcCode) detail.append(element('code', null, item.atcCode));
      const readiness = effectiveReadiness(item);
      const context = item.readiness === 'CALCULATOR_READY' && item.calculable !== true
        ? 'Regjimi primar nuk është verifikuar për kalkulim.'
        : (item.indication || item.summary || item.useStatus);
      if (context) detail.append(element('span', null, context));

      button.append(heading, meta, readinessBadge(readiness), detail);
      button.setAttribute('aria-label',
        `${item.name || 'Bar'}. ${READINESS_LABEL[readiness] || readiness}.`);
      row.append(button);
      group.append(row);
    }
    list.append(group);
  }

  function syncUrl() {
    try {
      const url = new URL(location.href);
      if (state.query.length >= MIN_QUERY) url.searchParams.set('q', state.query);
      else url.searchParams.delete('q');
      if (state.selectedDrugId) url.searchParams.set('drug', state.selectedDrugId);
      else url.searchParams.delete('drug');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch {}
  }

  async function runSearch(rawQuery) {
    const query = text(rawQuery);
    const token = ++state.searchToken;
    state.query = query;
    updateSearchChrome();
    syncUrl();

    if (query.length < MIN_QUERY) {
      state.searchController?.abort?.();
      state.results = [];
      updateFacets({ all:0, ready:0, text:0, blocked:0 });
      updateFormOptions();
      renderResults();
      setStatus('Shkruaj së paku dy shkronja për të kërkuar.');
      return;
    }

    const controller = abortController('searchController');
    renderSearchSkeleton();
    setStatus('Duke kërkuar në katalog…');

    try {
      const payload = await requestJson(
        `/api/dosage/search?q=${encodeURIComponent(query)}&limit=50`,
        { signal:controller.signal },
      );
      if (token !== state.searchToken || controller.signal.aborted) return;
      state.results = Array.isArray(payload.results) ? payload.results : [];
      updateFacets(payload.facets);
      updateFormOptions();
      renderResults();
      setStatus(
        state.results.length
          ? `${state.results.length} rezultate · zgjidh një bar për të parë regjimin.`
          : 'Asnjë bar nuk përputhet.',
        state.results.length ? 'success' : '',
      );
    } catch (error) {
      if (error?.name === 'AbortError' || token !== state.searchToken) return;
      state.results = [];
      updateFacets({ all:0, ready:0, text:0, blocked:0 });
      updateFormOptions();
      renderListError(error.message);
      setStatus(error.message, 'error');
    }
  }

  function sourceBlock(source) {
    const block = element('p', 'pediatric-source');
    const url = safeExternalUrl(source?.url);
    if (url) {
      const link = element('a', null, source.section || 'Burimi klinik');
      link.href = url;
      link.rel = 'noreferrer noopener';
      link.target = '_blank';
      block.append('Burimi: ', link);
    } else {
      block.append('Burimi klinik nuk është i regjistruar me URL.');
    }
    /* Vula «Verifikuar» varet nga burimi që e mban. Pa një URL https të
       lidhur, data e verifikimit nuk provohet dot nga faqja, prandaj nuk
       shfaqet — një datë pa burim lexohet si siguri që nuk ekziston. */
    const verified = url ? formatDate(source?.verifiedAt) : '';
    if (verified) block.append(` · Verifikuar: ${verified}`);
    return block;
  }

  function productFact(label, value) {
    const item = element('div', 'dosage-product-fact');
    item.append(element('span', null, label));
    item.append(element('strong', null, value || '—'));
    return item;
  }

  function calculationContext(product) {
    const binding = product?.calculationRegimen;
    if (!binding?.valid) return null;

    const card = element('div', 'pediatric-calculation-context');
    card.dataset.calculationContext = 'primary';
    card.append(element('strong', null, 'Regjimi për llogaritje'));
    card.append(element('p', 'pediatric-calculation-indication', binding.indication || 'Indikacion i lidhur'));

    const linked = (product.textRegimens || []).find(item => item.sourceKey === binding.selectionId);
    const routeAndSchedule = [binding.route || linked?.route, linked?.frequency, linked?.duration].filter(Boolean).join(' · ');
    if (routeAndSchedule) card.append(element('p', 'pediatric-text-meta', routeAndSchedule));
    if (linked?.dose) card.append(element('p', 'pediatric-regimen-dose', linked.dose));
    if (linked?.maximum) card.append(element('p', 'pediatric-text-meta', `Maksimumi: ${linked.maximum}`));
    if (linked?.warnings) card.append(element('p', 'pediatric-warning', linked.warnings));
    return card;
  }

  function informationalRegimens(product) {
    const primaryKey = product.calculationRegimen?.selectionId || '';
    const alternates = (product.textRegimens || []).filter(item => item.sourceKey !== primaryKey);
    if (!alternates.length) return null;

    const details = element('details', 'pediatric-informational-wrap');
    const summary = element('summary', null, `Regjime të tjera informuese (${alternates.length})`);
    details.append(summary);

    for (const regimen of alternates) {
      const card = element('div', 'pediatric-text-regimen');
      card.append(element('strong', null, regimen.indication || 'Regjim pediatrik informues'));
      if (regimen.dose) card.append(element('p', null, regimen.dose));
      const line = [regimen.route, regimen.frequency, regimen.duration].filter(Boolean).join(' · ');
      if (line) card.append(element('p', 'pediatric-text-meta', line));
      if (regimen.maximum) card.append(element('p', 'pediatric-text-meta', `Maksimumi: ${regimen.maximum}`));
      if (regimen.warnings) card.append(element('p', 'pediatric-warning', regimen.warnings));
      details.append(card);
    }
    return details;
  }

  function productSchedule(product) {
    const regimen = product?.regimen || {};
    if (regimen.intervalHours) return `çdo ${formatNumber(regimen.intervalHours)} orë`;
    if (regimen.dosesPerDay) return `${formatNumber(regimen.dosesPerDay)}×/ditë`;
    return '';
  }

  function renderProduct() {
    const product = state.product;
    const body = elements.productBody;
    body.textContent = '';
    elements.productEmpty.hidden = true;
    body.hidden = false;

    const header = element('div', 'pediatric-product-header');
    const identity = element('div');
    const titleRow = element('div', 'pediatric-product-title-row');
    titleRow.append(element('h2', 'pediatric-product-name', product.name || '(pa emër)'), readinessBadge(effectiveReadiness(product)));
    identity.append(titleRow);
    identity.append(element('p', 'pediatric-product-meta',
      [product.substance, product.strength, product.form].filter(Boolean).join(' · ')));
    const codes = element('div', 'pediatric-product-codes');
    if (product.atcCode) codes.append(element('code', null, product.atcCode));
    if (product.registryNumber) codes.append(element('span', null, `Reg. #${product.registryNumber}`));
    if (product.pdid) codes.append(element('span', null, product.pdid));
    identity.append(codes);

    const back = element('button', 'pediatric-back-button', 'Mbyll detajin');
    back.type = 'button';
    back.dataset.action = 'close-product';
    header.append(identity, back);
    body.append(header);

    if (product.summary) body.append(element('p', 'pediatric-product-summary', product.summary));

    const regimen = product.regimen || {};
    const facts = element('div', 'dosage-product-facts');
    facts.append(
      productFact('Indikacioni', product.calculationRegimen?.indication || regimen.indication || '—'),
      productFact('Rruga', product.calculationRegimen?.route || regimen.route || '—'),
      productFact('Baza', regimen.basis || '—'),
      productFact('Orari', productSchedule(product) || 'Sipas burimit'),
    );
    body.append(facts);

    if (product.restriction) body.append(element('p', 'pediatric-restriction', product.restriction));
    for (const warning of product.warnings || []) {
      if (warning && warning !== product.restriction) body.append(element('p', 'pediatric-warning', warning));
    }

    const context = calculationContext(product);
    if (context) body.append(context);

    if (!product.calculable) {
      const blocked = element('div', 'pediatric-not-calculable');
      blocked.append(element('strong', null, 'Llogaritja automatike është e bllokuar.'));
      const reasons = element('ul', 'pediatric-reason-list');
      for (const reason of product.reasons || []) reasons.append(element('li', null, reason));
      if (!product.reasons?.length && product.missing?.length) {
        reasons.append(element('li', null, `Mungojnë fusha typed: ${product.missing.join(', ')}.`));
      }
      blocked.append(reasons);
      body.append(blocked);
    }

    const alternates = informationalRegimens(product);
    if (alternates) body.append(alternates);
    body.append(sourceBlock(product.source));

    if (product.calculable) {
      applyPatientFields(product.requires);
      const indication = product.calculationRegimen?.indication;
      elements.hint.textContent = indication
        ? `Regjimi është lidhur me “${indication}”. Plotëso vetëm fushat e kërkuara.`
        : 'Plotëso vetëm fushat që kërkon formula e verifikuar.';
      setStatus('Bari u hap. Plotëso parametrat e pacientit.', 'success');
    } else {
      disablePatientPanel('Ky regjim nuk kalon portat për llogaritje automatike.');
      setStatus('Bari u hap vetëm për informacion; kalkulatori mbetet i bllokuar.');
    }
  }

  function renderProductLoading() {
    elements.productEmpty.hidden = true;
    elements.productBody.hidden = false;
    elements.productBody.textContent = '';
    const wrap = element('div', 'dosage-skeleton');
    for (let index = 0; index < 4; index += 1) {
      const row = element('div', 'dosage-skeleton-row');
      row.append(element('i'), element('i'));
      wrap.append(row);
    }
    elements.productBody.append(wrap);
  }

  function renderProductError(message) {
    elements.productEmpty.hidden = true;
    elements.productBody.hidden = false;
    elements.productBody.textContent = '';
    const block = element('div', 'dosage-list-error');
    block.append(element('strong', null, 'Detaji nuk u hap.'));
    block.append(element('span', null, message));
    const retry = element('button', 'dosage-list-retry', 'Provo përsëri');
    retry.type = 'button';
    retry.dataset.action = 'retry-product';
    block.append(retry);
    elements.productBody.append(block);
  }

  function resetCalculation(message = 'Rezultati, kufijtë, paralajmërimet dhe burimi do të shfaqen këtu.') {
    state.calculation = null;
    state.lastCopyText = '';
    elements.copy.hidden = true;
    elements.calculationBody.textContent = '';
    const empty = element('div', 'dosage-result-empty');
    empty.append(element('strong', null, 'Ende pa llogaritje'));
    empty.append(element('span', null, message));
    elements.calculationBody.append(empty);
  }

  function clearFieldErrors() {
    elements.patientPanel.querySelectorAll('[data-field-error]').forEach(node => { node.textContent = ''; });
    for (const input of [elements.weight, elements.age, elements.height]) input?.removeAttribute('aria-invalid');
  }

  function disablePatientPanel(message) {
    elements.patientPanel.classList.add('is-disabled');
    elements.patientPanel.querySelectorAll('[data-patient-field]').forEach(label => {
      label.hidden = true;
      const input = label.querySelector('input, select');
      if (input) input.disabled = true;
    });
    clearFieldErrors();
    elements.calculate.hidden = true;
    elements.calculate.disabled = true;
    elements.patientState.textContent = 'Në pritje';
    elements.patientState.className = 'dosage-step-state';
    elements.hint.textContent = message || 'Zgjidh një bar të llogaritshëm për të aktivizuar fushat.';
  }

  function applyPatientFields(requires) {
    const wanted = {
      weight:Boolean(requires?.weight),
      age:Boolean(requires?.age),
      'age-unit':Boolean(requires?.age),
      height:Boolean(requires?.height),
    };
    elements.patientPanel.classList.remove('is-disabled');
    for (const [field, visible] of Object.entries(wanted)) {
      const label = elements.patientPanel.querySelector(`[data-patient-field="${field}"]`);
      if (!label) continue;
      label.hidden = !visible;
      const input = label.querySelector('input, select');
      if (input) input.disabled = !visible;
    }
    elements.calculate.hidden = false;
    elements.patientState.textContent = 'Plotëso fushat';
    elements.patientState.className = 'dosage-step-state is-ready';
    validatePatientFields();
  }

  function fieldError(name, message) {
    const node = elements.patientPanel.querySelector(`[data-field-error="${name}"]`);
    const input = name === 'weight' ? elements.weight : name === 'age' ? elements.age : elements.height;
    if (node) node.textContent = message || '';
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function validatePatientFields({ showErrors = false } = {}) {
    const requires = state.product?.requires || {};
    let valid = Boolean(state.product?.calculable);

    if (requires.weight) {
      const value = Number(elements.weight.value);
      const error = !Number.isFinite(value) || value <= 0
        ? 'Shkruaj peshën.'
        : value > 300 ? 'Kontrollo peshën.' : '';
      if (showErrors || elements.weight.value) fieldError('weight', error); else fieldError('weight', '');
      if (error) valid = false;
    } else fieldError('weight', '');

    if (requires.age) {
      const value = Number(elements.age.value);
      const error = !Number.isFinite(value) || value < 0 ? 'Shkruaj moshën.' : '';
      if (showErrors || elements.age.value) fieldError('age', error); else fieldError('age', '');
      if (error) valid = false;
    } else fieldError('age', '');

    if (requires.height) {
      const value = Number(elements.height.value);
      const error = !Number.isFinite(value) || value < 20
        ? 'Shkruaj gjatësinë.'
        : value > 250 ? 'Kontrollo gjatësinë.' : '';
      if (showErrors || elements.height.value) fieldError('height', error); else fieldError('height', '');
      if (error) valid = false;
    } else fieldError('height', '');

    elements.calculate.disabled = !valid || state.pendingCalculation;
    elements.patientState.textContent = valid ? 'Gati' : 'Plotëso fushat';
    elements.patientState.className = valid ? 'dosage-step-state is-valid' : 'dosage-step-state is-ready';
    return valid;
  }

  function patientPayload() {
    const requires = state.product?.requires || {};
    const weight = Number(elements.weight?.value);
    const height = Number(elements.height?.value);
    const age = Number(elements.age?.value);
    const payload = { drugId:state.product?.drugId };
    if (requires.weight && Number.isFinite(weight) && weight > 0) payload.weightKg = weight;
    if (requires.height && Number.isFinite(height) && height > 0) payload.heightCm = height;
    if (requires.age && Number.isFinite(age) && age >= 0) {
      payload.age = { value:age, unit:elements.ageUnit?.value || 'muaj' };
    }
    const selectionId = state.product?.calculationRegimen?.selectionId;
    if (selectionId) payload.regimenId = selectionId;
    return payload;
  }

  function amountText(range, unit) {
    if (!range || range.min === null || range.min === undefined) return '';
    const suffix = unit ? ` ${unit}` : '';
    const min = formatNumber(range.min);
    if (range.max === null || range.max === undefined || Number(range.max) === Number(range.min)) return `${min}${suffix}`;
    return `${min}–${formatNumber(range.max)}${suffix}`;
  }

  function calculationFact(label, value) {
    const fact = element('div', 'dosage-calculation-fact');
    fact.append(element('span', null, label), element('strong', null, value || '—'));
    return fact;
  }

  function buildCopyText(calculation) {
    if (!calculation || calculation.outcome !== 'CALCULATED') return '';
    const unit = calculation.doseUnit || '';
    const dose = calculation.isRate
      ? amountText(calculation.ratePerHour, `${unit}/orë`)
      : amountText(calculation.perDose, unit);
    const lines = [
      calculation.drug?.name,
      calculation.indication ? `Indikacioni: ${calculation.indication}` : '',
      dose ? `Doza: ${dose}` : '',
      calculation.measure?.min ? `Vëllimi: ${amountText({ min:calculation.measure.min.amount, max:calculation.measure.max?.amount }, calculation.measure.min.unit)}` : '',
      calculation.dosesPerDay ? `Frekuenca: ${formatNumber(calculation.dosesPerDay)} herë/ditë` : '',
      calculation.daily?.min !== null && calculation.daily?.min !== undefined ? `Totali ditor: ${amountText(calculation.daily, unit)}` : '',
      calculation.route ? `Rruga: ${calculation.route}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  }

  function renderOutcomeBlock(calculation) {
    const danger = calculation.outcome === 'OUT_OF_RANGE' || calculation.outcome === 'NOT_CALCULABLE';
    const block = element('div', `dosage-outcome-block${danger ? ' is-danger' : ''}`);
    const title = calculation.outcome === 'NEEDS_PATIENT_DATA'
      ? 'Mungojnë të dhënat e pacientit.'
      : calculation.outcome === 'OUT_OF_RANGE'
        ? 'Pacienti është jashtë kufijve të skemës.'
        : 'Ky regjim nuk llogaritet.';
    block.append(element('strong', null, title));

    const details = [...(calculation.reasons || [])];
    if (calculation.outcome === 'NEEDS_PATIENT_DATA' && calculation.missing?.length) {
      details.push(`Plotëso: ${calculation.missing.join(', ')}.`);
    }
    for (const message of details) block.append(element('p', null, message));
    for (const warning of calculation.warnings || []) block.append(element('p', null, warning));
    elements.calculationBody.append(block);
  }

  function renderCalculation(calculation) {
    elements.calculationBody.textContent = '';
    elements.copy.hidden = true;

    if (calculation.outcome !== 'CALCULATED') {
      renderOutcomeBlock(calculation);
      setStatus(calculation.outcome === 'NEEDS_PATIENT_DATA'
        ? 'Plotëso të dhënat që mungojnë.'
        : 'Llogaritja u ndal nga porta klinike.', calculation.outcome === 'NEEDS_PATIENT_DATA' ? '' : 'error');
      return;
    }

    const block = element('section', 'pediatric-calculation');
    block.setAttribute('aria-label', 'Rezultati i llogaritjes');
    const unit = calculation.doseUnit || '';

    if (calculation.indication) block.append(element('p', 'pediatric-kicker', calculation.indication));
    if (calculation.isRate) {
      block.append(element('p', 'pediatric-dose-primary', amountText(calculation.ratePerHour, `${unit}/orë`)));
      block.append(element('p', 'pediatric-dose-secondary', 'infuzion i vazhdueshëm'));
    } else {
      block.append(element('p', 'pediatric-dose-primary', amountText(calculation.perDose, unit)));
      block.append(element('p', 'pediatric-dose-secondary',
        `për dozë${calculation.dosesPerDay ? ` · ${formatNumber(calculation.dosesPerDay)} herë në ditë` : ''}`));
    }

    if (calculation.measure?.min) {
      block.append(element('p', 'pediatric-dose-measure',
        amountText(
          { min:calculation.measure.min.amount, max:calculation.measure.max?.amount },
          calculation.measure.min.unit,
        )));
    }

    const facts = element('div', 'dosage-calculation-facts');
    facts.append(
      calculationFact('Rruga', calculation.route || '—'),
      calculationFact('Frekuenca', calculation.dosesPerDay ? `${formatNumber(calculation.dosesPerDay)}×/ditë` : 'Sipas regjimit'),
      calculationFact('Totali ditor', calculation.daily?.min !== null && calculation.daily?.min !== undefined
        ? amountText(calculation.daily, unit) : '—'),
    );
    block.append(facts);

    for (const warning of calculation.warnings || []) block.append(element('p', 'pediatric-warning', warning));

    if (calculation.steps?.length) {
      const details = element('details', 'pediatric-explain');
      details.append(element('summary', null, 'Si u llogarit?'));
      const table = element('dl', 'pediatric-explain-list');
      for (const step of calculation.steps) {
        table.append(element('dt', null, step.label));
        table.append(element('dd', null, `${formatNumber(step.value)}${step.unit ? ` ${step.unit}` : ''}`));
      }
      details.append(table);
      block.append(details);
    }

    block.append(sourceBlock(calculation.source));
    elements.calculationBody.append(block);
    state.lastCopyText = buildCopyText(calculation);
    elements.copy.hidden = !state.lastCopyText;
    setStatus('Doza u llogarit nga serveri për regjimin e lidhur.', 'success');
  }

  function invalidateCalculation() {
    if (!state.calculation) return;
    state.calculation = null;
    state.lastCopyText = '';
    elements.copy.hidden = true;
    resetCalculation('Të dhënat e pacientit ndryshuan. Llogarit përsëri për një rezultat të ri.');
  }

  async function calculateDose() {
    if (state.pendingCalculation || !state.product?.calculable) return;
    if (!validatePatientFields({ showErrors:true })) {
      setStatus('Plotëso fushat e kërkuara para llogaritjes.', 'error');
      return;
    }

    const token = ++state.calculationToken;
    const controller = abortController('calculationController');
    state.pendingCalculation = true;
    elements.calculate.disabled = true;
    elements.calculate.classList.add('is-loading');
    elements.calculate.querySelector('span').textContent = 'Duke llogaritur…';
    setStatus('Serveri po kontrollon formulën dhe kufijtë…');

    try {
      const payload = await requestJson('/api/dosage/calculate', {
        method:'POST',
        body:JSON.stringify(patientPayload()),
        signal:controller.signal,
      });
      if (token !== state.calculationToken || controller.signal.aborted) return;
      state.calculation = payload.calculation;
      renderCalculation(payload.calculation);
    } catch (error) {
      if (error?.name === 'AbortError' || token !== state.calculationToken) return;
      resetCalculation('Llogaritja nuk u krye. Të dhënat e pacientit janë ruajtur në formular për ta provuar përsëri.');
      setStatus(error.message, 'error');
    } finally {
      if (token === state.calculationToken) {
        state.pendingCalculation = false;
        elements.calculate.classList.remove('is-loading');
        elements.calculate.querySelector('span').textContent = 'Llogarit dozën';
        validatePatientFields();
      }
    }
  }

  async function selectDrug(drugId, { scroll = true } = {}) {
    if (!drugId) return;
    const token = ++state.productToken;
    const controller = abortController('productController');
    state.calculationController?.abort?.();
    state.selectedDrugId = drugId;
    state.product = null;
    state.calculation = null;
    renderResults();
    renderProductLoading();
    disablePatientPanel('Duke verifikuar regjimin dhe formulën…');
    resetCalculation('Rezultati aktivizohet pasi të hapet një regjim i llogaritshëm.');
    syncUrl();
    setStatus('Duke hapur barin…');

    try {
      const payload = await requestJson(
        `/api/dosage/product/${encodeURIComponent(drugId)}`,
        { signal:controller.signal },
      );
      if (token !== state.productToken || controller.signal.aborted) return;
      state.product = payload.product;
      renderProduct();
      if (scroll && window.matchMedia?.('(max-width: 1023px)').matches) {
        requestAnimationFrame(() => elements.productPanel.scrollIntoView({
          block:'start',
          behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        }));
      }
    } catch (error) {
      if (error?.name === 'AbortError' || token !== state.productToken) return;
      renderProductError(error.message);
      disablePatientPanel('Detaji i barit nuk u lexua.');
      setStatus(error.message, 'error');
    }
  }

  function clearSelectedProduct() {
    state.productController?.abort?.();
    state.calculationController?.abort?.();
    state.selectedDrugId = '';
    state.product = null;
    state.calculation = null;
    elements.productBody.textContent = '';
    elements.productBody.hidden = true;
    elements.productEmpty.hidden = false;
    disablePatientPanel('Zgjidh një bar të llogaritshëm për të aktivizuar fushat.');
    resetCalculation();
    renderResults();
    syncUrl();
    elements.search.focus();
  }

  async function copyResult() {
    if (!state.lastCopyText) return;
    const original = elements.copy.textContent;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(state.lastCopyText);
      } else {
        const area = document.createElement('textarea');
        area.value = state.lastCopyText;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      elements.copy.textContent = 'U kopjua';
      window.setTimeout(() => { elements.copy.textContent = original; }, 1400);
    } catch {
      elements.copy.textContent = 'Kopjimi dështoi';
      window.setTimeout(() => { elements.copy.textContent = original; }, 1600);
    }
  }

  function focusAdjacentResult(current, delta) {
    const buttons = [...elements.list.querySelectorAll('[data-drug-id]')];
    const index = buttons.indexOf(current);
    if (index < 0) return;
    const next = buttons[index + delta];
    next?.focus();
  }

  function bindEvents() {
    let searchTimer = 0;
    elements.search.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      state.query = text(elements.search.value);
      updateSearchChrome();
      searchTimer = window.setTimeout(() => runSearch(state.query), SEARCH_DEBOUNCE_MS);
    });

    elements.search.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        const first = elements.list.querySelector('[data-drug-id]');
        if (first) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === 'Escape' && elements.search.value) {
        event.preventDefault();
        elements.search.value = '';
        void runSearch('');
      }
    });

    elements.searchClear.addEventListener('click', () => {
      elements.search.value = '';
      void runSearch('');
      elements.search.focus();
    });

    for (const button of elements.filters) {
      button.addEventListener('click', () => setFilter(button.dataset.readinessFilter));
    }
    elements.formFilter?.addEventListener('change', () => setFormFilter(elements.formFilter.value));

    elements.list.addEventListener('click', event => {
      const choice = event.target.closest('[data-drug-id]');
      if (choice) {
        void selectDrug(choice.dataset.drugId);
        return;
      }
      if (event.target.closest('[data-action="retry-search"]')) void runSearch(state.query);
    });

    elements.list.addEventListener('keydown', event => {
      const current = event.target.closest('[data-drug-id]');
      if (!current) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusAdjacentResult(current, event.key === 'ArrowDown' ? 1 : -1);
      }
    });

    elements.productBody.addEventListener('click', event => {
      if (event.target.closest('[data-action="close-product"]')) {
        clearSelectedProduct();
        return;
      }
      if (event.target.closest('[data-action="retry-product"]') && state.selectedDrugId) {
        void selectDrug(state.selectedDrugId, { scroll:false });
      }
    });

    for (const input of [elements.weight, elements.age, elements.height]) {
      input?.addEventListener('input', () => {
        invalidateCalculation();
        validatePatientFields();
      });
    }
    elements.ageUnit?.addEventListener('change', () => {
      invalidateCalculation();
      validatePatientFields();
    });

    elements.calculate?.addEventListener('click', calculateDose);
    elements.patientPanel?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('input') && !elements.calculate.disabled) {
        event.preventDefault();
        void calculateDose();
      }
    });
    elements.copy?.addEventListener('click', copyResult);
  }

  async function restoreFromUrl() {
    let query = '';
    let drugId = '';
    try {
      const url = new URL(location.href);
      query = text(url.searchParams.get('q'));
      drugId = text(url.searchParams.get('drug'));
    } catch {}

    if (query) {
      elements.search.value = query;
      await runSearch(query);
    } else {
      renderResults();
      updateFacets({ all:0, ready:0, text:0, blocked:0 });
      updateFormOptions();
    }

    if (drugId) await selectDrug(drugId, { scroll:false });
  }

  function init() {
    if (!cacheElements()) {
      delete document.documentElement.dataset.pediatricCalculator;
      return;
    }

    disablePatientPanel('Zgjidh një bar të llogaritshëm për të aktivizuar fushat.');
    resetCalculation();
    updateSearchChrome();
    updateFacets({ all:0, ready:0, text:0, blocked:0 });
    updateFormOptions();
    bindEvents();
    void restoreFromUrl();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
