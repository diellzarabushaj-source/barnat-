(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexPrescriptionContext = api;
  if (root?.document) {
    const run = () => api.init(root.document, root);
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', run, { once:true });
    } else {
      run();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROUTES = ['IV', 'IM', 'SC'];
  const ROUTE_LABELS = Object.freeze({
    IV:'intravenoz',
    IM:'intramuskular',
    SC:'nënlëkurë',
  });
  const KEY = 'medindex_rx_clinical_context_v2';
  const LEGACY_KEY = 'medindex_rx_clinical_context_v1';
  const SAVED_KEY = 'regjistriBarnave_protokollet_v1';
  const PARENTERAL_FORM = /ampul|ampoule|injeks|injection|infuz|infusion|flakon|vial/i;
  const ORAL_FORM = /tablet|tableta|kapsul|capsul|sirup|syrup|oral/i;
  const SVG = Object.freeze({
    syringe:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5 5 5M13 6l5 5M4 20l5.5-5.5m0 0 5-5 2 2-5 5m-2-2 2 2M3 21l3-1-2-2-1 3Z"/><path d="m16.5 2.5 5 5"/></svg>',
    child:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M8 8H6a3 3 0 0 0-3 3v1m13-4h2a3 3 0 0 1 3 3v1M7 14c.8 4 2.5 6 5 6s4.2-2 5-6M9 12h6"/></svg>',
    shield:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>',
  });

  const state = {
    document:null,
    root:null,
    context:null,
    ready:false,
    nativeFetch:null,
    payloadView:null,
    payloadContextKey:'',
    refreshPromise:null,
    refreshTimer:0,
    previewObserver:null,
  };

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fold = value => text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq');

  function baseContext() {
    return {
      pediatric:false,
      parenteral:false,
      route:'',
      ageValue:'',
      ageUnit:'years',
      weightKg:'',
    };
  }

  function normalizeRoute(value) {
    const source = fold(value);
    if (/\bi\.?v\.?\b|intraveno/.test(source)) return 'IV';
    if (/\bi\.?m\.?\b|intramusk/.test(source)) return 'IM';
    if (/\bs\.?c\.?\b|subkutan|subcutan/.test(source)) return 'SC';
    if (/\bp\.?o\.?\b|oral|nga goja/.test(source)) return 'PO';
    if (/inhal/.test(source)) return 'INH';
    if (/rektal|rectal/.test(source)) return 'PR';
    if (/topik|topical|kutan|cutan/.test(source)) return 'TOP';
    return '';
  }

  function routeTokens(value) {
    const source = fold(value);
    const output = [];
    [
      ['IV', /\bi\.?v\.?\b|intraveno/],
      ['IM', /\bi\.?m\.?\b|intramusk/],
      ['SC', /\bs\.?c\.?\b|subkutan|subcutan/],
      ['PO', /\bp\.?o\.?\b|oral|nga goja/],
      ['INH', /inhal/],
      ['PR', /rektal|rectal/],
      ['TOP', /topik|topical|kutan|cutan/],
    ].forEach(([route, pattern]) => {
      if (pattern.test(source)) output.push(route);
    });
    return output;
  }

  function numberValue(value) {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function ageMonthsFrom(value, unit = 'years') {
    const numeric = numberValue(value);
    if (numeric == null || numeric < 0) return null;
    return Math.round(unit === 'months' ? numeric : numeric * 12);
  }

  function normalizeContext(value = {}) {
    const context = { ...baseContext(), ...value };
    context.pediatric = Boolean(context.pediatric);
    context.parenteral = Boolean(context.parenteral);
    context.route = ROUTES.includes(normalizeRoute(context.route)) ? normalizeRoute(context.route) : '';
    context.ageUnit = context.ageUnit === 'months' ? 'months' : 'years';
    context.ageValue = text(context.ageValue);
    context.weightKg = text(context.weightKg);
    return context;
  }

  function patientFromContext(value) {
    const context = normalizeContext(value);
    return {
      ageMonths:ageMonthsFrom(context.ageValue, context.ageUnit),
      weightKg:numberValue(context.weightKg),
    };
  }

  function validateContext(value) {
    const context = normalizeContext(value);
    const missing = [];
    const invalid = [];

    if (context.parenteral && !context.route) missing.push('route');

    if (context.pediatric) {
      const patient = patientFromContext(context);
      if (!context.ageValue) missing.push('age');
      else if (!Number.isFinite(patient.ageMonths) || patient.ageMonths < 0 || patient.ageMonths > 216) invalid.push('age');

      if (!context.weightKg) missing.push('weight');
      else if (!Number.isFinite(patient.weightKg) || patient.weightKg < 0.5 || patient.weightKg > 200) invalid.push('weight');
    }

    return {
      valid:missing.length === 0 && invalid.length === 0,
      missing,
      invalid,
      context,
    };
  }

  function population(regimen = {}) {
    const value = fold(regimen._medindexPopulation || regimen.population);
    if (/pediatr|femij|child/.test(value)) return 'pediatric';
    if (/adult|rritur/.test(value)) return 'adult';
    return regimen.mgPerKg != null
      || regimen.minAgeMonths != null
      || regimen.maxAgeMonths != null
      || text(regimen.formula)
      ? 'pediatric'
      : 'adult';
  }

  function isParenteral(regimen = {}) {
    return routeTokens(regimen.route).some(route => ROUTES.includes(route))
      || PARENTERAL_FORM.test(text(regimen.form));
  }

  function filterRegimens(rows, value) {
    const context = normalizeContext(value);
    const wantedPopulation = context.pediatric ? 'pediatric' : 'adult';

    return (Array.isArray(rows) ? rows : []).filter(regimen => {
      if (population(regimen) !== wantedPopulation) return false;
      if (isParenteral(regimen) !== context.parenteral) return false;
      if (!context.parenteral) return true;

      const routes = routeTokens(regimen.route);
      return routes.length === 1 && routes[0] === context.route;
    });
  }

  function decorateDosagePayload(payload = {}) {
    const adult = (payload.adult || []).map(item => ({ ...item, _medindexPopulation:'adult' }));
    const pediatric = (payload.pediatric || []).map(item => ({ ...item, _medindexPopulation:'pediatric' }));
    return {
      ...payload,
      adult:[...adult, ...pediatric],
      pediatric,
    };
  }

  function decideForContext(engine, drug, rows, value) {
    const context = normalizeContext(value);
    const validation = validateContext(context);
    if (!validation.valid) {
      return {
        status:'needs-clinical-context',
        matches:[],
        missing:validation.missing,
        invalid:validation.invalid,
      };
    }

    return engine.decideMatch(
      drug,
      filterRegimens(rows, context),
      {
        population:context.pediatric ? 'pediatric' : 'adult',
        patient:context.pediatric ? patientFromContext(context) : {},
      },
    );
  }

  function transferForContext(engine, drug, regimen, value) {
    const context = normalizeContext(value);
    const wantedPopulation = context.pediatric ? 'pediatric' : 'adult';
    const validation = validateContext(context);

    if (!regimen) return engine.prescriptionTransfer(drug, null, wantedPopulation);

    if (!validation.valid) {
      return {
        ...engine.prescriptionTransfer(drug, null, wantedPopulation),
        dosageStatus:'requires-review',
        warnings:'Plotëso grupmoshën, peshën dhe rrugën para dozimit.',
      };
    }

    const contextualRegimen = {
      ...regimen,
      ...(context.parenteral ? { route:context.route } : {}),
    };

    let calculation = context.pediatric && regimen.serverContextVerified
      ? regimen.serverCalculation
      : null;

    if (context.pediatric) {
      if (!calculation || calculation.status !== 'calculated') {
        calculation = engine.calculatePediatricDose(contextualRegimen, patientFromContext(context));
      }
      if (calculation.status !== 'calculated') {
        return {
          ...engine.prescriptionTransfer(drug, contextualRegimen, wantedPopulation, null),
          dosageStatus:'requires-review',
          signatura:'',
          warnings:[
            text(contextualRegimen.warnings),
            'Skema pediatrike nuk u llogarit automatikisht; kërkohet verifikim manual.',
          ].filter(Boolean).join(' · '),
        };
      }
    }

    const output = engine.prescriptionTransfer(
      drug,
      contextualRegimen,
      wantedPopulation,
      calculation,
    );

    if (regimen.serverContextVerified && text(regimen.serverSignature)) {
      output.signatura = text(regimen.serverSignature);
    }
    if (context.parenteral && output.signatura) {
      output.signatura = output.signatura.replace(/^(Merret|Jepen)\b/i, 'Administrohet');
      output.route = context.route;
    }
    if (calculation?.cappedBy?.length) {
      output.dosageStatus = 'requires-review';
      output.warnings = [
        text(output.warnings),
        `Doza u kufizua nga: ${calculation.cappedBy.join(', ')}.`,
      ].filter(Boolean).join(' · ');
    }

    return output;
  }

  function getContext() {
    return normalizeContext(state.context || baseContext());
  }

  function contextKey(value = getContext()) {
    const context = normalizeContext(value);
    const patient = patientFromContext(context);
    return [
      context.pediatric ? 'pediatric' : 'adult',
      context.parenteral ? 'parenteral' : 'non-parenteral',
      context.parenteral ? context.route : '',
      context.pediatric ? patient.ageMonths : '',
      context.pediatric ? patient.weightKg : '',
    ].join('|');
  }

  function contextEndpoint(value = getContext()) {
    const context = normalizeContext(value);
    const patient = patientFromContext(context);
    const query = new URLSearchParams({
      population:context.pediatric ? 'pediatric' : 'adult',
      parenteral:String(context.parenteral),
    });

    if (context.parenteral) query.set('route', context.route);
    if (context.pediatric) {
      query.set('ageMonths', String(patient.ageMonths));
      query.set('weightKg', String(patient.weightKg));
    }
    return `/api/prescription-dosage-context?${query.toString()}`;
  }

  function setStatus(message, type = '') {
    const node = state.document?.getElementById('rxStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `rx-status${type ? ` is-${type}` : ''}`;
  }

  function validationMessage(validation) {
    if (validation.missing.includes('route')) return 'Zgjidh rrugën IV, IM ose SC.';
    if (validation.missing.includes('age') || validation.missing.includes('weight')) {
      return 'Për fëmijë shëno moshën dhe peshën para zgjedhjes së barit.';
    }
    if (validation.invalid.includes('age')) return 'Mosha duhet të jetë ndërmjet 0 dhe 18 vjeç.';
    if (validation.invalid.includes('weight')) return 'Pesha duhet të jetë ndërmjet 0.5 dhe 200 kg.';
    return '';
  }

  function ageLabel(context) {
    if (!context.ageValue) return '';
    return context.ageUnit === 'months'
      ? `${context.ageValue} muaj`
      : `${context.ageValue} vjeç`;
  }

  function contextSummary(value = getContext()) {
    const context = normalizeContext(value);
    const parts = [];
    if (context.parenteral) parts.push('Parenterale', context.route || 'rruga mungon');
    else parts.push('Jo parenterale');
    if (context.pediatric) {
      parts.push('Fëmijë');
      if (context.ageValue) parts.push(ageLabel(context));
      if (context.weightKg) parts.push(`${context.weightKg} kg`);
    } else {
      parts.push('Të rritur');
    }
    return parts.join(' · ');
  }

  function patchNotation() {
    const core = state.root?.MedIndexPrescriptionFormat;
    if (!core || core.__registryNotationReady) return;

    const originalNormalizeDrug = core.normalizeDrug.bind(core);
    const originalSelectedDrugLine = core.selectedDrugLine.bind(core);

    core.normalizeDrug = item => {
      const normalized = originalNormalizeDrug(item);
      return {
        ...normalized,
        packaging:text(item?.packaging || item?.packageSize),
        packagingSummary:text(item?.packagingSummary),
        prescriptionLine:text(item?.prescriptionLine),
        prescriptionNotation:text(item?.prescriptionNotation),
        sheetPrescriptionNotation:text(item?.sheetPrescriptionNotation),
        dispense:text(item?.dispense || normalized.dispense),
      };
    };

    core.selectedDrugLine = item => {
      const drug = core.normalizeDrug(item);
      return drug.prescriptionLine || originalSelectedDrugLine(drug);
    };

    core.__registryNotationReady = true;
  }

  function createUi() {
    if (state.document.getElementById('rxClinicalContext')) return;
    const commandBar = state.document.querySelector('.rx-command-bar');
    if (!commandBar) return;

    commandBar.insertAdjacentHTML('afterend', `
      <section class="rx-clinical-context" id="rxClinicalContext" aria-labelledby="rxClinicalContextTitle">
        <div class="rx-context-buttons" role="group" aria-label="Lloji i terapisë dhe popullata">
          <button type="button" class="rx-context-toggle" id="rxParenteralToggle" aria-pressed="false">
            <span class="rx-context-icon">${SVG.syringe}</span>
            <span class="rx-context-copy">
              <strong>Terapia parenterale</strong>
              <small>Rrugë injektive</small>
            </span>
            <span class="rx-context-state" aria-hidden="true"></span>
          </button>
          <button type="button" class="rx-context-toggle" id="rxPediatricToggle" aria-pressed="false">
            <span class="rx-context-icon">${SVG.child}</span>
            <span class="rx-context-copy">
              <strong>Për fëmijë</strong>
              <small>Dozim pediatrik</small>
            </span>
            <span class="rx-context-state" aria-hidden="true"></span>
          </button>
        </div>

        <div class="rx-context-panel" id="rxContextDetails" hidden>
          <header class="rx-context-panel-head">
            <div>
              <span class="rx-context-kicker">Konteksti klinik</span>
              <strong id="rxClinicalContextTitle">Përcakto dozimin para zgjedhjes së barit</strong>
            </div>
            <span class="rx-context-readiness" id="rxContextReadiness">Gati</span>
          </header>

          <div class="rx-context-grid">
            <fieldset class="rx-context-field rx-route-field" id="rxRouteField" hidden>
              <legend>Rruga e administrimit</legend>
              <div class="rx-route-segments" role="radiogroup" aria-label="Rruga parenterale">
                ${ROUTES.map(route => `
                  <button type="button" id="rxRoute${route}" role="radio" aria-checked="false" data-context-route="${route}">
                    <strong>${route}</strong>
                    <small>${ROUTE_LABELS[route]}</small>
                  </button>
                `).join('')}
              </div>
            </fieldset>

            <div class="rx-context-field rx-age-field" id="rxAgeField" hidden>
              <label for="rxPatientAge">Mosha</label>
              <div class="rx-input-combo">
                <input id="rxPatientAge" type="number" min="0" max="216" step="0.1" inputmode="decimal" placeholder="p.sh. 4">
                <select id="rxPatientAgeUnit" aria-label="Njësia e moshës">
                  <option value="years">vjeç</option>
                  <option value="months">muaj</option>
                </select>
              </div>
            </div>

            <div class="rx-context-field rx-weight-field" id="rxWeightField" hidden>
              <label for="rxPatientWeight">Pesha</label>
              <div class="rx-input-combo">
                <input id="rxPatientWeight" type="number" min="0.5" max="200" step="0.1" inputmode="decimal" placeholder="p.sh. 18">
                <span class="rx-input-suffix">kg</span>
              </div>
            </div>
          </div>

          <div class="rx-context-guidance">
            <span class="rx-context-guidance-icon">${SVG.info}</span>
            <span>Doza dhe Signatura plotësohen vetëm nga skema e verifikuar që përputhet me barin, grupmoshën dhe rrugën.</span>
          </div>

          <div class="rx-context-summary" id="rxContextSummary" role="status" aria-live="polite">
            <span class="rx-context-summary-icon">${SVG.shield}</span>
            <span><strong>Konteksti aktiv:</strong> <span data-context-summary></span></span>
          </div>
        </div>
      </section>
    `);
  }

  function renderPreviewContext() {
    const preview = state.document?.getElementById('rxPreview');
    if (!preview) return;

    const paper = preview.querySelector('.rx-paper');
    const existing = preview.querySelector('.rx-preview-context');
    const context = getContext();
    const show = Boolean(paper && (context.parenteral || context.pediatric));

    if (!show) {
      existing?.remove();
      return;
    }

    const validation = validateContext(context);
    const rows = [
      context.parenteral ? ['Terapia', 'Parenterale'] : null,
      context.parenteral ? ['Rruga', context.route || 'E papërcaktuar'] : null,
      ['Popullata', context.pediatric ? 'Fëmijë' : 'Të rritur'],
      context.pediatric ? ['Mosha', ageLabel(context) || 'E paplotësuar'] : null,
      context.pediatric ? ['Pesha', context.weightKg ? `${context.weightKg} kg` : 'E paplotësuar'] : null,
    ].filter(Boolean);

    const markup = `
      <aside class="rx-preview-context${validation.valid ? ' is-verified' : ' is-incomplete'}" data-context-key="${contextKey(context)}">
        <header>
          <span>${SVG.shield}</span>
          <div><strong>Konteksti i dozimit</strong><small>${validation.valid ? 'Skema filtrohet sipas të dhënave të zgjedhura.' : validationMessage(validation)}</small></div>
        </header>
        <dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
      </aside>
    `;

    if (existing?.dataset.contextKey === contextKey(context)
      && existing.classList.contains(validation.valid ? 'is-verified' : 'is-incomplete')) return;

    existing?.remove();
    paper.insertAdjacentHTML('beforebegin', markup);
  }

  function render() {
    if (!state.document) return;
    const context = getContext();
    const validation = validateContext(context);

    const parenteralButton = state.document.getElementById('rxParenteralToggle');
    const pediatricButton = state.document.getElementById('rxPediatricToggle');
    const details = state.document.getElementById('rxContextDetails');

    if (parenteralButton) {
      parenteralButton.classList.toggle('is-active', context.parenteral);
      parenteralButton.setAttribute('aria-pressed', String(context.parenteral));
      parenteralButton.querySelector('small').textContent = context.parenteral
        ? (context.route ? `Aktive · ${context.route}` : 'Zgjidh IV, IM ose SC')
        : 'Rrugë injektive';
      parenteralButton.querySelector('.rx-context-state').textContent = context.parenteral ? '✓' : '';
    }

    if (pediatricButton) {
      pediatricButton.classList.toggle('is-active', context.pediatric);
      pediatricButton.setAttribute('aria-pressed', String(context.pediatric));
      pediatricButton.querySelector('small').textContent = context.pediatric
        ? (context.ageValue && context.weightKg ? `${ageLabel(context)} · ${context.weightKg} kg` : 'Plotëso moshën dhe peshën')
        : 'Dozim pediatrik';
      pediatricButton.querySelector('.rx-context-state').textContent = context.pediatric ? '✓' : '';
    }

    if (details) details.hidden = !context.parenteral && !context.pediatric;

    const routeField = state.document.getElementById('rxRouteField');
    const ageField = state.document.getElementById('rxAgeField');
    const weightField = state.document.getElementById('rxWeightField');

    if (routeField) {
      routeField.hidden = !context.parenteral;
      routeField.classList.toggle('has-error', validation.missing.includes('route'));
    }
    if (ageField) {
      ageField.hidden = !context.pediatric;
      ageField.classList.toggle('has-error', validation.missing.includes('age') || validation.invalid.includes('age'));
    }
    if (weightField) {
      weightField.hidden = !context.pediatric;
      weightField.classList.toggle('has-error', validation.missing.includes('weight') || validation.invalid.includes('weight'));
    }

    state.document.querySelectorAll('[data-context-route]').forEach(button => {
      const selected = context.parenteral && button.dataset.contextRoute === context.route;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected || (!context.route && button.dataset.contextRoute === 'IV') ? 0 : -1;
    });

    const ageInput = state.document.getElementById('rxPatientAge');
    const ageUnit = state.document.getElementById('rxPatientAgeUnit');
    const weightInput = state.document.getElementById('rxPatientWeight');
    if (ageInput && ageInput.value !== context.ageValue) ageInput.value = context.ageValue;
    if (ageUnit) {
      ageUnit.value = context.ageUnit;
      ageInput?.setAttribute('max', context.ageUnit === 'months' ? '216' : '18');
      ageInput?.setAttribute('step', context.ageUnit === 'months' ? '1' : '0.1');
    }
    if (weightInput && weightInput.value !== context.weightKg) weightInput.value = context.weightKg;

    const readiness = state.document.getElementById('rxContextReadiness');
    if (readiness) {
      readiness.textContent = validation.valid ? 'Gati' : 'Plotëso të dhënat';
      readiness.className = `rx-context-readiness ${validation.valid ? 'is-ready' : 'is-incomplete'}`;
    }

    const summary = state.document.querySelector('[data-context-summary]');
    if (summary) summary.textContent = contextSummary(context);

    const summaryBox = state.document.getElementById('rxContextSummary');
    if (summaryBox) summaryBox.classList.toggle('is-incomplete', !validation.valid);

    renderPreviewContext();
  }

  function load() {
    try {
      const current = state.root?.sessionStorage?.getItem(KEY);
      const legacy = state.root?.sessionStorage?.getItem(LEGACY_KEY);
      return normalizeContext(JSON.parse(current || legacy || '{}'));
    } catch {
      return baseContext();
    }
  }

  function persist() {
    try {
      state.root?.sessionStorage?.setItem(KEY, JSON.stringify(getContext()));
      state.root?.sessionStorage?.removeItem(LEGACY_KEY);
    } catch {}
  }

  function applyPayload(payload, appliedContextKey = contextKey()) {
    const next = decorateDosagePayload(payload);
    if (!state.payloadView) state.payloadView = {};
    Object.keys(state.payloadView).forEach(key => {
      if (!Object.hasOwn(next, key)) delete state.payloadView[key];
    });
    Object.assign(state.payloadView, next);
    state.payloadContextKey = appliedContextKey;
    return state.payloadView;
  }

  async function refreshPayloadForContext({ announce = false } = {}) {
    if (!state.payloadView || !state.nativeFetch) return null;

    const requestedContext = getContext();
    const validation = validateContext(requestedContext);
    if (!validation.valid) return null;

    const requestedKey = contextKey(requestedContext);
    if (state.payloadContextKey === requestedKey && !state.refreshPromise) return state.payloadView;
    if (state.refreshPromise) {
      await state.refreshPromise.catch(() => null);
      if (state.payloadContextKey === contextKey()) return state.payloadView;
      return refreshPayloadForContext({ announce });
    }

    if (announce) setStatus('Po përditësohen skemat sipas kontekstit klinik…');

    state.refreshPromise = state.nativeFetch(contextEndpoint(requestedContext), {
      credentials:'same-origin',
      headers:{ Accept:'application/json' },
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Dozologjia ${response.status}`);
      applyPayload(payload, requestedKey);
      return state.payloadView;
    }).catch(error => {
      setStatus(`${error.message}. Doza nuk u aplikua automatikisht.`, 'error');
      throw error;
    }).finally(() => {
      state.refreshPromise = null;
    });

    await state.refreshPromise;
    if (contextKey() !== requestedKey) return refreshPayloadForContext({ announce });
    if (announce) setStatus('Skemat u përshtatën me kontekstin klinik.', 'success');
    return state.payloadView;
  }

  function schedulePayloadRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => {
      if (validateContext(getContext()).valid) refreshPayloadForContext().catch(() => {});
    }, 280);
  }

  function save(value, { refresh = true } = {}) {
    state.context = normalizeContext(value);
    persist();
    render();
    state.root?.dispatchEvent?.(new CustomEvent('medindex:prescription-context-change', {
      detail:{ context:getContext(), valid:validateContext(getContext()).valid },
    }));
    if (refresh) refreshPayloadForContext().catch(() => {});
    return getContext();
  }

  function setContext(value, options = {}) {
    return save(value, options);
  }

  function resetContext({ refresh = true } = {}) {
    state.context = baseContext();
    persist();
    render();
    if (refresh) refreshPayloadForContext().catch(() => {});
    return getContext();
  }

  function hasDraft() {
    return Boolean(
      text(state.document.getElementById('rxComposer')?.value)
      || state.document.querySelector('#rxSelectedDrugs .rx-drug-chip'),
    );
  }

  function changeContext(next, focusId = '') {
    if (hasDraft()) {
      setStatus('Për siguri, hap “Recetë e re” para se të ndryshosh grupmoshën ose terapinë parenterale.', 'error');
      return false;
    }
    save(next);
    if (focusId) state.document.getElementById(focusId)?.focus({ preventScroll:true });
    return true;
  }

  function explicitParenteralRoutes(drug = {}) {
    return [...new Set(routeTokens(
      `${drug.route || ''} ${drug.prescriptionLine || ''} ${drug.prescriptionNotation || ''}`,
    ).filter(route => ROUTES.includes(route)))];
  }

  function compatibleDrug(drug, context = getContext()) {
    const form = text(drug?.form);
    const explicitRoutes = explicitParenteralRoutes(drug);
    const drugParenteral = PARENTERAL_FORM.test(form) || explicitRoutes.length > 0;

    if (context.parenteral && !drugParenteral) {
      return {
        valid:false,
        message:'Për terapinë parenterale zgjidh vetëm ampulë, flakon, injeksion ose infuzion.',
      };
    }
    if (!context.parenteral && drugParenteral) {
      return {
        valid:false,
        message:'Ky preparat është parenteral. Aktivizo terapinë parenterale dhe zgjidh IV, IM ose SC.',
      };
    }

    if (context.parenteral && explicitRoutes.length === 1 && explicitRoutes[0] !== context.route) {
      return {
        valid:false,
        message:`Ky preparat është i shënuar për ${explicitRoutes[0]}, ndërsa konteksti aktiv është ${context.route}.`,
      };
    }
    return { valid:true, message:'' };
  }

  function focusFirstProblem(validation) {
    const id = validation.missing.includes('route')
      ? 'rxRouteIV'
      : validation.missing.includes('age') || validation.invalid.includes('age')
        ? 'rxPatientAge'
        : 'rxPatientWeight';
    state.document.getElementById(id)?.focus?.({ preventScroll:true });
  }

  function persistContextOnSavedPrescription() {
    setTimeout(() => {
      try {
        const items = JSON.parse(state.root.localStorage.getItem(SAVED_KEY) || '[]');
        if (!Array.isArray(items) || !items.length) return;
        const sourceText = state.document.getElementById('rxComposer')?.value || '';
        const diagnosis = state.document.getElementById('rxDiagnosis')?.value || '';
        const candidate = items
          .filter(item => item.sourceText === sourceText || (!sourceText && item.indication === diagnosis))
          .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]
          || items[0];
        if (!candidate) return;
        candidate.clinicalContext = getContext();
        candidate.patientType = getContext().pediatric ? 'pediatric' : 'adult';
        candidate.population = getContext().pediatric ? 'pediatric' : 'adult';
        state.root.localStorage.setItem(SAVED_KEY, JSON.stringify(items));
      } catch {}
    }, 0);
  }

  function inferContextFromProtocol(protocol = {}) {
    if (protocol.clinicalContext) return normalizeContext(protocol.clinicalContext);

    const routeSource = [
      ...(Array.isArray(protocol.sections) ? protocol.sections.map(section => section.route) : []),
      ...(Array.isArray(protocol.items) ? protocol.items.map(item => item.route || item.administrationRoute) : []),
    ].filter(Boolean).join(' ');
    const routes = [...new Set(routeTokens(routeSource).filter(route => ROUTES.includes(route)))];
    const populationValue = fold(protocol.patientType || protocol.population);
    return normalizeContext({
      pediatric:/pediatr|femij|child/.test(populationValue),
      parenteral:routes.length > 0,
      route:routes.length === 1 ? routes[0] : '',
    });
  }

  function restoreContextForSavedPrescription(id) {
    try {
      const items = JSON.parse(state.root.localStorage.getItem(SAVED_KEY) || '[]');
      const protocol = Array.isArray(items) ? items.find(item => String(item.id) === String(id)) : null;
      setContext(inferContextFromProtocol(protocol || {}));
    } catch {
      setContext(baseContext());
    }
  }

  function fetchBridge() {
    if (state.root.__rxContextFetch) return;
    state.nativeFetch = state.root.fetch.bind(state.root);

    state.root.fetch = async (...args) => {
      const input = args[0];
      const originalUrl = typeof input === 'string' ? input : input?.url || '';
      const isDosage = /\/api\/dosage(?:[?#]|$)/.test(originalUrl);
      if (!isDosage) return state.nativeFetch(...args);

      const validation = validateContext(getContext());
      if (!validation.valid) return state.nativeFetch(contextEndpoint(), args[1]);

      const requestedContext = getContext();
      const requestedKey = contextKey(requestedContext);
      const response = await state.nativeFetch(contextEndpoint(requestedContext), args[1]);
      if (!response.ok) return response;

      const payload = await response.clone().json();
      let view = applyPayload(payload, requestedKey);
      if (contextKey() !== requestedKey) {
        view = await refreshPayloadForContext().catch(() => view);
      }

      return new Proxy(response, {
        get(target, property) {
          if (property === 'json') return async () => view;
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };

    state.root.__rxContextFetch = true;
  }

  function engineBridge() {
    const engine = state.root.MedIndexDosageEngine;
    if (!engine || engine.__rxContext) return;

    const original = {
      decideMatch:engine.decideMatch.bind(engine),
      prescriptionTransfer:engine.prescriptionTransfer.bind(engine),
      calculatePediatricDose:engine.calculatePediatricDose.bind(engine),
    };

    engine.decideMatch = (drug, rows) => decideForContext(original, drug, rows, getContext());
    engine.prescriptionTransfer = (drug, regimen) => transferForContext(original, drug, regimen, getContext());
    engine.__rxContext = true;
  }

  function bind() {
    state.document.getElementById('rxParenteralToggle')?.addEventListener('click', () => {
      const context = getContext();
      changeContext({ ...context, parenteral:!context.parenteral }, !context.parenteral ? 'rxRouteIV' : '');
    });

    state.document.getElementById('rxPediatricToggle')?.addEventListener('click', () => {
      const context = getContext();
      changeContext({ ...context, pediatric:!context.pediatric }, !context.pediatric ? 'rxPatientAge' : '');
    });

    state.document.querySelectorAll('[data-context-route]').forEach(button => {
      button.addEventListener('click', () => {
        if (hasDraft()) {
          setStatus('Për siguri, hap “Recetë e re” para se të ndryshosh rrugën e administrimit.', 'error');
          return;
        }
        save({ ...getContext(), route:button.dataset.contextRoute });
      });

      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const current = ROUTES.indexOf(button.dataset.contextRoute);
        const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
        const next = ROUTES[(current + direction + ROUTES.length) % ROUTES.length];
        const nextButton = state.document.querySelector(`[data-context-route="${next}"]`);
        nextButton?.focus();
        nextButton?.click();
      });
    });

    state.document.getElementById('rxPatientAge')?.addEventListener('input', event => {
      save({ ...getContext(), ageValue:event.target.value }, { refresh:false });
      schedulePayloadRefresh();
    });

    state.document.getElementById('rxPatientAgeUnit')?.addEventListener('change', event => {
      save({ ...getContext(), ageUnit:event.target.value }, { refresh:false });
      schedulePayloadRefresh();
    });

    state.document.getElementById('rxPatientWeight')?.addEventListener('input', event => {
      save({ ...getContext(), weightKg:event.target.value }, { refresh:false });
      schedulePayloadRefresh();
    });

    state.document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-drug-result]');
      if (!button) return;

      let drug = null;
      try {
        drug = JSON.parse(decodeURIComponent(button.dataset.drugResult || ''));
      } catch {}

      let activeContext = getContext();
      if (activeContext.parenteral && !activeContext.route) {
        const explicitRoutes = explicitParenteralRoutes(drug);
        if (explicitRoutes.length === 1) {
          save({ ...activeContext, route:explicitRoutes[0] }, { refresh:false });
          activeContext = getContext();
          setStatus(`Rruga ${explicitRoutes[0]} u mor nga regjistri i barit.`, 'success');
        }
      }

      const validation = validateContext(activeContext);
      if (!validation.valid) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setStatus(validationMessage(validation), 'error');
        focusFirstProblem(validation);
        return;
      }

      const compatibility = compatibleDrug(drug, activeContext);
      if (!compatibility.valid) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setStatus(compatibility.message, 'error');
        return;
      }

      const currentKey = contextKey();
      if (state.payloadView && (state.payloadContextKey !== currentKey || state.refreshPromise)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        refreshPayloadForContext({ announce:true })
          .then(() => button.isConnected && button.click())
          .catch(() => {});
      }
    }, true);

    ['rxNew', 'rxClear'].forEach(id => {
      state.document.getElementById(id)?.addEventListener('click', () => {
        setTimeout(() => resetContext(), 0);
      });
    });

    state.document.getElementById('rxSave')?.addEventListener('click', persistContextOnSavedPrescription);

    state.document.getElementById('rxSavedList')?.addEventListener('click', event => {
      const button = event.target.closest?.('[data-open-saved]');
      if (button) restoreContextForSavedPrescription(button.dataset.openSaved);
    }, true);

    const preview = state.document.getElementById('rxPreview');
    if (preview && typeof MutationObserver !== 'undefined') {
      state.previewObserver = new MutationObserver(renderPreviewContext);
      state.previewObserver.observe(preview, { childList:true, subtree:false });
    }
  }

  function init(documentRef, rootRef) {
    if (state.ready || !documentRef) return;
    state.ready = true;
    state.document = documentRef;
    state.root = rootRef;
    state.context = load();

    patchNotation();
    createUi();
    render();
    fetchBridge();
    engineBridge();
    bind();
  }

  return {
    ROUTES,
    ROUTE_LABELS,
    normalizeRoute,
    routeTokens,
    ageMonthsFrom,
    normalizeContext,
    patientFromContext,
    validateContext,
    population,
    isParenteral,
    filterRegimens,
    decorateDosagePayload,
    decideForContext,
    transferForContext,
    compatibleDrug,
    explicitParenteralRoutes,
    inferContextFromProtocol,
    contextSummary,
    contextKey,
    getContext,
    setContext,
    resetContext,
    init,
  };
});
