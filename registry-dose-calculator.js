(() => {
  'use strict';

  const VERSION = 'registry-dose-calculator-v2.3.0';
  const ENDPOINT = '/api/dose-calculator';
  const COLUMN_KEY = 'dose-calculator';
  const MAX_AGE_MONTHS = 130 * 12;
  const MAX_WEIGHT_KG = 500;
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
    return numeric === null ? '—' : new Intl.NumberFormat('sq-AL', { maximumFractionDigits:3 }).format(numeric);
  };
  const esc = value => clean(value).replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);
  const within = (value, minimum, maximum) => {
    if (value === null) return minimum === null && maximum === null;
    if (minimum !== null && value < minimum) return false;
    if (maximum !== null && value > maximum) return false;
    return true;
  };
  const needsWeightMethod = method => ['dose_per_kg_per_dose','dose_per_kg_per_day'].includes(clean(method));
  const needsBsaMethod = method => ['dose_per_m2_per_dose','dose_per_m2_per_day'].includes(clean(method));

  function canonicalUnit(value) {
    const unit = clean(value).toLowerCase().replace(/\s+/g, '').replace(/μ/g, 'µ');
    const aliases = {
      milligram:'mg', milligrams:'mg',
      microgram:'µg', micrograms:'µg', mcg:'µg', ug:'µg',
      gram:'g', grams:'g',
      milliliter:'ml', milliliters:'ml', millilitre:'ml', millilitres:'ml',
    };
    return aliases[unit] || unit;
  }

  function massFactorToMg(unit) {
    const canonical = canonicalUnit(unit);
    if (canonical === 'mg') return 1;
    if (canonical === 'g') return 1000;
    if (canonical === 'µg') return 0.001;
    return null;
  }

  function convertDoseUnit(value, fromUnit, toUnit) {
    const numeric = num(value);
    if (numeric === null) return null;
    if (canonicalUnit(fromUnit) === canonicalUnit(toUnit)) return numeric;
    const fromFactor = massFactorToMg(fromUnit);
    const toFactor = massFactorToMg(toUnit);
    return fromFactor !== null && toFactor !== null ? numeric * fromFactor / toFactor : null;
  }

  function administrationsPerDay(rule) {
    const explicit = num(rule.timesPerDay);
    const interval = num(rule.intervalMinHours);
    const maximum = num(rule.maxDoses24h);
    let count = explicit && explicit > 0 ? explicit : null;
    if (count === null && clean(rule.frequencyMode) === 'once') count = 1;
    if (count === null && clean(rule.frequencyMode) === 'interval' && interval && interval > 0) {
      count = Math.ceil(24 / interval);
    }
    if (maximum && maximum > 0) count = count === null ? maximum : Math.min(count, maximum);
    return count;
  }

  function hasExplicitAgeBand(rule) {
    return num(rule.minAgeMonths) !== null || num(rule.maxAgeMonths) !== null;
  }

  function ageMatchesRule(rule, ageMonths) {
    if (!within(ageMonths, num(rule.minAgeMonths), num(rule.maxAgeMonths))) return false;
    if (hasExplicitAgeBand(rule)) return true;
    const group = clean(rule.patientGroup);
    if (group === 'adult_only') return ageMonths >= 216;
    if (group === 'pediatric_only') return ageMonths < 216;
    return group === 'pediatric_and_adult';
  }

  function preferredUnique(rules) {
    if (rules.length <= 1) return rules;
    const preferred = rules.filter(rule => rule.preferred === true);
    return preferred.length === 1 ? preferred : rules;
  }

  function renderPlainLanguageTemplate(template, values = {}) {
    const source = clean(template);
    if (!source) return '';
    const tokenPattern = /\{(quantity|dose|frequency|duration|product)\}/g;
    if (!source.match(tokenPattern)) return '';
    return source.replace(tokenPattern, (_, key) => clean(values[key])).trim();
  }

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
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('medindex:registry-data-ready', ready);
        callback(value);
      };
      const ready = event => {
        const rows = event.detail?.rows || window.MEDINDEX_REGISTRY_ROWS;
        if (Array.isArray(rows)) finish(resolve, rows);
      };
      const timer = setTimeout(() => finish(reject, new Error('Regjistri nuk u bë gati me kohë.')), 30000);
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
    document.querySelectorAll('#headerRow > th').forEach((header, index) => {
      const label = clean(header.textContent).replace(/[▲▼↕]/g, '').trim();
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

  function ruleCoversPediatric(rule) {
    if (!hasExplicitAgeBand(rule)) return clean(rule.patientGroup) !== 'adult_only';
    const minimum = num(rule.minAgeMonths);
    return minimum === null || minimum < 216;
  }

  function ruleCoversAdult(rule) {
    if (!hasExplicitAgeBand(rule)) return clean(rule.patientGroup) !== 'pediatric_only';
    const maximum = num(rule.maxAgeMonths);
    return maximum === null || maximum >= 216;
  }

  function productGroup(product) {
    const rules = product?.rules || [];
    const pediatric = rules.some(ruleCoversPediatric);
    const adult = rules.some(ruleCoversAdult);
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
    const cell = document.createElement('td');
    cell.className = 'registry-dose-calculator-column';
    cell.dataset.registryDoseCalculatorColumn = COLUMN_KEY;
    cell.dataset.registryColumnKey = COLUMN_KEY;
    cell.dataset.label = 'Doza';
    if (catalog.status === 'loading' || registry.status === 'loading') {
      cell.classList.add('dose-table-cell-loading');
      cell.innerHTML = '<span class="registry-dosage-muted">…</span>';
      return cell;
    }
    if (!product || catalog.status !== 'ready' || registry.status !== 'ready') {
      cell.classList.add('dose-table-cell-empty');
      cell.innerHTML = '<span class="registry-dosage-muted" aria-label="Nuk ka kalkulator">—</span>';
      return cell;
    }
    const group = productGroup(product);
    cell.classList.add('dose-table-cell-ready');
    cell.innerHTML = `<span class="dose-calculator-group dose-calculator-group-${esc(group)}">${esc(groupLabel(group))}</span>`
      + `<button type="button" class="dose-calculator-open" data-dose-product-key="${esc(product.productKey)}">Kalkulo dozën</button>`;
    return cell;
  }

  function ensureRows() {
    const index = headerIndex();
    document.querySelectorAll('#tbody > tr').forEach(tableRow => {
      if (tableRow.querySelector('.empty-state')) return;
      const product = productFor(registryRow(tableRow, index));
      tableRow.classList.remove('has-pediatric-only-dose-calculator','has-all-ages-dose-calculator','has-adult-only-dose-calculator','has-parenteral-dose-calculator');
      if (product) {
        const group = productGroup(product);
        tableRow.classList.add(group === 'pediatric_only'
          ? 'has-pediatric-only-dose-calculator'
          : group === 'adult_only' ? 'has-adult-only-dose-calculator' : 'has-all-ages-dose-calculator');
        if (isParenteral(product)) tableRow.classList.add('has-parenteral-dose-calculator');
      }
      const matches = Array.from(tableRow.querySelectorAll(`[data-registry-dose-calculator-column="${COLUMN_KEY}"]`));
      matches.slice(1).forEach(node => node.remove());
      const desired = calculatorCell(product);
      if (!matches[0]) tableRow.appendChild(desired);
      else if (matches[0].innerHTML !== desired.innerHTML || matches[0].className !== desired.className) matches[0].replaceWith(desired);
    });
  }

  function quantityName(unit, value) {
    const singular = Math.abs(Number(value) - 1) < EPSILON;
    const names = {
      tablet:singular ? 'tabletë' : 'tableta',
      capsule:singular ? 'kapsulë' : 'kapsula',
      suppository:singular ? 'supozitor' : 'supozitorë',
      sachet:'qese', ampoule:singular ? 'ampulë' : 'ampula', vial:singular ? 'vial' : 'viale',
      dose:singular ? 'dozë' : 'doza', ml:'mL',
    };
    return names[canonicalUnit(unit)] || clean(unit);
  }

  function roundQuantity(value, product, conversion) {
    const unit = canonicalUnit(product.denominatorUnit);
    if (unit === 'tablet') {
      const denominator = conversion.tabletSplitAllowed ? Math.max(1, Number(product.tabletSplitDenominator) || 1) : 1;
      const increment = 1 / denominator;
      const rounded = Math.round(value / increment) * increment;
      if (Math.abs(rounded - value) > EPSILON && clean(product.roundingMode) === 'exact') return null;
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
    return Math.abs(rounded - value) <= EPSILON ? rounded : null;
  }

  function doseText(rule) {
    const minimum = fmt(rule.doseMinValue);
    const maximum = fmt(rule.doseMaxValue);
    const value = minimum === maximum ? minimum : `${minimum}–${maximum}`;
    if (rule.calculationMethod === 'dose_per_kg_per_dose') return `${value} ${rule.doseUnit}/kg/dozë`;
    if (rule.calculationMethod === 'dose_per_kg_per_day') return `${value} ${rule.doseUnit}/kg/ditë`;
    if (rule.calculationMethod === 'dose_per_m2_per_dose') return `${value} ${rule.doseUnit}/m²/dozë`;
    if (rule.calculationMethod === 'dose_per_m2_per_day') return `${value} ${rule.doseUnit}/m²/ditë`;
    const basis = rule.doseBasis === 'per_day' ? '/ditë' : rule.doseBasis === 'per_dose' ? '/dozë' : '';
    return `${value} ${rule.doseUnit}${basis}`;
  }

  function frequencyText(rule) {
    const minimum = num(rule.intervalMinHours);
    const maximum = num(rule.intervalMaxHours);
    const times = num(rule.timesPerDay);
    if (rule.frequencyMode === 'once') return 'një herë në ditë';
    if (rule.frequencyMode === 'continuous') return 'vazhdimisht';
    if (rule.frequencyMode === 'interval' && minimum !== null) return maximum === null || minimum === maximum
      ? `çdo ${fmt(minimum)} orë`
      : `çdo ${fmt(minimum)}–${fmt(maximum)} orë`;
    if (rule.frequencyMode === 'times_per_day' && times !== null) return `${fmt(times)} herë në ditë`;
    if (rule.frequencyMode === 'prn') return 'sipas nevojës';
    return 'sipas skemës së burimit';
  }

  function durationText(rule) {
    const minimum = num(rule.durationMinDays);
    const maximum = num(rule.durationMaxDays);
    if (rule.durationMode === 'single_dose') return 'Një dozë';
    if (rule.durationMode === 'prn') return 'Sipas nevojës';
    if (rule.durationMode === 'specialist_plan') return 'Sipas planit specialistik';
    if (minimum !== null && maximum !== null) return minimum === maximum ? `${fmt(minimum)} ditë` : `${fmt(minimum)}–${fmt(maximum)} ditë`;
    if (num(rule.reviewAfterDays) !== null) return `Rivlerësim pas ${fmt(rule.reviewAfterDays)} ditësh`;
    return 'Sipas indikacionit';
  }

  function computeDose(rule, product, weightKg) {
    if (rule.calculationMethod === 'manual_only') {
      return { error:clean(rule.clinicalNotes) || 'Kjo skemë kërkon vlerësim manual.' };
    }
    if (needsBsaMethod(rule.calculationMethod)) {
      return { error:'Kjo skemë kërkon sipërfaqen trupore; kalkulimi automatik nuk është konfiguruar për këtë rregull.' };
    }
    const minimum = num(rule.doseMinValue);
    const maximum = num(rule.doseMaxValue ?? rule.doseMinValue);
    if (minimum === null || maximum === null) return { error:'Rregulli nuk ka vlera numerike të plota.' };

    let doseMin = minimum;
    let doseMax = maximum;
    let calculation = 'Dozë fikse; pesha nuk përdoret në këtë rregull.';
    const administrations = administrationsPerDay(rule);

    if (needsWeightMethod(rule.calculationMethod)) {
      if (weightKg === null || weightKg <= 0) return { error:'Shkruaje peshën e pacientit.' };
      doseMin = minimum * weightKg;
      doseMax = maximum * weightKg;
      calculation = `${fmt(weightKg)} kg × ${minimum === maximum ? fmt(minimum) : `${fmt(minimum)}–${fmt(maximum)}`} ${rule.doseUnit}/kg`;
      if (rule.calculationMethod === 'dose_per_kg_per_day') {
        if (!administrations || administrations <= 0) return { error:'Mungon numri i dozave në ditë për këtë rregull.' };
        doseMin /= administrations;
        doseMax /= administrations;
        calculation += ` ÷ ${fmt(administrations)} doza/ditë`;
      }
    } else if (clean(rule.doseBasis) === 'per_day') {
      if (!administrations || administrations <= 0) return { error:'Mungon skema e administrimeve për dozën ditore.' };
      doseMin /= administrations;
      doseMax /= administrations;
      calculation = `${minimum === maximum ? fmt(minimum) : `${fmt(minimum)}–${fmt(maximum)}`} ${rule.doseUnit}/ditë ÷ ${fmt(administrations)} doza`;
    }

    const originalUnit = clean(rule.doseUnit);
    let finalUnit = originalUnit;
    let convertedMin = doseMin;
    let convertedMax = doseMax;
    const capUnit = clean(rule.maxDailyDoseUnit);
    const cap = num(rule.maxDailyDoseValue);
    if (cap !== null) {
      const perDoseCap = clean(rule.doseBasis) === 'per_day' && administrations ? cap / administrations : cap;
      if (capUnit && canonicalUnit(capUnit) !== canonicalUnit(originalUnit)) {
        const converted = convertDoseUnit(perDoseCap, capUnit, originalUnit);
        if (converted === null) return { error:'Njësia e kufirit maksimal nuk mund të konvertohet në mënyrë të sigurt.' };
        convertedMax = Math.min(convertedMax, converted);
      } else {
        convertedMax = Math.min(convertedMax, perDoseCap);
      }
    }
    convertedMin = Math.min(convertedMin, convertedMax);

    const conversion = product.conversion;
    let quantityMin = null;
    let quantityMax = null;
    let quantityText = '';
    if (conversion && num(product.denominatorValue) && clean(product.denominatorUnit)) {
      const numeratorFactor = convertDoseUnit(1, originalUnit, product.numeratorUnit);
      if (numeratorFactor !== null && num(product.numeratorValue)) {
        const numeratorPerDenominator = num(product.numeratorValue) / num(product.denominatorValue);
        quantityMin = roundQuantity(convertedMin * numeratorFactor / numeratorPerDenominator, product, conversion);
        quantityMax = roundQuantity(convertedMax * numeratorFactor / numeratorPerDenominator, product, conversion);
        if (quantityMin === null || quantityMax === null) return { error:'Doza e llogaritur nuk mund të matet saktë me këtë produkt.' };
        quantityText = quantityMin === quantityMax
          ? `${fmt(quantityMin)} ${quantityName(product.denominatorUnit, quantityMin)}`
          : `${fmt(quantityMin)}–${fmt(quantityMax)} ${quantityName(product.denominatorUnit, quantityMax)}`;
      }
    }

    return {
      doseMin:convertedMin,
      doseMax:convertedMax,
      doseUnit:finalUnit,
      doseText:convertedMin === convertedMax ? `${fmt(convertedMin)} ${finalUnit}` : `${fmt(convertedMin)}–${fmt(convertedMax)} ${finalUnit}`,
      quantityMin,
      quantityMax,
      quantityText,
      calculation,
      administrations,
    };
  }

  function matchRules(product, ageMonths, weightKg) {
    if (!product || !Array.isArray(product.rules)) return [];
    const matched = product.rules.filter(rule => {
      if (!ageMatchesRule(rule, ageMonths)) return false;
      if (!within(weightKg, num(rule.minWeightKg), num(rule.maxWeightKg))) return false;
      return true;
    });
    return preferredUnique(matched);
  }

  function patientAgeMonths() {
    const years = num(modal?.querySelector('#doseAgeYears')?.value) || 0;
    const months = num(modal?.querySelector('#doseAgeMonths')?.value) || 0;
    return Math.min(MAX_AGE_MONTHS, Math.max(0, years * 12 + months));
  }

  function weightKg() {
    const value = num(modal?.querySelector('#doseWeightKg')?.value);
    return value === null ? null : Math.min(MAX_WEIGHT_KG, Math.max(0, value));
  }

  function resultContent(product, rule, result) {
    const warnings = [];
    if (clean(rule.populationVerification) !== 'verified') warnings.push('Popullata e rregullit nuk është e verifikuar.');
    if (clean(product.sourceVerification) !== 'verified') warnings.push('Burimi nuk është i verifikuar.');
    if (clean(rule.clinicalNotes)) warnings.push(clean(rule.clinicalNotes));
    const warningHtml = warnings.length
      ? `<div class="dose-calculator-warning"><strong>Kontroll klinik</strong><ul>${warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul></div>`
      : '';
    const values = {
      quantity:result.quantityText || result.doseText,
      dose:result.doseText,
      frequency:frequencyText(rule),
      duration:durationText(rule),
      product:clean(product.tradeName),
    };
    const plain = renderPlainLanguageTemplate(rule.plainLanguageTemplate, values);
    return `
      <div class="dose-calculator-result-card">
        <div class="dose-calculator-result-kicker">DOZA E LLOGARITUR</div>
        <div class="dose-calculator-result-value">${esc(result.quantityText || result.doseText)}</div>
        <div class="dose-calculator-result-sub">${esc(result.doseText)} · ${esc(frequencyText(rule))}</div>
        ${plain ? `<div class="dose-calculator-plain-language">${esc(plain)}</div>` : ''}
        <div class="dose-calculator-equation">${esc(result.calculation)}</div>
      </div>${warningHtml}`;
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'doseCalculatorModal';
    modal.className = 'dose-calculator-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="dose-calculator-dialog" role="dialog" aria-modal="true" aria-labelledby="doseCalculatorTitle">
        <div class="dose-calculator-dialog-head">
          <div><span class="dose-calculator-kicker">KALKULATOR I VERIFIKUAR</span><h2 id="doseCalculatorTitle">Doza individuale</h2></div>
          <button type="button" class="dose-calculator-close" aria-label="Mbyll">×</button>
        </div>
        <div class="dose-calculator-product"></div>
        <div class="dose-calculator-inputs">
          <label>Mosha (vite)<input id="doseAgeYears" type="number" inputmode="decimal" min="0" max="130" step="1" autocomplete="off"></label>
          <label>Muaj<input id="doseAgeMonths" type="number" inputmode="numeric" min="0" max="11" step="1" autocomplete="off"></label>
          <label>Pesha (kg)<input id="doseWeightKg" type="number" inputmode="decimal" min="0.1" max="500" step="0.1" autocomplete="off"></label>
        </div>
        <div class="dose-calculator-actions"><button type="button" class="dose-calculator-run">Llogarit</button></div>
        <div class="dose-calculator-result" aria-live="polite"></div>
        <div class="dose-calculator-source"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.dose-calculator-close').addEventListener('click', closeModal);
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
    modal.querySelector('.dose-calculator-run').addEventListener('click', runCalculation);
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runCalculation();
    });
    return modal;
  }

  function openModal(productKey) {
    const product = catalog.byProductKey.get(clean(productKey));
    if (!product) return;
    activeProduct = product;
    const node = ensureModal();
    node.querySelector('#doseCalculatorTitle').textContent = product.tradeName || 'Doza individuale';
    node.querySelector('.dose-calculator-product').innerHTML = `<strong>${esc(product.tradeName)}</strong><span>${esc(product.activeSubstance)} · ${esc(product.strength)} · ${esc(product.pharmaceuticalForm)}</span>`;
    node.querySelector('.dose-calculator-result').innerHTML = '';
    node.querySelector('.dose-calculator-source').innerHTML = `<strong>Burimi:</strong> ${esc(product.sourceDocument || product.sourceUrl || 'Burim i verifikuar')}`;
    node.querySelectorAll('input').forEach(input => { input.value = ''; });
    node.hidden = false;
    document.body.classList.add('dose-calculator-opened');
    requestAnimationFrame(() => node.querySelector('#doseAgeYears')?.focus({ preventScroll:true }));
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('dose-calculator-opened');
    activeProduct = null;
  }

  function runCalculation() {
    if (!activeProduct || !modal) return;
    const ageMonths = patientAgeMonths();
    const weight = weightKg();
    const rules = matchRules(activeProduct, ageMonths, weight);
    const target = modal.querySelector('.dose-calculator-result');
    if (!rules.length) {
      target.innerHTML = '<div class="dose-calculator-error">Nuk ka një rregull të vetëm të verifikuar për këtë moshë/peshë. Kontrollo SmPC/burimin.</div>';
      return;
    }
    if (rules.length > 1) {
      target.innerHTML = '<div class="dose-calculator-error">Ka më shumë se një rregull të mundshëm. Zgjidhja automatike është bllokuar për siguri.</div>';
      return;
    }
    const result = computeDose(rules[0], activeProduct, weight);
    if (result.error) {
      target.innerHTML = `<div class="dose-calculator-error">${esc(result.error)}</div>`;
      return;
    }
    target.innerHTML = resultContent(activeProduct, rules[0], result);
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      ensureHeader();
      ensureRows();
    });
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const button = event.target.closest('.dose-calculator-open');
      if (button) openModal(button.dataset.doseProductKey);
    });
    ['medindex:registry-table-rendered','medindex:registry-dosage-ready','medindex:registry-dosage-updated','medindex:registry-view-changed'].forEach(name => {
      window.addEventListener(name, scheduleEnhance);
    });
    observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.type === 'childList' && mutation.target.closest?.('#tbody'))) scheduleEnhance();
    });
    const body = document.getElementById('tbody');
    if (body) observer.observe(body, { childList:true });
  }

  window.MedIndexDoseCalculator = {
    version:VERSION,
    computeDose,
    matchRules,
    productGroup,
    administrationsPerDay,
    convertDoseUnit,
    renderPlainLanguageTemplate,
    refresh:scheduleEnhance,
  };

  bindEvents();
  Promise.allSettled([loadRegistry(), loadCatalog()]).then(scheduleEnhance);
})();
