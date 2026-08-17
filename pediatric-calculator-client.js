(() => {
  'use strict';

  /* Fazat 3, 4 dhe 8 — zgjedhja e barit, formulari i pacientit dhe rezultati.
   *
   * Ky skedar nuk llogarit asgjë. Nuk ka as një shumëzim brenda tij. Kërkon,
   * mbledh të dhënat e pacientit, ia dërgon serverit dhe tregon çka u kthye.
   * Kjo është e gjithë pika: doza nuk udhëton nga shfletuesi, dhe as nuk
   * llogaritet aty ku dikush mund ta ndryshojë me konsolë.
   *
   * Merr pronësinë e faqes. `dozologjia.js` e ngarkonte të gjithë katalogun e
   * dozimit në shfletues dhe llogariste vendi — dy pronarë mbi të njëjtin DOM
   * është pikërisht gabimi që ky repo e ka paguar tashmë te regjistri, prandaj
   * shenja vihet para se ai të niset dhe ai tërhiqet.
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

  /* Teksti shkruhet me `textContent`, kurrë me `innerHTML`, sepse emrat e
     barnave dhe arsyet klinike vijnë nga baza. Kjo është edhe arsyeja pse
     ndërtimi bëhet me elemente dhe jo me vargje HTML. */
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

  // ------------------------------------------------------------ Faza 3: bari

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
      /* Emri i barit bashkë me gjendjen, që një lexues ekrani ta dëgjojë pa e
         kërkuar veçmas — statusi është informacioni kryesor i kësaj liste. */
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
      /* Përgjigjet e vonuara nuk guxojnë ta mbishkruajnë një kërkim më të ri —
         ndryshe shkrimi i shpejtë e lë ekranin me rezultatet e gabuara. */
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

  // ------------------------------------------------------- Faza 4: pacienti

  /* Formulari ndërtohet nga `requires` i serverit, jo nga hamendje e klientit.
     Nëse skema nuk e përdor gjatësinë, fusha nuk shfaqet fare — një fushë boshe
     që s'hyn askund është ftesë për ta mbushur gabim. */
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
    if (state.product?.regimen?.primaryRegimenId) payload.regimenId = state.product.regimen.primaryRegimenId;
    return payload;
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

    if (product.summary) {
      list.append(element('p', 'pediatric-product-summary', product.summary));
    }
    if (product.restriction) {
      list.append(element('p', 'pediatric-restriction', product.restriction));
    }

    /* Kur bari nuk llogaritet, arsyet janë përmbajtja kryesore, jo një shënim i
       vogël. Mjeku duhet ta dijë pse nuk ka numër — dhe teksti klinik mbetet. */
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

    for (const regimen of product.textRegimens || []) {
      const card = element('div', 'pediatric-text-regimen');
      if (regimen.indication) card.append(element('strong', null, regimen.indication));
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
      announce('Plotëso të dhënat e pacientit dhe llogarit dozën.');
      elements.weight?.focus();
    } else {
      hidePatientFields();
      announce('Ky bar shfaqet si tekst klinik; kalkulatori nuk aktivizohet.');
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

  // ----------------------------------------------------- Faza 8: rezultati

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

    if (calculation.isRate) {
      block.append(element('p', 'pediatric-dose-primary',
        `${amountText(calculation.ratePerHour, `${unit}/orë`)}`));
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

    /* "Si u llogarit?" — hapat vijnë nga serveri, aty ku numrat ekzistuan
       vërtet. Klienti nuk i rindërton, sepse një rindërtim mund të thoshte
       diçka tjetër nga ajo që ndodhi. */
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
    announce('Doza u llogarit.');
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

  // ------------------------------------------------------------------ lidhjet

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
    /* Enter brenda formularit llogarit, që rrjedha të mbarojë me tastierë. */
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
