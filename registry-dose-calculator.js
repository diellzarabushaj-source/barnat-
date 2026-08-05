(() => {
  'use strict';

  const VERSION = 'registry-dose-calculator-v2.0.0';
  const ENDPOINT = '/api/dose-calculator';
  const COLUMN_KEY = 'dose-calculator';
  const WAIT_TIMEOUT_MS = 30000;
  const EPSILON = 0.000001;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const numberValue = value => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[character]);
  const formatNumber = value => {
    const numeric = numberValue(value);
    if (numeric === null) return '—';
    return new Intl.NumberFormat('sq-AL', { maximumFractionDigits:3 }).format(numeric);
  };
  const within = (value, minimum, maximum) => {
    if (value === null) return minimum === null && maximum === null;
    if (minimum !== null && value < minimum) return false;
    if (maximum !== null && value > maximum) return false;
    return true;
  };

  let registry = { status:'loading', byNumber:new Map(), byDrugKey:new Map() };
  let catalog = { status:'loading', byPdid:new Map(), byRegistryNumber:new Map(), byProductKey:new Map() };
  let modal = null;
  let activeProduct = null;
  let enhanceQueued = false;
  let enhancing = false;
  let tbodyObserver = null;
  let headerObserver = null;

  function waitForRegistryRows() {
    if (Array.isArray(window.MEDINDEX_REGISTRY_ROWS)) return Promise.resolve(window.MEDINDEX_REGISTRY_ROWS);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        window.removeEventListener('medindex:registry-data-ready', onReady);
        callback(value);
      };
      const onReady = event => {
        const rows = event.detail?.rows || window.MEDINDEX_REGISTRY_ROWS;
        if (Array.isArray(rows)) finish(resolve, rows);
      };
      const timeout = setTimeout(() => finish(reject, new Error('Regjistri nuk u bë gati me kohë.')), WAIT_TIMEOUT_MS);
      window.addEventListener('medindex:registry-data-ready', onReady);
    });
  }

  function addUnique(map, key, value) {
    const normalized = clean(key);
    if (!normalized) return;
    if (!map.has(normalized)) map.set(normalized, value);
    else if (map.get(normalized)?.productKey !== value?.productKey) map.set(normalized, null);
  }

  async function loadRegistry() {
    try {
      const rows = await waitForRegistryRows();
      const byNumber = new Map();
      const byDrugKey = new Map();
      rows.forEach(row => {
        const number = clean(row['Nr rendor']);
        if (number) byNumber.set(number, row);
        addUnique(byDrugKey, [row.PDID, row['Emri tregtar'], row['Fortësia']].map(clean).join('|'), row);
      });
      registry = { status:'ready', byNumber, byDrugKey };
    } catch (error) {
      console.error('Regjistri nuk u indeksua për kalkulatorin e dozës:', error);
      registry = { status:'error', byNumber:new Map(), byDrugKey:new Map() };
    }
    scheduleEnhance();
  }

  async function loadCatalog() {
    try {
      const response = await fetch(ENDPOINT, { cache:'no-store', credentials:'same-origin' });
      if (!response.ok) throw new Error(`Katalogu i kalkulatorit nuk u ngarkua (${response.status}).`);
      const payload = await response.json();
      if (!payload?.meta?.failClosed || !payload?.meta?.officialVerifiedOnly || !Array.isArray(payload.catalog)) {
        throw new Error('Katalogu nuk e plotëson kontratën e sigurisë.');
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
      console.error('Kalkulatori i dozës nuk u ngarkua:', error);
      catalog = { status:'error', byPdid:new Map(), byRegistryNumber:new Map(), byProductKey:new Map() };
    }
    scheduleEnhance();
  }

  function buildHeaderIndex() {
    const map = new Map();
    Array.from(document.querySelectorAll('#headerRow > th')).forEach((header, index) => {
      const label = clean(header.textContent).replace(/[▲▼↕]/g, '').trim();
      if (label && !map.has(label)) map.set(label, index);
    });
    return map;
  }

  function registryRowForTableRow(tableRow, headerIndex) {
    const numberIndex = headerIndex.get('Nr');
    if (Number.isInteger(numberIndex)) {
      const number = clean(tableRow.children[numberIndex]?.textContent);
      const row = registry.byNumber.get(number);
      if (row) return row;
    }
    const drugKey = clean(tableRow.querySelector('.drug-select')?.dataset.drugKey);
    return drugKey ? registry.byDrugKey.get(drugKey) || null : null;
  }

  function productFor(row) {
    if (!row) return null;
    return catalog.byPdid.get(clean(row.PDID))
      || catalog.byRegistryNumber.get(clean(row['Nr rendor']))
      || null;
  }

  function patientGroupLabel(group) {
    if (group === 'pediatric_only') return 'VETËM PEDIATRIK';
    if (group === 'adult_only') return 'VETËM TË RRITUR';
    return 'FËMIJË + TË RRITUR';
  }

  function ensureHeader() {
    const header = document.getElementById('headerRow');
    if (!header || header.querySelector(`[data-registry-dose-calculator-column="${COLUMN_KEY}"]`)) return;
    const th = document.createElement('th');
    th.className = 'registry-dose-calculator-column';
    th.dataset.registryDoseCalculatorColumn = COLUMN_KEY;
    th.setAttribute('scope', 'col');
    th.innerHTML = 'Kalkulatori<span class="registry-dosage-subhead">Doza individuale</span>';
    header.appendChild(th);
  }

  function calculatorCell(product) {
    const cell = document.createElement('td');
    cell.className = 'registry-dose-calculator-column';
    cell.dataset.registryDoseCalculatorColumn = COLUMN_KEY;
    cell.dataset.label = 'Kalkulatori';

    if (catalog.status === 'loading' || registry.status === 'loading') {
      cell.innerHTML = '<span class="registry-dosage-muted">Duke u lidhur…</span>';
      return cell;
    }
    if (catalog.status === 'error' || registry.status === 'error') {
      cell.innerHTML = '<span class="registry-dosage-muted">—</span>';
      return cell;
    }
    if (!product) {
      cell.innerHTML = '<span class="registry-dosage-muted" aria-label="Nuk ka kalkulim të verifikuar">—</span>';
      return cell;
    }

    const group = clean(product.patientGroup);
    cell.innerHTML = `<span class="dose-calculator-group dose-calculator-group-${escapeHtml(group)}">${escapeHtml(patientGroupLabel(group))}</span>` +
      `<button type="button" class="dose-calculator-open" data-dose-product-key="${escapeHtml(product.productKey)}">Kalkulo dozën</button>`;
    return cell;
  }

  function ensureRows() {
    const headerIndex = buildHeaderIndex();
    document.querySelectorAll('#tbody > tr').forEach(tableRow => {
      if (tableRow.querySelector('.empty-state')) {
        const emptyCell = tableRow.querySelector('td');
        if (emptyCell) emptyCell.colSpan = document.querySelectorAll('#headerRow > th').length || Number(emptyCell.colSpan || 1);
        return;
      }
      const row = registryRowForTableRow(tableRow, headerIndex);
      const product = productFor(row);
      const matches = Array.from(tableRow.querySelectorAll(`[data-registry-dose-calculator-column="${COLUMN_KEY}"]`));
      matches.slice(1).forEach(node => node.remove());
      const desired = calculatorCell(product);
      if (!matches[0]) tableRow.appendChild(desired);
      else if (matches[0].innerHTML !== desired.innerHTML) matches[0].replaceWith(desired);
    });
  }

  function groupAllowed(patientGroup, selection) {
    if (patientGroup === 'pediatric_and_adult') return true;
    return selection === 'pediatric'
      ? patientGroup === 'pediatric_only'
      : patientGroup === 'adult_only';
  }

  function methodNeedsWeight(method) {
    return ['dose_per_kg_per_dose', 'dose_per_kg_per_day'].includes(clean(method));
  }

  function methodNeedsBsa(method) {
    return ['dose_per_m2_per_dose', 'dose_per_m2_per_day'].includes(clean(method));
  }

  function quantityName(unit, value) {
    const singular = Math.abs(Number(value) - 1) < EPSILON;
    const names = {
      tablet:singular ? 'tabletë' : 'tableta',
      capsule:singular ? 'kapsulë' : 'kapsula',
      suppository:singular ? 'supozitor' : 'supozitorë',
      sachet:singular ? 'qese' : 'qese',
      ampoule:singular ? 'ampulë' : 'ampula',
      vial:singular ? 'vial' : 'viale',
      dose:singular ? 'dozë' : 'doza',
      mL:'mL',
    };
    return names[unit] || clean(unit);
  }

  function roundQuantity(value, product, conversion) {
    const unit = clean(product.denominatorUnit);
    if (unit === 'tablet') {
      const denominator = conversion.tabletSplitAllowed ? Math.max(1, Number(product.tabletSplitDenominator) || 1) : 1;
      const increment = 1 / denominator;
      const rounded = Math.round(value / increment) * increment;
      if (Math.abs(rounded - value) > EPSILON && clean(product.roundingMode) === 'exact') return null;
      return rounded;
    }

    const increment = numberValue(conversion.roundingIncrementValue)
      || (unit === 'mL' ? numberValue(product.measurableIncrementMl) : null);
    if (!increment) return value;
    const mode = clean(product.roundingMode);
    const ratio = value / increment;
    if (mode === 'down') return Math.floor(ratio) * increment;
    if (mode === 'up') return Math.ceil(ratio) * increment;
    if (mode === 'nearest') return Math.round(ratio) * increment;
    const rounded = Math.round(ratio) * increment;
    return Math.abs(rounded - value) <= EPSILON ? rounded : null;
  }

  function officialDoseText(rule) {
    const minimum = formatNumber(rule.doseMinValue);
    const maximum = formatNumber(rule.doseMaxValue);
    const value = minimum === maximum ? minimum : `${minimum}–${maximum}`;
    const basis = rule.doseBasis === 'per_day' ? '/ditë' : rule.doseBasis === 'per_dose' ? '/dozë' : '';
    if (rule.calculationMethod === 'dose_per_kg_per_dose') return `${value} ${rule.doseUnit}/kg/dozë`;
    if (rule.calculationMethod === 'dose_per_kg_per_day') return `${value} ${rule.doseUnit}/kg/ditë`;
    if (rule.calculationMethod === 'dose_per_m2_per_dose') return `${value} ${rule.doseUnit}/m²/dozë`;
    if (rule.calculationMethod === 'dose_per_m2_per_day') return `${value} ${rule.doseUnit}/m²/ditë`;
    return `${value} ${rule.doseUnit}${basis}`;
  }

  function durationText(rule) {
    const min = numberValue(rule.durationMinDays);
    const max = numberValue(rule.durationMaxDays);
    if (rule.durationMode === 'single_dose') return 'Një dozë';
    if (rule.durationMode === 'prn') return 'Sipas nevojës';
    if (rule.durationMode === 'specialist_plan') return 'Sipas planit specialistik';
    if (min !== null && max !== null) {
      return min === max ? `${formatNumber(min)} ditë` : `${formatNumber(min)}–${formatNumber(max)} ditë`;
    }
    if (numberValue(rule.reviewAfterDays) !== null) return `Rivlerësim pas ${formatNumber(rule.reviewAfterDays)} ditësh`;
    return 'Sipas indikacionit';
  }

  function frequencyText(rule) {
    const min = numberValue(rule.intervalMinHours);
    const max = numberValue(rule.intervalMaxHours);
    const times = numberValue(rule.timesPerDay);
    if (rule.frequencyMode === 'once') return 'një herë në ditë';
    if (rule.frequencyMode === 'prn') return 'sipas nevojës';
    if (rule.frequencyMode === 'continuous') return 'vazhdimisht';
    if (rule.frequencyMode === 'interval' && min !== null) {
      return min === max || max === null ? `çdo ${formatNumber(min)} orë` : `çdo ${formatNumber(min)}–${formatNumber(max)} orë`;
    }
    if (rule.frequencyMode === 'times_per_day' && times !== null) return `${formatNumber(times)} herë në ditë`;
    return 'sipas skemës së verifikuar';
  }

  function computeDose(rule, product, weightKg) {
    const minimum = numberValue(rule.doseMinValue);
    const maximum = numberValue(rule.doseMaxValue ?? rule.doseMinValue);
    if (minimum === null || maximum === null) return { error:'Rregulli nuk ka vlera numerike të plota.' };
    if (rule.calculationMethod === 'manual_only') return { error:'Kjo skemë kërkon llogaritje dhe verifikim manual.' };
    if (methodNeedsBsa(rule.calculationMethod)) return { error:'Kjo skemë kërkon sipërfaqen trupore dhe nuk kalkulohet vetëm nga mosha/pesha.' };

    let doseMin = minimum;
    let doseMax = maximum;
    let calculation = 'Dozë fikse; nuk kërkohet llogaritje sipas peshës.';
    if (methodNeedsWeight(rule.calculationMethod)) {
      if (weightKg === null || weightKg <= 0) return { error:'Shkruaje peshën e pacientit në kilogramë.' };
      doseMin = minimum * weightKg;
      doseMax = maximum * weightKg;
      calculation = `${formatNumber(weightKg)} kg × ${minimum === maximum ? formatNumber(minimum) : `${formatNumber(minimum)}–${formatNumber(maximum)}`} ${rule.doseUnit}/kg`;
      if (rule.calculationMethod === 'dose_per_kg_per_day') {
        const times = numberValue(rule.timesPerDay);
        if (!times || times <= 0) return { error:'Mungon numri i dozave në ditë për këtë rregull.' };
        doseMin /= times;
        doseMax /= times;
        calculation += ` ÷ ${formatNumber(times)} doza/ditë`;
      }
    }

    const maxSingle = numberValue(rule.maxSingleDoseMg);
    if (clean(rule.doseUnit) === 'mg' && maxSingle !== null) {
      doseMin = Math.min(doseMin, maxSingle);
      doseMax = Math.min(doseMax, maxSingle);
    }
    const maxDaily = numberValue(rule.maxDailyDoseMg);
    const times = numberValue(rule.timesPerDay);
    if (clean(rule.doseUnit) === 'mg' && maxDaily !== null && times && times > 0) {
      doseMin = Math.min(doseMin, maxDaily / times);
      doseMax = Math.min(doseMax, maxDaily / times);
    }

    let quantityMin = null;
    let quantityMax = null;
    let conversionText = 'Konvertimi praktik kërkon verifikim manual.';
    const conversion = rule.conversion || {};
    const numerator = numberValue(product.numeratorValue);
    const denominator = numberValue(product.denominatorValue);
    const sameUnit = clean(product.numeratorUnit).toLowerCase() === clean(rule.doseUnit).toLowerCase();
    if (conversion.enabled && conversion.status === 'automatic' && numerator && denominator && sameUnit) {
      quantityMin = roundQuantity(doseMin * denominator / numerator, product, conversion);
      quantityMax = roundQuantity(doseMax * denominator / numerator, product, conversion);
      if (quantityMin === null || quantityMax === null) {
        return { error:'Doza nuk mund të shndërrohet saktë në këtë preparat pa ndarje ose rrumbullakim të palejuar.' };
      }
      const quantity = Math.abs(quantityMin - quantityMax) < EPSILON
        ? formatNumber(quantityMin)
        : `${formatNumber(quantityMin)}–${formatNumber(quantityMax)}`;
      conversionText = `${Math.abs(doseMin - doseMax) < EPSILON ? formatNumber(doseMin) : `${formatNumber(doseMin)}–${formatNumber(doseMax)}`} ${rule.doseUnit} = ${quantity} ${quantityName(product.denominatorUnit, quantityMax)}`;
    }

    return {
      doseMin,
      doseMax,
      quantityMin,
      quantityMax,
      calculation,
      conversionText,
    };
  }

  function errorMessageForRange(product, rules, group, ageMonths) {
    const groupRules = rules.filter(rule => groupAllowed(rule.patientGroup, group));
    if (!groupRules.length) {
      return group === 'pediatric'
        ? 'Ky preparat nuk përdoret te fëmijët sipas burimit zyrtar. Doza nuk mund të kalkulohet.'
        : 'Ky preparat nuk përdoret te të rriturit sipas burimit zyrtar. Doza nuk mund të kalkulohet.';
    }
    const minimums = groupRules.map(rule => numberValue(rule.minAgeMonths)).filter(value => value !== null);
    const minimum = minimums.length ? Math.min(...minimums) : null;
    if (minimum !== null && ageMonths < minimum) {
      const years = minimum / 12;
      return `Ky preparat nuk rekomandohet nën ${Number.isInteger(years) ? formatNumber(years) : formatNumber(minimum) + ' muaj'}. Doza nuk mund të kalkulohet.`;
    }
    return 'Nuk ka rregull të verifikuar për këtë moshë, peshë dhe indikacion. Doza nuk mund të kalkulohet.';
  }

  function selectedRules() {
    if (!modal || !activeProduct) return [];
    const indicationKey = clean(modal.indication.value);
    return activeProduct.rules.filter(rule => clean(rule.indicationKey) === indicationKey);
  }

  function updateWeightRequirement() {
    if (!modal) return;
    const rules = selectedRules();
    const needsWeight = rules.some(rule => methodNeedsWeight(rule.calculationMethod)
      || numberValue(rule.minWeightKg) !== null
      || numberValue(rule.maxWeightKg) !== null);
    modal.weight.disabled = !needsWeight;
    modal.weight.required = needsWeight;
    modal.weight.placeholder = needsWeight ? 'p.sh. 35' : 'Nuk nevojitet';
    if (!needsWeight) modal.weight.value = '';
    modal.weightHint.textContent = needsWeight ? 'kg' : 'Nuk nevojitet për këtë skemë';
  }

  function clearResult() {
    if (!modal) return;
    modal.result.hidden = true;
    modal.result.classList.remove('is-error');
    modal.resultText.textContent = '';
    modal.details.replaceChildren();
  }

  function showError(message) {
    modal.result.hidden = false;
    modal.result.classList.add('is-error');
    modal.resultText.textContent = message;
    modal.details.replaceChildren();
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

  function calculate() {
    clearResult();
    const group = clean(modal.group.value);
    const age = numberValue(modal.age.value);
    const ageUnit = clean(modal.ageUnit.value);
    const weight = modal.weight.disabled ? null : numberValue(modal.weight.value);
    if (!group) return showError('Zgjidhe grupmoshën e pacientit.');
    if (age === null || age < 0) return showError('Shkruaje moshën e pacientit.');
    const ageMonths = ageUnit === 'months' ? age : age * 12;
    if (group === 'pediatric' && ageMonths >= 216) return showError('Grupmosha “Fëmijë” nuk përputhet me moshën e shkruar.');
    if (group === 'adult' && ageMonths < 216) return showError('Grupmosha “I rritur” nuk përputhet me moshën e shkruar.');

    const rules = selectedRules();
    const eligible = rules.filter(rule => groupAllowed(rule.patientGroup, group)
      && within(ageMonths, numberValue(rule.minAgeMonths), numberValue(rule.maxAgeMonths))
      && within(weight, numberValue(rule.minWeightKg), numberValue(rule.maxWeightKg)));
    if (eligible.length !== 1) {
      if (!eligible.length) return showError(errorMessageForRange(activeProduct, rules, group, ageMonths));
      return showError('U gjetën më shumë se një rregull. Kalkulimi u bllokua për verifikim klinik.');
    }

    const rule = eligible[0];
    const computed = computeDose(rule, activeProduct, weight);
    if (computed.error) return showError(computed.error);

    modal.result.hidden = false;
    modal.result.classList.remove('is-error');
    const doseRange = Math.abs(computed.doseMin - computed.doseMax) < EPSILON
      ? `${formatNumber(computed.doseMin)} ${rule.doseUnit}`
      : `${formatNumber(computed.doseMin)}–${formatNumber(computed.doseMax)} ${rule.doseUnit}`;
    const quantity = computed.quantityMin !== null
      ? (Math.abs(computed.quantityMin - computed.quantityMax) < EPSILON
        ? `${formatNumber(computed.quantityMin)} ${quantityName(activeProduct.denominatorUnit, computed.quantityMin)}`
        : `${formatNumber(computed.quantityMin)}–${formatNumber(computed.quantityMax)} ${quantityName(activeProduct.denominatorUnit, computed.quantityMax)}`)
      : doseRange;
    modal.resultText.textContent = clean(rule.plainLanguageTemplate)
      || `Jep ${quantity} nga rruga ${rule.route || activeProduct.route}, ${frequencyText(rule)}, për ${durationText(rule).toLowerCase()}.`;

    const rows = [
      detailRow('Doza zyrtare:', officialDoseText(rule)),
      detailRow('Llogaritja:', computed.calculation),
      detailRow('Konvertimi:', computed.conversionText),
      detailRow('Shpeshtësia:', frequencyText(rule)),
      detailRow('Kohëzgjatja:', durationText(rule)),
    ];
    if (numberValue(rule.maxSingleDoseMg) !== null) rows.push(detailRow('Maksimumi për dozë:', `${formatNumber(rule.maxSingleDoseMg)} mg`));
    if (numberValue(rule.maxDailyDoseMg) !== null) rows.push(detailRow('Maksimumi në 24 orë:', `${formatNumber(rule.maxDailyDoseMg)} mg`));
    if (clean(rule.clinicalNotes)) rows.push(detailRow('Kujdes:', clean(rule.clinicalNotes)));

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
    modal.details.replaceChildren(...rows);
  }

  function populateModal(product) {
    activeProduct = product;
    modal.title.textContent = 'Kalkulo dozën';
    modal.productName.textContent = product.displayLabel || product.tradeName;
    modal.indication.replaceChildren();
    const indicationMap = new Map();
    product.rules.forEach(rule => {
      if (!indicationMap.has(rule.indicationKey)) indicationMap.set(rule.indicationKey, rule.indicationName);
    });
    indicationMap.forEach((name, key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = name;
      modal.indication.appendChild(option);
    });

    modal.group.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Zgjidhe';
    modal.group.appendChild(placeholder);
    const rules = product.rules;
    if (rules.some(rule => groupAllowed(rule.patientGroup, 'pediatric'))) {
      const option = document.createElement('option');
      option.value = 'pediatric';
      option.textContent = 'Fëmijë';
      modal.group.appendChild(option);
    }
    if (rules.some(rule => groupAllowed(rule.patientGroup, 'adult'))) {
      const option = document.createElement('option');
      option.value = 'adult';
      option.textContent = 'I rritur';
      modal.group.appendChild(option);
    }
    modal.age.value = '';
    modal.ageUnit.value = 'years';
    modal.weight.value = '';
    updateWeightRequirement();
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
    requestAnimationFrame(() => modal.indication.focus());
  }

  function ensureModal() {
    if (modal) return modal;
    const root = document.createElement('div');
    root.className = 'dose-calculator-modal';
    root.id = 'doseCalculatorModal';
    root.hidden = true;
    root.innerHTML = `
      <div class="dose-calculator-backdrop" data-dose-calculator-close></div>
      <section class="dose-calculator-dialog" role="dialog" aria-modal="true" aria-labelledby="doseCalculatorTitle">
        <header class="dose-calculator-dialog-header">
          <div><span class="dose-calculator-eyebrow">MedIndex · Burime zyrtare</span><h2 id="doseCalculatorTitle">Kalkulo dozën</h2></div>
          <button type="button" class="dose-calculator-close" data-dose-calculator-close aria-label="Mbyll kalkulatorin">×</button>
        </header>
        <div class="dose-calculator-product" data-dose-product-name></div>
        <div class="dose-calculator-form">
          <label><span>Indikacioni</span><select data-dose-indication></select></label>
          <label><span>Grupmosha</span><select data-dose-group></select></label>
          <label><span>Mosha</span><span class="dose-calculator-input-pair"><input data-dose-age type="number" min="0" step="0.1" inputmode="decimal" autocomplete="off"><select data-dose-age-unit><option value="years">vjet</option><option value="months">muaj</option></select></span></label>
          <label><span>Pesha</span><span class="dose-calculator-input-pair"><input data-dose-weight type="number" min="0.1" step="0.1" inputmode="decimal" autocomplete="off"><span class="dose-calculator-unit" data-dose-weight-hint>kg</span></span></label>
          <label><span>Preparati</span><output data-dose-product-output></output></label>
        </div>
        <button type="button" class="dose-calculator-submit" data-dose-calculate>Kalkulo</button>
        <section class="dose-calculator-result" data-dose-result hidden aria-live="polite">
          <h3>Rezultati për pacientin</h3>
          <p data-dose-result-text></p>
          <details><summary>Si u llogarit?</summary><div class="dose-calculator-details" data-dose-details></div></details>
        </section>
        <p class="dose-calculator-safety">Pa një rregull të verifikuar dhe burim zyrtar, kalkulatori bllokohet dhe nuk jep dozë.</p>
      </section>`;
    document.body.appendChild(root);
    modal = {
      root,
      title:root.querySelector('#doseCalculatorTitle'),
      productName:root.querySelector('[data-dose-product-name]'),
      indication:root.querySelector('[data-dose-indication]'),
      group:root.querySelector('[data-dose-group]'),
      age:root.querySelector('[data-dose-age]'),
      ageUnit:root.querySelector('[data-dose-age-unit]'),
      weight:root.querySelector('[data-dose-weight]'),
      weightHint:root.querySelector('[data-dose-weight-hint]'),
      productOutput:root.querySelector('[data-dose-product-output]'),
      result:root.querySelector('[data-dose-result]'),
      resultText:root.querySelector('[data-dose-result-text]'),
      details:root.querySelector('[data-dose-details]'),
    };
    Object.defineProperty(modal.productName, 'textContent', {
      set(value) {
        this.replaceChildren(document.createTextNode(value));
        modal.productOutput.value = value;
        modal.productOutput.textContent = value;
      },
      get() { return clean(this.innerText); },
      configurable:true,
    });
    root.querySelectorAll('[data-dose-calculator-close]').forEach(button => button.addEventListener('click', closeModal));
    root.querySelector('[data-dose-calculate]').addEventListener('click', calculate);
    modal.indication.addEventListener('change', () => { updateWeightRequirement(); clearResult(); });
    modal.group.addEventListener('change', clearResult);
    modal.age.addEventListener('input', clearResult);
    modal.ageUnit.addEventListener('change', clearResult);
    modal.weight.addEventListener('input', clearResult);
    return modal;
  }

  function disconnectObservers() {
    tbodyObserver?.disconnect();
    headerObserver?.disconnect();
  }

  function observe() {
    const tbody = document.getElementById('tbody');
    const header = document.getElementById('headerRow');
    if (tbody) {
      if (!tbodyObserver) tbodyObserver = new MutationObserver(scheduleEnhance);
      tbodyObserver.observe(tbody, { childList:true });
    }
    if (header) {
      if (!headerObserver) headerObserver = new MutationObserver(scheduleEnhance);
      headerObserver.observe(header, { childList:true });
    }
  }

  function enhance() {
    if (enhancing) return;
    enhancing = true;
    disconnectObservers();
    try {
      ensureHeader();
      ensureRows();
      document.documentElement.dataset.doseCalculatorVersion = VERSION;
    } finally {
      enhancing = false;
      observe();
    }
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
    const product = catalog.byProductKey.get(clean(button.dataset.doseProductKey));
    openModal(product);
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
    openByProductKey(productKey) {
      openModal(catalog.byProductKey.get(clean(productKey)) || null);
    },
    catalogStatus:() => catalog.status,
    _test:Object.freeze({ within, groupAllowed, methodNeedsWeight, computeDose, durationText, frequencyText }),
  };
})();
