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
    return numeric === null ? 'â€”' : new Intl.NumberFormat('sq-AL', { maximumFractionDigits:3 }).format(numeric);
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
    const unit = clean(value).toLowerCase().replace(/\s+/g, '').replace(/Î¼/g, 'Âµ');
    const aliases = {
      milligram:'mg', milligrams:'mg',
      microgram:'Âµg', micrograms:'Âµg', mcg:'Âµg', ug:'Âµg',
      gram:'g', grams:'g',
      milliliter:'ml', milliliters:'ml', millilitre:'ml', millilitres:'ml',
    };
    return aliases[unit] || unit;
  }

  function massFactorToMg(unit) {
    const canonical = canonicalUnit(unit);
    if (canonical === 'mg') return 1;
    if (canonical === 'g') return 1000;
    if (canonical === 'Âµg') return 0.001;
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
    if (count === null && rule.frequencyMode === 'once') count = 1;
    if (count === null && rule.frequencyMode === 'interval' && interval && interval > 0) {
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
      const timer = setTimeout(() => finish(reject, new Error('Regjistri nuk u bÃ« gati me kohÃ«.')), 30000);
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
        addUnique(byDrugKey, [row.PDID,row['Emri tregtar'],row['FortÃ«sia']].map(clean).join('|'), row);
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
        throw new Error('Kontrata e katalogut nuk Ã«shtÃ« e vlefshme.');
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
      const label = clean(header.textContent).replace(/[â–²â–¼â†•]/g, '').trim();
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
    if (group === 'pediatric_only') return 'VETÃ‹M PEDIATRIK';
    if (group === 'adult_only') return 'VETÃ‹M TÃ‹ RRITUR';
    return 'FÃ‹MIJÃ‹ + TÃ‹ RRITUR';
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
      cell.innerHTML = '<span class="registry-dosage-muted">â€¦</span>';
      return cell;
    }
    if (!product || catalog.status !== 'ready' || registry.status !== 'ready') {
      cell.classList.add('dose-table-cell-empty');
      cell.innerHTML = '<span class="registry-dosage-muted" aria-label="Nuk ka kalkulator">â€”</span>';
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
      tablet:singular ? 'tabletÃ«' : 'tableta',
      capsule:singular ? 'kapsulÃ«' : 'kapsula',
      suppository:singular ? 'supozitor' : 'supozitorÃ«',
      sachet:'qese', ampoule:singular ? 'ampulÃ«' : 'ampula', vial:singular ? 'vial' : 'viale',
      dose:singular ? 'dozÃ«' : 'doza', ml:'mL',
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
    const value = minimum === maximum ? minimum : `${minimum}â€“${maximum}`;
    if (rule.calculationMethod === 'dose_per_kg_per_dose') return `${value} ${rule.doseUnit}/kg/dozÃ«`;
    if (rule.calculationMethod === 'dose_per_kg_per_day') return `${value} ${rule.doseUnit}/kg/ditÃ«`;
    if (rule.calculationMethod === 'dose_per_m2_per_dose') return `${value} ${rule.doseUnit}/mÂ²/dozÃ«`;
    if (rule.calculationMethod === 'dose_per_m2_per_day') return `${value} ${rule.doseUnit}/mÂ²/ditÃ«`;
    const basis = rule.doseBasis === 'per_day' ? '/ditÃ«' : rule.doseBasis === 'per_dose' ? '/dozÃ«' : '';
    return `${value} ${rule.doseUnit}${basis}`;
  }

  function frequencyText(rule) {
    const minimum = num(rule.intervalMinHours);
    const maximum = num(rule.intervalMaxHours);
    const times = num(rule.timesPerDay);
    if (rule.frequencyMode === 'once') return 'njÃ« herÃ« nÃ« ditÃ«';
    if (rule.frequencyMode === 'continuous') return 'vazhdimisht';
    if (rule.frequencyMode === 'interval' && minimum !== null) return maximum === null || minimum === maximum
      ? `Ã§do ${fmt(minimum)} orÃ«`
      : `Ã§do ${fmt(minimum)}â€“${fmt(maximum)} orÃ«`;
    if (rule.frequencyMode === 'times_per_day' && times !== null) return `${fmt(times)} herÃ« nÃ« ditÃ«`;
    if (rule.frequencyMode === 'prn') return 'sipaÛß9¶‰žËkºwµçP¸œ¤ì4(€€€€€•±Í”±•…ÉI•ÍÕ±Ð ¤ì4(€€€€€É•ÑÕÉ¸™…±Í”ì4(€€€ô4(€€€¥˜€¡Ý•¥¡Ð€„ôô¹Õ±°€˜˜Ý•¥¡Ð€ø5a}]%!Q}-¤ì4(€€€€€Í¡½ÝÉÉ½È -½¹ÑÉ½±±½©”Á•Í£­¸”Á…¥•¹Ñ¥Ð¸œ¤ì4(€€€€€É•ÑÕÉ¸™…±Í”ì4(€€€ô4(4(€€€½¹ÍÐ•±¥¥‰±”€ôÁÉ•™•ÉÉ•‘U¹¥ÅÕ”¡…•IÕ±•Ì¹™¥±Ñ•È¡ÉÕ±”€ôø€…ÉÕ±•9••‘Í]•¥¡Ð¡ÉÕ±”¤(€€€€€ñðÝ¥Ñ¡¥¸¡Ý•¥¡Ð°¹Õ´¡ÉÕ±”¹µ¥¹]•¥¡Ñ-œ¤°¹Õ´¡ÉÕ±”¹µ…á]•¥¡Ñ-œ¤¤¤¤ì(€€€¥˜€¡•±¥¥‰±”¹±•¹Ñ €„ôô€Ä¤ì4(€€€€€¥˜€ …•±¥¥‰±”¹±•¹Ñ ¤Í¡½ÝÉÉ½È 9Õ¬­„ÉÉ•Õ±°Ó¬Ù•Ó­´Ã­È¯­Ó¬µ½Í£¬°Á•Í£¬‘¡”¥¹‘¥­…¥½¸¸œ¤ì4(€€€€€•±Í”Í¡½ÝÉÉ½È T©•Ó­¸‘¥Í„ÉÉ•Õ±±„Ç¬Ã­ÉÁÕÑ¡•¸¸-…±­Õ±¥µ¤Ô‰±±½­Õ„Ã­È­½¹ÑÉ½±°­±¥¹¥¬¸œ¤ì4(€€€€€É•ÑÕÉ¸™…±Í”ì4(€€€ô4(4(€€€½¹ÍÐÉÕ±”€ô•±¥¥‰±•lÁtì4(€€€½¹ÍÐ½µÁÕÑ•€ô½µÁÕÑ•½Í”¡ÉÕ±”°…Ñ¥Ù•AÉ½‘ÕÐ°Ý•¥¡Ð¤ì4(€€€¥˜€¡½µÁÕÑ•¹•ÉÉ½È¤ì4(€€€€€Í¡½ÝÉÉ½È¡½µÁÕÑ•¹•ÉÉ½È¤ì4(€€€€€É•ÑÕÉ¸™…±Í”ì4(€€€ô4(4(€€€½¹ÍÐ‘½Í•I…¹”€ô5…Ñ ¹…‰Ì¡½µÁÕÑ•¹‘½Í•5¥¸€´½µÁÕÑ•¹‘½Í•5…à¤€ðAM%1=84(€€€€€€ü€‘í™µÐ¡½µÁÕÑ•¹‘½Í•5¥¸¥ô€‘íÉÕ±”¹‘½Í•U¹¥Ñõ€4(€€€€€€è€‘í™µÐ¡½µÁÕÑ•¹‘½Í•5¥¸¥÷ŠL‘í™µÐ¡½µÁÕÑ•¹‘½Í•5…à¥ô€‘íÉÕ±”¹‘½Í•U¹¥Ñõ€ì4(€€€½¹ÍÐ¡…ÍÕÑ½µ…Ñ¥EÕ…¹Ñ¥Ñä€ô½µÁÕÑ•¹ÅÕ…¹Ñ¥Ñå5¥¸€„ôô¹Õ±°€˜˜½µÁÕÑ•¹ÅÕ…¹Ñ¥Ñå5…à€„ôô¹Õ±°ì4(€€€½¹ÍÐÅÕ…¹Ñ¥Ñä€ô¡…ÍÕÑ½µ…Ñ¥EÕ…¹Ñ¥Ñä4(€€€€€€ü€¡5…Ñ ¹…‰Ì¡½µÁÕÑ•¹ÅÕ…¹Ñ¥Ñå5¥¸€´½µÁÕÑ•¹ÅÕ…¹Ñ¥Ñå5…à¤€ðAM%1=84(€€€€€€€€ü€‘í™µÐ¡½µÁÕÑ•¹ÅÕ…¹Ñ¥Ñå5¥¸¥ô€‘íÅÕ…¹Ñ¥Ñå9…µ”¡…Ñ¥Ù•AÉ½‘ÕÐ¹‘•¹½µ¥¹…Ñ½ÉU¹¥Ð°½µÁÕÑ•¹ÅÕ…¹Ñ¥Ñå5¥¸¥õ€4(€€€€€€€€è€‘í™µÐ¡½µÁÕÑ•¹ÅÕ…¹Ñ¥Ñå5¥¸¥÷ŠL‘í™µÐ¡½µÁÕÑ•¹ÅÕ…¹Ñ¥Ñå5…à¥ô€‘íÅÕ…¹Ñ¥Ñå9…µ”¡…Ñ¥Ù•AÉ½‘ÕÐ¹‘•¹½µ¥¹…Ñ½ÉU¹¥Ð°½µÁÕÑ•¹ÅÕ…¹Ñ¥Ñå5…à¥õ€¤4(€€€€€€è‘½Í•I…¹”ì4(4(€€€µ½‘…°¹É•ÍÕ±Ð¹¡¥‘‘•¸€ô™…±Í”ì(€€€µ½‘…°¹É•ÍÕ±Ð¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ¥Ìµ•ÉÉ½Èœ¤ì(€€€½¹ÍÐ™É•ÅÕ•¹ä€ô™É•ÅÕ•¹åQ•áÐ¡ÉÕ±”¤ì(€€€½¹ÍÐ‘ÕÉ…Ñ¥½¸€ô‘ÕÉ…Ñ¥½¹Q•áÐ¡ÉÕ±”¤¹Ñ½1½Ý•É…Í” ¤ì(€€€½¹ÍÐ½µÁÕÑ•‘%¹ÍÑÉÕÑ¥½¸€ô¡…ÍÕÑ½µ…Ñ¥EÕ…¹Ñ¥Ñä(€€€€€€ü½é„è€‘íÅÕ…¹Ñ¥Ñåôƒ
Ü€‘í™É•ÅÕ•¹åôƒ
Ü€‘í‘ÕÉ…Ñ¥½¹ô¹€(€€€€€€è½é„è€‘í‘½Í•I…¹•ôƒ
Ü€‘í™É•ÅÕ•¹åôƒ
Ü€‘í‘ÕÉ…Ñ¥½¹ô¸-½¹Ù•ÉÑ¥µ¤»¬€‘í…Ñ¥Ù•AÉ½‘ÕÐ¹ÑÉ…‘•9…µ•ô¯­É­½¸Ù•É¥™¥­¥´µ…¹Õ…°¹€ì(€€€½¹ÍÐÑ•µÁ±…Ñ•‘%¹ÍÑÉÕÑ¥½¸€ôÉ•¹‘•ÉA±…¥¹1…¹Õ…•Q•µÁ±…Ñ”¡ÉÕ±”¹Á±…¥¹1…¹Õ…•Q•µÁ±…Ñ”°ì(€€€€€‘½Í”é‘½Í•I…¹”°(€€€€€ÅÕ…¹Ñ¥Ñä°(€€€€€™É•ÅÕ•¹ä°(€€€€€‘ÕÉ…Ñ¥½¸°(€€€€€ÁÉ½‘ÕÐé…Ñ¥Ù•AÉ½‘ÕÐ¹ÑÉ…‘•9…µ”°(€€€€€É½ÕÑ”é±•…¸¡ÉÕ±”¹É½ÕÑ”¤°(€€€ô¤ì(€€€µ½‘…°¹É•ÍÕ±ÑQ•áÐ¹Ñ•áÑ½¹Ñ•¹Ð€ôÑ•µÁ±…Ñ•‘%¹ÍÑÉÕÑ¥½¸ñð½µÁÕÑ•‘%¹ÍÑÉÕÑ¥½¸ì(4(€€€½¹ÍÐÉ½ÝÌ€ôl4(€€€€€‘•Ñ…¥±I½Ü IÉ•Õ±±¤èœ°‘½Í•Q•áÐ¡ÉÕ±”¤¤°4(€€€€€‘•Ñ…¥±I½Ü 1±½…É¥Ñ©„èœ°½µÁÕÑ•¹…±Õ±…Ñ¥½¸¤°4(€€€€€‘•Ñ…¥±I½Ü AÉ•Á…É…Ñ¤èœ°…Ñ¥Ù•AÉ½‘ÕÐ¹‘¥ÍÁ±…å1…‰•°ñð…Ñ¥Ù•AÉ½‘ÕÐ¹ÑÉ…‘•9…µ”¤°4(€€€€€‘•Ñ…¥±I½Ü -½¹Ù•ÉÑ¥µ¤èœ°½µÁÕÑ•¹½¹Ù•ÉÍ¥½¹Q•áÐ¤°4(€€€€€‘•Ñ…¥±I½Ü M¡Á•Í¡Ó­Í¥„èœ°™É•ÅÕ•¹åQ•áÐ¡ÉÕ±”¤¤°4(€€€€€‘•Ñ…¥±I½Ü -½£­é©…Ñ©„èœ°‘ÕÉ…Ñ¥½¹Q•áÐ¡ÉÕ±”¤¤°4(€€€tì4(€€€¥˜€¡¹Õ´¡ÉÕ±”¹µ…áM¥¹±•½Í•5œ¤€„ôô¹Õ±°¤É½ÝÌ¹ÁÕÍ ¡‘•Ñ…¥±I½Ü 5…­Í¥µÕµ¤Ã­È‘½ë¬èœ°€‘í™µÐ¡ÉÕ±”¹µ…áM¥¹±•½Í•5œ¥ôµ€¤¤ì4(€€€¥˜€¡¹Õ´¡ÉÕ±”¹µ…á…¥±å½Í•5œ¤€„ôô¹Õ±°¤É½ÝÌ¹ÁÕÍ ¡‘•Ñ…¥±I½Ü 5…­Í¥µÕµ¤»¬€ÈÐ½Ë¬èœ°€‘í™µÐ¡ÉÕ±”¹µ…á…¥±å½Í•5œ¥ôµ€¤¤ì4(€€€¥˜€¡¹Õ´¡ÉÕ±”¹µ…á½Í•ÌÈÑ ¤€„ôô¹Õ±°¤É½ÝÌ¹ÁÕÍ ¡‘•Ñ…¥±I½Ü 5…­Í¥µÕµ¤¤…‘µ¥¹¥ÍÑÉ¥µ•Ù”èœ°€‘í™µÐ¡ÉÕ±”¹µ…á½Í•ÌÈÑ ¥ô€¼€ÈÐ½Ë­€¤¤ì4(€€€¥˜€¡±•…¸¡ÉÕ±”¹±¥¹¥…±9½Ñ•Ì¤¤É½ÝÌ¹ÁÕÍ ¡‘•Ñ…¥±I½Ü M£­¹¥´èœ°±•…¸¡ÉÕ±”¹±¥¹¥…±9½Ñ•Ì¤¤¤ì4(4(€€€¥˜€¡ÉÕ±”¹Í½ÕÉ”ü¹ÕÉ°¤ì4(€€€€€½¹ÍÐÍ½ÕÉ•I½Ü€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‘¥Øœ¤ì4(€€€€€Í½ÕÉ•I½Ü¹±…ÍÍ9…µ”€ô€‘½Í”µ…±Õ±…Ñ½Èµ‘•Ñ…¥°µÉ½Üœì4(€€€€€½¹ÍÐÍ½ÕÉ•1…‰•°€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ÍÑÉ½¹œœ¤ì4(€€€€€Í½ÕÉ•1…‰•°¹Ñ•áÑ½¹Ñ•¹Ð€ô€	ÕÉ¥µ¤éåÉÑ…Èèœì4(€€€€€½¹ÍÐÍ½ÕÉ•1¥¹¬€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð „œ¤ì4(€€€€€Í½ÕÉ•1¥¹¬¹¡É•˜€ôÉÕ±”¹Í½ÕÉ”¹ÕÉ°ì4(€€€€€Í½ÕÉ•1¥¹¬¹Ñ…É•Ð€ô€}‰±…¹¬œì4(€€€€€Í½ÕÉ•1¥¹¬¹É•°€ô€¹½½Á•¹•È¹½É•™•ÉÉ•Èœì4(€€€€€Í½ÕÉ•1¥¹¬¹Ñ•áÑ½¹Ñ•¹Ð€ômÉÕ±”¹Í½ÕÉ”¹¹…µ”°ÉÕ±”¹Í½ÕÉ”¹Í•Ñ¥½¹A…•t¹™¥±Ñ•È¡	½½±•…¸¤¹©½¥¸ œƒ
Ü€œ¤ì4(€€€€€Í½ÕÉ•I½Ü¹…ÁÁ•¹¡Í½ÕÉ•1…‰•°°Í½ÕÉ•1¥¹¬¤ì4(€€€€€É½ÝÌ¹ÁÕÍ ¡Í½ÕÉ•I½Ü¤ì4(€€€ô4(€€€µ½‘…°¹‘•Ñ…¥±Ì¹É•Á±…•¡¥±‘É•¸ ¸¸¹É½ÝÌ¤ì4(€€€µ½‘…°¹…Ñ¥½¹Ì¹¡¥‘‘•¸€ô™…±Í”ì4(€€€µ½‘…°¹ÁÉ½É•ÍÍI•ÍÕ±Ð¹±…ÍÍ1¥ÍÐ¹…‘ ¥Ìµ‘½¹”œ¤ì4(€€€É•ÑÕÉ¸ÑÉÕ”ì4(€ô4(4(€™Õ¹Ñ¥½¸µ…å‰•…±Õ±…Ñ” ¤ì4(€€€ÕÁ‘…Ñ•‘…ÁÑ¥Ù•¥•±‘Ì ¤ì4(€€€Ù½¥…±Õ±…Ñ”¡ìÍ¥±•¹ÐéÑÉÕ”ô¤ì4(€ô4(4(€™Õ¹Ñ¥½¸Á½ÁÕ±…Ñ•5½‘…°¡ÁÉ½‘ÕÐ¤ì4(€€€…Ñ¥Ù•AÉ½‘ÕÐ€ôÁÉ½‘ÕÐì4(€€€½¹ÍÐ±…‰•°€ôÁÉ½‘ÕÐ¹‘¥ÍÁ±…å1…‰•°ñðÁÉ½‘ÕÐ¹ÑÉ…‘•9…µ”ì4(€€€µ½‘…°¹ÁÉ½‘ÕÑ9…µ”¹Ñ•áÑ½¹Ñ•¹Ð€ô±…‰•°ì4(€€€µ½‘…°¹¥¹‘¥…Ñ¥½¸¹É•Á±…•¡¥±‘É•¸ ¤ì4(€€€½¹ÍÐ¥¹‘¥…Ñ¥½¹Ì€ô¹•Ü5…À ¤ì4(€€€ÁÉ½‘ÕÐ¹ÉÕ±•Ì¹™½É… ¡ÉÕ±”€ôøì4(€€€€€¥˜€ …¥¹‘¥…Ñ¥½¹Ì¹¡…Ì¡ÉÕ±”¹¥¹‘¥…Ñ¥½¹-•ä¤¤¥¹‘¥…Ñ¥½¹Ì¹Í•Ð¡ÉÕ±”¹¥¹‘¥…Ñ¥½¹-•ä°ÉÕ±”¹¥¹‘¥…Ñ¥½¹9…µ”¤ì4(€€€ô¤ì4(€€€¥¹‘¥…Ñ¥½¹Ì¹™½É…  ¡¹…µ”°­•ä¤€ôøì4(€€€€€½¹ÍÐ½ÁÑ¥½¸€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ½ÁÑ¥½¸œ¤ì4(€€€€€½ÁÑ¥½¸¹Ù…±Õ”€ô­•äì4(€€€€€½ÁÑ¥½¸¹Ñ•áÑ½¹Ñ•¹Ð€ô¹…µ”ì4(€€€€€µ½‘…°¹¥¹‘¥…Ñ¥½¸¹…ÁÁ•¹‘¡¥±¡½ÁÑ¥½¸¤ì4(€€€ô¤ì4(€€€µ½‘…°¹¥¹‘¥…Ñ¥½¹]É…À¹¡¥‘‘•¸€ô¥¹‘¥…Ñ¥½¹Ì¹Í¥é”€ðô€Äì4(€€€µ½‘…°¹…”¹Ù…±Õ”€ô€œœì4(€€€µ½‘…°¹…•U¹¥Ð¹Ù…±Õ”€ô€å•…ÉÌœì4(€€€µ½‘…°¹Ý•¥¡Ð¹Ù…±Õ”€ô€œœì4(€€€µ½‘…°¹Ý•¥¡Ñ]É…À¹¡¥‘‘•¸€ôÑÉÕ”ì4(€€€µ½‘…°¹Ý•¥¡Ñ¡¥ÁÌ¹¡¥‘‘•¸€ôÑÉÕ”ì4(€€€µ½‘…°¹ÁÉ½É•ÍÍ”¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ¥Ìµ‘½¹”œ¤ì4(€€€µ½‘…°¹ÁÉ½É•ÍÍ]•¥¡Ð¹±…ÍÍ1¥ÍÐ¹…‘ ¥Ìµ‘½¹”œ¤ì4(€€€µ½‘…°¹ÁÉ½É•ÍÍI•ÍÕ±Ð¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ¥Ìµ‘½¹”œ¤ì4(€€€±•…ÉI•ÍÕ±Ð ¤ì4(€ô4(4(€™Õ¹Ñ¥½¸±½Í•5½‘…° ¤ì4(€€€¥˜€ …µ½‘…°¤É•ÑÕÉ¸ì4(€€€µ½‘…°¹É½½Ð¹¡¥‘‘•¸€ôÑÉÕ”ì4(€€€‘½Õµ•¹Ð¹‰½‘ä¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‘½Í”µ…±Õ±…Ñ½Èµµ½‘…°µ½Á•¸œ¤ì4(€€€…Ñ¥Ù•AÉ½‘ÕÐ€ô¹Õ±°ì4(€ô4(4(€™Õ¹Ñ¥½¸½Á•¹5½‘…°¡ÁÉ½‘ÕÐ¤ì4(€€€¥˜€ …ÁÉ½‘ÕÐ¤É•ÑÕÉ¸ì4(€€€•¹ÍÕÉ•5½‘…° ¤ì4(€€€Á½ÁÕ±…Ñ•5½‘…°¡ÁÉ½‘ÕÐ¤ì4(€€€µ½‘…°¹É½½Ð¹¡¥‘‘•¸€ô™…±Í”ì4(€€€‘½Õµ•¹Ð¹‰½‘ä¹±…ÍÍ1¥ÍÐ¹…‘ ‘½Í”µ…±Õ±…Ñ½Èµµ½‘…°µ½Á•¸œ¤ì4(€€€É•ÅÕ•ÍÑ¹¥µ…Ñ¥½¹É…µ”  ¤€ôø€¡µ½‘…°¹¥¹‘¥…Ñ¥½¹]É…À¹¡¥‘‘•¸€üµ½‘…°¹…”€èµ½‘…°¹¥¹‘¥…Ñ¥½¸¤¹™½ÕÌ ¤¤ì4(€ô4(4(€™Õ¹Ñ¥½¸½Áå%¹ÍÑÉÕÑ¥½¸ ¤ì4(€€€½¹ÍÐÑ•áÐ€ô±•…¸¡µ½‘…°ü¹É•ÍÕ±ÑQ•áÐü¹Ñ•áÑ½¹Ñ•¹Ð¤ì4(€€€¥˜€ …Ñ•áÐ¤É•ÑÕÉ¸ì4(€€€½¹ÍÐ‘½¹”€ô€ ¤€ôøì4(€€€€€µ½‘…°¹½Áä¹Ñ•áÑ½¹Ñ•¹Ð€ô€T­½Á©Õ„ƒŠrLœì4(€€€€€Í•ÑQ¥µ•½ÕÐ  ¤€ôøì¥˜€¡µ½‘…°¤µ½‘…°¹½Áä¹Ñ•áÑ½¹Ñ•¹Ð€ô€-½Á©¼Õ‘£­é¥µ¥¸œìô°€ÄÐÀÀ¤ì4(€€€ôì4(€€€¥˜€¡¹…Ù¥…Ñ½È¹±¥Á‰½…Éü¹ÝÉ¥Ñ•Q•áÐ¤¹…Ù¥…Ñ½È¹±¥Á‰½…É¹ÝÉ¥Ñ•Q•áÐ¡Ñ•áÐ¤¹Ñ¡•¸¡‘½¹”¤¹…Ñ   ¤€ôøíô¤ì4(€ô4(4(€™Õ¹Ñ¥½¸É•Í•ÑA…Ñ¥•¹Ð ¤ì4(€€€¥˜€ ……Ñ¥Ù•AÉ½‘ÕÐñð€…µ½‘…°¤É•ÑÕÉ¸ì4(€€€½¹ÍÐÁÉ½‘ÕÐ€ô…Ñ¥Ù•AÉ½‘ÕÐì4(€€€Á½ÁÕ±…Ñ•5½‘…°¡ÁÉ½‘ÕÐ¤ì4(€€€µ½‘…°¹…”¹™½ÕÌ ¤ì4(€ô4(4(€™Õ¹Ñ¥½¸•¹ÍÕÉ•MÑå±•Ì ¤ì4(€€€¥˜€¡‘½Õµ•¹Ð¹•Ñ±•µ•¹Ñ	å% ‘½Í•…±Õ±…Ñ½ÉXÈÉMÑå±•Ìœ¤¤É•ÑÕÉ¸ì4(€€€½¹ÍÐÍÑå±”€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ÍÑå±”œ¤ì4(€€€ÍÑå±”¹¥€ô€‘½Í•…±Õ±…Ñ½ÉXÈÉMÑå±•Ìœì4(€€€ÍÑå±”¹Ñ•áÑ½¹Ñ•¹Ð€ô€¹‘½Í”µ…±Õ±…Ñ½ÈµÁÉ½É•ÍÍí‘¥ÍÁ±…äéÉ¥íÉ¥µÑ•µÁ±…Ñ”µ½±Õµ¹ÌéÉ•Á•…Ð Ì±µ¥¹µ…à À°Å™È¤¤í…ÀèÙÁàíµ…É¥¸èÀ€À€ÄÉÁáô¹‘½Í”µ…±Õ±…Ñ½ÈµÁÉ½É•ÍÌÍÁ…¹íÁ…‘‘¥¹œèÕÁà€ÝÁàí‰½É‘•ÈèÅÁàÍ½±¥€å”É”Äí‰½É‘•ÈµÉ…‘¥ÕÌèääåÁàí‰…­É½Õ¹è˜á™…˜äí½±½ÈèŒØØÜÀàÔí™½¹ÐµÍ¥é”è¸ØÕÉ•´í™½¹ÐµÝ•¥¡ÐèàÀÀíÑ•áÐµ…±¥¸é•¹Ñ•Éô¹‘½Í”µ…±Õ±…Ñ½ÈµÁÉ½É•ÍÌÍÁ…¸¹¥Ìµ‘½¹•í‰½É‘•Èµ½±½ÈéÉ‰„ ÄÌ°äÔ°ää°¸ÈÐ¤í‰…­É½Õ¹éÉ‰„ ÄÌ°äÔ°ää°¸Àà¤í½±½ÈèŒÁÕ˜ØÍô¹‘½Í”µ…±Õ±…Ñ½ÈµÝ•¥¡Ðµ¡¥ÁÍí‘¥ÍÁ±…äé™±•àí…ÀèÙÁàí™±•àµÝÉ…ÀéÝÉ…Àíµ…É¥¸µÑ½ÀèÙÁáô¹‘½Í”µ…±Õ±…Ñ½ÈµÝ•¥¡Ðµ¡¥ÁÍm¡¥‘‘•¹t°¹‘½Í”µ…±Õ±…Ñ½ÈµÉ•ÍÕ±Ðµ…Ñ¥½¹Ím¡¥‘‘•¹t°¹‘½Í”µ…±Õ±…Ñ½Èµ™½É´±…‰•±m¡¥‘‘•¹uí‘¥ÍÁ±…äé¹½¹”…¥µÁ½ÉÑ…¹Ñô¹‘½Í”µ…±Õ±…Ñ½ÈµÝ•¥¡Ðµ¡¥ÁÌ‰ÕÑÑ½¸°¹‘½Í”µ…±Õ±…Ñ½ÈµÉ•ÍÕ±Ðµ…Ñ¥½¹Ì‰ÕÑÑ½¹íµ¥¸µ¡•¥¡ÐèÌáÁàí‰½É‘•ÈèÅÁàÍ½±¥€ŒåÝÔí‰½É‘•ÈµÉ…‘¥ÕÌèåÁàí‰…­É½Õ¹è™™˜í½±½ÈèŒÌÐÐÀÔÐí™½¹Ðé¥¹¡•É¥Ðí™½¹ÐµÍ¥é”è¸ÜÙÉ•´í™½¹ÐµÝ•¥¡ÐèàÀÀíÕÉÍ½ÈéÁ½¥¹Ñ•Éô¹‘½Í”µ…±Õ±…Ñ½ÈµÝ•¥¡Ðµ¡¥ÁÌ‰ÕÑÑ½¹íÁ…‘‘¥¹œèÕÁà€åÁáô¹‘½Í”µ…±Õ±…Ñ½ÈµÉ•ÍÕ±Ðµ…Ñ¥½¹Íí‘¥ÍÁ±…äéÉ¥íÉ¥µÑ•µÁ±…Ñ”µ½±Õµ¹ÌèÄ¸ÌÕ™È€Å™Èí…ÀèáÁàíµ…É¥¸µÑ½ÀèÄÉÁáô¹‘½Í”µ…±Õ±…Ñ½ÈµÉ•ÍÕ±Ðµ…Ñ¥½¹Ì‰ÕÑÑ½¸é™¥ÉÍÐµ¡¥±‘í‰½É‘•Èµ½±½ÈèŒÁÕ˜ØÌí‰…­É½Õ¹èŒÁÕ˜ØÌí½±½Èè™™™ô¹‘½Í”µ…±Õ±…Ñ½Èµ…ÕÑ¼µ¹½Ñ•íµ…É¥¸èÄÁÁà€À€Àí½±½ÈèŒØØÜÀàÔí™½¹ÐµÍ¥é”è¸ÝÉ•´íÑ•áÐµ…±¥¸é•¹Ñ•Éô¹‘½Í”µ…±Õ±…Ñ½Èµ‘•Ñ…¥°µÉ½Ü…í½Ù•É™±½ÜµÝÉ…Àé…¹åÝ¡•É•ô¹¡…ÌµÁ•‘¥…ÑÉ¥Œµ½¹±äµ‘½Í”µ…±Õ±…Ñ½ÈùÑ‘í½±½ÈèˆÐÈÌÄáô¹¡…ÌµÁ…É•¹Ñ•É…°µ‘½Í”µ…±Õ±…Ñ½ÈùÑ‘í‰…­É½Õ¹éÉ‰„ Ø°ÄÄà°ÜÄ°¸ÀÜ¥ô¹¡…ÌµÁ•‘¥…ÑÉ¥Œµ½¹±äµ‘½Í”µ…±Õ±…Ñ½È¹¡…ÌµÁ…É•¹Ñ•É…°µ‘½Í”µ…±Õ±…Ñ½ÈùÑ‘í½±½ÈèˆÐÈÌÄáô¹‘½Í”µ…±Õ±…Ñ½Èµ‘¥…±½œ€¹‘½Í”µ…±Õ±…Ñ½Èµ™½ÉµíÉ¥µÑ•µÁ±…Ñ”µ½±Õµ¹ÌéÉ•Á•…Ð È±µ¥¹µ…à À°Å™È¤¥ô¹‘½Í”µ…±Õ±…Ñ½Èµ‘¥…±½œ€¹‘½Í”µ…±Õ±…Ñ½Èµ™½É´±…‰•°é™¥ÉÍÐµ¡¥±‘íÉ¥µ½±Õµ¸èÄ¼´Åõµ•‘¥„¡µ…àµÝ¥‘Ñ èÜØÁÁà¥ì¹‘½Í”µ…±Õ±…Ñ½Èµ‘¥…±½œ€¹‘½Í”µ…±Õ±…Ñ½Èµ™½ÉµíÉ¥µÑ•µÁ±…Ñ”µ½±Õµ¹ÌèÅ™Éô¹‘½Í”µ…±Õ±…Ñ½ÈµÉ•ÍÕ±Ðµ…Ñ¥½¹ÍíÉ¥µÑ•µÁ±…Ñ”µ½±Õµ¹ÌèÅ™Éõõm‘…Ñ„µÑ¡•µ”ô‰‘…É¬‰t€¹‘½Í”µ…±Õ±…Ñ½ÈµÁÉ½É•ÍÌÍÁ…¹í‰½É‘•Èµ½±½ÈéÉ‰„ ÈÔÔ°ÈÔÔ°ÈÔÔ°¸ÄÌ¤í‰…­É½Õ¹éÉ‰„ ÈÔÔ°ÈÔÔ°ÈÔÔ°¸ÀÐ¤í½±½Èè…•‰‘ŒÁõm‘…Ñ„µÑ¡•µ”ô‰‘…É¬‰t€¹‘½Í”µ…±Õ±…Ñ½ÈµÁÉ½É•ÍÌÍÁ…¸¹¥Ìµ‘½¹•í½±½ÈèŒå‰å‘ˆí‰½É‘•Èµ½±½ÈéÉ‰„ ÄÈà°ÈÄÐ°ÈÄØ°¸ÈÈ¤í‰…­É½Õ¹éÉ‰„ ÄÈà°ÈÄÐ°ÈÄØ°¸Àà¥õm‘…Ñ„µÑ¡•µ”ô‰‘…É¬‰t€¹‘½Í”µ…±Õ±…Ñ½ÈµÝ•¥¡Ðµ¡¥ÁÌ‰ÕÑÑ½¸±m‘…Ñ„µÑ¡•µ”ô‰‘…É¬‰t€¹‘½Í”µ…±Õ±…Ñ½ÈµÉ•ÍÕ±Ðµ…Ñ¥½¹Ì‰ÕÑÑ½¹í‰½É‘•Èµ½±½ÈéÉ‰„ ÈÔÔ°ÈÔÔ°ÈÔÔ°¸ÄØ¤í‰…­É½Õ¹èŒÅ˜ÌÀÌÌí½±½Èè”Ý••••õm‘…Ñ„µÑ¡•µ”ô‰‘…É¬‰t€¹‘½Í”µ…±Õ±…Ñ½ÈµÉ•ÍÕ±Ðµ…Ñ¥½¹Ì‰ÕÑÑ½¸é™¥ÉÍÐµ¡¥±‘í‰…­É½Õ¹èŒÁÕ˜ØÌí½±½Èè™™™õµ•‘¥„¡ÁÉ•™•ÉÌµÉ•‘Õ•µµ½Ñ¥½¸éÉ•‘Õ”¥ì¹‘½Í”µ…±Õ±…Ñ½Èµ‘¥…±½œ€©íÑÉ…¹Í¥Ñ¥½¸é¹½¹”…¥µÁ½ÉÑ…¹ÐíÍÉ½±°µ‰•¡…Ù¥½Èé…ÕÑ¼…¥µÁ½ÉÑ…¹Ñõõ€ì4(€€€‘½Õµ•¹Ð¹¡•…¹…ÁÁ•¹‘¡¥±¡ÍÑå±”¤ì4(€ô4(4(€™Õ¹Ñ¥½¸•¹ÍÕÉ•5½‘…° ¤ì4(€€€¥˜€¡µ½‘…°¤É•ÑÕÉ¸µ½‘…°ì4(€€€•¹ÍÕÉ•MÑå±•Ì ¤ì4(€€€½¹ÍÐÉ½½Ð€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‘¥Øœ¤ì4(€€€É½½Ð¹±…ÍÍ9…µ”€ô€‘½Í”µ…±Õ±…Ñ½Èµµ½‘…°œì4(€€€É½½Ð¹¥€ô€‘½Í•…±Õ±…Ñ½É5½‘…°œì4(€€€É½½Ð¹¡¥‘‘•¸€ôÑÉÕ”ì4(€€€É½½Ð¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ‰…­‘É½Àˆ‘…Ñ„µ‘½Í”µ…±Õ±…Ñ½Èµ±½Í”øð½‘¥ØøñÍ•Ñ¥½¸±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ‘¥…±½œˆÉ½±”ô‰‘¥…±½œˆ…É¥„µµ½‘…°ô‰ÑÉÕ”ˆ…É¥„µ±…‰•±±•‘‰äô‰‘½Í•…±Õ±…Ñ½ÉQ¥Ñ±”ˆøñ¡•…‘•È±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ‘¥…±½œµ¡•…‘•Èˆøñ‘¥ØøñÍÁ…¸±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ•å•‰É½Üˆù5•‘%¹‘•àƒ
Ü-…±­Õ±…Ñ½È‘½é”ð½ÍÁ…¸øñ È¥ô‰‘½Í•…±Õ±…Ñ½ÉQ¥Ñ±”ˆù-…±­Õ±¼ð½ Èøð½‘¥Øøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ±½Í”ˆ‘…Ñ„µ‘½Í”µ…±Õ±…Ñ½Èµ±½Í”…É¥„µ±…‰•°ô‰5‰å±°­…±­Õ±…Ñ½É¥¸ˆû\ð½‰ÕÑÑ½¸øð½¡•…‘•Èøñ‘¥Ø±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½ÈµÁÉ½‘ÕÐˆ‘…Ñ„µ‘½Í”µÁÉ½‘ÕÐµ¹…µ”øð½‘¥Øøñ‘¥Ø±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½ÈµÁÉ½É•ÍÌˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆøñÍÁ…¸‘…Ñ„µ‘½Í”µÁÉ½É•ÍÌµ…”ù5½Í¡„ð½ÍÁ…¸øñÍÁ…¸‘…Ñ„µ‘½Í”µÁÉ½É•ÍÌµÝ•¥¡ÐùA•Í¡„ð½ÍÁ…¸øñÍÁ…¸‘…Ñ„µ‘½Í”µÁÉ½É•ÍÌµÉ•ÍÕ±ÐùI•éÕ±Ñ…Ñ¤ð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ™½É´ˆøñ±…‰•°‘…Ñ„µ‘½Í”µ¥¹‘¥…Ñ¥½¸µÝÉ…ÀøñÍÁ…¸ù%¹‘¥­…¥½¹¤ð½ÍÁ…¸øñÍ•±•Ð‘…Ñ„µ‘½Í”µ¥¹‘¥…Ñ¥½¸øð½Í•±•Ðøð½±…‰•°øñ±…‰•°øñÍÁ…¸ù5½Í¡„ð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ¥¹ÁÕÐµÁ…¥Èˆøñ¥¹ÁÕÐ‘…Ñ„µ‘½Í”µ…”ÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸ôˆÀˆµ…àôˆÄÌÀˆÍÑ•ÀôˆÀ¸Äˆ¥¹ÁÕÑµ½‘”ô‰‘•¥µ…°ˆ…ÕÑ½½µÁ±•Ñ”ô‰½™˜ˆÁ±…•¡½±‘•Èô‰À¹Í ¸€ÜˆøñÍ•±•Ð‘…Ñ„µ‘½Í”µ…”µÕ¹¥Ð…É¥„µ±…‰•°ô‰9«­Í¥„”µ½Í£­Ìˆøñ½ÁÑ¥½¸Ù…±Õ”ô‰å•…ÉÌˆùÙ©•Ðð½½ÁÑ¥½¸øñ½ÁÑ¥½¸Ù…±Õ”ô‰µ½¹Ñ¡ÌˆùµÕ…¨ð½½ÁÑ¥½¸øð½Í•±•Ðøð½ÍÁ…¸øð½±…‰•°øñ±…‰•°‘…Ñ„µ‘½Í”µÝ•¥¡ÐµÝÉ…À¡¥‘‘•¸øñÍÁ…¸ùA•Í¡„ð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ¥¹ÁÕÐµÁ…¥Èˆøñ¥¹ÁÕÐ‘…Ñ„µ‘½Í”µÝ•¥¡ÐÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸ôˆÀ¸Äˆµ…àôˆÔÀÀˆÍÑ•ÀôˆÀ¸Äˆ¥¹ÁÕÑµ½‘”ô‰‘•¥µ…°ˆ…ÕÑ½½µÁ±•Ñ”ô‰½™˜ˆÁ±…•¡½±‘•Èô‰­œˆøñÍÁ…¸±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½ÈµÕ¹¥Ðˆù­œð½ÍÁ…¸øð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½ÈµÝ•¥¡Ðµ¡¥ÁÌˆ‘…Ñ„µ‘½Í”µÝ•¥¡Ðµ¡¥ÁÌ¡¥‘‘•¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÝ•¥¡ÐôˆÔˆøÔð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÝ•¥¡ÐôˆÄÀˆøÄÀð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÝ•¥¡ÐôˆÄÔˆøÄÔð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÝ•¥¡ÐôˆÌÀˆøÌÀð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÝ•¥¡ÐôˆÐÀˆøÐÀð½‰ÕÑÑ½¸øð½ÍÁ…¸øð½±…‰•°øð½‘¥ØøñÀ±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ…ÕÑ¼µ¹½Ñ”ˆùI•éÕ±Ñ…Ñ¤±±½…É¥Ñ•Ð…ÕÑ½µ…Ñ¥­¥Í¡ÐÍ…Á¼Á±½Ó­Í½¡•¸Ó¬‘£­¹…Ð”¹•Ù½©Í¡µ”¸ð½ÀøñÍ•Ñ¥½¸±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½ÈµÉ•ÍÕ±Ðˆ‘…Ñ„µ‘½Í”µÉ•ÍÕ±Ð¡¥‘‘•¸…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆøñ ÌùI•éÕ±Ñ…Ñ¤ð½ ÌøñÀ‘…Ñ„µ‘½Í”µÉ•ÍÕ±ÐµÑ•áÐøð½Àøñ‘•Ñ…¥±ÌøñÍÕµµ…ÉäùM¤Ô±±½…É¥Ðüð½ÍÕµµ…Éäøñ‘¥Ø±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½Èµ‘•Ñ…¥±Ìˆ‘…Ñ„µ‘½Í”µ‘•Ñ…¥±Ìøð½‘¥Øøð½‘•Ñ…¥±Ìøñ‘¥Ø±…ÍÌô‰‘½Í”µ…±Õ±…Ñ½ÈµÉ•ÍÕ±Ðµ…Ñ¥½¹Ìˆ‘…Ñ„µ‘½Í”µ…Ñ¥½¹Ì¡¥‘‘•¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µ‘½Í”µ½Áäù-½Á©¼Õ‘£­é¥µ¥¸ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µ‘½Í”µ¹•ÜµÁ…Ñ¥•¹ÐùA…¥•¹Ð¤É¤ð½‰ÕÑÑ½¸øð½‘¥Øøð½Í•Ñ¥½¸øð½Í•Ñ¥½¸ù€ì4(€€€‘½Õµ•¹Ð¹‰½‘ä¹…ÁÁ•¹‘¡¥±¡É½½Ð¤ì4(€€€µ½‘…°€ôì4(€€€€€É½½Ð°ÁÉ½‘ÕÑ9…µ”éÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µÁÉ½‘ÕÐµ¹…µ•tœ¤°¥¹‘¥…Ñ¥½¹]É…ÀéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µ¥¹‘¥…Ñ¥½¸µÝÉ…Átœ¤°4(€€€€€¥¹‘¥…Ñ¥½¸éÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µ¥¹‘¥…Ñ¥½¹tœ¤°…”éÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µ…•tœ¤°…•U¹¥ÐéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µ…”µÕ¹¥Ñtœ¤°4(€€€€€Ý•¥¡Ñ]É…ÀéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µÝ•¥¡ÐµÝÉ…Átœ¤°Ý•¥¡ÐéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µÝ•¥¡Ñtœ¤°Ý•¥¡Ñ¡¥ÁÌéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µÝ•¥¡Ðµ¡¥ÁÍtœ¤°4(€€€€€É•ÍÕ±ÐéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µÉ•ÍÕ±Ñtœ¤°É•ÍÕ±ÑQ•áÐéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µÉ•ÍÕ±ÐµÑ•áÑtœ¤°‘•Ñ…¥±ÌéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µ‘•Ñ…¥±Ítœ¤°4(€€€€€…Ñ¥½¹ÌéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µ…Ñ¥½¹Ítœ¤°½ÁäéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µ½Áåtœ¤°ÁÉ½É•ÍÍ”éÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µÁÉ½É•ÍÌµ…•tœ¤°4(€€€€€ÁÉ½É•ÍÍ]•¥¡ÐéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µÁÉ½É•ÍÌµÝ•¥¡Ñtœ¤°ÁÉ½É•ÍÍI•ÍÕ±ÐéÉ½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µÁÉ½É•ÍÌµÉ•ÍÕ±Ñtœ¤°4(€€€ôì4(€€€É½½Ð¹ÅÕ•ÉåM•±•Ñ½É±° m‘…Ñ„µ‘½Í”µ…±Õ±…Ñ½Èµ±½Í•tœ¤¹™½É… ¡‰ÕÑÑ½¸€ôø‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ°±½Í•5½‘…°¤¤ì4(€€€µ½‘…°¹¥¹‘¥…Ñ¥½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¡…¹”œ°µ…å‰•…±Õ±…Ñ”¤ì4(€€€µ½‘…°¹…”¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¥¹ÁÕÐœ°µ…å‰•…±Õ±…Ñ”¤ì4(€€€µ½‘…°¹…•U¹¥Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¡…¹”œ°µ…å‰•…±Õ±…Ñ”¤ì4(€€€µ½‘…°¹Ý•¥¡Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¥¹ÁÕÐœ°µ…å‰•…±Õ±…Ñ”¤ì4(€€€µ½‘…°¹Ý•¥¡Ñ¡¥ÁÌ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ°•Ù•¹Ð€ôøì4(€€€€€½¹ÍÐ‰ÕÑÑ½¸€ô•Ù•¹Ð¹Ñ…É•Ð¹±½Í•ÍÐ m‘…Ñ„µÝ•¥¡Ñtœ¤ì4(€€€€€¥˜€ …‰ÕÑÑ½¸¤É•ÑÕÉ¸ì4(€€€€€µ½‘…°¹Ý•¥¡Ð¹Ù…±Õ”€ô‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹Ý•¥¡Ðì4(€€€€€µ…å‰•…±Õ±…Ñ” ¤ì4(€€€ô¤ì4(€€€µ½‘…°¹½Áä¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ°½Áå%¹ÍÑÉÕÑ¥½¸¤ì4(€€€É½½Ð¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ‘½Í”µ¹•ÜµÁ…Ñ¥•¹Ñtœ¤¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ°É•Í•ÑA…Ñ¥•¹Ð¤ì4(€€€É•ÑÕÉ¸µ½‘…°ì4(€ô4(4(€™Õ¹Ñ¥½¸•¹¡…¹” ¤ì4(€€€•¹ÍÕÉ•!•…‘•È ¤ì4(€€€•¹ÍÕÉ•I½ÝÌ ¤ì4(€€€‘½Õµ•¹Ð¹‘½Õµ•¹Ñ±•µ•¹Ð¹‘…Ñ…Í•Ð¹‘½Í•…±Õ±…Ñ½ÉY•ÉÍ¥½¸€ôYIM%=8ì4(€ô4(4(€™Õ¹Ñ¥½¸Í¡•‘Õ±•¹¡…¹” ¤ì4(€€€¥˜€¡•¹¡…¹•EÕ•Õ•¤É•ÑÕÉ¸ì4(€€€•¹¡…¹•EÕ•Õ•€ôÑÉÕ”ì4(€€€É•ÅÕ•ÍÑ¹¥µ…Ñ¥½¹É…µ”  ¤€ôøì4(€€€€€•¹¡…¹•EÕ•Õ•€ô™…±Í”ì4(€€€€€•¹¡…¹” ¤ì4(€€€ô¤ì4(€ô4(4(€™Õ¹Ñ¥½¸½‰Í•ÉÙ” ¤ì4(€€€½¹ÍÐÑ‰½‘ä€ô‘½Õµ•¹Ð¹•Ñ±•µ•¹Ñ	å% Ñ‰½‘äœ¤ì4(€€€¥˜€ …Ñ‰½‘äñð½‰Í•ÉÙ•È¤É•ÑÕÉ¸ì4(€€€½‰Í•ÉÙ•È€ô¹•Ü5ÕÑ…Ñ¥½¹=‰Í•ÉÙ•È¡Í¡•‘Õ±•¹¡…¹”¤ì4(€€€½‰Í•ÉÙ•È¹½‰Í•ÉÙ”¡Ñ‰½‘ä°ì¡¥±‘1¥ÍÐéÑÉÕ”ô¤ì4(€ô4(4(€‘½Õµ•¹Ð¹•Ñ±•µ•¹Ñ	å% Ñ‰½‘äœ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ°•Ù•¹Ð€ôøì4(€€€½¹ÍÐ‰ÕÑÑ½¸€ô•Ù•¹Ð¹Ñ…É•Ð¹±½Í•ÍÐ œ¹‘½Í”µ…±Õ±…Ñ½Èµ½Á•¸œ¤ì4(€€€¥˜€ …‰ÕÑÑ½¸¤É•ÑÕÉ¸ì4(€€€•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì4(€€€•Ù•¹Ð¹ÍÑ½ÁAÉ½Á……Ñ¥½¸ ¤ì4(€€€½Á•¹5½‘…°¡…Ñ…±½œ¹‰åAÉ½‘ÕÑ-•ä¹•Ð¡±•…¸¡‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹‘½Í•AÉ½‘ÕÑ-•ä¤¤ñð¹Õ±°¤ì4(€ô¤ì4(€‘½Õµ•¹Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ­•å‘½Ý¸œ°•Ù•¹Ð€ôøì4(€€€¥˜€¡•Ù•¹Ð¹­•ä€ôôô€Í…Á”œ€˜˜µ½‘…°€˜˜€…µ½‘…°¹É½½Ð¹¡¥‘‘•¸¤±½Í•5½‘…° ¤ì4(€ô¤ì4(4(€•¹ÍÕÉ•5½‘…° ¤ì4(€½‰Í•ÉÙ” ¤ì4(€Í¡•‘Õ±•¹¡…¹” ¤ì4(€Ù½¥±½…‘I•¥ÍÑÉä ¤ì4(€Ù½¥±½…‘…Ñ…±½œ ¤ì4(4(€Ý¥¹‘½Ü¹5•‘%¹‘•á½Í•…±Õ±…Ñ½È€ôì4(€€€Ù•ÉÍ¥½¸éYIM%=8°4(€€€É•™É•Í éÍ¡•‘Õ±•¹¡…¹”°4(€€€½Á•¹	åAÉ½‘ÕÑ-•ä¡ÁÉ½‘ÕÑ-•ä¤ì½Á•¹5½‘…°¡…Ñ…±½œ¹‰åAÉ½‘ÕÑ-•ä¹•Ð¡±•…¸¡ÁÉ½‘ÕÑ-•ä¤¤ñð¹Õ±°¤ìô°4(€€€…Ñ…±½MÑ…ÑÕÌè ¤€ôø…Ñ…±½œ¹ÍÑ…ÑÕÌ°4(€€€}Ñ•ÍÐé=‰©•Ð¹™É••é”¡ì(€€€€€¹Õ´°Ý¥Ñ¡¥¸°…¹½¹¥…±U¹¥Ð°½¹Ù•ÉÑ½Í•U¹¥Ð°…‘µ¥¹¥ÍÑÉ…Ñ¥½¹ÍA•É…ä°…•5…Ñ¡•ÍIÕ±”°ÁÉ•™•ÉÉ•‘U¹¥ÅÕ”°(€€€€€¹••‘Í]•¥¡Ñ5•Ñ¡½°¹••‘Í	Í…5•Ñ¡½°½µÁÕÑ•½Í”°É•¹‘•ÉA±…¥¹1…¹Õ…•Q•µÁ±…Ñ”°(€€€€€™É•ÅÕ•¹åQ•áÐ°‘ÕÉ…Ñ¥½¹Q•áÐ°ÉÕ±•½Ù•ÉÍA•‘¥…ÑÉ¥Œ°ÉÕ±•½Ù•ÉÍ‘Õ±Ð°ÁÉ½‘ÕÑÉ½ÕÀ°(€€€ô¤°(€ôì4)ô¤ ¤ì4