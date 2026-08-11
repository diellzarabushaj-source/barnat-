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
      + `<button type="button" class="dose-calculator-open" data-dose-product-key="${esc(product.productKey)}">Kalkulo</button>`;
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
      calculation = `Doza totale ditore ÷ ${fmt(administrations)} administrime/ditë`;
    }

    const maxSingle = num(rule.maxSingleDoseMg);
    if (maxSingle !== null) {
      const minMg = convertDoseUnit(doseMin, rule.doseUnit, 'mg');
      const maxMg = convertDoseUnit(doseMax, rule.doseUnit, 'mg');
      if (minMg !== null && maxMg !== null) {
        doseMin = convertDoseUnit(Math.min(minMg, maxSingle), 'mg', rule.doseUnit);
        doseMax = convertDoseUnit(Math.min(maxMg, maxSingle), 'mg', rule.doseUnit);
      }
    }
    const maxDaily = num(rule.maxDailyDoseMg);
    if (maxDaily !== null && administrations && administrations > 0) {
      const perAdministrationMaxMg = maxDaily / administrations;
      const minMg = convertDoseUnit(doseMin, rule.doseUnit, 'mg');
      const maxMg = convertDoseUnit(doseMax, rule.doseUnit, 'mg');
      if (minMg !== null && maxMg !== null) {
        doseMin = convertDoseUnit(Math.min(minMg, perAdministrationMaxMg), 'mg', rule.doseUnit);
        doseMax = convertDoseUnit(Math.min(maxMg, perAdministrationMaxMg), 'mg', rule.doseUnit);
      }
    }

    const conversion = rule.conversion || {};
    const numerator = num(product.numeratorValue);
    const denominator = num(product.denominatorValue);
    const doseMinForProduct = convertDoseUnit(doseMin, rule.doseUnit, product.numeratorUnit);
    const doseMaxForProduct = convertDoseUnit(doseMax, rule.doseUnit, product.numeratorUnit);
    let quantityMin = null;
    let quantityMax = null;
    let conversionText = 'Konvertimi në njësinë e këtij preparati kërkon verifikim manual.';
    if (!conversion.enabled || conversion.status === 'not_allowed') {
      conversionText = 'Konvertimi automatik në këtë preparat nuk lejohet; përdor dozën dhe verifiko preparatin.';
    } else if (conversion.status === 'automatic' && numerator && denominator && doseMinForProduct !== null && doseMaxForProduct !== null) {
      quantityMin = roundQuantity(doseMinForProduct * denominator / numerator, product, conversion);
      quantityMax = roundQuantity(doseMaxForProduct * denominator / numerator, product, conversion);
      if (quantityMin === null || quantityMax === null) {
        return { error:'Doza nuk mund të shndërrohet saktë në këtë preparat pa ndarje ose rrumbullakim të palejuar.' };
      }
      const doseLabel = Math.abs(doseMin - doseMax) < EPSILON ? fmt(doseMin) : `${fmt(doseMin)}–${fmt(doseMax)}`;
      const units = Math.abs(quantityMin - quantityMax) < EPSILON ? fmt(quantityMin) : `${fmt(quantityMin)}–${fmt(quantityMax)}`;
      conversionText = `${doseLabel} ${rule.doseUnit} = ${units} ${quantityName(product.denominatorUnit, quantityMax)}`;
    }

    return { doseMin, doseMax, quantityMin, quantityMax, calculation, conversionText };
  }

  function currentAgeMonths() {
    if (!modal) return null;
    const value = num(modal.age.value);
    if (value === null) return null;
    return modal.ageUnit.value === 'months' ? value : value * 12;
  }

  function rulesForIndication() {
    if (!modal || !activeProduct) return [];
    const key = clean(modal.indication.value);
    return activeProduct.rules.filter(rule => clean(rule.indicationKey) === key);
  }

  function ageMatchedRules(ageMonths = currentAgeMonths()) {
    if (ageMonths === null) return [];
    return rulesForIndication().filter(rule => ageMatchesRule(rule, ageMonths));
  }

  function ruleNeedsWeight(rule) {
    return needsWeightMethod(rule.calculationMethod) || num(rule.minWeightKg) !== null || num(rule.maxWeightKg) !== null;
  }

  function updateAdaptiveFields() {
    if (!modal) return;
    const ageMonths = currentAgeMonths();
    const ageValid = ageMonths !== null && ageMonths >= 0 && ageMonths <= MAX_AGE_MONTHS;
    const needsWeight = ageValid && ageMatchedRules(ageMonths).some(ruleNeedsWeight);
    modal.weightWrap.hidden = !needsWeight;
    modal.weight.disabled = !needsWeight;
    modal.weight.required = needsWeight;
    if (!needsWeight) modal.weight.value = '';
    modal.weightChips.hidden = !needsWeight;
    modal.progressAge.classList.toggle('is-done', ageValid);
    modal.progressWeight.classList.toggle('is-done', !needsWeight || (num(modal.weight.value) !== null && num(modal.weight.value) > 0));
  }

  function clearResult() {
    if (!modal) return;
    modal.result.hidden = true;
    modal.result.classList.remove('is-error');
    modal.resultText.textContent = '';
    modal.details.replaceChildren();
    modal.actions.hidden = true;
    modal.progressResult.classList.remove('is-done');
  }

  function showError(message) {
    modal.result.hidden = false;
    modal.result.classList.add('is-error');
    modal.resultText.textContent = message;
    modal.details.replaceChildren();
    modal.actions.hidden = true;
    modal.progressResult.classList.remove('is-done');
  }

  function detailRow(label, value) {
    const row = document.createElement('div');
    row.className = 'dose-calculator-detail-row';
    const strong = document.createElement('strong');
    strong.textContent = label;
    const span = document.createElement('span');
    span.textContent = value;
    row.append(strong, span);
    return row;
  }

  function calculate(options = {}) {
    const silent = Boolean(options.silent);
    if (!modal || !activeProduct) return false;
    const ageMonths = currentAgeMonths();
    if (ageMonths === null) {
      if (!silent) showError('Shkruaje moshën e pacientit.');
      else clearResult();
      return false;
    }
    if (ageMonths < 0 || ageMonths > MAX_AGE_MONTHS) {
      showError('Kontrolloje moshën e pacientit.');
      return false;
    }

    const ageRules = ageMatchedRules(ageMonths);
    if (!ageRules.length) {
      showError('Nuk ka rregull doze për këtë moshë dhe indikacion.');
      return false;
    }
    const needsWeight = ageRules.some(ruleNeedsWeight);
    const weight = needsWeight ? num(modal.weight.value) : null;
    if (needsWeight && (weight === null || weight <= 0)) {
      if (!silent) showError('Shkruaje peshën e pacientit.');
      else clearResult();
      return false;
    }
    if (weight !== null && weight > MAX_WEIGHT_KG) {
      showError('Kontrolloje peshën e pacientit.');
      return false;
    }

    const eligible = preferredUnique(ageRules.filter(rule => !ruleNeedsWeight(rule)
      || within(weight, num(rule.minWeightKg), num(rule.maxWeightKg))));
    if (eligible.length !== 1) {
      if (!eligible.length) showError('Nuk ka rregull të vetëm për këtë moshë, peshë dhe indikacion.');
      else showError('U gjetën disa rregulla që përputhen. Kalkulimi u bllokua për kontroll klinik.');
      return false;
    }

    const rule = eligible[0];
    const computed = computeDose(rule, activeProduct, weight);
    if (computed.error) {
      showError(computed.error);
      return false;
    }

    const doseRange = Math.abs(computed.doseMin - computed.doseMax) < EPSILON
      ? `${fmt(computed.doseMin)} ${rule.doseUnit}`
      : `${fmt(computed.doseMin)}–${fmt(computed.doseMax)} ${rule.doseUnit}`;
    const hasAutomaticQuantity = computed.quantityMin !== null && computed.quantityMax !== null;
    const quantity = hasAutomaticQuantity
      ? (Math.abs(computed.quantityMin - computed.quantityMax) < EPSILON
        ? `${fmt(computed.quantityMin)} ${quantityName(activeProduct.denominatorUnit, computed.quantityMin)}`
        : `${fmt(computed.quantityMin)}–${fmt(computed.quantityMax)} ${quantityName(activeProduct.denominatorUnit, computed.quantityMax)}`)
      : doseRange;

    modal.result.hidden = false;
    modal.result.classList.remove('is-error');
    const renderedTemplate = renderPlainLanguageTemplate(rule.plainLanguageTemplate, {
      quantity,
      dose:doseRange,
      frequency:frequencyText(rule),
      duration:durationText(rule).toLowerCase(),
      product:activeProduct.tradeName,
    });
    if (renderedTemplate) {
      modal.resultText.textContent = renderedTemplate;
    } else if (hasAutomaticQuantity) {
      modal.resultText.textContent = `Doza: ${quantity} · ${frequencyText(rule)} · ${durationText(rule).toLowerCase()}.`;
    } else {
      modal.resultText.textContent = `Doza: ${doseRange} · ${frequencyText(rule)} · ${durationText(rule).toLowerCase()}. Konvertimi në ${activeProduct.tradeName} kërkon verifikim manual.`;
    }

    const rows = [
      detailRow('Rregulli:', doseText(rule)),
      detailRow('Llogaritja:', computed.calculation),
      detailRow('Preparati:', activeProduct.displayLabel || activeProduct.tradeName),
      detailRow('Konvertimi:', computed.conversionText),
      detailRow('Shpeshtësia:', frequencyText(rule)),
      detailRow('Kohëzgjatja:', durationText(rule)),
    ];
    if (num(rule.maxSingleDoseMg) !== null) rows.push(detailRow('Maksimumi për dozë:', `${fmt(rule.maxSingleDoseMg)} mg`));
    if (num(rule.maxDailyDoseMg) !== null) rows.push(detailRow('Maksimumi në 24 orë:', `${fmt(rule.maxDailyDoseMg)} mg`));
    if (num(rule.maxDoses24h) !== null) rows.push(detailRow('Maksimumi i administrimeve:', `${fmt(rule.maxDoses24h)} / 24 orë`));
    if (clean(rule.clinicalNotes)) rows.push(detailRow('Shënim:', clean(rule.clinicalNotes)));

    if (rule.source?.url) {
      const sourceRow = document.createElement('div');
      sourceRow.className = 'dose-calculator-detail-row';
      const sourceLabel = document.createElement('strong');
      sourceLabel.textContent = 'Burimi zyrtar:';
      const sourceLink = document.createElement('a');
      sourceLink.href = rule.source.url;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      sourceLink.textContent = [rule.source.name, rule.source.sectionPage].filter(Boolean).join(' · ');
      sourceRow.append(sourceLabel, sourceLink);
      rows.push(sourceRow);
    }
    modal.details.replaceChildren(...rows);
    modal.actions.hidden = false;
    modal.progressResult.classList.add('is-done');
    return true;
  }

  function maybeCalculate() {
    updateAdaptiveFields();
    void calculate({ silent:true });
  }

  function populateModal(product) {
    activeProduct = product;
    const label = product.displayLabel || product.tradeName;
    modal.productName.textContent = label;
    modal.indication.replaceChildren();
    const indications = new Map();
    product.rules.forEach(rule => {
      if (!indications.has(rule.indicationKey)) indications.set(rule.indicationKey, rule.indicationName);
    });
    indications.forEach((name, key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = name;
      modal.indication.appendChild(option);
    });
    modal.indicationWrap.hidden = indications.size <= 1;
    modal.age.value = '';
    modal.ageUnit.value = 'years';
    modal.weight.value = '';
    modal.weightWrap.hidden = true;
    modal.weightChips.hidden = true;
    modal.progressAge.classList.remove('is-done');
    modal.progressWeight.classList.add('is-done');
    modal.progressResult.classList.remove('is-done');
    clearResult();
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
    populateModal(product);
    modal.root.hidden = false;
    document.body.classList.add('dose-calculator-modal-open');
    requestAnimationFrame(() => (modal.indicationWrap.hidden ? modal.age : modal.indication).focus());
  }

  function copyInstruction() {
    const text = clean(modal?.resultText?.textContent);
    if (!text) return;
    const done = () => {
      modal.copy.textContent = 'U kopjua ✓';
      setTimeout(() => { if (modal) modal.copy.textContent = 'Kopjo udhëzimin'; }, 1400);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
  }

  function resetPatient() {
    if (!activeProduct || !modal) return;
    const product = activeProduct;
    populateModal(product);
    modal.age.focus();
  }

  function ensureStyles() {
    if (document.getElementById('doseCalculatorV23Styles')) return;
    const style = document.createElement('style');
    style.id = 'doseCalculatorV23Styles';
    style.textContent = `.dose-calculator-progress{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 12px}.dose-calculator-progress span{padding:5px 7px;border:1px solid #d9e2e1;border-radius:999px;background:#f8faf9;color:#667085;font-size:.65rem;font-weight:800;text-align:center}.dose-calculator-progress span.is-done{border-color:rgba(13,95,99,.24);background:rgba(13,95,99,.08);color:#0d5f63}.dose-calculator-weight-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.dose-calculator-weight-chips[hidden],.dose-calculator-result-actions[hidden],.dose-calculator-form label[hidden]{display:none!important}.dose-calculator-weight-chips button,.dose-calculator-result-actions button{min-height:38px;border:1px solid #c9d7d5;border-radius:9px;background:#fff;color:#344054;font:inherit;font-size:.76rem;font-weight:800;cursor:pointer}.dose-calculator-weight-chips button{padding:5px 9px}.dose-calculator-result-actions{display:grid;grid-template-columns:1.35fr 1fr;gap:8px;margin-top:12px}.dose-calculator-result-actions button:first-child{border-color:#0d5f63;background:#0d5f63;color:#fff}.dose-calculator-auto-note{margin:10px 0 0;color:#667085;font-size:.7rem;text-align:center}.dose-calculator-detail-row a{overflow-wrap:anywhere}.has-pediatric-only-dose-calculator>td{color:#b42318}.has-parenteral-dose-calculator>td{background:rgba(6,118,71,.07)}.has-pediatric-only-dose-calculator.has-parenteral-dose-calculator>td{color:#b42318}.dose-calculator-dialog .dose-calculator-form{grid-template-columns:repeat(2,minmax(0,1fr))}.dose-calculator-dialog .dose-calculator-form label:first-child{grid-column:1/-1}@media(max-width:760px){.dose-calculator-dialog .dose-calculator-form{grid-template-columns:1fr}.dose-calculator-result-actions{grid-template-columns:1fr}}[data-theme="dark"] .dose-calculator-progress span{border-color:rgba(255,255,255,.13);background:rgba(255,255,255,.04);color:#aebdc0}[data-theme="dark"] .dose-calculator-progress span.is-done{color:#9bd9db;border-color:rgba(128,214,216,.22);background:rgba(128,214,216,.08)}[data-theme="dark"] .dose-calculator-weight-chips button,[data-theme="dark"] .dose-calculator-result-actions button{border-color:rgba(255,255,255,.16);background:#1f3033;color:#e7eeee}[data-theme="dark"] .dose-calculator-result-actions button:first-child{background:#0d5f63;color:#fff}@media(prefers-reduced-motion:reduce){.dose-calculator-dialog *{transition:none!important;scroll-behavior:auto!important}}`;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (modal) return modal;
    ensureStyles();
    const root = document.createElement('div');
    root.className = 'dose-calculator-modal';
    root.id = 'doseCalculatorModal';
    root.hidden = true;
    root.innerHTML = `<div class="dose-calculator-backdrop" data-dose-calculator-close></div><section class="dose-calculator-dialog" role="dialog" aria-modal="true" aria-labelledby="doseCalculatorTitle"><header class="dose-calculator-dialog-header"><div><span class="dose-calculator-eyebrow">MedIndex · Kalkulator doze</span><h2 id="doseCalculatorTitle">Kalkulo</h2></div><button type="button" class="dose-calculator-close" data-dose-calculator-close aria-label="Mbyll kalkulatorin">×</button></header><div class="dose-calculator-product" data-dose-product-name></div><div class="dose-calculator-progress" aria-hidden="true"><span data-dose-progress-age>Mosha</span><span data-dose-progress-weight>Pesha</span><span data-dose-progress-result>Rezultati</span></div><div class="dose-calculator-form"><label data-dose-indication-wrap><span>Indikacioni</span><select data-dose-indication></select></label><label><span>Mosha</span><span class="dose-calculator-input-pair"><input data-dose-age type="number" min="0" max="130" step="0.1" inputmode="decimal" autocomplete="off" placeholder="p.sh. 7"><select data-dose-age-unit aria-label="Njësia e moshës"><option value="years">vjet</option><option value="months">muaj</option></select></span></label><label data-dose-weight-wrap hidden><span>Pesha</span><span class="dose-calculator-input-pair"><input data-dose-weight type="number" min="0.1" max="500" step="0.1" inputmode="decimal" autocomplete="off" placeholder="kg"><span class="dose-calculator-unit">kg</span></span><span class="dose-calculator-weight-chips" data-dose-weight-chips hidden><button type="button" data-weight="5">5</button><button type="button" data-weight="10">10</button><button type="button" data-weight="15">15</button><button type="button" data-weight="30">30</button><button type="button" data-weight="40">40</button></span></label></div><p class="dose-calculator-auto-note">Rezultati llogaritet automatikisht sapo plotësohen të dhënat e nevojshme.</p><section class="dose-calculator-result" data-dose-result hidden aria-live="polite"><h3>Rezultati</h3><p data-dose-result-text></p><details><summary>Si u llogarit?</summary><div class="dose-calculator-details" data-dose-details></div></details><div class="dose-calculator-result-actions" data-dose-actions hidden><button type="button" data-dose-copy>Kopjo udhëzimin</button><button type="button" data-dose-new-patient>Pacient i ri</button></div></section></section>`;
    document.body.appendChild(root);
    modal = {
      root, productName:root.querySelector('[data-dose-product-name]'), indicationWrap:root.querySelector('[data-dose-indication-wrap]'),
      indication:root.querySelector('[data-dose-indication]'), age:root.querySelector('[data-dose-age]'), ageUnit:root.querySelector('[data-dose-age-unit]'),
      weightWrap:root.querySelector('[data-dose-weight-wrap]'), weight:root.querySelector('[data-dose-weight]'), weightChips:root.querySelector('[data-dose-weight-chips]'),
      result:root.querySelector('[data-dose-result]'), resultText:root.querySelector('[data-dose-result-text]'), details:root.querySelector('[data-dose-details]'),
      actions:root.querySelector('[data-dose-actions]'), copy:root.querySelector('[data-dose-copy]'), progressAge:root.querySelector('[data-dose-progress-age]'),
      progressWeight:root.querySelector('[data-dose-progress-weight]'), progressResult:root.querySelector('[data-dose-progress-result]'),
    };
    root.querySelectorAll('[data-dose-calculator-close]').forEach(button => button.addEventListener('click', closeModal));
    modal.indication.addEventListener('change', maybeCalculate);
    modal.age.addEventListener('input', maybeCalculate);
    modal.ageUnit.addEventListener('change', maybeCalculate);
    modal.weight.addEventListener('input', maybeCalculate);
    modal.weightChips.addEventListener('click', event => {
      const button = event.target.closest('[data-weight]');
      if (!button) return;
      modal.weight.value = button.dataset.weight;
      maybeCalculate();
    });
    modal.copy.addEventListener('click', copyInstruction);
    root.querySelector('[data-dose-new-patient]').addEventListener('click', resetPatient);
    return modal;
  }

  function enhance() {
    ensureHeader();
    ensureRows();
    document.documentElement.dataset.doseCalculatorVersion = VERSION;
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      enhance();
    });
  }

  function observe() {
    const tbody = document.getElementById('tbody');
    if (!tbody || observer) return;
    observer = new MutationObserver(scheduleEnhance);
    observer.observe(tbody, { childList:true });
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

  ensureModal();
  observe();
  scheduleEnhance();
  void loadRegistry();
  void loadCatalog();

  window.MedIndexDoseCalculator = {
    version:VERSION,
    refresh:scheduleEnhance,
    openByProductKey(productKey) { openModal(catalog.byProductKey.get(clean(productKey)) || null); },
    catalogStatus:() => catalog.status,
    _test:Object.freeze({ num, within, needsWeightMethod, needsBsaMethod, canonicalUnit, convertDoseUnit, administrationsPerDay, ageMatchesRule, preferredUnique, renderPlainLanguageTemplate, computeDose, frequencyText, durationText, ruleCoversPediatric, ruleCoversAdult, productGroup }),
  };
})();