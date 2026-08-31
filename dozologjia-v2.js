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
    productTab:'summary',
    renderedProductId:'',
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
    elements.indication = $('#patientIndication');
    elements.weight = $('#patientWeightKg');
    elements.age = $('#patientAgeMonths');
    elements.ageUnit = $('#patientAgeUnit');
    elements.height = $('#patientHeightCm');
    elements.crcl = $('#patientCrCl');
    elements.egfr = $('#patientEgfr');
    elements.dialysis = $('#patientDialysisStatus');
    elements.childPugh = $('#patientChildPugh');
    elements.hepaticImpairment = $('#patientHepaticImpairment');
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

  const PRODUCT_TABS = Object.freeze([
    ['summary','Përmbledhje'],
    ['use','Përdorimi'],
    ['dose','Dozimi'],
    ['safety','Siguria'],
    ['products','Produktet'],
    ['notes','Shënime'],
    ['sources','Burime'],
  ]);

  function productEntityKey(product=state.product) {
    return text(product?.drugId);
  }

  function phase9Personal() {
    return window.DRxPhase9Personal || null;
  }

  function personalEntityKey(type,product=state.product) {
    if(type==='product') return text(product?.drugId);
    if(type==='substance') return text(product?.substanceConceptId);
    if(type==='variant') return text(product?.clinicalVariantId);
    return '';
  }

  function personalEntityLabel(type,product=state.product) {
    if(type==='product') return product?.name || 'Produkti';
    if(type==='substance') return product?.substanceCanonicalName || product?.substance || 'Substanca';
    if(type==='variant') return [
      product?.strength,
      product?.form,
      product?.phase9Context?.releaseKey,
      product?.phase9Context?.routeKey,
    ].filter(Boolean).join(' · ') || 'Varianti klinik';
    return type;
  }

  function availablePersonalEntities(product=state.product) {
    return ['product','substance','variant']
      .map(type=>({type,key:personalEntityKey(type,product),label:personalEntityLabel(type,product)}))
      .filter(item=>item.key);
  }

  function populationLabel(product) {
    const explicit=text(product?.populationKey).toUpperCase();
    const labels={
      PEDIATRIC_ONLY:'Vetëm pediatrik',
      ADULT_ONLY:'Vetëm të rritur',
      ADULT_AND_PEDIATRIC:'Pediatrik + të rritur',
      PEDIATRIC_AND_ADULT:'Pediatrik + të rritur',
    };
    if (labels[explicit]) return labels[explicit];
    const raw=text(product?.useStatus);
    if (!raw) return 'Popullata: sipas burimit';
    const key=raw.toLowerCase().replace(/[\s-]+/g,'_');
    return {
      pediatric_only:'Vetëm pediatrik',
      adult_only:'Vetëm të rritur',
      pediatric_and_adult:'Pediatrik + të rritur',
      adult_and_pediatric:'Pediatrik + të rritur',
    }[key] || raw;
  }

  function phase9Badge(label,tone='') {
    const badge=element('span','phase9-context-badge',label);
    if(tone) badge.dataset.tone=tone;
    return badge;
  }

  function phase9Flow(product) {
    const list=element('ol','phase9-clinical-flow');
    list.setAttribute('aria-label','Rrjedha klinike Phase 9');
    const indication=text(product?.calculationRegimen?.indication || product?.regimen?.indication);
    const variantReady=Boolean(product?.clinicalVariantId);
    const variantDetail=variantReady
      ? `Variant kanonik · ${text(product.clinicalVariantId).slice(0,8)}…`
      : product?.variantStatus==='REVIEWED_PILOT_OVERRIDE_NO_CANONICAL_VARIANT_ID'
        ? 'Pilot i review-uar; pa ID kanonik varianti'
        : 'Variant i pazgjidhur';
    const steps=[
      ['Substanca',Boolean(product?.substanceConceptId),product?.substanceCanonicalName || product?.substance || 'Mungon ID kanonik'],
      ['Varianti',variantReady,variantDetail],
      ['Popullata',Boolean(product?.populationKey || product?.useStatus),populationLabel(product)],
      ['Indikacioni',Boolean(indication),indication || 'Kërkohet lidhje klinike'],
      ['Inputet',Boolean(product?.calculable),product?.calculable ? 'Vetëm fushat e kërkuara' : 'Bllokuar nga porta klinike'],
      ['Doza',state.calculation?.outcome==='CALCULATED',state.calculation?.outcome==='CALCULATED' ? 'Llogaritur server-side' : 'Pas inputeve'],
      ['Produkti',Boolean(product?.drugId),product?.name || 'Mungon'],
      ['Receta',state.calculation?.outcome==='CALCULATED',state.calculation?.outcome==='CALCULATED' ? 'Gati për kontekst' : 'Pas rezultatit'],
    ];
    for(const [label,complete,detail] of steps){
      const item=element('li',`phase9-flow-step ${complete ? 'is-complete' : 'is-pending'}`);
      item.append(element('span','phase9-flow-dot',complete ? '✓' : '·'));
      const copy=element('span','phase9-flow-copy');
      copy.append(element('strong',null,label),element('small',null,detail));
      item.append(copy);
      list.append(item);
    }
    return list;
  }

  function setProductTab(tab) {
    if(!PRODUCT_TABS.some(([key])=>key===tab)) return;
    state.productTab=tab;
    for(const button of elements.productBody.querySelectorAll('[data-product-tab]')){
      const active=button.dataset.productTab===tab;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-selected',active ? 'true' : 'false');
      button.tabIndex=active ? 0 : -1;
    }
    for(const panel of elements.productBody.querySelectorAll('[data-product-panel]')){
      panel.hidden=panel.dataset.productPanel!==tab;
    }
  }

  function tabPanel(key) {
    const panel=element('section','phase9-tab-panel');
    panel.dataset.productPanel=key;
    panel.id=`phase9-panel-${key}`;
    panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',`phase9-tab-${key}`);
    return panel;
  }

  function appendBlockedState(panel,product) {
    if(product.calculable) return;
    const blocked=element('div','pediatric-not-calculable');
    blocked.append(element('strong',null,'Llogaritja automatike është e bllokuar.'));
    const reasons=element('ul','pediatric-reason-list');
    for(const reason of product.reasons || []) reasons.append(element('li',null,reason));
    if(!product.reasons?.length && product.missing?.length){
      reasons.append(element('li',null,`Mungojnë fusha typed: ${product.missing.join(', ')}.`));
    }
    blocked.append(reasons);
    panel.append(blocked);
  }

  function buildSummaryPanel(product) {
    const panel=tabPanel('summary');
    if(product.summary) panel.append(element('p','pediatric-product-summary',product.summary));
    const regimen=product.regimen || {};
    const facts=element('div','dosage-product-facts');
    facts.append(
      productFact('Indikacioni',product.calculationRegimen?.indication || regimen.indication || '—'),
      productFact('Rruga',product.calculationRegimen?.route || regimen.route || '—'),
      productFact('Baza',regimen.basis || '—'),
      productFact('Orari',productSchedule(product) || 'Sipas burimit'),
    );
    panel.append(facts);
    const context=calculationContext(product);
    if(context) panel.append(context);
    appendBlockedState(panel,product);
    return panel;
  }

  function buildUsePanel(product) {
    const panel=tabPanel('use');
    const indication=text(product.calculationRegimen?.indication || product.regimen?.indication);
    panel.append(element('p','phase9-tab-kicker','Përdorimi klinik i ekspozuar nga burimi'));
    const facts=element('div','dosage-product-facts');
    facts.append(
      productFact('Popullata',populationLabel(product)),
      productFact('Indikacioni',indication || '—'),
      productFact('Statusi',READINESS_LABEL[effectiveReadiness(product)] || effectiveReadiness(product)),
      productFact('Rruga',product.calculationRegimen?.route || product.regimen?.route || '—'),
    );
    panel.append(facts);
    if(product.restriction) panel.append(element('p','pediatric-restriction',product.restriction));
    const alternates=informationalRegimens(product);
    if(alternates) panel.append(alternates);
    return panel;
  }

  function buildDosePanel(product) {
    const panel=tabPanel('dose');
    panel.append(element('p','phase9-tab-kicker','Dozimi mbetet server-side; browser-i nuk llogarit formulën.'));
    const context=calculationContext(product);
    if(context) panel.append(context);
    const regimen=product.regimen || {};
    const facts=element('div','dosage-product-facts');
    facts.append(
      productFact('Baza',regimen.basis || '—'),
      productFact('Orari',productSchedule(product) || 'Sipas burimit'),
      productFact('Min. peshë',regimen.minWeightKg != null ? `${formatNumber(regimen.minWeightKg)} kg` : '—'),
      productFact('Max. peshë',regimen.maxWeightKg != null ? `${formatNumber(regimen.maxWeightKg)} kg` : '—'),
    );
    panel.append(facts);
    appendBlockedState(panel,product);
    return panel;
  }

  function buildSafetyPanel(product) {
    const panel=tabPanel('safety');
    panel.append(element('p','phase9-tab-kicker','Vetëm paralajmërimet dhe kufizimet që kthen serveri.'));
    let count=0;
    if(product.restriction){
      panel.append(element('p','pediatric-restriction',product.restriction));
      count+=1;
    }
    for(const warning of product.warnings || []){
      if(warning && warning!==product.restriction){
        panel.append(element('p','pediatric-warning',warning));
        count+=1;
      }
    }
    if(!count) panel.append(element('p','phase9-empty-tab','Nuk ka paralajmërim shtesë të ekspozuar nga ky endpoint.'));
    return panel;
  }

  function buildProductsPanel(product) {
    const panel=tabPanel('products');
    panel.append(element('p','phase9-tab-kicker',
      product?.runtime === 'v3'
        ? 'Kontekst kanonik + produkt V3 i publikuar; kalkulatori po përdor runtime V3.'
        : product?.phase9Context?.v3Published
          ? 'Kontekst kanonik + produkt V3 i publikuar; ky request po përdor fallback V2 të kontrolluar.'
          : 'Kontekst kanonik i produktit; runtime V2 fallback mbetet aktiv.'));
    const facts=element('div','dosage-product-facts');
    facts.append(
      productFact('Produkti',product.name || '—'),
      productFact('Substanca',product.substanceCanonicalName || product.substance || '—'),
      productFact('Fortësia',product.strength || '—'),
      productFact('Forma',product.form || '—'),
      productFact('Popullata',populationLabel(product)),
      productFact('ATC',product.atcCode || '—'),
      productFact('Produkte me të njëjtën përbërje',Number.isInteger(product.productCount) ? String(product.productCount) : '—'),
      productFact('Varianti',product.clinicalVariantId ? 'Kanonik' : (product.variantStatus || '—')),
    );
    panel.append(facts);

    const personal=phase9Personal();
    const actions=element('div','phase9-entity-actions');
    for(const entity of availablePersonalEntities(product)){
      const button=element('button','phase9-entity-favorite',`☆ ${entity.type==='substance' ? 'Substanca' : entity.type==='variant' ? 'Varianti' : 'Produkti'}`);
      button.type='button';
      button.dataset.action='toggle-phase9-favorite';
      button.dataset.entityType=entity.type;
      try{
        if(personal?.isFavorite(entity.type,entity.key)){
          button.textContent=`★ ${entity.type==='substance' ? 'Substanca' : entity.type==='variant' ? 'Varianti' : 'Produkti'}`;
          button.classList.add('is-active');
          button.setAttribute('aria-pressed','true');
        }else button.setAttribute('aria-pressed','false');
      }catch{ button.setAttribute('aria-pressed','false'); }
      actions.append(button);
    }
    if(actions.childElementCount) panel.append(actions);

    if(!product.clinicalVariantId){
      panel.append(element('p','phase9-inline-note',
        'Favoriti/shënimi i variantit mbetet i çaktivizuar derisa ekziston një clinical_variant_id kanonik; override-i i pilotit nuk përdoret si ID.'));
    }
    return panel;
  }

  function buildNotesPanel(product) {
    const panel=tabPanel('notes');
    const personal=phase9Personal();
    panel.append(element('p','phase9-tab-kicker','Shënime personale · owner-only · nuk ndikojnë llogaritjen klinike.'));

    const entities=availablePersonalEntities(product);
    if(!entities.length){
      panel.append(element('p','phase9-empty-tab','Nuk ka identitet të qëndrueshëm për shënim.'));
      return panel;
    }

    for(const entity of entities){
      const card=element('section','phase9-note-entity-card');
      card.append(element('strong','phase9-note-entity-title',
        entity.type==='substance' ? 'Substanca / përbërja' : entity.type==='variant' ? 'Varianti' : 'Produkti'));
      card.append(element('small','phase9-note-entity-label',entity.label));

      const area=element('textarea','phase9-note-editor');
      area.dataset.phase9NoteEntity=entity.type;
      area.maxLength=2000;
      area.rows=4;
      area.placeholder='Shkruaj shënim personal…';
      try{ area.value=personal?.note(entity.type,entity.key) || ''; }catch{ area.value=''; }
      card.append(area);

      const actions=element('div','phase9-note-actions');
      const save=element('button','phase9-save-note','Ruaj');
      save.type='button';
      save.dataset.action='save-phase9-note';
      save.dataset.entityType=entity.type;
      const remove=element('button','phase9-delete-note','Fshi');
      remove.type='button';
      remove.dataset.action='delete-phase9-note';
      remove.dataset.entityType=entity.type;
      actions.append(save,remove);
      card.append(actions);
      panel.append(card);
    }

    panel.append(element('small','phase9-personal-hint',
      personal?.state?.().loaded ? 'Sinkronizuar me llogarinë aktive.' : 'Sinkronizimi aktivizohet pas verifikimit të sesionit.'));
    return panel;
  }

  function buildSourcesPanel(product) {
    const panel=tabPanel('sources');
    panel.append(element('p','phase9-tab-kicker',
      'Burimi i dozimit dhe burimi i identitetit të produktit mbahen të ndarë.'));

    const doseTitle=element('h3','phase9-source-subtitle','Burimi i dozimit');
    panel.append(doseTitle,sourceBlock(product.source));
    const doseFacts=element('div','dosage-product-facts');
    doseFacts.append(
      productFact('Seksioni',product.source?.section || '—'),
      productFact('Statusi',product.source?.verificationStatus || '—'),
      productFact('Verifikuar',formatDate(product.source?.verifiedAt) || '—'),
    );
    panel.append(doseFacts);

    const identitySource=product.phase9Context?.source;
    panel.append(element('h3','phase9-source-subtitle','Burimi i produktit / identitetit'));
    const identityFacts=element('div','dosage-product-facts');
    identityFacts.append(
      productFact('Tier',identitySource?.sourceTier || '—'),
      productFact('Source key',identitySource?.sourceKey || '—'),
      productFact('Versioni',identitySource?.documentVersion || 'Nuk disponohet'),
      productFact('Data',identitySource?.documentDate || '—'),
      productFact('V3',product.phase9Context?.v3Published ? `Published · v${product.phase9Context.v3VersionNo || 1}` : 'Jo i publikuar në V3'),
    );
    panel.append(identityFacts);
    return panel;
  }

  async function togglePhase9Favorite(button) {
    const product=state.product;
    const type=text(button?.dataset?.entityType);
    const key=personalEntityKey(type,product);
    const personal=phase9Personal();
    if(!product || !key || !personal) return;
    button.disabled=true;
    try{
      if(!personal.state().loaded) await personal.load();
      await personal.toggleFavorite(type,key,{
        label:personalEntityLabel(type,product),
        drugId:product.drugId || null,
        registryNumber:product.registryNumber || null,
      });
      renderProduct();
      setProductTab('products');
      setStatus('Favoriti personal u sinkronizua.','success');
    }catch(error){
      button.disabled=false;
      setStatus(error?.message || 'Favoriti nuk u ruajt.','error');
    }
  }

  async function savePhase9Note(type,{remove=false}={}) {
    const product=state.product;
    const key=personalEntityKey(type,product);
    const personal=phase9Personal();
    if(!product || !key || !personal) return;
    const area=elements.productBody.querySelector(`[data-phase9-note-entity="${type}"]`);
    try{
      if(!personal.state().loaded) await personal.load();
      if(remove) await personal.deleteNote(type,key);
      else await personal.saveNote(type,key,area?.value || '');
      renderProduct();
      setProductTab('notes');
      setStatus(remove ? 'Shënimi personal u fshi.' : 'Shënimi personal u ruajt.','success');
    }catch(error){
      setStatus(error?.message || 'Shënimi nuk u sinkronizua.','error');
    }
  }

  function renderProduct() {
    const product=state.product;
    const body=elements.productBody;
    if(!product) return;
    if(state.renderedProductId!==product.drugId){
      state.renderedProductId=product.drugId || '';
      state.productTab='summary';
    }
    body.textContent='';
    elements.productEmpty.hidden=true;
    body.hidden=false;

    const header=element('div','pediatric-product-header phase9-product-header');
    const identity=element('div','phase9-product-identity');
    const titleRow=element('div','pediatric-product-title-row');
    titleRow.append(element('h2','pediatric-product-name',product.name || '(pa emër)'),readinessBadge(effectiveReadiness(product)));
    titleRow.append(phase9Badge(populationLabel(product),'population'));
    titleRow.append(phase9Badge(product.runtime === 'v3' ? 'V3 live' : (product.runtimeLabel || 'V2 fallback'),'runtime'));
    identity.append(titleRow);
    identity.append(element('p','pediatric-product-meta',
      [product.substance,product.strength,product.form].filter(Boolean).join(' · ')));
    const codes=element('div','pediatric-product-codes');
    if(product.atcCode) codes.append(element('code',null,product.atcCode));
    if(product.registryNumber) codes.append(element('span',null,`Reg. #${product.registryNumber}`));
    if(product.pdid) codes.append(element('span',null,product.pdid));
    identity.append(codes);

    const actions=element('div','phase9-product-actions');
    const favorite=element('button','phase9-favorite-button','☆ Favorit');
    favorite.type='button';
    favorite.dataset.action='toggle-phase9-favorite';
    favorite.dataset.entityType='product';
    try{
      const active=phase9Personal()?.isFavorite('product',productEntityKey(product));
      if(active){
        favorite.textContent='★ Favorit';
        favorite.classList.add('is-active');
        favorite.setAttribute('aria-pressed','true');
      }else favorite.setAttribute('aria-pressed','false');
    }catch{ favorite.setAttribute('aria-pressed','false'); }
    const back=element('button','pediatric-back-button','Mbyll detajin');
    back.type='button';
    back.dataset.action='close-product';
    actions.append(favorite,back);
    header.append(identity,actions);
    body.append(header);

    body.append(phase9Flow(product));

    const tabs=element('div','phase9-tabs');
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','Detajet e barit');
    for(const [key,label] of PRODUCT_TABS){
      const button=element('button','phase9-tab-button',label);
      button.type='button';
      button.dataset.productTab=key;
      button.id=`phase9-tab-${key}`;
      button.setAttribute('role','tab');
      button.setAttribute('aria-controls',`phase9-panel-${key}`);
      tabs.append(button);
    }
    body.append(tabs);

    const panels=element('div','phase9-panels');
    panels.append(
      buildSummaryPanel(product),
      buildUsePanel(product),
      buildDosePanel(product),
      buildSafetyPanel(product),
      buildProductsPanel(product),
      buildNotesPanel(product),
      buildSourcesPanel(product),
    );
    body.append(panels);
    setProductTab(state.productTab);

    if(product.calculable){
      configureIndication(product);
      applyPatientFields(activeRequires());
      const indication=product.calculationRegimen?.indication;
      const choices=calculationOptions(product);
      elements.hint.textContent=choices.length>1 && !selectedCalculationOption(product)
        ? 'Zgjidh indikacionin e verifikuar; pastaj shfaqen vetëm inputet që kërkon ai regjim.'
        : indication
          ? `Regjimi është lidhur me “${indication}”. Plotëso vetëm fushat e kërkuara.`
          : 'Plotëso vetëm fushat që kërkon formula e verifikuar.';
      setStatus('Bari u hap. Plotëso parametrat e pacientit.','success');
    }else{
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

  function calculationOptions(product = state.product) {
    return Array.isArray(product?.calculationOptions) ? product.calculationOptions : [];
  }

  function selectedCalculationOption(product = state.product) {
    const options = calculationOptions(product);
    if (!options.length) return null;
    const selected = text(elements.indication?.value || product?.calculationRegimen?.selectionId);
    return options.find(option => text(option.selectionId) === selected)
      || (options.length === 1 ? options[0] : null);
  }

  function applyCalculationOption(option) {
    if (!state.product) return;
    if (!option) {
      state.product.calculationRegimen = { valid:false,selectionId:'',indication:'',route:'',requires:null };
      state.product.regimen = {};
      state.product.requires = { weight:false,height:false,age:false,advancedInputs:[] };
      return;
    }
    state.product.calculationRegimen = { ...option,valid:true };
    state.product.regimen = { ...(option.regimen || {}) };
    state.product.requires = option.requires || { weight:false,height:false,age:false,advancedInputs:[] };
    if (option.source?.url) state.product.source = option.source;
  }

  function configureIndication(product = state.product) {
    const select = elements.indication;
    if (!select) return;
    const options = calculationOptions(product);
    const current = text(product?.calculationRegimen?.selectionId);
    select.textContent = '';
    if (options.length > 1) {
      const placeholder = element('option',null,'Zgjidh indikacionin');
      placeholder.value = '';
      select.append(placeholder);
    }
    for (const option of options) {
      const node = element('option',null,option.indication || option.indicationKey || 'Indikacion i verifikuar');
      node.value = option.selectionId;
      select.append(node);
    }
    if (options.length === 1) {
      select.value = options[0].selectionId;
      select.disabled = true;
      applyCalculationOption(options[0]);
    } else {
      select.disabled = false;
      select.value = options.some(option => option.selectionId === current) ? current : '';
      applyCalculationOption(selectedCalculationOption(product));
    }
  }

  function activeRequires() {
    return selectedCalculationOption()?.requires || state.product?.requires || {};
  }

  function advancedFieldFlags(requires = {}) {
    const values = new Set(Array.isArray(requires.advancedInputs) ? requires.advancedInputs : []);
    return {
      crcl:values.has('CrCl_mL_min'),
      egfr:values.has('eGFR_mL_min_1_73m2'),
      dialysis:values.has('dialysis_status'),
      'child-pugh':values.has('Child_Pugh_class'),
      'hepatic-impairment':values.has('hepatic_impairment_textual'),
    };
  }

  function applyPatientFields(requires) {
    const options = calculationOptions();
    const needsIndication = options.length > 1;
    const hasSelection = !needsIndication || Boolean(selectedCalculationOption());
    const advanced = advancedFieldFlags(requires);
    const wanted = {
      indication:needsIndication,
      weight:hasSelection && Boolean(requires?.weight),
      age:hasSelection && Boolean(requires?.age),
      'age-unit':hasSelection && Boolean(requires?.age),
      height:hasSelection && Boolean(requires?.height),
      crcl:hasSelection && advanced.crcl,
      egfr:hasSelection && advanced.egfr,
      dialysis:hasSelection && advanced.dialysis,
      'child-pugh':hasSelection && advanced['child-pugh'],
      'hepatic-impairment':hasSelection && advanced['hepatic-impairment'],
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
    elements.patientState.textContent = hasSelection ? 'Plotëso fushat' : 'Zgjidh indikacionin';
    elements.patientState.className = 'dosage-step-state is-ready';
    validatePatientFields();
  }

  function fieldError(name, message) {
    const node = elements.patientPanel.querySelector(`[data-field-error="${name}"]`);
    const inputs = {
      indication:elements.indication,
      weight:elements.weight,
      age:elements.age,
      height:elements.height,
      crcl:elements.crcl,
      egfr:elements.egfr,
      dialysis:elements.dialysis,
      'child-pugh':elements.childPugh,
      'hepatic-impairment':elements.hepaticImpairment,
    };
    const input = inputs[name];
    if (node) node.textContent = message || '';
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function validatePatientFields({ showErrors = false } = {}) {
    const requires = activeRequires();
    const options = calculationOptions();
    let valid = Boolean(state.product?.calculable);

    if (options.length > 1) {
      const error = selectedCalculationOption() ? '' : 'Zgjidh indikacionin.';
      if (showErrors || elements.indication?.value) fieldError('indication',error); else fieldError('indication','');
      if (error) valid = false;
    } else fieldError('indication','');

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

    const advanced = advancedFieldFlags(requires);
    const numericAdvanced = [
      ['crcl',elements.crcl,advanced.crcl,'Shkruaj CrCl.'],
      ['egfr',elements.egfr,advanced.egfr,'Shkruaj eGFR.'],
    ];
    for (const [name,input,required,message] of numericAdvanced) {
      if (!required) { fieldError(name,''); continue; }
      const value = Number(input?.value);
      const error = !Number.isFinite(value) || value < 0 ? message : '';
      if (showErrors || input?.value) fieldError(name,error); else fieldError(name,'');
      if (error) valid = false;
    }

    for (const [name,input,required,message] of [
      ['dialysis',elements.dialysis,advanced.dialysis,'Zgjidh statusin e dializës.'],
      ['child-pugh',elements.childPugh,advanced['child-pugh'],'Zgjidh klasën Child–Pugh.'],
      ['hepatic-impairment',elements.hepaticImpairment,advanced['hepatic-impairment'],'Zgjidh statusin hepatik sipas burimit.'],
    ]) {
      if (!required) { fieldError(name,''); continue; }
      const error = text(input?.value) ? '' : message;
      if (showErrors || input?.value) fieldError(name,error); else fieldError(name,'');
      if (error) valid = false;
    }

    elements.calculate.disabled = !valid || state.pendingCalculation;
    elements.patientState.textContent = valid ? 'Gati' : (options.length > 1 && !selectedCalculationOption() ? 'Zgjidh indikacionin' : 'Plotëso fushat');
    elements.patientState.className = valid ? 'dosage-step-state is-valid' : 'dosage-step-state is-ready';
    return valid;
  }
  function patientPayload() {
    const requires = activeRequires();
    const weight = Number(elements.weight?.value);
    const height = Number(elements.height?.value);
    const age = Number(elements.age?.value);
    const payload = { drugId:state.product?.drugId };
    if (requires.weight && Number.isFinite(weight) && weight > 0) payload.weightKg = weight;
    if (requires.height && Number.isFinite(height) && height > 0) payload.heightCm = height;
    if (requires.age && Number.isFinite(age) && age >= 0) {
      payload.age = { value:age, unit:elements.ageUnit?.value || 'muaj' };
    }
    const selectionId = selectedCalculationOption()?.selectionId || state.product?.calculationRegimen?.selectionId;
    if (selectionId) payload.regimenId = selectionId;

    const advanced = advancedFieldFlags(requires);
    if (advanced.crcl && elements.crcl?.value !== '') payload.crClMlMin = Number(elements.crcl.value);
    if (advanced.egfr && elements.egfr?.value !== '') payload.eGfrMlMin173m2 = Number(elements.egfr.value);
    if (advanced.dialysis && elements.dialysis?.value) payload.dialysisStatus = elements.dialysis.value;
    if (advanced['child-pugh'] && elements.childPugh?.value) payload.childPughClass = elements.childPugh.value;
    if (advanced['hepatic-impairment'] && elements.hepaticImpairment?.value) {
      payload.hepaticImpairment = elements.hepaticImpairment.value;
    }
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
    const product=state.product || {};
    const unit=calculation.doseUnit || '';
    const dose=calculation.isRate
      ? amountText(calculation.ratePerHour,`${unit}/orë`)
      : amountText(calculation.perDose,unit);
    const schedule=calculation.isRate
      ? 'infuzion i vazhdueshëm'
      : calculation.dosesPerDay
        ? `${formatNumber(calculation.dosesPerDay)} herë/ditë`
        : productSchedule(product) || 'sipas regjimit';
    const doseSource=calculation.source || product.source || {};
    const identitySource=product.phase9Context?.source || {};
    const productLine=[
      product.name || calculation.drug?.name,
      product.strength,
      product.form,
    ].filter(Boolean).join(' · ');

    return [
      'Rx — DRx',
      productLine,
      calculation.indication ? `Indikacioni: ${calculation.indication}` : '',
      dose ? `Doza: ${dose}` : '',
      calculation.measure?.min
        ? `Sasia për administrim: ${amountText({min:calculation.measure.min.amount,max:calculation.measure.max?.amount},calculation.measure.min.unit)}`
        : '',
      `Frekuenca: ${schedule}`,
      calculation.route ? `Rruga: ${calculation.route}` : '',
      calculation.daily?.min !== null && calculation.daily?.min !== undefined
        ? `Totali ditor: ${amountText(calculation.daily,unit)}`
        : '',
      doseSource.section ? `Burimi i dozimit: §${doseSource.section}` : '',
      doseSource.url ? `URL burimi: ${doseSource.url}` : '',
      identitySource.documentVersion
        ? `Versioni i burimit të produktit: ${identitySource.documentVersion}`
        : '',
      identitySource.documentDate
        ? `Data e burimit të produktit: ${identitySource.documentDate}`
        : '',
      product.runtime === 'v3'
        ? `Runtime: V3 · ${product.phase9Context?.v3ProductKey || 'published'} · v${product.phase9Context?.v3VersionNo || 1}`
        : product.phase9Context?.v3Published
          ? `Konteksti V3 i publikuar; request-i aktual: ${product.runtimeLabel || 'V2 fallback'}`
          : 'Runtime: V2 fallback',
    ].filter(Boolean).join('\n');
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
      calculationFact('Frekuenca', calculation.scheduleText || (calculation.dosesPerDay ? `${formatNumber(calculation.dosesPerDay)}×/ditë` : 'Sipas regjimit')),
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

    state.lastCopyText=buildCopyText(calculation);
    if(state.lastCopyText){
      const rx=element('details','phase9-prescription-preview');
      const summary=element('summary',null,'Receta / skema e përshkrimit');
      const pre=element('pre','phase9-prescription-text');
      pre.textContent=state.lastCopyText;
      rx.append(summary,pre);
      block.append(rx);
    }

    elements.calculationBody.append(block);
    elements.copy.hidden=!state.lastCopyText;
    if(!elements.copy.hidden) elements.copy.textContent='Kopjo për recetë';
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
    state.productTab='summary';
    state.renderedProductId='';
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

    elements.productBody.addEventListener('keydown',event=>{
      const tab=event.target.closest?.('[data-product-tab]');
      if(!tab) return;
      const tabs=[...elements.productBody.querySelectorAll('[data-product-tab]')];
      const index=tabs.indexOf(tab);
      if(index<0) return;
      let next=index;
      if(event.key==='ArrowRight') next=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft') next=(index-1+tabs.length)%tabs.length;
      else if(event.key==='Home') next=0;
      else if(event.key==='End') next=tabs.length-1;
      else return;
      event.preventDefault();
      const target=tabs[next];
      setProductTab(target.dataset.productTab);
      target.focus();
    });

        elements.productBody.addEventListener('click', event => {
      const tab=event.target.closest('[data-product-tab]');
      if(tab){
        setProductTab(tab.dataset.productTab);
        return;
      }
      const favorite=event.target.closest('[data-action="toggle-phase9-favorite"]');
      if(favorite){
        void togglePhase9Favorite(favorite);
        return;
      }
      const saveNote=event.target.closest('[data-action="save-phase9-note"]');
      if(saveNote){
        void savePhase9Note(saveNote.dataset.entityType);
        return;
      }
      const deleteNote=event.target.closest('[data-action="delete-phase9-note"]');
      if(deleteNote){
        void savePhase9Note(deleteNote.dataset.entityType,{remove:true});
        return;
      }
      if (event.target.closest('[data-action="close-product"]')) {
        clearSelectedProduct();
        return;
      }
      if (event.target.closest('[data-action="retry-product"]') && state.selectedDrugId) {
        void selectDrug(state.selectedDrugId, { scroll:false });
      }
    });

    elements.indication?.addEventListener('change', () => {
      applyCalculationOption(selectedCalculationOption());
      invalidateCalculation();
      renderProduct();
    });
    for (const input of [elements.weight, elements.age, elements.height, elements.crcl, elements.egfr]) {
      input?.addEventListener('input', () => {
        invalidateCalculation();
        validatePatientFields();
      });
    }
    for (const input of [elements.ageUnit, elements.dialysis, elements.childPugh, elements.hepaticImpairment]) {
      input?.addEventListener('change', () => {
        invalidateCalculation();
        validatePatientFields();
      });
    }

    elements.calculate?.addEventListener('click', calculateDose);
    elements.patientPanel?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('input') && !elements.calculate.disabled) {
        event.preventDefault();
        void calculateDose();
      }
    });
    elements.copy?.addEventListener('click', copyResult);
    window.addEventListener('drx:phase9-personal-ready',()=>{ if(state.product) renderProduct(); });
    window.addEventListener('drx:phase9-personal-changed',()=>{ if(state.product) renderProduct(); });
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
