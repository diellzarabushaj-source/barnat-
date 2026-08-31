(() => {
  'use strict';

  const VERSION = 'registry-v2-dose-calculator-v1';
  const ENDPOINT = '/api/dosage?view=product-rules&registryNumber=';
  const MAX_WEIGHT_KG = 500;
  const MAX_HEIGHT_CM = 250;
  const EPS = 1e-9;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const num = value => {
    const raw = clean(value);
    if (!raw) return null;
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const fmt = value => {
    const n = num(value);
    return n === null ? '—' : new Intl.NumberFormat('sq-XK', { maximumFractionDigits:3 }).format(n);
  };
  const Core = () => window.DRxDoseCore;
  const Runtime = () => window.DRxDoseRuntime;

  let modal = null;
  const state = {
    product:null,
    payload:null,
    registryNumber:'',
    runtimeServed:'',
    cutoverMode:'',
    selectedForV3:false,
    trigger:null,
  };

  function canonicalUnit(value) {
    const raw = clean(value).toLowerCase().replace(/\s+/g, '').replace(/μ/g, 'µ');
    const aliases = {
      milligram:'mg', milligrams:'mg',
      microgram:'µg', micrograms:'µg', mcg:'µg', ug:'µg',
      gram:'g', grams:'g',
      milliliter:'ml', milliliters:'ml', millilitre:'ml', millilitres:'ml',
    };
    return aliases[raw] || raw;
  }

  function massFactorMg(unit) {
    const key = canonicalUnit(unit);
    if (key === 'mg') return 1;
    if (key === 'g') return 1000;
    if (key === 'µg') return .001;
    return null;
  }

  function convertMass(value, fromUnit, toUnit) {
    const n = num(value);
    if (n === null) return null;
    if (canonicalUnit(fromUnit) === canonicalUnit(toUnit)) return n;
    const from = massFactorMg(fromUnit);
    const to = massFactorMg(toUnit);
    return from !== null && to !== null ? n * from / to : null;
  }

  function quantityName(unit, value) {
    const one = Math.abs(Number(value) - 1) < EPS;
    const key = canonicalUnit(unit);
    const labels = {
      tablet:one ? 'tabletë' : 'tableta',
      capsule:one ? 'kapsulë' : 'kapsula',
      suppository:one ? 'supozitor' : 'supozitorë',
      sachet:'qese',
      ampoule:one ? 'ampulë' : 'ampula',
      vial:one ? 'vial' : 'viale',
      dose:one ? 'dozë' : 'doza',
      ml:'mL',
    };
    return labels[key] || clean(unit) || 'njësi';
  }

  function roundQuantity(value, product, conversion) {
    const unit = canonicalUnit(product.denominatorUnit);
    if (unit === 'tablet') {
      const denominator = conversion.tabletSplitAllowed
        ? Math.max(1, Number(product.tabletSplitDenominator) || 1)
        : 1;
      const increment = 1 / denominator;
      const rounded = Math.round(value / increment) * increment;
      if (Math.abs(rounded - value) > EPS && clean(product.roundingMode) === 'exact') return null;
      return rounded;
    }
    const increment = num(conversion.roundingIncrementValue)
      || (unit === 'ml' ? num(product.measurableIncrementMl) : null);
    if (!increment) return value;
    const ratio = value / increment;
    const mode = clean(product.roundingMode);
    if (mode === 'down') return Math.floor(ratio) * increment;
    if (mode === 'up') return Math.ceil(ratio) * increment;
    if (mode === 'nearest') return Math.round(ratio) * increment;
    const rounded = Math.round(ratio) * increment;
    return Math.abs(rounded - value) <= EPS ? rounded : null;
  }

  function exactSourceValid(source = {}) {
    const snapshot = clean(source.snapshotId);
    const sectionHash = clean(source.sectionSha256);
    const evidenceHash = clean(source.evidenceHash);
    return /^[0-9a-f]{64}$/i.test(snapshot)
      && /^[0-9a-f]{64}$/i.test(sectionHash)
      && /^[0-9a-f]{64}$/i.test(evidenceHash)
      && snapshot.toLowerCase() === evidenceHash.toLowerCase()
      && clean(source.section) === '4.2'
      && Boolean(source.documentVersion || source.documentDate)
      && source.official === true;
  }

  function v3RuleValid(rule = {}) {
    const runtime = Runtime();
    if (!runtime?.validateAdjustment) return false;
    const renal = Array.isArray(rule.renalAdjustments) ? rule.renalAdjustments : [];
    const hepatic = Array.isArray(rule.hepaticAdjustments) ? rule.hepaticAdjustments : [];
    const conversion = rule.conversion || {};
    return exactSourceValid(rule.source || {})
      && renal.every(row => runtime.validateAdjustment(row).valid)
      && hepatic.every(row => runtime.validateAdjustment(row).valid)
      && (rule.renalAdjustmentRequired !== true || renal.length > 0)
      && (rule.hepaticAdjustmentRequired !== true || hepatic.length > 0)
      && clean(conversion.bindingStatus).toLowerCase() === 'verified'
      && Boolean(clean(conversion.verifiedBy))
      && Boolean(clean(conversion.verifiedAt))
      && (conversion.enabled === true ? conversion.status === 'automatic' : conversion.status === 'not_allowed');
  }

  function payloadValid(payload) {
    if (!payload?.meta?.failClosed || payload?.meta?.publishedOnly !== true || payload?.meta?.officialVerifiedOnly !== true) return false;
    if (!payload.product?.productKey || !Array.isArray(payload.product.rules) || !payload.product.rules.length) return false;
    if (payload.schemaVersion === 'dose-product-fast-path-v3') return payload.product.rules.every(v3RuleValid);
    return true;
  }

  async function fetchProduct(registryNumber) {
    const response = await fetch(ENDPOINT + encodeURIComponent(registryNumber), {
      method:'GET',
      cache:'no-store',
      credentials:'same-origin',
      headers:{ Accept:'application/json' },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || (response.status === 404 ? 'Nuk ka rregull doze të publikuar për këtë preparat.' : 'Kalkulatori nuk u ngarkua.'));
    }
    const payload = await response.json();
    if (!payloadValid(payload)) throw new Error('Payload-i klinik nuk e kaloi verifikimin fail-closed.');
    return {
      payload,
      runtimeServed:clean(response.headers.get('X-DRx-Dose-Runtime')),
      cutoverMode:clean(response.headers.get('X-DRx-Dose-Cutover-Mode')),
      selectedForV3:response.headers.get('X-DRx-Dose-V3-Selected') === '1',
    };
  }

  function field(label, control, help = '', extra = '') {
    return '<label class="drx-dose-field" ' + extra + '><span>' + label + '</span>' + control
      + (help ? '<small class="drx-dose-help">' + help + '</small>' : '') + '</label>';
  }

  function ensureModal() {
    if (modal) return modal;
    const root = document.createElement('div');
    root.className = 'drx-dose-modal';
    root.hidden = true;
    root.innerHTML = '<div class="drx-dose-backdrop" data-dose-v2-close></div>'
      + '<section class="drx-dose-dialog" role="dialog" aria-modal="true" aria-labelledby="drxDoseTitle">'
      + '<header class="drx-dose-head"><div><span class="drx-dose-eyebrow">DRx · Kalkulator klinik</span><h2 id="drxDoseTitle">Kalkulo dozën</h2></div><button class="drx-dose-close" type="button" data-dose-v2-close aria-label="Mbyll">×</button></header>'
      + '<div class="drx-dose-product"><strong data-dose-product-name>—</strong><small data-dose-product-meta></small></div>'
      + '<div class="drx-dose-runtime-row"><span class="drx-dose-chip" data-dose-runtime>—</span><span class="drx-dose-chip" data-dose-cutover></span></div>'
      + '<div class="drx-dose-form">'
      + field('Indikacioni','<select data-dose-indication></select>','Zgjidh indikacionin e saktë.','data-field="indication"')
      + field('Mosha','<span class="drx-dose-input-pair"><input data-dose-age type="number" min="0" step="0.1" inputmode="decimal" autocomplete="off" placeholder="Mosha"><select data-dose-age-unit aria-label="Njësia e moshës"><option value="years">vjet</option><option value="months">muaj</option><option value="days">ditë</option></select></span>','Për neonatal/infant rules mund të kërkohet mosha në ditë.','data-field="age"')
      + field('Pesha','<input data-dose-weight type="number" min="0.1" max="500" step="0.1" inputmode="decimal" autocomplete="off" placeholder="kg">','kg','data-field="weight" hidden')
      + field('Gjatësia','<input data-dose-height type="number" min="20" max="250" step="0.1" inputmode="decimal" autocomplete="off" placeholder="cm">','cm · për BSA','data-field="height" hidden')
      + field('Dita e trajtimit','<input data-dose-treatment-day type="number" min="1" step="1" inputmode="numeric" autocomplete="off" placeholder="p.sh. 1">','Për skema loading → maintenance / sequence.','data-field="treatmentDay" hidden')
      + field('Varianti klinik','<select data-dose-variant><option value="">Zgjidh…</option></select>','Zgjedhja duhet të përputhet me variantin e verifikuar të skemës.','data-field="variant" hidden')
      + field('CrCl','<input data-dose-crcl type="number" min="0" step="0.1" inputmode="decimal" autocomplete="off" placeholder="mL/min">','Cockcroft–Gault / CrCl; nuk zëvendësohet me eGFR.','data-field="crcl" hidden')
      + field('eGFR','<input data-dose-egfr type="number" min="0" step="0.1" inputmode="decimal" autocomplete="off" placeholder="mL/min/1.73m²">','eGFR; nuk zëvendësohet me CrCl.','data-field="egfr" hidden')
      + field('Dializa','<select data-dose-dialysis><option value="">Zgjidh…</option></select>','','data-field="dialysis" hidden')
      + field('Child-Pugh','<select data-dose-child-pugh><option value="">Zgjidh…</option><option value="none">Nuk aplikohet / pa cirrozë</option></select>','','data-field="childPugh" hidden')
      + field('Gjendja hepatike','<select data-dose-hepatic><option value="">Zgjidh…</option><option value="none">Pa dëmtim hepatik</option></select>','Nëse burimi nuk ka rregull për gjendjen e zgjedhur, kalkulimi bllokohet.','data-field="hepatic" hidden')
      + '</div>'
      + '<p class="drx-dose-note" data-dose-guidance>Rezultati llogaritet automatikisht sapo plotësohen inputet e kërkuara.</p>'
      + '<section class="drx-dose-result" data-dose-result hidden aria-live="polite"><h3 data-dose-result-title>Rezultati</h3><p class="drx-dose-result-text" data-dose-result-text></p><div class="drx-dose-details" data-dose-details></div><div class="drx-dose-actions"><button type="button" data-dose-copy>Kopjo udhëzimin</button><button type="button" data-dose-new>Pacient i ri</button></div></section>'
      + '</section>';
    document.body.appendChild(root);

    const $ = selector => root.querySelector(selector);
    modal = {
      root,
      productName:$('[data-dose-product-name]'),
      productMeta:$('[data-dose-product-meta]'),
      runtime:$('[data-dose-runtime]'),
      cutover:$('[data-dose-cutover]'),
      indication:$('[data-dose-indication]'),
      age:$('[data-dose-age]'),
      ageUnit:$('[data-dose-age-unit]'),
      weight:$('[data-dose-weight]'),
      height:$('[data-dose-height]'),
      treatmentDay:$('[data-dose-treatment-day]'),
      variant:$('[data-dose-variant]'),
      crcl:$('[data-dose-crcl]'),
      egfr:$('[data-dose-egfr]'),
      dialysis:$('[data-dose-dialysis]'),
      childPugh:$('[data-dose-child-pugh]'),
      hepatic:$('[data-dose-hepatic]'),
      guidance:$('[data-dose-guidance]'),
      result:$('[data-dose-result]'),
      resultTitle:$('[data-dose-result-title]'),
      resultText:$('[data-dose-result-text]'),
      details:$('[data-dose-details]'),
      copy:$('[data-dose-copy]'),
      fields:Object.fromEntries([...root.querySelectorAll('[data-field]')].map(node => [node.dataset.field,node])),
    };

    root.querySelectorAll('[data-dose-v2-close]').forEach(node => node.addEventListener('click', close));
    root.querySelector('[data-dose-new]').addEventListener('click', resetPatient);
    modal.copy.addEventListener('click', copyResult);
    [
      modal.indication,modal.age,modal.ageUnit,modal.weight,modal.height,modal.treatmentDay,
      modal.variant,modal.crcl,modal.egfr,modal.dialysis,modal.childPugh,modal.hepatic,
    ].forEach(control => {
      control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => {
        updateAdaptiveFields();
        calculate({ silent:true });
      });
    });
    return modal;
  }

  function selectedRules() {
    if (!state.product || !modal) return [];
    const key = clean(modal.indication.value);
    return state.product.rules.filter(rule => clean(rule.indicationKey) === key);
  }

  function coreInputs(rule) {
    return Core()?.requiredInputs ? Core().requiredInputs(rule) : [];
  }

  function setVisible(name, visible) {
    const wrapper = modal?.fields?.[name];
    if (wrapper) wrapper.hidden = !visible;
  }

  function adjustmentValues(rules, measure) {
    const values = new Set();
    for (const rule of rules) {
      for (const row of [...(rule.renalAdjustments || []), ...(rule.hepaticAdjustments || [])]) {
        if (Runtime()?.normalizeMeasure(row.measureType) !== measure) continue;
        const accepted = row.acceptedValues ?? row.severityOrClass ?? [];
        for (const item of Array.isArray(accepted) ? accepted : [accepted]) {
          const value = clean(item);
          if (value) values.add(value);
        }
      }
    }
    return [...values];
  }

  function fillSelect(select, values, { preserveSpecial = false } = {}) {
    const previous = select.value;
    const special = preserveSpecial ? [...select.options].filter(option => option.value === '' || option.value === 'none').map(option => ({value:option.value,text:option.textContent})) : [{value:'',text:'Zgjidh…'}];
    select.replaceChildren();
    for (const item of special) {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.text;
      select.appendChild(option);
    }
    for (const value of values) {
      if ([...select.options].some(option => option.value.toLowerCase() === value.toLowerCase())) continue;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }

  function updateAdaptiveFields() {
    if (!modal || !state.product) return;
    const rules = selectedRules();
    const required = new Set(rules.flatMap(coreInputs));
    const measures = new Set(rules.flatMap(rule => Runtime()?.requiredMeasureTypes?.(rule) || []));

    setVisible('weight', required.has('weight_kg'));
    setVisible('height', required.has('height_cm'));
    setVisible('treatmentDay', required.has('treatment_day'));

    const variantRules = rules.filter(rule => rule.conditionReviewRequired === true || required.has('clinical_variant'));
    const variantOptions = [...new Map(variantRules
      .filter(rule => clean(rule.regimenOptionKey))
      .map(rule => [clean(rule.regimenOptionKey), clean(rule.conditionText) || clean(rule.regimenOptionKey)])).entries()];
    setVisible('variant', required.has('clinical_variant'));
    if (required.has('clinical_variant')) {
      const previous = modal.variant.value;
      modal.variant.replaceChildren(new Option('Zgjidh…',''));
      variantOptions.forEach(([value,label]) => modal.variant.appendChild(new Option(label,value)));
      if ([...modal.variant.options].some(option => option.value === previous)) modal.variant.value = previous;
    }

    setVisible('crcl', measures.has('CrCl_mL_min'));
    setVisible('egfr', measures.has('eGFR_mL_min_1_73m2'));
    setVisible('dialysis', measures.has('dialysis_status'));
    setVisible('childPugh', measures.has('Child_Pugh_class'));
    setVisible('hepatic', measures.has('hepatic_impairment_textual'));

    if (measures.has('dialysis_status')) fillSelect(modal.dialysis, adjustmentValues(rules,'dialysis_status'));
    if (measures.has('Child_Pugh_class')) fillSelect(modal.childPugh, adjustmentValues(rules,'Child_Pugh_class'), { preserveSpecial:true });
    if (measures.has('hepatic_impairment_textual')) fillSelect(modal.hepatic, adjustmentValues(rules,'hepatic_impairment_textual'), { preserveSpecial:true });

    const manual = required.has('cardiac_status') || required.has('manual_clinical_review')
      || (required.has('clinical_variant') && variantOptions.length === 0);
    const notes = [];
    if (required.has('age_days')) notes.push('Kjo skemë kërkon moshën në ditë.');
    if (measures.has('CrCl_mL_min')) notes.push('CrCl kërkohet si input i veçantë; eGFR nuk përdoret si zëvendësim.');
    if (measures.has('eGFR_mL_min_1_73m2')) notes.push('eGFR kërkohet si input i veçantë.');
    if (manual) notes.push('Kjo skemë përmban një komponent që kërkon review manual.');
    modal.guidance.textContent = notes.length
      ? notes.join(' ')
      : 'Rezultati llogaritet automatikisht sapo plotësohen inputet e kërkuara.';
  }

  function patientFromForm() {
    const age = num(modal.age.value);
    const unit = modal.ageUnit.value;
    const patient = {
      ageMonths:age === null ? null : unit === 'years' ? age * 12 : unit === 'months' ? age : age / 30.4375,
      ageDays:age === null || unit !== 'days' ? null : age,
      weightKg:num(modal.weight.value),
      heightCm:num(modal.height.value),
      treatmentDay:num(modal.treatmentDay.value),
      clinicalVariant:clean(modal.variant.value),
      crClMlMin:num(modal.crcl.value),
      eGfrMlMin173m2:num(modal.egfr.value),
      dialysisStatus:clean(modal.dialysis.value),
      childPughClass:clean(modal.childPugh.value),
      hepaticImpairment:clean(modal.hepatic.value),
    };
    return patient;
  }

  const INPUT_LABELS = Object.freeze({
    age_months:'mosha',
    age_days:'mosha në ditë',
    weight_kg:'pesha',
    height_cm:'gjatësia',
    treatment_day:'dita e trajtimit',
    clinical_variant:'varianti klinik',
    renal_function:'funksioni renal',
    hepatic_function:'funksioni hepatik',
    cardiac_status:'statusi kardiak',
    manual_clinical_review:'review klinik',
    CrCl_mL_min:'CrCl',
    eGFR_mL_min_1_73m2:'eGFR',
    dialysis_status:'statusi i dializës',
    Child_Pugh_class:'Child-Pugh',
    hepatic_impairment_textual:'gjendja hepatike',
  });

  function friendlyInput(value) {
    return INPUT_LABELS[value] || value;
  }

  function clearResult() {
    modal.result.hidden = true;
    modal.result.classList.remove('is-error','is-info');
    modal.resultText.textContent = '';
    modal.details.replaceChildren();
  }

  function showMessage(title, message, type = 'error') {
    modal.result.hidden = false;
    modal.result.classList.toggle('is-error', type === 'error');
    modal.result.classList.toggle('is-info', type === 'info');
    modal.resultTitle.textContent = title;
    modal.resultText.textContent = message;
    modal.details.replaceChildren();
  }

  function detail(label, value) {
    const row = document.createElement('div');
    row.className = 'drx-dose-detail';
    const strong = document.createElement('strong');
    strong.textContent = label;
    const span = document.createElement('span');
    span.textContent = value;
    row.append(strong,span);
    return row;
  }

  function frequencyText(rule = {}) {
    const mode = clean(rule.frequencyMode);
    const times = num(rule.timesPerDay);
    const min = num(rule.intervalMinHours);
    const max = num(rule.intervalMaxHours);
    if (mode === 'once') return 'një herë';
    if (mode === 'times_per_day' && times !== null) return fmt(times) + ' herë/ditë';
    if (mode === 'interval' && min !== null) return max === null || Math.abs(min-max)<EPS ? 'çdo ' + fmt(min) + ' orë' : 'çdo ' + fmt(min) + '–' + fmt(max) + ' orë';
    if (mode === 'prn') return 'sipas nevojës';
    return 'sipas skemës së verifikuar';
  }

  function durationText(rule = {}) {
    const mode = clean(rule.durationMode);
    const min = num(rule.durationMinDays);
    const max = num(rule.durationMaxDays);
    if (mode === 'single_dose') return 'një dozë';
    if (mode === 'prn') return 'sipas nevojës';
    if (min !== null && max !== null) return Math.abs(min-max)<EPS ? fmt(min)+' ditë' : fmt(min)+'–'+fmt(max)+' ditë';
    if (num(rule.reviewAfterDays) !== null) return 'rivlerësim pas '+fmt(rule.reviewAfterDays)+' ditësh';
    return 'sipas indikacionit';
  }

  function doseRangeText(range, unit) {
    if (!range) return '';
    return Math.abs(range.min-range.max)<EPS
      ? fmt(range.min)+' '+unit
      : fmt(range.min)+'–'+fmt(range.max)+' '+unit;
  }

  function quantityFor(result, rule) {
    if (!result.perDose) return null;
    const product = state.product;
    const conversion = rule.conversion || {};
    if (conversion.enabled !== true || conversion.status !== 'automatic') return null;
    const numerator = num(product.numeratorValue);
    const denominator = num(product.denominatorValue);
    if (!(numerator > 0) || !(denominator > 0)) return null;
    const minDose = convertMass(result.perDose.min, result.doseUnit, product.numeratorUnit);
    const maxDose = convertMass(result.perDose.max, result.doseUnit, product.numeratorUnit);
    if (minDose === null || maxDose === null) return null;
    const min = roundQuantity(minDose * denominator / numerator, product, conversion);
    const max = roundQuantity(maxDose * denominator / numerator, product, conversion);
    if (min === null || max === null) return { error:true };
    return { min,max,unit:product.denominatorUnit };
  }

  function successful(outcome) {
    const core = Core();
    return [core.OUTCOME.CALCULATED,core.OUTCOME.RANGE,core.OUTCOME.DAILY_ONLY].includes(outcome);
  }

  function preferredUnique(entries) {
    if (entries.length <= 1) return entries;
    const preferred = entries.filter(item => item.rule.preferred === true);
    return preferred.length === 1 ? preferred : entries;
  }

  function manualReason(reasons = []) {
    const map = {
      specialist_review:'Burimi kërkon vlerësim specialistik për këtë gjendje.',
      contraindicated:'Kjo skemë është e kundërindikuar për gjendjen e zgjedhur.',
      avoid:'Burimi rekomandon shmangien e kësaj skeme për gjendjen e zgjedhur.',
      no_exact_adjustment_match:'Nuk ka rregull të verifikuar që përputhet saktë me këtë gjendje.',
      renal_adjustment_evidence_missing:'Mungon adjustment renal i verifikuar.',
      hepatic_adjustment_evidence_missing:'Mungon adjustment hepatik i verifikuar.',
      multiple_adjustment_matches:'U gjetën disa adjustment-e të mundshme; kërkohet review.',
      multiple_dose_changing_adjustments_require_manual_review:'Ka më shumë se një ndryshim doze; kërkohet review manual.',
    };
    return reasons.map(reason => map[reason] || reason).join(' ');
  }

  function renderSuccess(entry) {
    const { rule,result } = entry;
    const effective = result.adjustedRule || rule;
    const dose = result.perDose ? doseRangeText(result.perDose,result.doseUnit) : '';
    const daily = result.daily ? doseRangeText(result.daily,result.doseUnit) : '';
    const quantity = quantityFor(result,effective);
    if (quantity?.error) {
      showMessage('Konvertimi u bllokua','Doza e llogaritur nuk mund të rrumbullakohet në preparatin aktual pa devijuar nga rregulli i verifikuar.');
      return;
    }
    let quantityText = '';
    if (quantity) {
      quantityText = Math.abs(quantity.min-quantity.max)<EPS
        ? fmt(quantity.min)+' '+quantityName(quantity.unit,quantity.min)
        : fmt(quantity.min)+'–'+fmt(quantity.max)+' '+quantityName(quantity.unit,quantity.max);
    }

    const primary = quantityText || dose || daily;
    const suffix = result.perDose ? ' · '+frequencyText(effective) : ' · dozë ditore totale';
    modal.result.hidden = false;
    modal.result.classList.remove('is-error','is-info');
    modal.resultTitle.textContent = 'Rezultati i verifikuar';
    modal.resultText.textContent = primary + suffix + ' · ' + durationText(effective) + '.';

    const rows = [
      detail('Doza për administrim',dose || '—'),
      detail('Doza ditore',daily || '—'),
      detail('Preparati',state.product.displayLabel || state.product.tradeName || '—'),
      detail('Konvertimi',quantityText || (effective.conversion?.status === 'not_allowed' ? 'Konvertimi automatik nuk lejohet.' : 'Nuk aplikohet automatikisht.')),
      detail('Shpeshtësia',frequencyText(effective)),
      detail('Kohëzgjatja',durationText(effective)),
      detail('Runtime',state.runtimeServed || '—'),
    ];
    if (result.appliedAdjustments?.length) {
      rows.push(detail('Adjustments',result.appliedAdjustments.map(item => item.domain+': '+item.action).join(' · ')));
    }
    if (effective.source) {
      rows.push(detail('Burimi',[effective.source.sourceKey,effective.source.documentVersion||effective.source.documentDate,'§'+(effective.source.section||'4.2')].filter(Boolean).join(' · ')));
    }
    modal.details.replaceChildren(...rows);
  }

  function calculate({ silent = false } = {}) {
    if (!modal || !state.product) return;
    const core = Core();
    const runtime = Runtime();
    if (!core?.calculate || !runtime?.calculate) {
      if (!silent) showMessage('Kalkulimi u bllokua','Motori klinik nuk është ngarkuar.');
      return;
    }
    const rules = selectedRules();
    if (!rules.length) {
      showMessage('Nuk ka rregull','Nuk ka rregull të publikuar për këtë indikacion.');
      return;
    }

    const required = new Set(rules.flatMap(coreInputs));
    if (required.has('clinical_variant') && !rules.some(rule => clean(rule.regimenOptionKey))) {
      showMessage('Review manual','Varianti klinik nuk ka opsion të strukturuar të verifikuar.');
      return;
    }
    if (required.has('cardiac_status') || required.has('manual_clinical_review')) {
      showMessage('Review manual','Kjo skemë nuk lejohet për kalkulim automatik pa review klinik.');
      return;
    }

    const patient = patientFromForm();
    if (patient.weightKg !== null && (patient.weightKg <= 0 || patient.weightKg > MAX_WEIGHT_KG)) {
      showMessage('Kontrollo peshën','Pesha është jashtë kufirit teknik të kalkulatorit.');
      return;
    }
    if (patient.heightCm !== null && (patient.heightCm <= 0 || patient.heightCm > MAX_HEIGHT_CM)) {
      showMessage('Kontrollo gjatësinë','Gjatësia është jashtë kufirit teknik të kalkulatorit.');
      return;
    }

    const entries = rules.map(rule => ({ rule, result:runtime.calculate(rule,patient,state.product) }));
    const good = preferredUnique(entries.filter(item => successful(item.result.outcome)));
    if (good.length === 1) {
      renderSuccess(good[0]);
      return;
    }
    if (good.length > 1) {
      showMessage('Kalkulimi u bllokua','U gjetën disa rregulla të vlefshme njëkohësisht. Kërkohet review klinik.');
      return;
    }

    const missing = [...new Set(entries
      .filter(item => item.result.outcome === core.OUTCOME.NEEDS_INPUT)
      .flatMap(item => item.result.missing || []))];
    if (missing.length) {
      if (silent) {
        showMessage('Plotëso inputet','Mungojnë: '+missing.map(friendlyInput).join(', ')+'.','info');
      } else {
        showMessage('Mungojnë të dhënat','Plotëso: '+missing.map(friendlyInput).join(', ')+'.','info');
      }
      return;
    }

    const manual = entries.filter(item => item.result.outcome === core.OUTCOME.MANUAL_REVIEW);
    if (manual.length) {
      const reasons = [...new Set(manual.flatMap(item => item.result.reasons || [item.result.reason]).filter(Boolean))];
      showMessage('Review manual',manualReason(reasons) || 'Rregulli kërkon review klinik/manual.');
      return;
    }

    const invalid = entries.find(item => item.result.outcome === core.OUTCOME.INVALID_RULE);
    if (invalid) {
      showMessage('Rregull jo-deterministik','Rregulli i publikuar nuk e kaloi kontratën e kalkulimit: '+clean(invalid.result.reason)+'.');
      return;
    }
    showMessage('Jashtë intervalit','Nuk ka rregull që përputhet me moshën, peshën, ditën e trajtimit dhe variantin e zgjedhur.');
  }

  function populateProduct() {
    const product = state.product;
    modal.productName.textContent = product.displayLabel || product.tradeName || 'Preparat';
    modal.productMeta.textContent = [product.activeSubstance,product.pharmaceuticalForm,product.route].filter(Boolean).join(' · ');

    const indications = new Map();
    product.rules.forEach(rule => {
      const key = clean(rule.indicationKey);
      if (key && !indications.has(key)) indications.set(key,clean(rule.indicationName)||key);
    });
    modal.indication.replaceChildren();
    indications.forEach((label,key) => modal.indication.appendChild(new Option(label,key)));

    modal.runtime.textContent = state.runtimeServed === 'v3' ? 'V3 · verified' : (state.runtimeServed || 'V2 · verified');
    modal.runtime.className = 'drx-dose-chip' + (state.runtimeServed === 'v3' ? ' is-v3' : (state.runtimeServed.includes('fallback') ? ' is-fallback' : ''));
    modal.cutover.textContent = state.cutoverMode ? 'Cutover '+state.cutoverMode : '';
    resetPatient(false);
    updateAdaptiveFields();
    calculate({ silent:true });
  }

  function resetPatient(focus = true) {
    if (!modal) return;
    [modal.age,modal.weight,modal.height,modal.treatmentDay,modal.crcl,modal.egfr].forEach(input => { input.value=''; });
    [modal.variant,modal.dialysis,modal.childPugh,modal.hepatic].forEach(select => { select.value=''; });
    modal.ageUnit.value='years';
    clearResult();
    updateAdaptiveFields();
    if (focus) modal.age.focus();
  }

  function close() {
    if (!modal) return;
    modal.root.hidden = true;
    document.body.classList.remove('drx-dose-modal-open');
    const trigger = state.trigger;
    state.product = null;
    state.payload = null;
    if (trigger?.isConnected) trigger.focus({ preventScroll:true });
  }

  function copyResult() {
    const value = clean(modal?.resultText?.textContent);
    if (!value) return;
    navigator.clipboard?.writeText?.(value).then(() => {
      const original = modal.copy.textContent;
      modal.copy.textContent='U kopjua ✓';
      setTimeout(() => { if (modal) modal.copy.textContent=original; },1200);
    }).catch(() => {});
  }

  async function open(registryNumber, trigger = null) {
    const nr = clean(registryNumber);
    if (!nr) return;
    ensureModal();
    state.trigger = trigger;
    state.registryNumber = nr;
    modal.root.hidden = false;
    document.body.classList.add('drx-dose-modal-open');
    modal.productName.textContent = 'Duke ngarkuar…';
    modal.productMeta.textContent = 'Po verifikohet payload-i klinik.';
    modal.runtime.textContent = 'loading';
    modal.cutover.textContent = '';
    clearResult();

    try {
      const loaded = await fetchProduct(nr);
      state.payload = loaded.payload;
      state.product = loaded.payload.product;
      state.runtimeServed = loaded.runtimeServed;
      state.cutoverMode = loaded.cutoverMode;
      state.selectedForV3 = loaded.selectedForV3;
      populateProduct();
      requestAnimationFrame(() => modal.indication.focus());
    } catch (error) {
      state.product = null;
      modal.productName.textContent = 'Kalkulatori nuk u hap';
      modal.productMeta.textContent = '';
      showMessage('Fail-closed',error?.message || 'Payload-i klinik nuk u ngarkua.');
    }
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-dose-calculator-open]');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    void open(trigger.dataset.registryNumber,trigger);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal && !modal.root.hidden) close();
  });

  window.DRxRegistryDoseCalculator = Object.freeze({
    version:VERSION,
    open,
    _test:Object.freeze({
      canonicalUnit,convertMass,roundQuantity,exactSourceValid,v3RuleValid,payloadValid,
      patientFromForm,successful,preferredUnique,frequencyText,durationText,
    }),
  });
})();
