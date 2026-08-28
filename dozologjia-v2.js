/* Dozologjia V2 — one runtime, server-calculated pediatric flow. */

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
      $('#syncText').textContent = 'Supabase';
      $('#sourceStatus').textContent = 'Dozologjia pediatrike · Supabase';
      $('#dosageSourceMetric').textContent = 'Supabase';
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

  /* Klienti i kalkulatorit pediatrik. Nuk bën aritmetikë klinike: kërkon barin,
   * mbledh matjet e pacientit dhe renderon rezultatin që kthen serveri.
   * Regjimi/indikacioni për llogaritje vjen i lidhur nga serveri dhe, kur është
   * unik, zgjidhet automatikisht. Nuk ka fushë free-text për indikacionin.
   */

  const OWNER_FLAG = 'server';
  document.documentElement.dataset.pediatricCalculator = OWNER_FLAG;

  const SEARCH_DEBOUNCE_MS = 220;
  const MIN_QUERY = 2;
  const $ = selector => document.querySelector(selector);
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  const state = {
    query:'',
    results:[],
    product:null,
    calculation:null,
    searchToken:0,
    pending:false,
  };

  const elements = {};

  function cacheElements() {
    elements.search = $('#dosageSearch');
    elements.list = $('#dosageList');
    elements.status = $('#dosageStatus');
    elements.count = $('#dosageCount');
    elements.panel = $('#pediatricInputs');
    elements.hint = $('#pediatricInputsHint');
    elements.weight = $('#patientWeightKg');
    elements.age = $('#patientAgeMonths');
    elements.ageUnit = $('#patientAgeUnit');
    elements.height = $('#patientHeightCm');
    elements.calculate = $('#pediatricCalculate');
    return Boolean(elements.search && elements.list && elements.status);
  }

  function announce(message) {
    if (elements.status) elements.status.textContent = message;
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials:'same-origin',
      cache:'no-store',
      headers:{ Accept:'application/json', ...(options.body ? { 'Content-Type':'application/json' } : {}) },
      ...options,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Kërkesa dështoi (${response.status}).`);
    }
    return payload;
  }

  const READINESS_LABEL = {
    CALCULATOR_READY:'Llogaritet',
    TEXT_ONLY:'Vetëm tekst',
    NOT_RECOMMENDED:'Nuk rekomandohet',
    CONTRAINDICATED:'Kundërindikuar',
    INSUFFICIENT_DATA:'Pa të dhëna',
  };

  function readinessBadge(readiness) {
    const badge = element('span', 'pediatric-badge', READINESS_LABEL[readiness] || readiness);
    badge.dataset.readiness = readiness;
    return badge;
  }

  function renderResults() {
    const list = elements.list;
    list.textContent = '';
    list.dataset.pediatricView = 'search';

    if (!state.results.length) {
      list.append(element('p', 'pediatric-empty', state.query.length >= MIN_QUERY
        ? 'Asnjë bar nuk përputhet me këtë kërkim.'
        : 'Shkruaj së paku dy shkronja për të kërkuar.'));
      return;
    }

    const group = element('ul', 'pediatric-result-list');
    group.setAttribute('aria-label', 'Rezultatet e kërkimit');
    for (const item of state.results) {
      const row = element('li', 'pediatric-result-item');
      const button = element('button', 'pediatric-result-button');
      button.type = 'button';
      button.dataset.drugId = item.drugId;

      const heading = element('span', 'pediatric-result-name', item.name || '(pa emër)');
      const meta = element('span', 'pediatric-result-meta',
        [item.substance, item.strength, item.form].filter(Boolean).join(' · '));
      button.append(heading, meta, readinessBadge(item.readiness));
      button.setAttribute('aria-label',
        `${item.name}. ${READINESS_LABEL[item.readiness] || item.readiness}.`);
      row.append(button);
      group.append(row);
    }
    list.append(group);
  }

  async function runSearch(query) {
    const token = ++state.searchToken;
    state.query = query;

    if (query.length < MIN_QUERY) {
      state.results = [];
      renderResults();
      announce('Shkruaj së paku dy shkronja.');
      if (elements.count) elements.count.textContent = '0';
      return;
    }

    announce('Duke kërkuar…');
    try {
      const payload = await requestJson(`/api/dosage/search?q=${encodeURIComponent(query)}`);
      if (token !== state.searchToken) return;
      state.results = Array.isArray(payload.results) ? payload.results : [];
      renderResults();
      if (elements.count) elements.count.textContent = String(state.results.length);
      announce(state.results.length
        ? `${state.results.length} barna u gjetën. Zgjidh një bar për të vazhduar.`
        : 'Asnjë bar nuk përputhet.');
    } catch (error) {
      if (token !== state.searchToken) return;
      state.results = [];
      renderResults();
      announce(error.message);
    }
  }

  function applyPatientFields(requires) {
    const wanted = {
      weight:Boolean(requires?.weight),
      age:Boolean(requires?.age),
      'age-unit':Boolean(requires?.age),
      height:Boolean(requires?.height),
    };
    for (const [field, visible] of Object.entries(wanted)) {
      const label = elements.panel?.querySelector(`[data-patient-field="${field}"]`);
      if (!label) continue;
      label.hidden = !visible;
      const input = label.querySelector('input, select');
      if (input) input.disabled = !visible;
    }
    if (elements.calculate) elements.calculate.hidden = false;
  }

  function hidePatientFields() {
    elements.panel?.querySelectorAll('[data-patient-field]').forEach(label => { label.hidden = true; });
    if (elements.calculate) elements.calculate.hidden = true;
  }

  function patientPayload() {
    const weight = Number(elements.weight?.value);
    const height = Number(elements.height?.value);
    const age = Number(elements.age?.value);
    const payload = { drugId:state.product?.drugId };
    if (Number.isFinite(weight) && weight > 0) payload.weightKg = weight;
    if (Number.isFinite(height) && height > 0) payload.heightCm = height;
    if (Number.isFinite(age) && age >= 0) {
      payload.age = { value:age, unit:elements.ageUnit?.value || 'muaj' };
    }
    const selectionId = state.product?.calculationRegimen?.selectionId;
    if (selectionId) payload.regimenId = selectionId;
    return payload;
  }

  function calculationContext(product) {
    const binding = product?.calculationRegimen;
    if (!binding?.valid) return null;

    const card = element('div', 'pediatric-text-regimen pediatric-calculation-context');
    card.dataset.calculationContext = 'primary';
    card.append(element('strong', null, 'Indikacioni i kësaj llogaritjeje'));
    card.append(element('p', 'pediatric-calculation-indication', binding.indication || 'Indikacion i lidhur'));
    const meta = [binding.route, 'Regjimi u zgjodh automatikisht nga serveri'].filter(Boolean).join(' · ');
    if (meta) card.append(element('p', 'pediatric-text-meta', meta));

    const linked = (product.textRegimens || []).find(item => item.sourceKey === binding.selectionId);
    if (linked?.dose) card.append(element('p', null, linked.dose));
    const line = [linked?.frequency, linked?.duration].filter(Boolean).join(' · ');
    if (line) card.append(element('p', 'pediatric-text-meta', line));
    if (linked?.maximum) card.append(element('p', 'pediatric-text-meta', `Maksimumi: ${linked.maximum}`));
    if (linked?.warnings) card.append(element('p', 'pediatric-warning', linked.warnings));
    return card;
  }

  function renderProduct() {
    const product = state.product;
    const list = elements.list;
    list.textContent = '';
    list.dataset.pediatricView = 'product';

    const header = element('div', 'pediatric-product-header');
    header.append(element('h3', 'pediatric-product-name', product.name));
    header.append(element('p', 'pediatric-product-meta',
      [product.substance, product.strength, product.form].filter(Boolean).join(' · ')));
    header.append(readinessBadge(product.readiness));

    const back = element('button', 'pediatric-back-button', 'Ndrysho barin');
    back.type = 'button';
    back.dataset.action = 'back';
    header.append(back);
    list.append(header);

    if (product.summary) list.append(element('p', 'pediatric-product-summary', product.summary));
    if (product.restriction) list.append(element('p', 'pediatric-restriction', product.restriction));

    const context = calculationContext(product);
    if (context) list.append(context);

    if (!product.calculable) {
      const block = element('div', 'pediatric-not-calculable');
      block.append(element('strong', null, 'Ky bar nuk llogaritet automatikisht.'));
      const reasons = element('ul', 'pediatric-reason-list');
      for (const reason of product.reasons || []) reasons.append(element('li', null, reason));
      if (!product.reasons?.length && product.missing?.length) {
        reasons.append(element('li', null, `Mungojnë të dhënat: ${product.missing.join(', ')}.`));
      }
      block.append(reasons);
      list.append(block);
    }

    const primaryKey = product.calculationRegimen?.selectionId || '';
    for (const regimen of product.textRegimens || []) {
      if (regimen.sourceKey === primaryKey) continue;
      const card = element('div', 'pediatric-text-regimen pediatric-informational-regimen');
      card.append(element('strong', null, regimen.indication || 'Regjim pediatrik informues'));
      card.append(element('p', 'pediatric-text-meta', 'Nuk përdoret nga kalkulatori i këtij regjimi typed.'));
      if (regimen.dose) card.append(element('p', null, regimen.dose));
      const line = [regimen.route, regimen.frequency, regimen.duration].filter(Boolean).join(' · ');
      if (line) card.append(element('p', 'pediatric-text-meta', line));
      if (regimen.maximum) card.append(element('p', 'pediatric-text-meta', `Maksimumi: ${regimen.maximum}`));
      if (regimen.warnings) card.append(element('p', 'pediatric-warning', regimen.warnings));
      list.append(card);
    }

    list.append(sourceBlock(product.source));

    if (product.calculable) {
      applyPatientFields(product.requires);
      if (elements.hint && product.calculationRegimen?.indication) {
        elements.hint.textContent = `Regjimi është lidhur automatikisht me: ${product.calculationRegimen.indication}. Plotëso vetëm të dhënat e pacientit.`;
      }
      announce('Plotëso të dhënat e pacientit dhe llogarit dozën.');
      elements.weight?.focus();
    } else {
      hidePatientFields();
      announce('Kalkulatori u mbyll sepse regjimi/indikacioni nuk është i sigurt për llogaritje.');
    }
  }

  function sourceBlock(source) {
    const block = element('p', 'pediatric-source');
    if (source?.url) {
      const link = element('a', null, source.section || 'Burimi klinik');
      link.href = source.url;
      link.rel = 'noreferrer noopener';
      link.target = '_blank';
      block.append('Burimi: ', link);
    } else {
      block.append('Burimi klinik nuk është i regjistruar.');
    }
    if (source?.verifiedAt) block.append(` · Verifikuar më ${source.verifiedAt}`);
    return block;
  }

  async function selectDrug(drugId) {
    if (!drugId) return;
    announce('Duke hapur barin…');
    try {
      const payload = await requestJson(`/api/dosage/product/${encodeURIComponent(drugId)}`);
      state.product = payload.product;
      state.calculation = null;
      renderProduct();
    } catch (error) {
      announce(error.message);
    }
  }

  function amountText(range, unit) {
    if (!range || range.min === null || range.min === undefined) return '';
    const suffix = unit ? ` ${unit}` : '';
    if (range.max === null || range.max === undefined || range.max === range.min) {
      return `${range.min}${suffix}`;
    }
    return `${range.min}–${range.max}${suffix}`;
  }

  function renderCalculation(calculation) {
    const existing = elements.list.querySelector('.pediatric-calculation');
    if (existing) existing.remove();

    const block = element('section', 'pediatric-calculation');
    block.setAttribute('aria-label', 'Rezultati i llogaritjes');

    if (calculation.outcome === 'NEEDS_PATIENT_DATA') {
      block.append(element('strong', null, 'Mungojnë të dhënat e pacientit.'));
      block.append(element('p', null, `Plotëso: ${(calculation.missing || []).join(', ')}.`));
      elements.list.append(block);
      announce('Plotëso të dhënat që mungojnë.');
      return;
    }
    if (calculation.outcome === 'OUT_OF_RANGE' || calculation.outcome === 'NOT_CALCULABLE') {
      block.append(element('strong', null, calculation.outcome === 'OUT_OF_RANGE'
        ? 'Pacienti është jashtë kufijve të skemës.'
        : 'Ky bar nuk llogaritet.'));
      const reasons = element('ul', 'pediatric-reason-list');
      for (const reason of calculation.reasons || []) reasons.append(element('li', null, reason));
      block.append(reasons);
      elements.list.append(block);
      announce('Llogaritja u ndal.');
      return;
    }

    const unit = calculation.doseUnit || '';
    block.append(element('p', 'pediatric-kicker', '3 · Rezultati'));
    if (calculation.indication) {
      block.append(element('p', 'pediatric-calculation-indication', `Indikacioni: ${calculation.indication}`));
    }

    if (calculation.isRate) {
      block.append(element('p', 'pediatric-dose-primary', amountText(calculation.ratePerHour, `${unit}/orë`)));
    } else {
      block.append(element('p', 'pediatric-dose-primary', amountText(calculation.perDose, unit)));
      block.append(element('p', 'pediatric-dose-secondary',
        `për dozë${calculation.dosesPerDay ? ` · ${calculation.dosesPerDay} herë në ditë` : ''}`));
    }

    if (calculation.measure?.min) {
      block.append(element('p', 'pediatric-dose-measure',
        `= ${amountText(
          { min:calculation.measure.min.amount, max:calculation.measure.max?.amount },
          calculation.measure.min.unit,
        )}`));
    }
    if (calculation.daily?.min !== null && calculation.daily?.min !== undefined) {
      block.append(element('p', 'pediatric-dose-daily', `Gjithsej në ditë: ${amountText(calculation.daily, unit)}`));
    }

    for (const warning of calculation.warnings || []) {
      block.append(element('p', 'pediatric-warning', warning));
    }

    if (calculation.steps?.length) {
      const details = element('details', 'pediatric-explain');
      details.append(element('summary', null, 'Si u llogarit?'));
      const table = element('dl', 'pediatric-explain-list');
      for (const step of calculation.steps) {
        table.append(element('dt', null, step.label));
        table.append(element('dd', null, `${step.value}${step.unit ? ` ${step.unit}` : ''}`));
      }
      details.append(table);
      block.append(details);
    }

    block.append(sourceBlock(calculation.source));
    elements.list.append(block);
    announce('Doza u llogarit për regjimin dhe indikacionin e lidhur.');
  }

  async function calculateDose() {
    if (state.pending || !state.product?.calculable) return;
    state.pending = true;
    if (elements.calculate) elements.calculate.disabled = true;
    announce('Duke llogaritur…');
    try {
      const payload = await requestJson('/api/dosage/calculate', {
        method:'POST',
        body:JSON.stringify(patientPayload()),
      });
      state.calculation = payload.calculation;
      renderCalculation(payload.calculation);
    } catch (error) {
      announce(error.message);
    } finally {
      state.pending = false;
      if (elements.calculate) elements.calculate.disabled = false;
    }
  }

  function init() {
    if (!cacheElements()) {
      delete document.documentElement.dataset.pediatricCalculator;
      return;
    }
    hidePatientFields();
    renderResults();
    announce('Kërko barin pediatrik për të filluar.');

    let timer = 0;
    elements.search.addEventListener('input', () => {
      window.clearTimeout(timer);
      const value = text(elements.search.value);
      timer = window.setTimeout(() => runSearch(value), SEARCH_DEBOUNCE_MS);
    });

    elements.list.addEventListener('click', event => {
      const choice = event.target.closest('[data-drug-id]');
      if (choice) {
        selectDrug(choice.dataset.drugId);
        return;
      }
      if (event.target.closest('[data-action="back"]')) {
        state.product = null;
        state.calculation = null;
        hidePatientFields();
        renderResults();
        elements.search.focus();
      }
    });

    elements.calculate?.addEventListener('click', calculateDose);
    elements.panel?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('input')) {
        event.preventDefault();
        calculateDose();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
