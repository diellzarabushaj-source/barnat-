(() => {
  'use strict';

  const VERSION = 'registry-dose-calculator-v2.1.0';
  const ENDPOINT = '/api/dose-calculator';
  const COLUMN_KEY = 'dose-calculator';
  const ADULT_MONTHS = 216;
  const EPSILON = 0.000001;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const num = value => {
    const raw = clean(value);
    if (!raw) return null;
    const parsed = Number(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const fmt = value => {
    const numeric = num(value);
    return numeric === null ? '—' : new Intl.NumberFormat('sq-AL', { maximumFractionDigits: 3 }).format(numeric);
  };
  const esc = value => clean(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const within = (value, min, max) => {
    if (value === null) return min === null && max === null;
    if (min !== null && value < min) return false;
    if (max !== null && value > max) return false;
    return true;
  };
  const ageGroup = months => months === null ? null : months < ADULT_MONTHS ? 'pediatric' : 'adult';
  const groupAllowed = (ruleGroup, group) => ruleGroup === 'pediatric_and_adult'
    || (group === 'pediatric' && ruleGroup === 'pediatric_only')
    || (group === 'adult' && ruleGroup === 'adult_only');
  const needsWeightMethod = method => ['dose_per_kg_per_dose','dose_per_kg_per_day'].includes(clean(method));
  const needsBsaMethod = method => ['dose_per_m2_per_dose','dose_per_m2_per_day'].includes(clean(method));

  let registry = { status:'loading', byNumber:new Map(), byDrugKey:new Map() };
  let catalog = { status:'loading', byPdid:new Map(), byRegistryNumber:new Map(), byProductKey:new Map() };
  let modal = null;
  let activeProduct = null;
  let enhanceQueued = false;
  let observer = null;

  function addUnique(map, key, value) {
    const normalized = clean(key);
    if (!normalized) return;
    if (!map.has(normalized)) map.set(normalized, value);
    else if (map.get(normalized)?.productKey !== value?.productKey) map.set(normalized, null);
  }

  function waitForRows() {
    if (Array.isArray(window.MEDINDEX_REGISTRY_ROWS)) return Promise.resolve(window.MEDINDEX_REGISTRY_ROWS);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Regjistri nuk u bë gati me kohë.')), 30000);
      const ready = event => {
        const rows = event.detail?.rows || window.MEDINDEX_REGISTRY_ROWS;
        if (!Array.isArray(rows)) return;
        clearTimeout(timer);
        window.removeEventListener('medindex:registry-data-ready', ready);
        resolve(rows);
      };
      window.addEventListener('medindex:registry-data-ready', ready);
    });
  }

  async function loadRegistry() {
    try {
      const rows = await waitForRows();
      const byNumber = new Map();
      const byDrugKey = new Map();
      rows.forEach(row => {
        const number = clean(row['Nr rendor']);
        if (number) byNumber.set(number, row);
        addUnique(byDrugKey, [row.PDID,row['Emri tregtar'],row['Fortësia']].map(clean).join('|'), row);
      });
      registry = { status:'ready', byNumber, byDrugKey };
    } catch (error) {
      console.error('Dose calculator registry:', error);
      registry = { status:'error', byNumber:new Map(), byDrugKey:new Map() };
    }
    scheduleEnhance();
  }

  async function loadCatalog() {
    try {
      const response = await fetch(ENDPOINT, { cache:'no-store', credentials:'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.meta?.failClosed || !payload?.meta?.officialVerifiedOnly || !Array.isArray(payload.catalog)) {
        throw new Error('Kontrata e katalogut nuk është e vlefshme.');
      }
      const byPdid = new Map();
      const byRegistryNumber = new Map();
      const byProductKey = new Map();
      payload.catalog.forEach(product => {
        if (!product?.productKey || !Array.isArray(product.rules) || !product.rules.length) return;
        byProductKey.set(clean(product.productKey), product);
        addUnique(byPdid, product.pdid, product);
        addUnique(byRegistryNumber, product.registryNumber, product);
      });
      catalog = { status:'ready', byPdid, byRegistryNumber, byProductKey };
    } catch (error) {
      console.error('Dose calculator catalog:', error);
      catalog = { status:'error', byPdid:new Map(), byRegistryNumber:new Map(), byProductKey:new Map() };
    }
    scheduleEnhance();
  }

  function headerIndex() {
    const result = new Map();
    document.querySelectorAll('#headerRow > th').forEach((th, index) => {
      const label = clean(th.textContent).replace(/[▲▼↕]/g, '').trim();
      if (label && !result.has(label)) result.set(label, index);
    });
    return result;
  }

  function registryRow(tableRow, index) {
    const numberIndex = index.get('Nr');
    if (Number.isInteger(numberIndex)) {
      const row = registry.byNumber.get(clean(tableRow.children[numberIndex]?.textContent));
      if (row) return row;
    }
    const key = clean(tableRow.querySelector('.drug-select')?.dataset.drugKey);
    return key ? registry.byDrugKey.get(key) || null : null;
  }

  function productFor(row) {
    if (!row) return null;
    return catalog.byPdid.get(clean(row.PDID)) || catalog.byRegistryNumber.get(clean(row['Nr rendor'])) || null;
  }

  function productGroup(product) {
    const rules = product?.rules || [];
    const pediatric = rules.some(rule => groupAllowed(clean(rule.patientGroup), 'pediatric'));
    const adult = rules.some(rule => groupAllowed(clean(rule.patientGroup), 'adult'));
    if (pediatric && adult) return 'pediatric_and_adult';
    if (pediatric) return 'pediatric_only';
    return 'adult_only';
  }

  function groupLabel(group) {
    if (group === 'pediatric_only') return 'VETËM PEDIATRIK';
    if (group === 'adult_only') return 'VETËM TË RRITUR';
    return 'FËMIJË + TË RRITUR';
  }

  function isParenteral(product) {
    const text = `${clean(product?.route)} ${clean(product?.pharmaceuticalForm)}`.toLowerCase();
    return /(^|[\s,;/])(iv|im|sc)([\s,;/]|$)|intraven|intramus|subcut|injection|infusion|injectable/.test(text);
  }

  function ensureHeader() {
    const row = document.getElementById('headerRow');
    if (!row || row.querySelector(`[data-registry-dose-calculator-column="${COLUMN_KEY}"]`)) return;
    const th = document.createElement('th');
    th.className = 'registry-dose-calculator-column dose-table-header';
    th.dataset.registryDoseCalculatorColumn = COLUMN_KEY;
    th.dataset.registryColumnKey = COLUMN_KEY;
    th.dataset.doseHeaderMeta = 'Doza individuale';
    th.scope = 'col';
    th.textContent = 'Doza';
    row.appendChild(th);
  }

  function calculatorCell(product) {
    const td = document.createElement('td');
    td.className = 'registry-dose-calculator-column';
    td.dataset.registryDoseCalculatorColumn = COLUMN_KEY;
    td.dataset.registryColumnKey = COLUMN_KEY;
    td.dataset.label = 'Doza';
    if (catalog.status === 'loading' || registry.status === 'loading') {
      td.classList.add('dose-table-cell-loading');
      td.innerHTML = '<span class="registry-dosage-muted">…</span>';
      return td;
    }
    if (!product || catalog.status !== 'ready' || registry.status !== 'ready') {
      td.classList.add('dose-table-cell-empty');
      td.innerHTML = '<span class="registry-dosage-muted" aria-label="Nuk ka kalkulator">—</span>';
      return td;
    }
    const group = productGroup(product);
    td.classList.add('dose-table-cell-ready');
    td.innerHTML = `<span class="dose-calculator-group dose-calculator-group-${esc(group)}">${esc(groupLabel(group))}</span>`
      + `<button type="button" class="dose-calculator-open" data-dose-product-key="${esc(product.productKey)}">Kalkulo</button>`;
    return td;
  }

  function ensureRows() {
    const index = headerIndex();
    document.querySelectorAll('#tbody > tr').forEach(tr => {
      if (tr.querySelector('.empty-state')) return;
      const product = productFor(registryRow(tr, index));
      tr.classList.remove('has-pediatric-only-dose-calculator','has-all-ages-dose-calculator','has-adult-only-dose-calculator','has-parenteral-dose-calculator');
      if (product) {
        const group = productGroup(product);
        tr.classList.add(group === 'pediatric_only' ? 'has-pediatric-only-dose-calculator' : group === 'adult_only' ? 'has-adult-only-dose-calculator' : 'has-all-ages-dose-calculator');
        if (isParenteral(product)) tr.classList.add('has-parenteral-dose-calculator');
      }
      const existing = tr.querySelector(`[data-registry-dose-calculator-column="${COLUMN_KEY}"]`);
      const desired = calculatorCell(product);
      if (!existing) tr.appendChild(desired);
      else if (existing.innerHTML !== desired.innerHTML || existing.className !== desired.className) existing.replaceWith(desired);
    });
  }

  function ageMonths() {
    if (!modal) return null;
    const age = num(modal.age.value);
    if (age === null || age < 0) return null;
    return modal.ageUnit.value === 'months' ? age : age * 12;
  }

  function indicationRules() {
    if (!modal || !activeProduct) return [];
    const key = clean(modal.indication.value);
    return activeProduct.rules.filter(rule => clean(rule.indicationKey) === key);
  }

  function ageMatchedRules() {
    const months = ageMonths();
    if (months === null) return indicationRules();
    const group = ageGroup(months);
    return indicationRules().filter(rule => groupAllowed(clean(rule.patientGroup), group)
      && within(months, num(rule.minAgeMonths), num(rule.maxAgeMonths)));
  }

  function updateAdaptiveFields() {
    if (!modal) return;
    const indications = modal.indication.options.length;
    modal.indicationField.hidden = indications <= 1;
    const rules = ageMatchedRules();
    const needsWeight = rules.some(rule => needsWeightMethod(rule.calculationMethod)
      || num(rule.minWeightKg) !== null || num(rule.maxWeightKg) !== null);
    modal.weightField.hidden = !needsWeight;
    modal.weight.required = needsWeight;
    if (!needsWeight) modal.weight.value = '';
  }

  function quantityName(unit, value) {
    const singular = Math.abs(Number(value) - 1) < EPSILON;
    const names = {
      tablet:singular ? 'tabletë' : 'tableta', capsule:singular ? 'kapsulë' : 'kapsula',
      suppository:singular ? 'supozitor' : 'supozitorë', sachet:'qese', ampoule:singular ? 'ampulë' : 'ampula',
      vial:singular ? 'vial' : 'viale', dose:singular ? 'dozë' : 'doza', mL:'mL',
    };
    return names[clean(unit)] || clean(unit);
  }

  function roundQuantity(value, product, conversion) {
    const unit = clean(product.denominatorUnit);
    if (unit === 'tablet') {
      const denominator = conversion.tabletSplitAllowed ? Math.max(1, Number(product.tabletSplitDenominator) || 1) : 1;
      const increment = 1 / denominator;
      const rounded = Math.round(value / increment) * increment;
      return Math.abs(rounded - value) <= EPSILON || clean(product.roundingMode) !== 'exact' ? rounded : null;
    }
    const increment = num(conversion.roundingIncrementValue) || (unit === 'mL' ? num(product.measurableIncrementMl) : null);
    if (!increment) return value;
    const ratio = value / increment;
    const mode = clean(product.roundingMode);
    if (mode === 'down') return Math.floor(ratio) * increment;
    if (mode === 'up') return Math.ceil(ratio) * increment;
    if (mode === 'nearest') return Math.round(ratio) * increment;
    const rounded = Math.round(ratio) * increment;
    return Math.abs(rounded - value) <= EPSILON ? rounded : null;
  }

  function computeDose(rule, product, weightKg) {
    const minDose = num(rule.doseMinValue);
    const maxDose = num(rule.doseMaxValue ?? rule.doseMinValue);
    if (rule.calculationMethod === 'manual_only') return { error:'Ky rast kërkon vlerësim klinik manual.' };
    if (needsBsaMethod(rule.calculationMethod)) return { error:'Ky rregull kërkon BSA dhe nuk llogaritet vetëm nga mosha/pesha.' };
    if (minDose === null || maxDose === null) return { error:'Rregulli nuk ka vlera numerike të plota.' };

    let doseMin = minDose;
    let doseMax = maxDose;
    let calculation = 'Dozë fikse sipas grupmoshës/indikacionit.';
    if (needsWeightMethod(rule.calculationMethod)) {
      if (weightKg === null || weightKg <= 0) return { error:'Shkruaje peshën në kg.' };
      doseMin *= weightKg;
      doseMax *= weightKg;
      calculation = `${fmt(weightKg)} kg × ${fmt(minDose)}${Math.abs(minDose-maxDose) > EPSILON ? `–${fmt(maxDose)}` : ''} ${rule.doseUnit}/kg`;
      if (rule.calculationMethod === 'dose_per_kg_per_day') {
        const times = num(rule.timesPerDay);
        if (!times) return { error:'Mungon numri i dozave në ditë.' };
        doseMin /= times;
        doseMax /= times;
        calculation += ` ÷ ${fmt(times)} doza/ditë`;
      }
    }

    if (clean(rule.doseUnit).toLowerCase() === 'mg' && num(rule.maxSingleDoseMg) !== null) {
      doseMin = Math.min(doseMin, num(rule.maxSingleDoseMg));
      doseMax = Math.min(doseMax, num(rule.maxSingleDoseMg));
    }

    const conversion = rule.conversion || {};
    const numerator = num(product.numeratorValue);
    const denominator = num(product.denominatorValue);
    const sameUnit = clean(product.numeratorUnit).toLowerCase() === clean(rule.doseUnit).toLowerCase();
    let quantityMin = null;
    let quantityMax = null;
    let conversionText = 'Shfaqet doza në mg; forma e preparatit kërkon verifikim praktik.';
    if (conversion.enabled && conversion.status === 'automatic' && numerator && denominator && sameUnit) {
      quantityMin = roundQuantity(doseMin * denominator / numerator, product, conversion);
      quantityMax = roundQuantity(doseMax * denominator / numerator, product, conversion);
      if (quantityMin === null || quantityMax === null) {
        quantityMin = quantityMax = null;
      } else {
        const doseText = Math.abs(doseMin-doseMax) < EPSILON ? fmt(doseMin) : `${fmt(doseMin)}–${fmt(doseMax)}`;
        const qtyText = Math.abs(quantityMin-quantityMax) < EPSILON ? fmt(quantityMin) : `${fmt(quantityMin)}–${fmt(quantityMax)}`;
        conversionText = `${doseText} ${rule.doseUnit} = ${qtyText} ${quantityName(product.denominatorUnit, quantityMax)}`;
      }
    }
    return { doseMin,doseMax,quantityMin,quantityMax,calculation,conversionText };
  }

  function frequencyText(rule) {
    const min = num(rule.intervalMinHours);
    const max = num(rule.intervalMaxHours);
    const times = num(rule.timesPerDay);
    if (rule.frequencyMode === 'once') return '1 herë në ditë';
    if (rule.frequencyMode === 'interval' && min !== null) return max !== null && max !== min ? `çdo ${fmt(min)}–${fmt(max)} orë` : `çdo ${fmt(min)} orë`;
    if (rule.frequencyMode === 'times_per_day' && times !== null) return `${fmt(times)} herë në ditë`;
    if (rule.frequencyMode === 'prn') return 'sipas nevojës';
    return 'sipas rregullit';
  }

  function clearResult() {
    if (!modal) return;
    modal.result.hidden = true;
    modal.result.classList.remove('is-error');
    modal.resultText.textContent = '';
    modal.details.replaceChildren();
    modal.copy.disabled = true;
  }

  function showError(message, silent = false) {
    if (silent) return clearResult();
    modal.result.hidden = false;
    modal.result.classList.add('is-error');
    modal.resultText.textContent = message;
    modal.copy.disabled = true;
  }

  function detail(label, value) {
    const row = document.createElement('div');
    row.className = 'dose-calculator-detail-row';
    const strong = document.createElement('strong');
    strong.textContent = label;
    const span = document.createElement('span');
    span.textContent = value;
    row.append(strong, span);
    return row;
  }

  function calculate({ silent = false } = {}) {
    clearResult();
    if (!activeProduct) return;
    const months = ageMonths();
    if (months === null) return showError('Shkruaje moshën.', silent);
    const group = ageGroup(months);
    const rules = indicationRules();
    const ageRules = rules.filter(rule => groupAllowed(clean(rule.patientGroup), group)
      && within(months, num(rule.minAgeMonths), num(rule.maxAgeMonths)));
    if (!ageRules.length) return showError('Nuk ka rregull për këtë moshë dhe indikacion.', silent);

    const needsWeight = ageRules.some(rule => needsWeightMethod(rule.calculationMethod)
      || num(rule.minWeightKg) !== null || num(rule.maxWeightKg) !== null);
    const weight = needsWeight ? num(modal.weight.value) : null;
    if (needsWeight && (weight === null || weight <= 0)) return showError('Shkruaje peshën në kg.', silent);

    const eligible = ageRules.filter(rule => within(weight, num(rule.minWeightKg), num(rule.maxWeightKg)));
    if (eligible.length !== 1) return showError(eligible.length ? 'Ka më shumë se një rregull për këto të dhëna.' : 'Nuk ka rregull për këtë peshë.', silent);
    const rule = eligible[0];
    const computed = computeDose(rule, activeProduct, weight);
    if (computed.error) return showError(computed.error, silent);

    const doseText = Math.abs(computed.doseMin-computed.doseMax) < EPSILON
      ? `${fmt(computed.doseMin)} ${rule.doseUnit}` : `${fmt(computed.doseMin)}–${fmt(computed.doseMax)} ${rule.doseUnit}`;
    const quantity = computed.quantityMin !== null
      ? (Math.abs(computed.quantityMin-computed.quantityMax) < EPSILON
        ? `${fmt(computed.quantityMin)} ${quantityName(activeProduct.denominatorUnit, computed.quantityMin)}`
        : `${fmt(computed.quantityMin)}–${fmt(computed.quantityMax)} ${quantityName(activeProduct.denominatorUnit, computed.quantityMax)}`)
      : doseText;

    modal.result.hidden = false;
    modal.resultText.textContent = `Doza: ${quantity} · ${frequencyText(rule)}.`;
    const rows = [
      detail('Doza:', doseText),
      detail('Preparati:', computed.conversionText),
      detail('Shpeshtësia:', frequencyText(rule)),
    ];
    if (num(rule.maxSingleDoseMg) !== null) rows.push(detail('Maksimumi/dozë:', `${fmt(rule.maxSingleDoseMg)} mg`));
    if (num(rule.maxDailyDoseMg) !== null) rows.push(detail('Maksimumi/24h:', `${fmt(rule.maxDailyDoseMg)} mg`));
    if (num(rule.maxDoses24h) !== null) rows.push(detail('Maksimumi i administrimeve:', `${fmt(rule.maxDoses24h)} / 24h`));
    rows.push(detail('Llogaritja:', computed.calculation));
    if (clean(rule.clinicalNotes)) rows.push(detail('Shënim:', clean(rule.clinicalNotes)));
    if (rule.source?.url) {
      const row = document.createElement('div');
      row.className = 'dose-calculator-detail-row';
      const strong = document.createElement('strong');
      strong.textContent = 'Burimi:';
      const link = document.createElement('a');
      link.href = rule.source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = [rule.source.name,rule.source.sectionPage].filter(Boolean).join(' · ');
      row.append(strong, link);
      rows.push(row);
    }
    modal.details.replaceChildren(...rows);
    modal.copy.disabled = false;
  }

  function maybeCalculate() {
    updateAdaptiveFields();
    calculate({ silent:true });
  }

  function populate(product) {
    activeProduct = product;
    modal.productName.textContent = product.displayLabel || product.tradeName;
    modal.indication.replaceChildren();
    const indications = new Map();
    product.rules.forEach(rule => indications.set(clean(rule.indicationKey), clean(rule.indicationName)));
    indications.forEach((name,key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = name;
      modal.indication.appendChild(option);
    });
    modal.age.value = '';
    modal.ageUnit.value = 'years';
    modal.weight.value = '';
    updateAdaptiveFields();
    clearResult();
  }

  function resetPatient() {
    if (!modal) return;
    modal.age.value = '';
    modal.weight.value = '';
    updateAdaptiveFields();
    clearResult();
    modal.age.focus();
  }

  async function copyInstruction() {
    if (!modal || modal.copy.disabled || !clean(modal.resultText.textContent)) return;
    try {
      await navigator.clipboard.writeText(clean(modal.resultText.textContent));
      const previous = modal.copy.textContent;
      modal.copy.textContent = 'U kopjua';
      setTimeout(() => { modal.copy.textContent = previous; }, 1200);
    } catch (_) {}
  }

  function closeModal() {
    if (!modal) return;
    modal.root.hidden = true;
    document.body.classList.remove('dose-calculator-modal-open');
    activeProduct = null;
  }

  function openModal(product) {
    if (!product) return;
    ensureModal();
    populate(product);
    modal.root.hidden = false;
    document.body.classList.add('dose-calculator-modal-open');
    requestAnimationFrame(() => (modal.indicationField.hidden ? modal.age : modal.indication).focus());
  }

  function ensureModal() {
    if (modal) return modal;
    const root = document.createElement('div');
    root.className = 'dose-calculator-modal';
    root.id = 'doseCalculatorModal';
    root.hidden = true;
    root.innerHTML = `
      <div class="dose-calculator-backdrop" data-dose-close></div>
      <section class="dose-calculator-dialog" role="dialog" aria-modal="true" aria-labelledby="doseCalculatorTitle">
        <header class="dose-calculator-dialog-header">
          <div><span class="dose-calculator-eyebrow">MedIndex</span><h2 id="doseCalculatorTitle">Kalkulo dozën</h2></div>
          <button type="button" class="dose-calculator-close" data-dose-close aria-label="Mbyll">×</button>
        </header>
        <div class="dose-calculator-product" data-dose-product-name></div>
        <div class="dose-calculator-form">
          <label data-dose-indication-field><span>Indikacioni</span><select data-dose-indication></select></label>
          <label><span>Mosha</span><span class="dose-calculator-input-pair"><input data-dose-age type="number" min="0" step="0.1" inputmode="decimal" autocomplete="off" placeholder="Mosha"><select data-dose-age-unit><option value="years">vjet</option><option value="months">muaj</option></select></span></label>
          <label data-dose-weight-field hidden><span>Pesha</span><span class="dose-calculator-input-pair"><input data-dose-weight type="number" min="0.1" step="0.1" inputmode="decimal" autocomplete="off" placeholder="kg"><span class="dose-calculator-unit">kg</span></span><span class="dose-calculator-weight-chips">${[5,10,15,30,40].map(v => `<button type="button" data-dose-weight-chip="${v}">${v} kg</button>`).join('')}</span></label>
        </div>
        <button type="button" class="dose-calculator-submit" data-dose-calculate>Kalkulo</button>
        <section class="dose-calculator-result" data-dose-result hidden aria-live="polite">
          <h3>Rezultati</h3><p data-dose-result-text></p>
          <div class="dose-calculator-result-actions"><button type="button" data-dose-copy disabled>Kopjo udhëzimin</button><button type="button" data-dose-new>Pacient i ri</button></div>
          <details><summary>Si u llogarit?</summary><div class="dose-calculator-details" data-dose-details></div></details>
        </section>
      </section>`;
    document.body.appendChild(root);
    modal = {
      root,
      productName:root.querySelector('[data-dose-product-name]'),
      indicationField:root.querySelector('[data-dose-indication-field]'),
      indication:root.querySelector('[data-dose-indication]'),
      age:root.querySelector('[data-dose-age]'),
      ageUnit:root.querySelector('[data-dose-age-unit]'),
      weightField:root.querySelector('[data-dose-weight-field]'),
      weight:root.querySelector('[data-dose-weight]'),
      result:root.querySelector('[data-dose-result]'),
      resultText:root.querySelector('[data-dose-result-text]'),
      details:root.querySelector('[data-dose-details]'),
      copy:root.querySelector('[data-dose-copy]'),
    };
    root.querySelectorAll('[data-dose-close]').forEach(node => node.addEventListener('click', closeModal));
    root.querySelector('[data-dose-calculate]').addEventListener('click', () => calculate({ silent:false }));
    root.querySelector('[data-dose-new]').addEventListener('click', resetPatient);
    modal.copy.addEventListener('click', copyInstruction);
    modal.indication.addEventListener('change', maybeCalculate);
    modal.age.addEventListener('input', maybeCalculate);
    modal.ageUnit.addEventListener('change', maybeCalculate);
    modal.weight.addEventListener('input', () => calculate({ silent:true }));
    root.querySelectorAll('[data-dose-weight-chip]').forEach(button => button.addEventListener('click', () => {
      modal.weight.value = button.dataset.doseWeightChip;
      calculate({ silent:true });
    }));
    return modal;
  }

  function ensureStyles() {
    if (document.getElementById('medindexDoseCalculatorV21')) return;
    const style = document.createElement('style');
    style.id = 'medindexDoseCalculatorV21';
    style.textContent = `
      #dataTable #tbody > tr.has-pediatric-only-dose-calculator > td{color:#b42318!important}
      #dataTable #tbody > tr.has-pediatric-only-dose-calculator .dose-calculator-open{color:#fff!important}
      #dataTable #tbody > tr.has-parenteral-dose-calculator > td{background:rgba(22,163,74,.075)!important}
      [data-theme="dark"] #dataTable #tbody > tr.has-parenteral-dose-calculator > td{background:rgba(34,197,94,.12)!important}
      .registry-dose-calculator-column .dose-calculator-open{min-height:52px!important;border-radius:14px!important;background:#0b6870!important;color:#fff!important}
      .registry-dose-calculator-column .dose-calculator-open:hover{background:#095e65!important}
      .dose-calculator-weight-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
      .dose-calculator-weight-chips button,.dose-calculator-result-actions button{min-height:34px;padding:6px 10px;border:1px solid rgba(11,104,112,.22);border-radius:999px;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}
      .dose-calculator-result-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
      .dose-calculator-result-actions button:disabled{opacity:.45;cursor:default}
    `;
    document.head.appendChild(style);
  }

  function observe() {
    observer?.disconnect();
    observer = new MutationObserver(scheduleEnhance);
    const table = document.getElementById('dataTable');
    if (table) observer.observe(table, { childList:true, subtree:true });
  }

  function enhance() {
    observer?.disconnect();
    ensureHeader();
    ensureRows();
    document.documentElement.dataset.doseCalculatorVersion = VERSION;
    observe();
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      enhance();
    });
  }

  document.getElementById('tbody')?.addEventListener('click', event => {
    const button = event.target.closest('.dose-calculator-open');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openModal(catalog.byProductKey.get(clean(button.dataset.doseProductKey)) || null);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal && !modal.root.hidden) closeModal();
  });

  ensureStyles();
  ensureModal();
  observe();
  scheduleEnhance();
  void loadRegistry();
  void loadCatalog();

  window.MedIndexDoseCalculator = {
    version:VERSION,
    refresh:scheduleEnhance,
    openByProductKey(key){ openModal(catalog.byProductKey.get(clean(key)) || null); },
    catalogStatus:() => catalog.status,
    _test:Object.freeze({ num,within,ageGroup,groupAllowed,needsWeightMethod,computeDose,frequencyText,isParenteral }),
  };
})();