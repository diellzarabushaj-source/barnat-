/* Master v2.7: all clinical calculations remain on the authenticated server. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  /* Albanian writes 4,2 — and Intl cannot be trusted for it, because a browser
     built without the sq locale silently falls back to a decimal point. */
  const round = (value, digits) => {
    const factor = 10 ** digits;
    return String(Math.round(value * factor) / factor).replace('.', ',');
  };
  const exact = value => round(value, 4);
  const fmt = value => round(value, 2);
  const num = value => {
    const text = String(value ?? '').replace(',', '.').trim();
    if (!/^\d+(?:\.\d+)?$/.test(text)) return NaN;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const positive = value => Number.isFinite(value) && value > 0;
  const range = (lo, hi, unit) => `${exact(lo)}${lo === hi ? '' : '–' + exact(hi)} ${unit}`;
  const compact = window.matchMedia('(max-width:760px)');

  /* mg is the currency of every conversion below; the source may state a dose
     in mcg or g, so bring it to mg before touching a product strength. */
  const MASS = { g:1000, mg:1, mcg:0.001 };
  /* Below this a syringe cannot be read honestly, so a strength that lands
     under it is a worse default than one that needs a larger volume. */
  const MEASURABLE_ML = 2.5;
  const PRODUCTS_KEY = 'drx.dozologjia.products.v1';
  const MINE = 'drx-mine';

  /* Reference weight for age, from the CARPA STM / WBM table the antibiotics
     page already uses. It runs one way here: a real weight is on the scale in
     front of the clinician, so it fills the age in rather than the reverse.
     The estimate is marked as derived and is overwritten the moment the
     clinician types an age of their own. */
  const REFERENCE_AGES = [
    { months:0, kg:3.3 }, { months:3, kg:6.2 }, { months:6, kg:7.6 },
    { months:12, kg:9 }, { months:24, kg:12 }, { months:48, kg:16 },
    { months:72, kg:20 }, { months:96, kg:25 }, { months:120, kg:32 },
    { months:144, kg:40 },
  ];
  const HEAVIEST_BAND_KG = 40;
  function ageForWeight(kg) {
    /* Past the table an age cannot be read off a weight at all, and under the
       three-month band it turns on days rather than kilograms — both are the
       clinician's to state. */
    if (!positive(kg) || kg > HEAVIEST_BAND_KG) return null;
    const band = REFERENCE_AGES.reduce((best, entry) => {
      if (!best) return entry;
      const gap = Math.abs(entry.kg - kg), bestGap = Math.abs(best.kg - kg);
      if (gap < bestGap) return entry;
      return gap === bestGap && entry.months < best.months ? entry : best;
    }, null);
    if (!band || band.months < 3) return null;
    return band.months < 12 ? { value:band.months, unit:'month' } : { value:band.months / 12, unit:'year' };
  }

  const state = {
    rows:[],
    drugId:'',
    indicationId:'',
    regimen:null,
    revision:0,
    pending:null,
    result:null,
    productId:'',        // the shelf item the volume is measured from
    editing:false,       // the "my own unit" editor is open
    ageSource:'',        // '' | 'weight' (derived) | 'chosen' (the clinician's)
    patient:{},
    kind:'liquid',       // what that editor is describing
  };

  /* ---------------------------------------------------------------- storage
     A clinician stocks one bottle and one blister. Once they tell us which,
     that is the default for the drug until they say otherwise. */
  function readProducts() {
    try { return JSON.parse(localStorage.getItem(PRODUCTS_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function savedProduct(drugId) {
    const saved = readProducts()[drugId];
    if (!saved || !positive(saved.mg)) return null;
    if (saved.kind === 'solid') return { id:MINE, kind:'solid', form:saved.form || 'tabletë', mg:saved.mg, label:`${fmt(saved.mg)} mg`, mine:true };
    if (!positive(saved.mL)) return null;
    return { id:MINE, kind:'liquid', mg:saved.mg, mL:saved.mL, label:`${fmt(saved.mg)} mg / ${fmt(saved.mL)} mL`, mine:true };
  }
  function saveProduct(drugId, product) {
    if (!drugId || !product) return;
    const all = readProducts();
    all[drugId] = product.kind === 'solid'
      ? { kind:'solid', mg:product.mg, form:product.form }
      : { kind:'liquid', mg:product.mg, mL:product.mL };
    try { localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all)); } catch { /* private window */ }
  }

  /* ------------------------------------------------------------------ shelf
     Templates are what the market usually carries, not a verified label, so
     the clinician's own strength always leads and can always be created. */
  function shelf(regimen) {
    if (!regimen || !regimen.manualMeasurementAllowed) return [];
    const mine = savedProduct(regimen.drugId);
    const templates = regimen.templates || [];
    return mine ? [mine, ...templates] : templates;
  }
  function shelfItem(regimen, id) {
    return shelf(regimen).find(item => item.id === id) || null;
  }
  function mgPerML(item) {
    return item && item.kind === 'liquid' && positive(item.mL) ? item.mg / item.mL : 0;
  }
  /* What a clinician would actually reach for. A dose that lands on whole
     tablets is a tablet; anything else is measured, at the smallest volume a
     syringe can still read; and if every strength lands under that, the
     largest volume is the least bad of them. */
  function preferred(items, mg) {
    if (!items.length) return null;
    if (!positive(mg)) return items[0];
    const whole = items.filter(item => item.kind === 'solid' && positive(item.mg))
      .map(item => ({ item, units:mg / item.mg }))
      .filter(entry => entry.units >= 1 && entry.units <= 4 && Math.abs(entry.units - Math.round(entry.units)) < 1e-9);
    if (whole.length) return whole.reduce((best, entry) => (entry.units < best.units ? entry : best)).item;
    const liquids = items.filter(item => mgPerML(item) > 0).map(item => ({ item, mL:mg / mgPerML(item) }));
    if (!liquids.length) return items[0];
    const measurable = liquids.filter(entry => entry.mL >= MEASURABLE_ML);
    if (measurable.length) return measurable.reduce((best, entry) => (entry.mL < best.mL ? entry : best)).item;
    return liquids.reduce((best, entry) => (entry.mL > best.mL ? entry : best)).item;
  }

  /* ------------------------------------------------------------- invalidate
     Any change to any input retires the answer before a new one is asked for,
     so a stale dose can never sit next to fresh patient values. */
  function invalidate() {
    clearTimeout(timer);
    state.revision += 1;
    state.pending?.abort();
    state.result = null;
    $('masterResult').hidden = true;
    $('masterResult').replaceChildren();
    $('masterProvenance').hidden = true;
    setErrors([]);
  }
  function setErrors(list) {
    const box = $('masterErrors');
    box.replaceChildren();
    list.forEach(text => box.append(el('p', text)));
    box.hidden = !list.length;
  }
  function setPending(text, guide = false) {
    const box = $('masterResult');
    box.replaceChildren();
    box.append(el('p', text, 'dz-waiting'));
    if (guide) {
      const next = el('button', 'Plotëso fushën e radhës', 'dz-none');
      next.type = 'button';
      next.addEventListener('click', focusNextMissing);
      box.append(next);
    }
    box.hidden = false;
  }

  /* ------------------------------------------------------------------ chips */
  function chip(group, value, label, note, checked, onPick) {
    const wrap = el('label', null, 'dz-chip');
    const input = el('input');
    input.type = 'radio';
    input.name = group;
    input.value = value;
    input.checked = checked;
    input.addEventListener('change', () => onPick(value));
    wrap.append(input, el('span', label));
    if (note) wrap.append(el('small', note));
    return wrap;
  }
  function pickerCurrent(id, text) {
    const node = $(id);
    if (node) node.textContent = text || '—';
  }
  function ruleText(rule) {
    if (!rule || !positive(rule.min) || !positive(rule.max)) return '';
    if (!['FIXED_PER_DOSE', 'FIXED_VOLUME', 'WEIGHT_PER_DOSE', 'WEIGHT_DAILY', 'FIXED_DAILY', 'LOCAL_LENGTH'].includes(rule.basis)) return '';
    const period = ['WEIGHT_DAILY', 'FIXED_DAILY'].includes(rule.basis) ? 'në 24 orë' : 'për marrje';
    return `${range(rule.min, rule.max, rule.unitLabel)}${rule.basis.startsWith('WEIGHT_') ? '/kg' : ''} ${period}`;
  }
  function fold(id) {
    const picker = $(id);
    if (picker && compact.matches) picker.open = false;
  }
  /* On a wide screen a picker is a labelled group, not a control: it stays
     open, and its summary only becomes clickable when a phone needs the room. */
  function pinOpen(id) {
    const picker = $(id);
    if (!picker) return;
    picker.addEventListener('toggle', () => {
      if (!compact.matches && !picker.open) picker.open = true;
    });
  }

  /* -------------------------------------------------------------- 1 · drugs */
  function drugs() {
    const seen = new Map();
    state.rows.forEach(row => { if (!seen.has(row.drugId)) seen.set(row.drugId, row.drug); });
    return [...seen].map(([id, name]) => ({ id, name }));
  }
  function renderDrugs() {
    const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const query = normalize($('dosageSearch').value.trim());
    const list = drugs().filter(drug => state.rows.some(row => row.drugId === drug.id && normalize(`${row.drug} ${row.indication}`).includes(query)));
    const box = $('masterDrugs');
    box.replaceChildren();
    if (!list.length) {
      box.append(el('p', 'Nuk u gjet bar ose indikacion.', 'dz-empty'));
      const clear = el('button', 'Shfaq të gjitha barnat', 'dz-none');
      clear.type = 'button';
      clear.addEventListener('click', () => { $('dosageSearch').value = ''; renderDrugs(); $('dosageSearch').focus(); });
      box.append(clear);
      return;
    }
    list.forEach(drug => box.append(chip('dz-drug', drug.id, drug.name, '', drug.id === state.drugId, pickDrug)));
    pickerCurrent('drugCurrent', drugs().find(drug => drug.id === state.drugId)?.name || '');
  }
  function pickDrug(id) {
    state.drugId = id;
    state.indicationId = '';
    state.regimen = null;
    state.productId = '';
    state.editing = false;
    /* A shape chosen for one drug says nothing about the next one. */
    state.kindTouched = false;
    invalidate();
    renderDrugs();
    renderIndications();
    fold('drugPicker');
  }

  /* --------------------------------------------------------- 2 · indication */
  function indications() {
    const seen = new Map();
    state.rows.filter(row => row.drugId === state.drugId)
      .forEach(row => { if (!seen.has(row.indicationId)) seen.set(row.indicationId, row.indication); });
    return [...seen].map(([id, name]) => ({ id, name }));
  }
  function renderIndications() {
    const list = indications();
    $('indicationBlock').hidden = !list.length;
    const box = $('masterIndication');
    box.replaceChildren();
    if (list.length === 1 && !state.indicationId) state.indicationId = list[0].id;
    list.forEach(item => box.append(chip('dz-indication', item.id, item.name, '', item.id === state.indicationId, pickIndication)));
    pickerCurrent('indicationCurrent', list.find(item => item.id === state.indicationId)?.name || '');
    if (list.length === 1) fold('indicationPicker');
    else if (!state.indicationId) $('indicationPicker').open = true;
    renderRegimens();
  }
  function pickIndication(id) {
    state.editing = false;
    state.indicationId = id;
    state.regimen = null;
    state.productId = '';
    invalidate();
    renderIndications();
    fold('indicationPicker');
  }

  /* ------------------------------------------------------------ 3 · regimen */
  function regimens() {
    return state.rows.filter(row => row.drugId === state.drugId && row.indicationId === state.indicationId);
  }
  function renderRegimens() {
    const list = regimens();
    if (list.length === 1 && !state.regimen) state.regimen = list[0];
    if (state.regimen && !list.some(row => row.id === state.regimen.id)) state.regimen = list.length === 1 ? list[0] : null;
    /* One way to give it is not a choice — do not ask a question with one answer. */
    $('regimenBlock').hidden = list.length < 2;
    const box = $('masterRegimens');
    box.replaceChildren();
    list.forEach(row => box.append(chip('dz-regimen', row.id, row.routeLabel, [row.population, ruleText(row.doseRule), row.frequency, row.steps.length ? 'Skemë me hapa' : ''].filter(Boolean).join(' · '), row.id === state.regimen?.id, pickRegimen)));
    if (list.length > 1 && !state.regimen) $('regimenPicker').open = true;
    pickerCurrent('regimenCurrent', state.regimen ? `${state.regimen.routeLabel}${state.regimen.frequency ? ' · ' + state.regimen.frequency : ''}` : '');
    renderPatient();
  }
  function pickRegimen(id) {
    state.editing = false;
    state.regimen = regimens().find(row => row.id === id) || null;
    state.productId = '';
    invalidate();
    renderRegimens();
    fold('regimenPicker');
  }

  /* ------------------------------------------------------------ 4 · patient */
  function fieldRow(labelText, control, hint, forId) {
    const wrap = el('div', null, 'dz-field');
    const label = el('label', labelText, 'dz-label');
    label.htmlFor = forId || control.id;
    wrap.append(label, control);
    if (hint) wrap.append(el('p', hint, 'dz-hint'));
    return wrap;
  }
  function numberInput(id, placeholder, suffix) {
    const shell = el('div', null, 'dz-number');
    const input = el('input');
    input.id = id;
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.placeholder = placeholder;
    shell.append(input);
    if (suffix) shell.append(el('span', suffix));
    return { shell, input };
  }
  function renderPatient() {
    const regimen = state.regimen;
    const form = $('masterForm');
    const fields = $('masterFields');
    const gates = $('masterGates');
    form.hidden = !regimen;
    ['masterWeight', 'masterAge', 'masterAgeUnit'].forEach(id => {
      if ($(id)) state.patient[id] = $(id).value;
    });
    fields.replaceChildren();
    gates.replaceChildren();
    if (!regimen) { setPending(state.indicationId ? 'Zgjidh skemën sipas grupmoshës dhe mënyrës së dhënies.' : 'Zgjidh indikacionin për të vazhduar.'); return; }

    /* Weight leads: it is the number on the scale, and on a child it fills the
       age in too, so the same fact is never typed twice. */
    if (regimen.needs.weight) {
      const weight = numberInput('masterWeight', '18', 'kg');
      weight.shell.classList.add('dz-number-lead');
      weight.input.addEventListener('input', applyAgeFromWeight);
      fields.append(fieldRow('Pesha', weight.shell, 'Pesha aktuale e matur.', weight.input.id));
    }
    if (regimen.needs.age) {
      const age = numberInput('masterAge', '4', '');
      const unit = el('select', null, 'dz-unit');
      unit.id = 'masterAgeUnit';
      unit.setAttribute('aria-label', 'Njësia e moshës');
      [['year', 'vjeç'], ['month', 'muajsh']].forEach(([value, label]) => {
        const option = el('option', label);
        option.value = value;
        unit.append(option);
      });
      /* Touching the age makes it the clinician's, and the weight stops
         writing over it. */
      const own = () => { state.ageSource = 'chosen'; markAgeSource(); };
      age.input.addEventListener('input', own);
      unit.addEventListener('change', own);
      const row = el('div', null, 'dz-row');
      row.append(age.shell, unit);
      const field = fieldRow('Mosha', row, '', age.input.id);
      field.id = 'masterAgeField';
      field.append(el('p', '', 'dz-hint dz-age-note'));
      fields.append(field);
    }
    const priors = [
      ['masterDaily', regimen.needs.daily, 'Sa ka marrë në 24 orët e fundit'],
      ['masterTotal', regimen.needs.total, 'Sa ka marrë në këtë episod'],
    ];
    priors.forEach(([id, needed, label]) => {
      if (!needed) return;
      const given = numberInput(id, '0', regimen.unitLabel);
      /* "Nothing given" is the common answer and still has to be said out loud,
         so it is one tap rather than a silent default. */
      const none = el('button', 'Asgjë', 'dz-none');
      none.type = 'button';
      none.addEventListener('click', () => { given.input.value = '0'; given.input.dispatchEvent(new Event('input', { bubbles:true })); });
      const row = el('div', null, 'dz-row');
      row.append(given.shell, none);
      fields.append(fieldRow(label, row, '', given.input.id));
    });

    if (regimen.steps.length) {
      const box = el('div', null, 'dz-chips dz-chips-tight');
      regimen.steps.forEach(step => box.append(chip('dz-step', step.id, step.label, '', false, () => schedule())));
      fields.append(group('Hapi', box));
    }
    if (regimen.products.length) {
      /* When the source binds exactly one product to the regimen there is
         nothing to choose: take it, so the audited mL conversion is not lost
         to a tap the clinician had no reason to make. */
      const only = regimen.products.length === 1;
      const box = el('div', null, 'dz-chips dz-chips-tight');
      regimen.products.forEach(product => box.append(chip('dz-product', product.id, `${product.form} ${product.strength}`, product.name, only, () => schedule())));
      fields.append(group('Produkti dhe përqendrimi', box));
    }

    const confirmations = [{ id:'masterScope', text:`Pacienti i takon grupit: ${regimen.population}.` },
      ...regimen.gates.map(gate => ({ id:gate.id, text:gate.text }))];
    confirmations.forEach(item => {
      const wrap = el('label', null, 'dz-check');
      const input = el('input');
      input.type = 'checkbox';
      input.id = item.id;
      wrap.append(input, el('span', item.text));
      gates.append(wrap);
    });
    if (regimen.safety) gates.append(el('p', regimen.safety, 'dz-safety'));
    Object.entries(state.patient).forEach(([id, value]) => { if ($(id)) $(id).value = value; });
    applyAgeFromWeight();
    markAgeSource();
    renderAnswer();
  }
  function group(labelText, node) {
    const wrap = el('div', null, 'dz-field dz-field-wide');
    wrap.append(el('p', labelText, 'dz-label'), node);
    return wrap;
  }

  function markAgeSource() {
    const field = $('masterAgeField');
    if (!field) return;
    const derived = state.ageSource === 'weight';
    field.dataset.source = derived ? 'weight' : 'chosen';
    const note = field.querySelector('.dz-age-note');
    if (note) note.textContent = derived ? 'Plotësuar nga pesha — ndryshoje nëse mosha e vërtetë është tjetër.' : '';
  }
  function applyAgeFromWeight() {
    const age = $('masterAge');
    if (!age || state.ageSource === 'chosen') return;
    const derived = ageForWeight(num($('masterWeight')?.value));
    if (!derived) {
      /* Clearing or overshooting the table retires an estimate, never an
         age the clinician typed. */
      if (state.ageSource === 'weight') { age.value = ''; state.ageSource = ''; }
      markAgeSource();
      return;
    }
    age.value = String(derived.value).replace('.', ',');
    $('masterAgeUnit').value = derived.unit;
    state.ageSource = 'weight';
    markAgeSource();
  }

  /* --------------------------------------------------------------- request */
  function checked(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
  }
  function missingBits() {
    const regimen = state.regimen;
    const need = [];
    if (regimen.needs.weight && !positive(num($('masterWeight')?.value))) need.push('peshën');
    if (regimen.needs.age && !positive(num($('masterAge')?.value))) need.push('moshën');
    if (regimen.needs.daily && !(num($('masterDaily')?.value) >= 0)) need.push('sa ka marrë në 24 orët e fundit');
    if (regimen.needs.total && !(num($('masterTotal')?.value) >= 0)) need.push('sa ka marrë këtë episod');
    if (regimen.steps.length && !checked('dz-step')) need.push('hapin');
    if (regimen.needs.product && !checked('dz-product')) need.push('produktin');
    const boxes = [$('masterScope'), ...regimen.gates.map(gate => $(gate.id))].filter(Boolean);
    const open = boxes.filter(box => !box.checked).length;
    if (open) need.push(open === 1 ? 'konfirmimin e mbetur' : `${open} konfirmimet e mbetura`);
    return need;
  }
  function focusNextMissing() {
    const regimen = state.regimen;
    if (!regimen) return;
    let target = ['masterWeight', 'masterAge', 'masterDaily', 'masterTotal'].map($).find(node => node && (['masterDaily','masterTotal'].includes(node.id) ? !(num(node.value) >= 0) : !positive(num(node.value))));
    if (!target && regimen.steps.length && !checked('dz-step')) target = document.querySelector('input[name="dz-step"]');
    if (!target && regimen.needs.product && !checked('dz-product')) target = document.querySelector('input[name="dz-product"]');
    if (!target) target = document.querySelector('#masterGates input:not(:checked)');
    if (target) { target.scrollIntoView({block:'center'}); target.focus({preventScroll:true}); }
  }
  function payload() {
    const regimen = state.regimen;
    const input = { regimenId:regimen.id, drugId:regimen.drugId, indicationId:regimen.indicationId, scope:true, gates:{} };
    if (regimen.needs.weight) input.weight = num($('masterWeight').value);
    if (regimen.needs.age) { input.age = num($('masterAge').value); input.ageUnit = $('masterAgeUnit').value; }
    if (regimen.needs.daily) input.given24h = num($('masterDaily').value);
    if (regimen.needs.total) input.givenTotal = num($('masterTotal').value);
    if (regimen.steps.length) input.stepId = checked('dz-step');
    const product = checked('dz-product');
    if (product) input.productId = product;
    regimen.gates.forEach(gate => { if ($(gate.id)?.checked) input.gates[gate.id] = 'PASS'; });
    return input;
  }
  let timer = null;
  function schedule() {
    invalidate();
    clearTimeout(timer);
    if (!state.regimen) return;
    const need = missingBits();
    if (need.length) { setPending(`Shëno ${need.join(', ')}.`, true); return; }
    setPending('Duke llogaritur…');
    timer = setTimeout(calculate, 180);
  }
  async function calculate() {
    const token = state.revision;
    const controller = new AbortController();
    state.pending = controller;
    let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
    try {
      const response = await fetch('/api/dosage?view=master-calculate', {
        method:'POST', credentials:'same-origin', cache:'no-store',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(payload()), signal:controller.signal,
      });
      const result = await response.json();
      if (token !== state.revision) return;
      if (!response.ok || result.outcome === 'BLOCKED') {
        $('masterResult').hidden = true;
        setErrors(result.errors || [result.error || 'Llogaritja dështoi.']);
        return;
      }
      state.result = result;
      renderAnswer();
    } catch (error) {
      if (token === state.revision && (timedOut || error.name !== 'AbortError')) {
        $('masterResult').hidden = true;
        setErrors(['Llogaritja nuk u krye. Kontrollo lidhjen dhe provo përsëri.']);
        const retry = el('button', 'Provo përsëri', 'dz-copy');
        retry.type = 'button';
        retry.addEventListener('click', schedule);
        $('masterErrors').append(retry);
      }
    } finally {
      clearTimeout(deadline);
      if (state.pending === controller) state.pending = null;
    }
  }

  /* ---------------------------------------------------------------- answer */
  function doseMg(dose) {
    if (!dose || !MASS[dose.unit]) return null;
    return { min:dose.min * MASS[dose.unit], max:dose.max * MASS[dose.unit] };
  }
  function renderAnswer() {
    const result = state.result;
    const box = $('masterResult');
    if (!result) { if (state.regimen) schedulePlaceholder(); return; }
    box.replaceChildren();
    box.hidden = false;

    const head = el('div', null, 'dz-answer-head');
    head.append(el('h2', `${result.drug} · ${result.routeLabel}`), el('p', `${result.indication} · ${result.population}`));
    box.append(head);

    const perDay = result.dose?.period === 'day';
    box.append(el('p', result.dose ? range(result.dose.min, result.dose.max, result.dose.unitLabel) : (result.instruction || 'Sipas përgjigjes klinike'), 'dz-dose'));
    box.append(el('p', result.dose ? (perDay ? 'në 24 orë, e pandarë' : 'për një marrje') : 'udhëzim, jo dozë numerike', 'dz-dose-note'));

    const rhythm = [result.frequencyNote, result.durationNote].filter(Boolean).join(' · ');
    if (rhythm) box.append(el('p', rhythm, 'dz-rhythm'));
    if (!result.durationNote) box.append(el('p', 'Kohëzgjatja nuk është përcaktuar në këtë skemë; verifiko burimin.', 'dz-hint'));
    if (perDay) box.append(el('p', 'Ky është totali për 24 orë. Mos e jep si dozë të vetme; ndarja kërkon skemën e burimit.', 'dz-safety'));
    if (result.dose && result.dose.min !== result.dose.max) box.append(el('p', 'Interval doze: zgjedhja e vlerës kërkon vlerësim klinik.', 'dz-hint'));
    if (result.calculation && result.dose?.raw) {
      const calc = result.calculation;
      const fold = el('details', null, 'dz-fold');
      fold.append(el('summary', 'Si u llogarit doza'));
      const body = el('div', null, 'dz-fold-body');
      const rule = ruleText({...calc, unitLabel:result.dose.unitLabel});
      body.append(el('p', `Rregulli i skemës: ${rule}.`));
      if (calc.weight !== null) body.append(el('p', `${range(calc.min, calc.max, result.dose.unitLabel)}/kg × ${exact(calc.weight)} kg = ${range(result.dose.raw.min, result.dose.raw.max, result.dose.unitLabel)}.`));
      if (result.dose.raw.max !== result.dose.max || result.dose.raw.min !== result.dose.min) body.append(el('p', `Pas zbatimit të kufijve: ${range(result.dose.min, result.dose.max, result.dose.unitLabel)}.`));
      body.append(el('p', result.dose.period === 'day' ? 'Rezultati është total ditor.' : 'Rezultati është për një marrje.'));
      fold.append(body); box.append(fold);
    }
    if (result.step) {
      const parts = [result.step.label];
      if (result.step.startDay) parts.push(`ditët ${result.step.startDay}–${result.step.endDay}`);
      if (result.step.note) parts.push(result.step.note);
      box.append(el('p', parts.join(' · '), 'dz-rhythm'));
    }

    /* The Master's own conversion is source-audited; it is shown as the answer,
       not as something the clinician assembled. */
    if (result.conversion) {
      const sourced = el('div', null, 'dz-measure dz-measure-sourced');
      sourced.append(el('p', 'Sasia për të matur', 'dz-label'),
        el('p', range(result.conversion.min, result.conversion.max, result.conversion.unitLabel), 'dz-volume'),
        el('p', `${result.product?.form || ''} ${result.conversion.strength} — produkt i lidhur në Master`.trim(), 'dz-hint'),
        el('p', result.conversion.product, 'dz-hint dz-hint-quiet'));
      box.append(sourced);
    } else {
      renderShelf(box, result);
    }

    if (result.preparation) {
      const prep = el('details', null, 'dz-fold');
      prep.append(el('summary', 'Përgatitja'));
      const body = el('div', null, 'dz-fold-body');
      body.append(el('p', result.preparation.instruction));
      if (result.preparation.timeMin) body.append(el('p', `Jepet për ${result.preparation.timeMin}–${result.preparation.timeMax} ${result.preparation.timeUnit}.`));
      if (result.preparation.minimumMinutesAtMaxDose) body.append(el('p', `Në dozën maksimale duhen së paku ${Math.ceil(result.preparation.minimumMinutesAtMaxDose)} minuta.`));
      if (result.preparation.notes) body.append(el('p', result.preparation.notes));
      prep.append(body);
      box.append(prep);
    }

    const copy = el('button', 'Kopjo përmbledhjen', 'dz-copy');
    copy.type = 'button';
    copy.id = 'masterCopy';
    copy.disabled = state.editing;
    if (state.editing) copy.textContent = 'Ruaj përqendrimin para kopjimit';
    copy.addEventListener('click', () => copyLine(copy));
    box.append(copy);

    const limits = [...result.maxima.map(max => `Kufiri: ${max.sq}`), ...result.notices, result.safety].filter(Boolean);
    if (limits.length) {
      const fold = el('details', null, 'dz-fold');
      fold.open = true;
      fold.append(el('summary', 'Kufijtë dhe kushtet'));
      const body = el('div', null, 'dz-fold-body');
      limits.forEach(text => body.append(el('p', text)));
      fold.append(body);
      box.append(fold);
    }
    renderSources(result);
  }
  function schedulePlaceholder() {
    const need = missingBits();
    setPending(need.length ? `Shëno ${need.join(', ')}.` : 'Duke llogaritur…', need.length > 0);
  }

  /* -------------------------------------------------- formulation calculator
     Master gives mg. Turning mg into something a spoon or a blister can carry
     needs a real product, and outside the bound formulations that product is
     the clinician's, so it is theirs to pick, theirs to create, and labelled
     as theirs rather than as a source. */
  function renderShelf(box, result) {
    const mg = doseMg(result.dose);
    const regimen = state.regimen;
    if (!mg || !regimen || result.dose.period === 'day') return;
    if (!regimen.manualMeasurementAllowed) {
      box.append(el('p', 'Sasia për të matur kërkon produktin dhe përgatitjen e verifikuar për këtë mënyrë dhënieje.', 'dz-safety'));
      return;
    }

    const items = shelf(regimen);
    if (state.productId && !items.some(item => item.id === state.productId)) state.productId = '';
    /* A unit the clinician saved is their answer already: never talk them out
       of it with a template that happens to measure smaller. */
    if (!state.productId && items.length) state.productId = (items.find(item => item.mine) || preferred(items, mg.max) || items[0]).id;
    const chosen = shelfItem(regimen, state.productId);

    const wrap = el('div', null, 'dz-measure');
    wrap.append(el('p', 'Sasia për të matur', 'dz-label'));

    const chips = el('div', null, 'dz-chips dz-chips-tight');
    items.forEach(item => chips.append(chip('dz-shelf', item.id, item.label,
      item.mine ? 'e imja' : (item.kind === 'solid' ? item.form : 'sirup'),
      item.id === state.productId && !state.editing,
      id => { state.productId = id; state.editing = false; renderAnswer(); })));
    const own = el('button', items.some(item => item.mine) ? 'Ndrysho njësinë time' : 'Njësia ime…', 'dz-chip dz-chip-ghost');
    own.type = 'button';
    own.addEventListener('click', () => { state.editing = !state.editing; renderAnswer(); });
    chips.append(own);
    wrap.append(chips);

    if (state.editing) wrap.append(editor(regimen));
    else if (chosen) wrap.append(...measured(chosen, mg));

    if (regimen.caution) wrap.append(el('p', regimen.caution, 'dz-hint dz-hint-warn'));
    if (!state.editing && chosen && !chosen.mine) wrap.append(el('p', 'Fuqi tipike e tregut, pa etiketë të verifikuar — kontrollo shishen ose kutinë.', 'dz-hint'));
    box.append(wrap);
  }
  function measured(item, mg) {
    if (item.kind === 'solid') {
      const lo = mg.min / item.mg, hi = mg.max / item.mg;
      const rounds = value => Math.abs(value * 2 - Math.round(value * 2)) < 1e-6;
      const nodes = [el('p', `${fmt(lo)}${lo === hi ? '' : '–' + fmt(hi)} ${item.form}`, 'dz-volume'),
        el('p', `nga ${item.label} për ${item.form}`, 'dz-hint')];
      if (!rounds(lo) || !rounds(hi)) nodes.push(el('p', 'Nuk del në gjysma të plota — zgjidh fuqi tjetër ose përdor formë të lëngshme.', 'dz-hint dz-hint-warn'));
      return nodes;
    }
    const perML = mgPerML(item);
    if (!perML) return [el('p', 'Shëno sa mg ka dhe në sa mL.', 'dz-hint')];
    const lo = mg.min / perML, hi = mg.max / perML;
    const nodes = [el('p', `${fmt(lo)}${lo === hi ? '' : '–' + fmt(hi)} mL`, 'dz-volume'),
      el('p', `nga ${item.label}`, 'dz-hint'),
      el('p', `${range(mg.min, mg.max, 'mg')} ÷ ${exact(perML)} mg/mL = ${fmt(lo)}${lo === hi ? '' : '–' + fmt(hi)} mL për marrje.`, 'dz-hint')];
    if (hi < MEASURABLE_ML) nodes.push(el('p', 'Vëllim shumë i vogël për t’u matur saktë — merr fuqi më të ulët.', 'dz-hint dz-hint-warn'));
    return nodes;
  }
  function editor(regimen) {
    /* Open on whatever is already selected, so changing a strength is an edit
       and not a retyping exercise. */
    const seed = savedProduct(regimen.drugId) || shelfItem(regimen, state.productId);
    const wrap = el('div', null, 'dz-editor');
    if (!state.kindTouched) state.kind = seed?.kind || 'liquid';
    const saved = seed;

    const kinds = el('div', null, 'dz-segments');
    [['liquid', 'Sirup / solucion oral'], ['solid', 'Tabletë / kapsulë']].forEach(([value, label]) => {
      kinds.append(chip('dz-kind', value, label, '', state.kind === value,
        picked => { state.kind = picked; state.kindTouched = true; renderAnswer(); }));
    });
    wrap.append(kinds);

    const line = el('div', null, 'dz-editor-line');
    const mg = numberInput('mineMg', '125', 'mg');
    mg.input.setAttribute('aria-label', 'Sasia e barit në mg sipas etiketës');
    if (saved && saved.kind === state.kind) mg.input.value = String(saved.mg).replace('.', ',');
    line.append(mg.shell);
    let mL = null;
    if (state.kind === 'liquid') {
      line.append(el('span', 'në', 'dz-editor-sep'));
      mL = numberInput('mineMl', '5', 'mL');
      mL.input.setAttribute('aria-label', 'Vëllimi në mL sipas etiketës');
      if (saved && saved.kind === 'liquid') mL.input.value = String(saved.mL).replace('.', ',');
      line.append(mL.shell);
    }
    wrap.append(line);

    const save = el('button', 'Ruaj për këtë bar', 'dz-save');
    save.type = 'button';
    const feedback = el('p', '', 'dz-hint dz-hint-warn');
    feedback.setAttribute('role', 'alert');
    save.addEventListener('click', () => {
      const value = num(mg.input.value);
      const volume = mL ? num(mL.input.value) : 1;
      if (!positive(value) || !positive(volume)) {
        feedback.textContent = 'Shëno vlera më të mëdha se zero, saktësisht si në etiketë.';
        (!positive(value) ? mg.input : mL.input).focus(); return;
      }
      saveProduct(regimen.drugId, state.kind === 'solid'
        ? { kind:'solid', mg:value, form:'tabletë' }
        : { kind:'liquid', mg:value, mL:volume });
      state.editing = false;
      state.productId = MINE;
      renderAnswer();
    });
    wrap.append(save, feedback);
    wrap.append(el('p', 'Ruhet vetëm në këtë pajisje dhe vlen si njësia jote për këtë bar.', 'dz-hint'));
    return wrap;
  }

  /* ------------------------------------------------------------------- copy */
  function copyLine(button) {
    const result = state.result;
    if (!result || state.editing) return;
    const parts = [`${result.drug} ${result.dose ? range(result.dose.min, result.dose.max, result.dose.unitLabel) : ''}`.trim()];
    if (result.dose) parts.push(result.dose.period === 'day' ? 'gjithsej në 24 orë, jo për një marrje' : 'për një marrje');
    if (result.instruction) parts.push(result.instruction);
    parts.push(`Indikacioni: ${result.indication}`, result.routeText);
    if (result.frequencyNote) parts.push(result.frequencyNote);
    if (result.step) parts.push(`Hapi: ${result.step.label}`, result.step.startDay ? `Ditët ${result.step.startDay}–${result.step.endDay}` : '', result.step.note);
    let line = parts.filter(Boolean).join(', ');
    if (result.durationNote) line += ` — ${result.durationNote}`;
    line += '.';
    const mg = doseMg(result.dose);
    const chosen = shelfItem(state.regimen, state.productId);
    if (result.conversion) line += ` Sasia: ${range(result.conversion.min, result.conversion.max, result.conversion.unitLabel)} nga ${result.conversion.product} ${result.conversion.strength}.`;
    else if (mg && chosen && result.dose.period !== 'day') {
      if (chosen.kind === 'solid') line += ` Sasia: ${fmt(mg.min / chosen.mg)}${mg.min === mg.max ? '' : '–' + fmt(mg.max / chosen.mg)} ${chosen.form} nga ${chosen.label}.`;
      else if (mgPerML(chosen)) line += ` Sasia: ${fmt(mg.min / mgPerML(chosen))}${mg.min === mg.max ? '' : '–' + fmt(mg.max / mgPerML(chosen))} mL nga ${chosen.label}.`;
      line += ' Produkt i zgjedhur manualisht; verifiko etiketën dhe matshmërinë e sasisë.';
    }
    if (result.dose && result.dose.min !== result.dose.max) line += ' Interval doze: vlera përfundimtare kërkon vlerësim klinik.';
    if (!result.durationNote) line += ' Kohëzgjatja nuk është përcaktuar në këtë skemë.';
    if (result.preparation?.instruction) line += ` Përgatitja: ${result.preparation.instruction}.`;
    const cautions = [...result.maxima.map(item => `Kufiri: ${item.sq}`), ...result.notices, result.safety].filter(Boolean);
    if (cautions.length) line += `\n${cautions.join('\n')}`;
    if (!navigator.clipboard?.writeText) { button.textContent = 'Kopjimi nuk mbështetet'; return; }
    navigator.clipboard.writeText(line).then(() => {
      button.textContent = 'U kopjua';
      setTimeout(() => { button.textContent = 'Kopjo përmbledhjen'; }, 1600);
    }).catch(() => { button.textContent = 'S’u kopjua'; });
  }

  /* ---------------------------------------------------------------- sources */
  function renderSources(result) {
    const fold = $('masterProvenance');
    const body = $('masterProvenanceBody');
    body.replaceChildren();
    result.sources.forEach(source => {
      const line = el('p', `${source.Authority || source.Source_ID} — ${source.Title || source.Scope || ''}`.trim());
      const url = Object.values(source).find(value => typeof value === 'string' && /^https:\/\//.test(value));
      if (url) {
        const link = el('a', 'Hap burimin');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        line.append(' ', link);
      }
      body.append(line);
    });
    $('masterSourceCount').textContent = result.sources.length === 1 ? '1 burim' : `${result.sources.length} burime`;
    fold.hidden = !result.sources.length;
  }

  /* ------------------------------------------------------------------- boot */
  async function boot() {
    $('masterStatus').textContent = 'Duke ngarkuar skemat…';
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 12000);
    try {
      await window.DRxDosageShell.ensureAuth();
      const response = await fetch('/api/dosage?view=master-catalog', { credentials:'same-origin', cache:'no-store', signal:controller.signal });
      if (!response.ok) throw new Error('Master-i nuk mund të ngarkohet.');
      const data = await response.json();
      state.rows = data.regimens;
      $('masterStatus').textContent = `${drugs().length} barna · ${state.rows.length} skema · Master v2.7`;
      renderDrugs();
    } catch (error) {
      $('masterStatus').textContent = 'Skemat nuk u ngarkuan. Kontrollo lidhjen ose sesionin.';
      const retry = el('button', 'Ringarko skemat', 'dz-none');
      retry.type = 'button';
      retry.addEventListener('click', () => { void boot(); });
      $('masterStatus').append(' ', retry);
    } finally {
      clearTimeout(deadline);
    }
  }

  ['drugPicker', 'indicationPicker', 'regimenPicker'].forEach(pinOpen);
  compact.addEventListener('change', () => {
    if (!compact.matches) ['drugPicker', 'indicationPicker', 'regimenPicker'].forEach(id => { $(id).open = true; });
  });
  $('masterReset').addEventListener('click', () => {
    state.editing = false;
    ['masterWeight', 'masterAge', 'masterDaily', 'masterTotal'].forEach(id => { if ($(id)) $(id).value = ''; });
    state.patient = {};
    state.ageSource = '';
    invalidate();
    renderPatient();
    $('masterWeight')?.focus();
  });
  $('dosageSearch').addEventListener('input', renderDrugs);
  $('masterForm').addEventListener('submit', event => event.preventDefault());
  $('masterForm').addEventListener('input', schedule);
  $('masterForm').addEventListener('change', schedule);
  void boot();
})();

/* Pediatric common-drug source table. Display text comes from the supplied
   reference file; calculator output is arithmetic over those source formulas. */
(() => {
  'use strict';

  const DATA_URL = '/api/dosage?view=pediatric-common-reference';
  const STATIC_FALLBACK_URL = '/data/pediatric-common-drugs-reference.json';
  const STATIC_AGE_DEFAULTS_URL = '/data/pediatric-weight-age-defaults.json';
  const byId = id => document.getElementById(id);
  const node = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text != null) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  const numeric = value => {
    const parsed = Number(String(value ?? '').replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const positiveNumber = value => Number.isFinite(value) && value > 0;
  const calcFmt = value => {
    const rounded = Math.round(value * 10000) / 10000;
    if (Number.isInteger(rounded) && Math.abs(rounded) >= 10000) {
      return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    return String(rounded).replace('.', ',');
  };
  const doseRange = (lo, hi, unit) => `${calcFmt(lo)}${lo === hi ? '' : '–' + calcFmt(hi)} ${unit}`;
  const searchText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let commonSections = [];
  let weightAgeDefaults = null;
  const weightAgeCore = window.DRxPediatricWeightAge || null;

  function inBand(value, band, minKey, maxKey) {
    const min = band[minKey], max = band[maxKey];
    if (Number.isFinite(min) && (band.minInclusive === false ? value <= min : value < min)) return false;
    if (Number.isFinite(max) && (band.maxInclusive === false ? value >= max : value > max)) return false;
    return true;
  }
  function ageMonths(ageValue, ageUnit) {
    const value = numeric(ageValue);
    if (!positiveNumber(value)) return NaN;
    return ageUnit === 'month' ? value : value * 12;
  }
  const needsWeight = option => ['weight', 'ageWeight', 'oseltamivirBands'].includes(option?.mode);
  const needsAge = option => ['ageBands', 'ageWeight', 'ageFixed', 'oseltamivirBands'].includes(option?.mode);
  const needsPatientWeight = option => needsWeight(option) || needsAge(option);

  function resolvedAgeInfo(values) {
    if (values.ageManual) {
      const months = ageMonths(values.age, values.ageUnit);
      if (positiveNumber(months)) {
        return {
          minMonths:months,
          maxMonths:months,
          defaultMonths:months,
          label:weightAgeCore?.rangeLabel ? weightAgeCore.rangeLabel(months, months) : `≈${calcFmt(months)} muaj`,
          kind:'manual',
          manual:true,
          ambiguous:false,
        };
      }
    }
    if (!weightAgeCore || !weightAgeDefaults) return null;
    const inferred = weightAgeCore.infer(values.weight, weightAgeDefaults);
    return inferred ? { ...inferred, manual:false } : null;
  }

  function safeAgeBand(ageInfo, bands) {
    if (!ageInfo || !Array.isArray(bands)) return null;
    if (ageInfo.manual || (Number.isFinite(ageInfo.maxMonths) && Math.abs(ageInfo.maxMonths - ageInfo.minMonths) < 0.001)) {
      return bands.find(item => inBand(ageInfo.defaultMonths, item, 'minMonths', 'maxMonths')) || null;
    }
    if (!weightAgeCore?.ageRangeFitsBand) return null;
    const candidates = bands.filter(item => weightAgeCore.ageRangeFitsBand(ageInfo, item, 'minMonths', 'maxMonths'));
    return candidates.length === 1 ? candidates[0] : null;
  }

  function ageInfoFitsOption(ageInfo, option) {
    if (!ageInfo || !option) return false;
    if (ageInfo.manual || (Number.isFinite(ageInfo.maxMonths) && Math.abs(ageInfo.maxMonths - ageInfo.minMonths) < 0.001)) {
      return inBand(ageInfo.defaultMonths, option, 'minMonths', 'maxMonths');
    }
    return Boolean(weightAgeCore?.ageRangeFitsBand?.(ageInfo, option, 'minMonths', 'maxMonths'));
  }

  function ageConfirmation(ageInfo) {
    return {
      error:ageInfo?.label
        ? `Pesha sugjeron moshën ${ageInfo.label}. Për këtë bar mosha e saktë mund ta ndryshojë dozën.`
        : 'Pesha nuk mjafton për ta përcaktuar moshën për këtë dozë.',
      needsAgeConfirmation:true,
    };
  }

  function doseResult({ min, max, unit, period = 'dose', frequency = '', source = '', split = null, note = '' }) {
    const result = {
      primary:doseRange(min, max, unit),
      note,
      source,
      doseMin:min,
      doseMax:max,
      doseUnit:unit,
      dosePeriod:period,
      frequency,
    };
    if (period === 'dose') {
      result.perDoseMin = min;
      result.perDoseMax = max;
    } else if (period === 'day' && Number.isFinite(split) && split > 0) {
      result.perDoseMin = min / split;
      result.perDoseMax = max / split;
      if (split > 1) {
        result.secondary = `Aritmetikisht / ${split} marrje: ${doseRange(result.perDoseMin, result.perDoseMax, unit)} për marrje`;
      }
    }
    return result;
  }

  function calculateOption(option, values) {
    if (!option) return { error:'Zgjidh formulën.' };
    if (option.mode === 'fixed') {
      return doseResult({
        min:option.min, max:option.max, unit:option.unit, period:'dose',
        frequency:option.frequency || '', source:option.label, note:option.frequency || '',
      });
    }

    const weight = needsPatientWeight(option) ? numeric(values.weight) : NaN;
    const ageInfo = needsAge(option) ? resolvedAgeInfo(values) : null;

    if (needsPatientWeight(option) && !positiveNumber(weight)) {
      return { error:'Shëno vetëm peshën reale në kg. Mosha do të sugjerohet automatikisht.' };
    }

    if (option.mode === 'ageBands') {
      if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return ageConfirmation(ageInfo);
      const band = safeAgeBand(ageInfo, option.bands);
      if (!band) {
        if (ageInfo.manual) return { error:'Tabela nuk përcakton dozë për këtë moshë.' };
        return ageConfirmation(ageInfo);
      }
      return doseResult({
        min:band.min, max:band.max, unit:band.unit, period:'dose',
        frequency:band.frequency || '', source:band.source, note:band.frequency || '',
      });
    }

    if (option.mode === 'ageFixed') {
      if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return ageConfirmation(ageInfo);
      if (!ageInfoFitsOption(ageInfo, option)) {
        if (ageInfo.manual) return { error:'Kjo formulë nuk i përket kësaj moshe.' };
        return ageConfirmation(ageInfo);
      }
      return doseResult({
        min:option.min, max:option.max, unit:option.unit, period:'dose',
        frequency:option.frequency || '', source:option.label, note:option.frequency || '',
      });
    }

    if (option.mode === 'ageWeight') {
      if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return ageConfirmation(ageInfo);
      if (!ageInfoFitsOption(ageInfo, option)) {
        if (ageInfo.manual) return { error:'Kjo formulë nuk i përket kësaj moshe.' };
        return ageConfirmation(ageInfo);
      }
      const min = option.min * weight;
      const max = option.max * weight;
      return doseResult({
        min, max, unit:option.unit, period:option.period || 'day', split:option.split,
        frequency:option.frequency || '', source:option.label,
        note:[option.period === 'day' ? 'në 24 orë' : '', option.frequency].filter(Boolean).join(' · '),
      });
    }

    if (option.mode === 'oseltamivirBands') {
      if (!ageInfo || !Number.isFinite(ageInfo.defaultMonths)) return ageConfirmation(ageInfo);
      const ageBand = safeAgeBand(ageInfo, option.bands);
      if (ageBand) {
        return doseResult({
          min:ageBand.min, max:ageBand.max, unit:ageBand.unit, period:'dose',
          frequency:ageBand.frequency || '', source:ageBand.source, note:ageBand.frequency || '',
        });
      }

      const certainlyOverOneYear = Number.isFinite(ageInfo.minMonths) && ageInfo.minMonths > 12;
      const manuallyOverOneYear = ageInfo.manual && ageInfo.defaultMonths > 12;
      if (!certainlyOverOneYear && !manuallyOverOneYear) {
        if (ageInfo.manual && ageInfo.defaultMonths <= 12) return { error:'Tabela nuk përcakton dozë për këtë moshë.' };
        return ageConfirmation(ageInfo);
      }

      const weightBand = option.weightBands.find(item => inBand(weight, item, 'minKg', 'maxKg'));
      if (!weightBand) return { error:'Tabela nuk përcakton brez peshe për këtë vlerë.' };
      return doseResult({
        min:weightBand.min, max:weightBand.max, unit:weightBand.unit, period:'dose',
        frequency:weightBand.frequency || '', source:weightBand.source, note:weightBand.frequency || '',
      });
    }

    if (option.mode === 'weight') {
      const min = option.min * weight;
      const max = option.max * weight;
      let periodText = 'për një marrje';
      if (option.period === 'day') periodText = 'në 24 orë';
      else if (option.period === 'hour') periodText = 'në orë';
      return doseResult({
        min, max, unit:option.unit, period:option.period || 'dose', split:option.split,
        frequency:option.frequency || '', source:option.label,
        note:[periodText, option.frequency].filter(Boolean).join(' · '),
      });
    }

    return { error:'Kjo formulë nuk ka kalkulator numerik.' };
  }

  const liquidCore = window.DRxPediatricLiquid || null;
  const mlNumber = value => {
    const digits = Math.abs(value) < 1 ? 2 : 1;
    const factor = 10 ** digits;
    return String(Math.round(value * factor) / factor).replace('.', ',');
  };
  const mlRange = (lo, hi) => `${mlNumber(lo)}${Math.abs(lo - hi) < 1e-9 ? '' : '–' + mlNumber(hi)} mL`;

  function renderLiquidConversions(drug, option, result, answer) {
    if (!liquidCore || result.error) return;
    const presentations = liquidCore.presentationsFor(drug, option);
    const conversions = liquidCore.volumeConversions(result, presentations);
    if (!conversions.length) return;

    const box = node('section', null, 'dz-common-volume');
    const head = node('div', null, 'dz-common-volume-head');
    head.append(node('strong', 'Matja praktike'));
    head.append(node('span', 'mL AUTO', 'dz-common-volume-badge'));
    box.append(head);

    const list = node('div', null, 'dz-common-volume-list');
    conversions.forEach(item => {
      const card = node('article', null, 'dz-common-volume-card');
      const top = node('div', null, 'dz-common-volume-top');
      top.append(node('b', item.form));
      const concentration = item.componentBasis
        ? `${calcFmt(item.mg)} mg ${item.componentBasis} / ${calcFmt(item.mL)} mL`
        : `${calcFmt(item.mg)} mg / ${calcFmt(item.mL)} mL`;
      top.append(node('small', concentration));
      card.append(top);

      const practical = node('div', null, 'dz-common-volume-dose');
      practical.append(node('strong', `≈ ${mlRange(item.volumeMin, item.volumeMax)}`));
      practical.append(node('span', [item.basisLabel, item.frequency].filter(Boolean).join(' · ')));
      card.append(practical);

      const source = node('small', null, 'dz-common-volume-source');
      source.append(node('span', 'Nga formulimi: '), node('b', item.source));
      card.append(source);
      list.append(card);
    });
    box.append(list);
    box.append(node('p', 'Kontrollo përqendrimin në shishe/kuti para administrimit.', 'dz-common-volume-safety'));
    answer.append(box);
  }

  function addWeightShortcuts(field, input, values, update) {
    const row = node('div', null, 'dz-common-weight-quick');
    [3.5, 7, 10, 12, 15, 20, 25, 30, 40, 50, 60].forEach(kg => {
      const button = node('button', `${kg} kg`);
      button.type = 'button';
      button.addEventListener('click', () => {
        input.value = String(kg);
        values.weight = String(kg);
        update();
      });
      row.append(button);
    });
    field.append(row);
  }

  function makeNumberField(label, id, suffix, value = '') {
    const field = node('label', null, 'dz-common-field');
    const box = node('span', null, 'dz-number');
    const input = node('input');
    input.id = id; input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.value = value;
    box.append(input);
    if (suffix) box.append(node('span', suffix));
    field.append(node('span', label, 'dz-label'), box);
    return { field, input };
  }

  function renderCalculator(drug, host) {
    host.replaceChildren();
    const options = drug.calc || [];
    if (!options.length) return;

    const shell = node('div', null, 'dz-common-calculator');
    const title = node('div', null, 'dz-common-calc-head');
    title.append(node('strong', 'Kalkulatori'), node('small', 'Pesha → mosha AUTO → doza → mL'));
    shell.append(title);

    const selector = node('select', null, 'dz-unit dz-common-select');
    options.forEach((option, index) => {
      const choice = node('option', option.displayLabel || option.label);
      choice.value = String(index);
      selector.append(choice);
    });
    if (options.length > 1) {
      const wrap = node('label', null, 'dz-common-field dz-common-field-wide');
      wrap.append(node('span', 'Formula', 'dz-label'), selector);
      shell.append(wrap);
    }

    const fields = node('div', null, 'dz-common-calc-fields');
    const answer = node('div', null, 'dz-common-calc-answer');
    shell.append(fields, answer);
    host.append(shell);

    const values = {
      weight:'',
      age:'',
      ageUnit:'year',
      ageManual:false,
      ageManualVisible:false,
    };
    let ageSummary = null;

    function currentOption() {
      return options[Number(selector.value) || 0];
    }

    function renderAgeSummary() {
      if (!ageSummary) return;
      ageSummary.replaceChildren();
      const weight = numeric(values.weight);
      if (!positiveNumber(weight)) {
        ageSummary.hidden = true;
        return;
      }

      ageSummary.hidden = false;
      const info = resolvedAgeInfo(values);
      const copy = node('div', null, 'dz-common-age-copy');
      const kicker = node('span', values.ageManual ? 'MOSHA E SAKTË' : 'MOSHA AUTO NGA PESHA', 'dz-common-age-kicker');
      copy.append(kicker);

      if (info?.label) {
        copy.append(node('strong', info.label, 'dz-common-age-value'));
      } else {
        copy.append(node('strong', 'Nuk u përcaktua', 'dz-common-age-value'));
      }

      if (!values.ageManual) {
        copy.append(node('small',
          info?.kind === 'below-range'
            ? 'Pesha është nën intervalin e tabelës; për doza sipas moshës duhet mosha e saktë.'
            : 'Sugjerim praktik nga tabela peshë–moshë. Mosha reale ka përparësi kur dihet.',
          'dz-common-age-note'
        ));
      } else {
        copy.append(node('small', 'Vlera që e shënove ti po përdoret në vend të sugjerimit nga pesha.', 'dz-common-age-note'));
      }

      const action = node('button', values.ageManual ? 'Përdor AUTO' : 'Ndrysho');
      action.type = 'button';
      action.className = 'dz-common-age-action';
      action.addEventListener('click', () => {
        if (values.ageManual) {
          values.ageManual = false;
          values.age = '';
          values.ageManualVisible = false;
        } else {
          values.ageManualVisible = true;
        }
        rebuildFields();
        if (values.ageManualVisible) {
          const slug = searchText(drug.name).replace(/[^a-z0-9]+/g, '-');
          setTimeout(() => byId(`${slug}-common-age`)?.focus(), 0);
        }
      });

      ageSummary.append(copy, action);
    }

    function renderError(result) {
      const wrap = node('div', null, result.needsAgeConfirmation ? 'dz-common-age-alert' : '');
      wrap.append(node('p', result.error, 'dz-waiting'));
      if (result.needsAgeConfirmation) {
        const button = node('button', 'Shëno moshën e saktë');
        button.type = 'button';
        button.className = 'dz-common-age-cta';
        button.addEventListener('click', () => {
          values.ageManualVisible = true;
          rebuildFields();
          const slug = searchText(drug.name).replace(/[^a-z0-9]+/g, '-');
          setTimeout(() => byId(`${slug}-common-age`)?.focus(), 0);
        });
        wrap.append(button);
      }
      answer.append(wrap);
    }

    function update() {
      renderAgeSummary();
      const option = currentOption();
      const result = calculateOption(option, values);
      answer.replaceChildren();

      if (result.error) {
        renderError(result);
        return;
      }

      const primary = node('div', null, 'dz-common-result-main');
      primary.append(node('span', 'DOZA', 'dz-common-result-kicker'));
      primary.append(node('p', result.primary, 'dz-common-result-dose'));
      if (result.note) primary.append(node('p', result.note, 'dz-common-result-note'));
      answer.append(primary);

      if (result.secondary) answer.append(node('p', result.secondary, 'dz-common-derived'));
      renderLiquidConversions(drug, option, result, answer);

      if (result.source) {
        const source = node('p', null, 'dz-common-source-line');
        source.append(node('span', 'Formula: '), node('b', result.source));
        answer.append(source);
      }
    }

    function appendExactAgeField(option) {
      if (!needsAge(option) || !values.ageManualVisible) return;
      const ageField = node('div', null, 'dz-common-field dz-common-age-exact');
      ageField.append(node('span', 'Mosha e saktë', 'dz-label'));
      const row = node('span', null, 'dz-common-age-row');
      const slug = searchText(drug.name).replace(/[^a-z0-9]+/g, '-');
      const age = makeNumberField('', `${slug}-common-age`, '', values.age);
      age.input.placeholder = 'p.sh. 5';
      age.input.addEventListener('input', () => {
        values.age = age.input.value;
        values.ageManual = positiveNumber(ageMonths(values.age, values.ageUnit));
        update();
      });

      const unit = node('select', null, 'dz-unit');
      [['year','vjeç'],['month','muaj']].forEach(([value, label]) => {
        const choice = node('option', label);
        choice.value = value;
        choice.selected = value === values.ageUnit;
        unit.append(choice);
      });
      unit.addEventListener('change', () => {
        values.ageUnit = unit.value;
        values.ageManual = positiveNumber(ageMonths(values.age, values.ageUnit));
        update();
      });

      row.append(age.field.lastElementChild, unit);
      ageField.append(row);
      fields.append(ageField);
    }

    function rebuildFields() {
      fields.replaceChildren();
      ageSummary = null;
      const option = currentOption();

      if (needsPatientWeight(option)) {
        const slug = searchText(drug.name).replace(/[^a-z0-9]+/g, '-');
        const weight = makeNumberField('Pesha e fëmijës', `${slug}-common-weight`, 'kg', values.weight);
        weight.field.classList.add('dz-common-weight-field');
        weight.field.lastElementChild?.classList.add('dz-number-lead');
        weight.input.placeholder = 'p.sh. 12';
        weight.input.addEventListener('input', () => {
          values.weight = weight.input.value;
          update();
        });
        addWeightShortcuts(weight.field, weight.input, values, update);
        fields.append(weight.field);

        ageSummary = node('div', null, 'dz-common-age-auto');
        ageSummary.hidden = true;
        fields.append(ageSummary);
      }

      appendExactAgeField(option);
      update();
    }

    selector.addEventListener('change', () => {
      values.ageManualVisible = false;
      values.ageManual = false;
      values.age = '';
      rebuildFields();
    });
    rebuildFields();
  }

  function drugMatches(drug, query) {
    return !query || searchText([drug.name, ...drug.dose, ...drug.formulations].join(' ')).includes(query);
  }

  function renderDrug(drug) {
    const card = node('details', null, 'dz-common-drug');
    const summary = node('summary');
    const formula = node('span', null, 'dz-common-summary-dose');
    drug.dose.forEach(line => formula.append(node('small', line)));
    summary.append(node('span', String(drug.no), 'dz-common-no'), node('strong', drug.name), formula);
    card.append(summary);

    const body = node('div', null, 'dz-common-drug-body');
    const calcHost = node('div');
    body.append(calcHost);

    const sourceDetails = node('details', null, 'dz-common-source-details');
    sourceDetails.open = !window.matchMedia('(max-width:760px)').matches;
    const sourceSummary = node('summary');
    sourceSummary.append(node('strong', 'Tabela origjinale'), node('small', 'doza + formulimet'));
    sourceDetails.append(sourceSummary);

    const grid = node('div', null, 'dz-common-source-grid');
    const doseCol = node('div', null, 'dz-common-source-col');
    doseCol.append(node('h4', 'Formula for dosage'));
    drug.dose.forEach(line => doseCol.append(node('p', line)));
    const formCol = node('div', null, 'dz-common-source-col');
    formCol.append(node('h4', 'Available formulations'));
    drug.formulations.forEach(line => formCol.append(node('p', line)));
    grid.append(doseCol, formCol);
    sourceDetails.append(grid);
    body.append(sourceDetails);

    let built = false;
    card.addEventListener('toggle', () => {
      if (card.open && !built) { built = true; renderCalculator(drug, calcHost); }
    });
    card.append(body);
    return card;
  }

  function renderSections() {
    const target = byId('pediatricCommonSections');
    if (!target) return;
    const query = searchText(byId('pediatricCommonSearch')?.value.trim());
    target.replaceChildren();
    let shown = 0;

    commonSections.forEach((section, sectionIndex) => {
      const matching = section.drugs.filter(drug => drugMatches(drug, query));
      if (query && !matching.length && !searchText(`${section.roman} ${section.title}`).includes(query)) return;
      const visible = matching.length ? matching : section.drugs;
      shown += visible.length;
      const block = node('details', null, 'dz-common-section');
      block.open = sectionIndex === 0 || Boolean(query);
      const summary = node('summary');
      summary.append(node('span', section.roman, 'dz-common-roman'), node('strong', section.title), node('small', String(visible.length)));
      block.append(summary);
      const list = node('div', null, 'dz-common-drug-list');
      visible.forEach(drug => list.append(renderDrug(drug)));
      block.append(list);
      target.append(block);
    });

    const count = byId('pediatricCommonCount');
    if (count) count.textContent = query ? `${shown} barna të gjetura` : '50 barna · 10 ndarje';
    if (!shown) target.append(node('p', 'Nuk u gjet bar në këtë referencë.', 'dz-empty'));
  }

  async function bootReference() {
    const target = byId('pediatricCommonSections');
    if (!target) return;
    try {
      let payload = null;
      let source = 'database';
      try {
        const response = await fetch(DATA_URL, { cache:'no-store', credentials:'same-origin' });
        if (!response.ok) throw new Error('Database reference unavailable');
        payload = await response.json();
      } catch {
        source = 'static-fallback';
        const fallback = await fetch(STATIC_FALLBACK_URL, { cache:'force-cache', credentials:'same-origin' });
        if (!fallback.ok) throw new Error('Static reference unavailable');
        payload = await fallback.json();
      }
      commonSections = Array.isArray(payload?.sections) ? payload.sections : [];
      if (!commonSections.length) throw new Error('Reference empty');
      renderSections();
      const count = byId('pediatricCommonCount');
      if (count) count.dataset.source = source;
      byId('pediatricCommonSearch')?.addEventListener('input', renderSections);
    } catch {
      if (byId('pediatricCommonCount')) byId('pediatricCommonCount').textContent = 'Nuk u ngarkua';
      target.replaceChildren(node('p', 'Referenca pediatrike nuk u ngarkua. Ringarko faqen.', 'dz-empty'));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootReference, { once:true });
  else void bootReference();
})();
