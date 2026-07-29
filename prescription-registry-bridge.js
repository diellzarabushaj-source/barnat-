(function (root, factory) {
  const api = factory(root?.MedIndexAdministrationRoutes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexPrescriptionContext = api;
  if (root?.document) {
    const run = () => api.init(root.document, root);
    root.document.readyState === 'loading'
      ? root.document.addEventListener('DOMContentLoaded', run, { once:true })
      : run();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Administration) {
  'use strict';

  if (!Administration && typeof require === 'function') {
    try { Administration = require('./administration-routes.js'); } catch {}
  }
  if (!Administration) throw new Error('MedIndexAdministrationRoutes mungon.');

  const KEY = 'medindex_rx_clinical_context_v3';
  const LEGACY_KEYS = ['medindex_rx_clinical_context_v2', 'medindex_rx_clinical_context_v1'];
  const SAVED_KEY = 'regjistriBarnave_protokollet_v1';
  const { CATEGORIES, CATEGORY_ORDER, ROUTE_LABELS } = Administration;
  const SVG = Object.freeze({
    enteral:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v4a4 4 0 0 1-4 4H9v4a4 4 0 0 0 4 4h3"/><path d="M8 7h8M7 3h10"/></svg>',
    parenteral:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5 5 5M13 6l5 5M4 20l5.5-5.5m0 0 5-5 2 2-5 5m-2-2 2 2M3 21l3-1-2-2-1 3Z"/><path d="m16.5 2.5 5 5"/></svg>',
    topical:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c4-2 6-6 8-12 3 2 6 5 8 9-2 4-5 6-9 6-3 0-5-1-7-3Z"/><path d="M7 16c3 0 6-2 8-6"/></svg>',
    inhalation:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v7c0 3-2 5-5 5M16 4v7c0 3 2 5 5 5"/><path d="M8 9c2-2 3-3 4-3s2 1 4 3M12 6v14"/></svg>',
    child:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M8 8H6a3 3 0 0 0-3 3v1m13-4h2a3 3 0 0 1 3 3v1M7 14c.8 4 2.5 6 5 6s4.2-2 5-6M9 12h6"/></svg>',
    shield:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>',
  });
  const CATEGORY_ICONS = Object.freeze({ ENTERAL:SVG.enteral, PARENTERAL:SVG.parenteral, TOPICAL_LOCAL:SVG.topical, INHALATION:SVG.inhalation });

  const state = {
    document:null, root:null, context:null, ready:false, nativeFetch:null,
    payloadView:null, payloadContextKey:'', refreshPromise:null, refreshTimer:0, previewObserver:null,
  };
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const numberValue = value => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  function baseContext() {
    return { administrationCategory:'ENTERAL', route:'PO', pediatric:false, ageValue:'', ageUnit:'years', weightKg:'' };
  }

  function normalizeContext(value = {}) {
    const legacyCategory = value.parenteral === true ? 'PARENTERAL' : '';
    const category = Administration.normalizeCategory(value.administrationCategory || value.category || legacyCategory) || 'ENTERAL';
    let route = Administration.normalizeRoute(value.route);
    if (!Administration.routeBelongsToCategory(route, category)) route = '';
    if (!route && category === 'ENTERAL') route = 'PO';
    return {
      administrationCategory:category,
      route,
      pediatric:Boolean(value.pediatric),
      ageValue:text(value.ageValue),
      ageUnit:value.ageUnit === 'months' ? 'months' : 'years',
      weightKg:text(value.weightKg),
    };
  }

  function patientFromContext(value) {
    const context = normalizeContext(value);
    const age = numberValue(context.ageValue);
    return {
      ageMonths:age == null || age < 0 ? null : Math.round(context.ageUnit === 'months' ? age : age * 12),
      weightKg:numberValue(context.weightKg),
    };
  }

  function validateContext(value) {
    const context = normalizeContext(value);
    const missing = [];
    const invalid = [];
    if (!context.administrationCategory) missing.push('category');
    if (!context.route) missing.push('route');
    else if (!Administration.routeBelongsToCategory(context.route, context.administrationCategory)) invalid.push('route');
    if (context.pediatric) {
      const patient = patientFromContext(context);
      if (!context.ageValue) missing.push('age');
      else if (!Number.isFinite(patient.ageMonths) || patient.ageMonths < 0 || patient.ageMonths > 216) invalid.push('age');
      if (!context.weightKg) missing.push('weight');
      else if (!Number.isFinite(patient.weightKg) || patient.weightKg < 0.5 || patient.weightKg > 200) invalid.push('weight');
    }
    return { valid:!missing.length && !invalid.length, missing, invalid, context };
  }

  function population(regimen = {}) {
    const source = text(regimen._medindexPopulation || regimen.population).toLowerCase();
    if (/pediatr|femij|fëmij|child/.test(source)) return 'pediatric';
    if (/adult|rritur/.test(source)) return 'adult';
    return regimen.mgPerKg != null || regimen.mgPerKgMin != null || regimen.minAgeMonths != null || text(regimen.formula)
      ? 'pediatric' : 'adult';
  }

  function regimenAdministration(regimen = {}) {
    return Administration.inferAdministration({
      administrationCategory:regimen.administrationCategory,
      allowedRoutes:regimen.allowedRoutes,
      form:regimen.form,
      route:regimen.route,
    });
  }

  function isParenteral(regimen = {}) {
    return regimenAdministration(regimen).category === 'PARENTERAL';
  }

  function filterRegimens(rows, value) {
    const context = normalizeContext(value);
    const wantedPopulation = context.pediatric ? 'pediatric' : 'adult';
    return (Array.isArray(rows) ? rows : []).filter(regimen => {
      if (population(regimen) !== wantedPopulation) return false;
      const administration = regimenAdministration(regimen);
      if (administration.category !== context.administrationCategory) return false;
      const routes = Administration.routeTokens(regimen.route || administration.routes.join(' '));
      return routes.length === 1 && routes[0] === context.route;
    });
  }

  function decorateDosagePayload(payload = {}) {
    const adult = (payload.adult || []).map(item => ({ ...item, _medindexPopulation:'adult' }));
    const pediatric = (payload.pediatric || []).map(item => ({ ...item, _medindexPopulation:'pediatric' }));
    return { ...payload, adult:[...adult, ...pediatric], pediatric };
  }

  function decideForContext(engine, drug, rows, value) {
    const context = normalizeContext(value);
    const validation = validateContext(context);
    if (!validation.valid) return { status:'needs-clinical-context', matches:[], missing:validation.missing, invalid:validation.invalid };
    return engine.decideMatch(drug, filterRegimens(rows, context), {
      population:context.pediatric ? 'pediatric' : 'adult',
      patient:context.pediatric ? patientFromContext(context) : {},
    });
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
        warnings:'Plotëso kategorinë, rrugën, grupmoshën dhe peshën para dozimit.',
      };
    }

    const contextualRegimen = { ...regimen, administrationCategory:context.administrationCategory, route:context.route };
    let calculation = context.pediatric && regimen.serverContextVerified ? regimen.serverCalculation : null;
    if (context.pediatric) {
      if (!calculation || !['calculated', 'range-calculated'].includes(calculation.status)) {
        calculation = engine.calculatePediatricDose(contextualRegimen, patientFromContext(context));
      }
      if (!['calculated', 'range-calculated'].includes(calculation.status)) {
        return {
          ...engine.prescriptionTransfer(drug, contextualRegimen, wantedPopulation, null),
          dosageStatus:'requires-review', signatura:'',
          warnings:[text(contextualRegimen.warnings), 'Skema pediatrike nuk u llogarit; kërkohet verifikim manual.'].filter(Boolean).join(' · '),
        };
      }
    }

    const output = engine.prescriptionTransfer(drug, contextualRegimen, wantedPopulation, calculation);
    output.administrationCategory = context.administrationCategory;
    output.route = context.route;
    if (regimen.serverContextVerified && text(regimen.serverSignature) && calculation?.status !== 'range-calculated') {
      output.signatura = text(regimen.serverSignature);
    }
    if (context.administrationCategory === 'PARENTERAL' && output.signatura) {
      output.signatura = output.signatura.replace(/^(Merret|Jepen)\b/i, 'Administrohet');
    }
    if (calculation?.status === 'range-calculated') {
      output.dosageStatus = 'requires-review';
      output.signatura = '';
      output.calculatedDoseRange = engine.calculatedRangeText(calculation);
      output.warnings = [
        text(output.warnings),
        `Kalkulatori llogariti ${output.calculatedDoseRange || 'një diapazon doze'}; zgjidhja e dozës përfundimtare varet nga indikacioni dhe protokolli.`,
      ].filter(Boolean).join(' · ');
    }
    if (calculation?.cappedBy?.length) {
      output.dosageStatus = 'requires-review';
      output.warnings = [text(output.warnings), `Doza u kufizua nga: ${calculation.cappedBy.join(', ')}.`].filter(Boolean).join(' · ');
    }
    return output;
  }

  const getContext = () => normalizeContext(state.context || baseContext());
  function contextKey(value = getContext()) {
    const context = normalizeContext(value);
    const patient = patientFromContext(context);
    return [context.pediatric ? 'pediatric' : 'adult', context.administrationCategory, context.route,
      context.pediatric ? patient.ageMonths : '', context.pediatric ? patient.weightKg : ''].join('|');
  }
  function contextEndpoint(value = getContext()) {
    const context = normalizeContext(value);
    const patient = patientFromContext(context);
    const query = new URLSearchParams({
      population:context.pediatric ? 'pediatric' : 'adult',
      category:context.administrationCategory,
      route:context.route,
      parenteral:String(context.administrationCategory === 'PARENTERAL'),
    });
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
    if (validation.missing.includes('category')) return 'Zgjidh kategorinë e administrimit.';
    if (validation.missing.includes('route') || validation.invalid.includes('route')) return 'Zgjidh rrugën e saktë të administrimit.';
    if (validation.missing.includes('age') || validation.missing.includes('weight')) return 'Për fëmijë shëno moshën dhe peshën.';
    if (validation.invalid.includes('age')) return 'Mosha duhet të jetë ndërmjet 0 dhe 18 vjeç.';
    if (validation.invalid.includes('weight')) return 'Pesha duhet të jetë ndërmjet 0.5 dhe 200 kg.';
    return '';
  }
  function ageLabel(context) {
    if (!context.ageValue) return '';
    return context.ageUnit === 'months' ? `${context.ageValue} muaj` : `${context.ageValue} vjeç`;
  }
  function contextSummary(value = getContext()) {
    const context = normalizeContext(value);
    const parts = [Administration.categoryLabel(context.administrationCategory) || context.administrationCategory];
    if (context.route) parts.push(`${context.route} · ${Administration.routeLabel(context.route)}`);
    parts.push(context.pediatric ? 'Fëmijë' : 'Të rritur');
    if (context.pediatric && context.ageValue) parts.push(ageLabel(context));
    if (context.pediatric && context.weightKg) parts.push(`${context.weightKg} kg`);
    return parts.join(' · ');
  }

  function patchNotation() {
    const core = state.root?.MedIndexPrescriptionFormat;
    if (!core || core.__registryNotationReady) return;
    const originalNormalizeDrug = core.normalizeDrug.bind(core);
    const originalSelectedDrugLine = core.selectedDrugLine.bind(core);
    core.normalizeDrug = item => {
      const normalized = originalNormalizeDrug(item);
      const administration = Administration.inferAdministration(item);
      return {
        ...normalized,
        packaging:text(item?.packaging || item?.packageSize),
        packagingSummary:text(item?.packagingSummary),
        prescriptionLine:text(item?.prescriptionLine),
        prescriptionNotation:text(item?.prescriptionNotation),
        sheetPrescriptionNotation:text(item?.sheetPrescriptionNotation),
        dispense:text(item?.dispense || normalized.dispense),
        administrationCategory:text(item?.administrationCategory || item?.__administrationCategory || item?.['Kategoria e administrimit'] || administration.category),
        allowedRoutes:Array.isArray(item?.allowedRoutes) ? item.allowedRoutes
          : Array.isArray(item?.__allowedRoutes) ? item.__allowedRoutes
            : Administration.routeTokens(item?.['Rrugët e lejuara'] || administration.routes.join(' ')),
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
        <div class="rx-context-heading">
          <div><span class="rx-context-kicker">Rruga e barit</span><strong id="rxClinicalContextTitle">Zgjidh kategorinë e administrimit</strong></div>
          <span class="rx-context-readiness" id="rxContextReadiness">Gati</span>
        </div>
        <div class="rx-category-grid" role="radiogroup" aria-label="Kategoria e administrimit">
          ${CATEGORY_ORDER.map(category => `
            <button type="button" class="rx-category-button" data-context-category="${category}" role="radio" aria-checked="false">
              <span class="rx-context-icon">${CATEGORY_ICONS[category]}</span>
              <span><strong>${CATEGORIES[category].label}</strong><small>${CATEGORIES[category].description}</small></span>
              <span class="rx-context-state" aria-hidden="true"></span>
            </button>
          `).join('')}
        </div>
        <div class="rx-context-lower">
          <div class="rx-context-panel" id="rxContextDetails">
            <fieldset class="rx-context-field rx-route-field" id="rxRouteField">
              <legend>Rruga specifike</legend>
              <div class="rx-route-segments" id="rxRouteSegments" role="radiogroup" aria-label="Rruga specifike"></div>
            </fieldset>
            <div class="rx-context-guidance">
              <span class="rx-context-guidance-icon">${SVG.info}</span>
              <span>Kategoria merret nga prezantimi i barit. Doza automatike përdoret vetëm kur formula, indikacioni, grupmosha dhe rruga janë të verifikuara.</span>
            </div>
          </div>
          <button type="button" class="rx-pediatric-toggle" id="rxPediatricToggle" aria-pressed="false">
            <span class="rx-context-icon">${SVG.child}</span>
            <span><strong>Për fëmijë</strong><small>Aktivizon kalkulatorin sipas formulës së barit</small></span>
            <span class="rx-context-state" aria-hidden="true"></span>
          </button>
        </div>
        <div class="rx-pediatric-fields" id="rxPediatricFields" hidden>
          <div class="rx-context-field rx-age-field" id="rxAgeField">
            <label for="rxPatientAge">Mosha</label>
            <div class="rx-input-combo"><input id="rxPatientAge" type="number" min="0" max="18" step="0.1" inputmode="decimal" placeholder="p.sh. 4"><select id="rxPatientAgeUnit" aria-label="Njësia e moshës"><option value="years">vjeç</option><option value="months">muaj</option></select></div>
          </div>
          <div class="rx-context-field rx-weight-field" id="rxWeightField">
            <label for="rxPatientWeight">Pesha</label>
            <div class="rx-input-combo"><input id="rxPatientWeight" type="number" min="0.5" max="200" step="0.1" inputmode="decimal" placeholder="p.sh. 18"><span class="rx-input-suffix">kg</span></div>
          </div>
          <div class="rx-context-summary" id="rxContextSummary" role="status" aria-live="polite"><span class="rx-context-summary-icon">${SVG.shield}</span><span><strong>Konteksti aktiv:</strong> <span data-context-summary></span></span></div>
        </div>
      </section>
    `);
  }

  function renderRoutes(context, validation) {
    const holder = state.document.getElementById('rxRouteSegments');
    if (!holder) return;
    const routes = Administration.routesForCategory(context.administrationCategory);
    const signature = `${context.administrationCategory}:${routes.join(',')}`;
    if (holder.dataset.signature !== signature) {
      holder.dataset.signature = signature;
      holder.innerHTML = routes.map(route => `<button type="button" role="radio" aria-checked="false" data-context-route="${route}"><strong>${route}</strong><small>${ROUTE_LABELS[route]}</small></button>`).join('');
      bindRouteButtons(holder);
    }
    holder.classList.toggle('has-error', validation.missing.includes('route') || validation.invalid.includes('route'));
    holder.querySelectorAll('[data-context-route]').forEach((button, index) => {
      const selected = button.dataset.contextRoute === context.route;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected || (!context.route && index === 0) ? 0 : -1;
    });
  }

  function renderPreviewContext() {
    const preview = state.document?.getElementById('rxPreview');
    if (!preview) return;
    const paper = preview.querySelector('.rx-paper');
    const existing = preview.querySelector('.rx-preview-context');
    const context = getContext();
    const show = Boolean(paper);
    if (!show) { existing?.remove(); return; }
    const validation = validateContext(context);
    const rows = [
      ['Kategoria', Administration.categoryLabel(context.administrationCategory)],
      ['Rruga', context.route ? `${context.route} · ${Administration.routeLabel(context.route)}` : 'E papërcaktuar'],
      ['Popullata', context.pediatric ? 'Fëmijë' : 'Të rritur'],
      context.pediatric ? ['Mosha', ageLabel(context) || 'E paplotësuar'] : null,
      context.pediatric ? ['Pesha', context.weightKg ? `${context.weightKg} kg` : 'E paplotësuar'] : null,
    ].filter(Boolean);
    const key = contextKey(context);
    if (existing?.dataset.contextKey === key && existing.classList.contains(validation.valid ? 'is-verified' : 'is-incomplete')) return;
    existing?.remove();
    paper.insertAdjacentHTML('beforebegin', `
      <aside class="rx-preview-context ${validation.valid ? 'is-verified' : 'is-incomplete'}" data-context-key="${key}">
        <header><span>${SVG.shield}</span><div><strong>Konteksti i dozimit</strong><small>${validation.valid ? 'Skemat janë filtruar sipas kategorisë, rrugës dhe popullatës.' : validationMessage(validation)}</small></div></header>
        <dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
      </aside>
    `);
  }

  function render() {
    if (!state.document) return;
    const context = getContext();
    const validation = validateContext(context);
    state.document.querySelectorAll('[data-context-category]').forEach(button => {
      const selected = button.dataset.contextCategory === context.administrationCategory;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-checked', String(selected));
      button.querySelector('.rx-context-state').textContent = selected ? '✓' : '';
    });
    renderRoutes(context, validation);
    const pediatricButton = state.document.getElementById('rxPediatricToggle');
    if (pediatricButton) {
      pediatricButton.classList.toggle('is-active', context.pediatric);
      pediatricButton.setAttribute('aria-pressed', String(context.pediatric));
      pediatricButton.querySelector('small').textContent = context.pediatric
        ? (context.ageValue && context.weightKg ? `${ageLabel(context)} · ${context.weightKg} kg` : 'Plotëso moshën dhe peshën')
        : 'Aktivizon kalkulatorin sipas formulës së barit';
      pediatricButton.querySelector('.rx-context-state').textContent = context.pediatric ? '✓' : '';
    }
    const pediatricFields = state.document.getElementById('rxPediatricFields');
    if (pediatricFields) pediatricFields.hidden = !context.pediatric;
    const ageField = state.document.getElementById('rxAgeField');
    const weightField = state.document.getElementById('rxWeightField');
    ageField?.classList.toggle('has-error', validation.missing.includes('age') || validation.invalid.includes('age'));
    weightField?.classList.toggle('has-error', validation.missing.includes('weight') || validation.invalid.includes('weight'));
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
    state.document.getElementById('rxContextSummary')?.classList.toggle('is-incomplete', !validation.valid);
    renderPreviewContext();
  }

  function load() {
    try {
      const current = state.root?.sessionStorage?.getItem(KEY);
      const legacy = LEGACY_KEYS.map(key => state.root?.sessionStorage?.getItem(key)).find(Boolean);
      return normalizeContext(JSON.parse(current || legacy || '{}'));
    } catch { return baseContext(); }
  }
  function persist() {
    try {
      state.root?.sessionStorage?.setItem(KEY, JSON.stringify(getContext()));
      LEGACY_KEYS.forEach(key => state.root?.sessionStorage?.removeItem(key));
    } catch {}
  }
  function applyPayload(payload, appliedContextKey = contextKey()) {
    const next = decorateDosagePayload(payload);
    if (!state.payloadView) state.payloadView = {};
    Object.keys(state.payloadView).forEach(key => { if (!Object.hasOwn(next, key)) delete state.payloadView[key]; });
    Object.assign(state.payloadView, next);
    state.payloadContextKey = appliedContextKey;
    return state.payloadView;
  }
  async function refreshPayloadForContext({ announce = false } = {}) {
    if (!state.payloadView || !state.nativeFetch) return null;
    const requestedContext = getContext();
    if (!validateContext(requestedContext).valid) return null;
    const requestedKey = contextKey(requestedContext);
    if (state.payloadContextKey === requestedKey && !state.refreshPromise) return state.payloadView;
    if (state.refreshPromise) {
      await state.refreshPromise.catch(() => null);
      return state.payloadContextKey === contextKey() ? state.payloadView : refreshPayloadForContext({ announce });
    }
    if (announce) setStatus('Po filtrohen skemat sipas kategorisë dhe rrugës…');
    state.refreshPromise = state.nativeFetch(contextEndpoint(requestedContext), {
      credentials:'same-origin', headers:{ Accept:'application/json' },
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Dozologjia ${response.status}`);
      applyPayload(payload, requestedKey);
      return state.payloadView;
    }).catch(error => {
      setStatus(`${error.message}. Doza nuk u aplikua automatikisht.`, 'error');
      throw error;
    }).finally(() => { state.refreshPromise = null; });
    await state.refreshPromise;
    if (contextKey() !== requestedKey) return refreshPayloadForContext({ announce });
    if (announce) setStatus('Skemat u përshtatën me kategorinë, rrugën dhe popullatën.', 'success');
    return state.payloadView;
  }
  function schedulePayloadRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => { if (validateContext(getContext()).valid) refreshPayloadForContext().catch(() => {}); }, 280);
  }
  function save(value, { refresh = true } = {}) {
    state.context = normalizeContext(value);
    persist(); render();
    state.root?.dispatchEvent?.(new CustomEvent('medindex:prescription-context-change', {
      detail:{ context:getContext(), valid:validateContext(getContext()).valid },
    }));
    if (refresh) refreshPayloadForContext().catch(() => {});
    return getContext();
  }
  const setContext = (value, options = {}) => save(value, options);
  function resetContext({ refresh = true } = {}) {
    state.context = baseContext(); persist(); render();
    if (refresh) refreshPayloadForContext().catch(() => {});
    return getContext();
  }
  function hasDraft() {
    return Boolean(text(state.document.getElementById('rxComposer')?.value) || state.document.querySelector('#rxSelectedDrugs .rx-drug-chip'));
  }
  function changeContext(next, focusId = '') {
    if (hasDraft()) {
      setStatus('Për siguri, hap “Recetë e re” para se të ndryshosh kategorinë, rrugën ose grupmoshën.', 'error');
      return false;
    }
    save(next);
    if (focusId) state.document.getElementById(focusId)?.focus({ preventScroll:true });
    return true;
  }

  function drugAdministration(drug = {}) {
    return Administration.inferAdministration({
      administrationCategory:drug.administrationCategory || drug.__administrationCategory || drug['Kategoria e administrimit'],
      allowedRoutes:drug.allowedRoutes || drug.__allowedRoutes || drug['Rrugët e lejuara'],
      form:drug.form || drug['Forma farmaceutike'],
      route:[drug.route, drug.prescriptionLine, drug.prescriptionNotation].filter(Boolean).join(' '),
    });
  }
  function explicitParenteralRoutes(drug = {}) {
    const administration = drugAdministration(drug);
    return administration.category === 'PARENTERAL' ? administration.routes : [];
  }
  function compatibleDrug(drug, context = getContext()) {
    const administration = drugAdministration(drug);
    if (!administration.category) return { valid:false, message:'Kategoria e këtij prezantimi nuk është përcaktuar; kërkohet verifikim në databazë.' };
    if (administration.category !== context.administrationCategory) {
      return { valid:false, message:`Ky prezantim është ${Administration.categoryLabel(administration.category)}, ndërsa konteksti është ${Administration.categoryLabel(context.administrationCategory)}.` };
    }
    if (administration.routes.length === 1 && administration.routes[0] !== context.route) {
      return { valid:false, message:`Ky prezantim përdor rrugën ${administration.routes[0]}, ndërsa është zgjedhur ${context.route}.` };
    }
    if (administration.routes.length > 1 && !administration.routes.includes(context.route)) {
      return { valid:false, message:`Zgjidh njërën nga rrugët e lejuara: ${administration.routes.join(', ')}.` };
    }
    return { valid:true, message:'' };
  }
  function focusFirstProblem(validation) {
    const id = validation.missing.includes('route') || validation.invalid.includes('route')
      ? 'rxRouteSegments'
      : validation.missing.includes('age') || validation.invalid.includes('age') ? 'rxPatientAge' : 'rxPatientWeight';
    state.document.getElementById(id)?.querySelector?.('button')?.focus?.({ preventScroll:true });
    state.document.getElementById(id)?.focus?.({ preventScroll:true });
  }

  function persistContextOnSavedPrescription() {
    setTimeout(() => {
      try {
        const items = JSON.parse(state.root.localStorage.getItem(SAVED_KEY) || '[]');
        if (!Array.isArray(items) || !items.length) return;
        const sourceText = state.document.getElementById('rxComposer')?.value || '';
        const diagnosis = state.document.getElementById('rxDiagnosis')?.value || '';
        const candidate = items.filter(item => item.sourceText === sourceText || (!sourceText && item.indication === diagnosis))
          .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || items[0];
        if (!candidate) return;
        candidate.clinicalContext = getContext();
        candidate.patientType = getContext().pediatric ? 'pediatric' : 'adult';
        candidate.population = getContext().pediatric ? 'pediatric' : 'adult';
        candidate.administrationCategory = getContext().administrationCategory;
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
    const routes = Administration.routeTokens(routeSource);
    const route = routes.length === 1 ? routes[0] : '';
    const category = Administration.normalizeCategory(protocol.administrationCategory) || Administration.categoryForRoute(route) || 'ENTERAL';
    const populationValue = text(protocol.patientType || protocol.population).toLowerCase();
    return normalizeContext({ administrationCategory:category, route, pediatric:/pediatr|femij|fëmij|child/.test(populationValue) });
  }
  function restoreContextForSavedPrescription(id) {
    try {
      const items = JSON.parse(state.root.localStorage.getItem(SAVED_KEY) || '[]');
      const protocol = Array.isArray(items) ? items.find(item => String(item.id) === String(id)) : null;
      setContext(inferContextFromProtocol(protocol || {}));
    } catch { setContext(baseContext()); }
  }

  function fetchBridge() {
    if (state.root.__rxContextFetch) return;
    state.nativeFetch = state.root.fetch.bind(state.root);
    state.root.fetch = async (...args) => {
      const input = args[0];
      const originalUrl = typeof input === 'string' ? input : input?.url || '';
      if (!/\/api\/dosage(?:[?#]|$)/.test(originalUrl)) return state.nativeFetch(...args);
      const requestedContext = getContext();
      const requestedKey = contextKey(requestedContext);
      const response = await state.nativeFetch(contextEndpoint(requestedContext), args[1]);
      if (!response.ok) return response;
      const payload = await response.clone().json();
      let view = applyPayload(payload, requestedKey);
      if (contextKey() !== requestedKey) view = await refreshPayloadForContext().catch(() => view);
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
      calculatedRangeText:engine.calculatedRangeText.bind(engine),
    };
    engine.decideMatch = (drug, rows) => decideForContext(original, drug, rows, getContext());
    engine.prescriptionTransfer = (drug, regimen) => transferForContext(original, drug, regimen, getContext());
    engine.__rxContext = true;
  }

  function bindRouteButtons(holder = state.document.getElementById('rxRouteSegments')) {
    holder?.querySelectorAll('[data-context-route]').forEach(button => {
      button.addEventListener('click', () => {
        if (hasDraft()) {
          setStatus('Për siguri, hap “Recetë e re” para se të ndryshosh rrugën.', 'error');
          return;
        }
        save({ ...getContext(), route:button.dataset.contextRoute });
      });
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...holder.querySelectorAll('[data-context-route]')];
        const current = buttons.indexOf(button);
        const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
        const next = buttons[(current + direction + buttons.length) % buttons.length];
        next?.focus(); next?.click();
      });
    });
  }

  function bind() {
    state.document.querySelectorAll('[data-context-category]').forEach(button => {
      button.addEventListener('click', () => {
        const category = button.dataset.contextCategory;
        const defaultRoute = CATEGORIES[category]?.defaultRoute || '';
        changeContext({ ...getContext(), administrationCategory:category, route:defaultRoute }, 'rxRouteSegments');
      });
    });
    state.document.getElementById('rxPediatricToggle')?.addEventListener('click', () => {
      const context = getContext();
      changeContext({ ...context, pediatric:!context.pediatric }, !context.pediatric ? 'rxPatientAge' : '');
    });
    state.document.getElementById('rxPatientAge')?.addEventListener('input', event => {
      save({ ...getContext(), ageValue:event.target.value }, { refresh:false }); schedulePayloadRefresh();
    });
    state.document.getElementById('rxPatientAgeUnit')?.addEventListener('change', event => {
      save({ ...getContext(), ageUnit:event.target.value }, { refresh:false }); schedulePayloadRefresh();
    });
    state.document.getElementById('rxPatientWeight')?.addEventListener('input', event => {
      save({ ...getContext(), weightKg:event.target.value }, { refresh:false }); schedulePayloadRefresh();
    });

    state.document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-drug-result]');
      if (!button) return;
      let drug = null;
      try { drug = JSON.parse(decodeURIComponent(button.dataset.drugResult || '')); } catch {}
      const inferred = drugAdministration(drug || {});
      let active = getContext();

      if (inferred.category && !hasDraft()) {
        const nextRoute = inferred.routes.length === 1
          ? inferred.routes[0]
          : inferred.routes.includes(active.route) && active.administrationCategory === inferred.category ? active.route : '';
        if (active.administrationCategory !== inferred.category || active.route !== nextRoute) {
          save({ ...active, administrationCategory:inferred.category, route:nextRoute }, { refresh:false });
          active = getContext();
          setStatus(inferred.routes.length === 1
            ? `${Administration.categoryLabel(inferred.category)} · ${nextRoute} u identifikua nga prezantimi i barit.`
            : `${Administration.categoryLabel(inferred.category)} u identifikua; zgjidh rrugën ${inferred.routes.join(', ')}.`,
          inferred.routes.length === 1 ? 'success' : '');
        }
      }

      const validation = validateContext(active);
      if (!validation.valid) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        setStatus(validationMessage(validation), 'error'); focusFirstProblem(validation); return;
      }
      const compatibility = compatibleDrug(drug, active);
      if (!compatibility.valid) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        setStatus(compatibility.message, 'error'); return;
      }
      const currentKey = contextKey();
      if (state.payloadView && (state.payloadContextKey !== currentKey || state.refreshPromise)) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        refreshPayloadForContext({ announce:true }).then(() => button.isConnected && button.click()).catch(() => {});
      }
    }, true);

    ['rxNew', 'rxClear'].forEach(id => state.document.getElementById(id)?.addEventListener('click', () => setTimeout(() => resetContext(), 0)));
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
    state.ready = true; state.document = documentRef; state.root = rootRef; state.context = load();
    patchNotation(); createUi(); render(); fetchBridge(); engineBridge(); bind();
  }

  return {
    CATEGORIES, CATEGORY_ORDER, ROUTE_LABELS,
    normalizeRoute:Administration.normalizeRoute,
    routeTokens:Administration.routeTokens,
    normalizeContext, patientFromContext, validateContext, population, regimenAdministration, isParenteral,
    filterRegimens, decorateDosagePayload, decideForContext, transferForContext, drugAdministration,
    compatibleDrug, explicitParenteralRoutes, inferContextFromProtocol, contextSummary, contextKey,
    getContext, setContext, resetContext, init,
  };
});