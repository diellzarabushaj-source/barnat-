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
  const fmt = value => round(value, Math.abs(value) >= 10 ? 1 : 2);
  const num = value => {
    const parsed = Number(String(value ?? '').replace(',', '.').trim());
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
    if (!regimen) return [];
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
  function setPending(text) {
    const box = $('masterResult');
    box.replaceChildren();
    box.append(el('p', text, 'dz-waiting'));
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
    const query = $('dosageSearch').value.trim().toLowerCase();
    const list = drugs().filter(drug => drug.name.toLowerCase().includes(query));
    const box = $('masterDrugs');
    box.replaceChildren();
    if (!list.length) { box.append(el('p', 'Asnjë bar me këtë emër.', 'dz-empty')); return; }
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
    renderRegimens();
  }
  function pickIndication(id) {
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
    if (list.length && !state.regimen) state.regimen = list[0];
    if (state.regimen && !list.some(row => row.id === state.regimen.id)) state.regimen = list[0] || null;
    /* One way to give it is not a choice — do not ask a question with one answer. */
    $('regimenBlock').hidden = list.length < 2;
    const box = $('masterRegimens');
    box.replaceChildren();
    list.forEach(row => box.append(chip('dz-regimen', row.id, row.routeLabel, row.frequency || row.population, row.id === state.regimen?.id, pickRegimen)));
    pickerCurrent('regimenCurrent', state.regimen ? `${state.regimen.routeLabel}${state.regimen.frequency ? ' · ' + state.regimen.frequency : ''}` : '');
    renderPatient();
  }
  function pickRegimen(id) {
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
    state.ageSource = '';
    fields.replaceChildren();
    gates.replaceChildren();
    if (!regimen) { renderAnswer(); return; }

    /* Weight leads: it is the number on the scale, and on a child it fills the
       age in too, so the same fact is never typed twice. */
    if (regimen.needs.weight) {
      const weight = numberInput('masterWeight', '18', 'kg');
      weight.shell.classList.add('dz-number-lead');
      weight.input.addEventListener('input', applyAgeFromWeight);
      fields.append(fieldRow('Pesha', weight.shell));
    }
    if (regimen.needs.age) {
      const age = numberInput('masterAge', '4', '');
      const unit = el('select', null, 'dz-unit');
      unit.id = 'masterAgeUnit';
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
      fields.append(group('Produkti i lidhur në Master', box));
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
    if (regimen.needs.daily && !(num($('masterDaily')?.value) >= 0)) need.push('sa ka marrë sot');
    if (regimen.needs.total && !(num($('masterTotal')?.value) >= 0)) need.push('sa ka marrë këtë episod');
    if (regimen.steps.length && !checked('dz-step')) need.push('hapin');
    if (regimen.needs.product && !checked('dz-product')) need.push('produktin');
    const boxes = [$('masterScope'), ...regimen.gates.map(gate => $(gate.id))].filter(Boolean);
    const open = boxes.filter(box => !box.checked).length;
    if (open) need.push(open === 1 ? 'konfirmimin e mbetur' : `${open} konfirmimet e mbetura`);
    return need;
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
    if (need.length) { setPending(`Shëno ${need.join(', ')}.`); return; }
    setPending('Duke llogaritur…');
    timer = setTimeout(calculate, 180);
  }
  async function calculate() {
    const token = state.revision;
    state.pending = new AbortController();
    try {
      const response = await fetch('/api/dosage?view=master-calculate', {
        method:'POST', credentials:'same-origin', cache:'no-store',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(payload()), signal:state.pending.signal,
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
      if (token === state.revision && error.name !== 'AbortError') setErrors([error.message]);
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

    const copy = el('button', 'Kopjo recetën', 'dz-copy');
    copy.type = 'button';
    copy.id = 'masterCopy';
    copy.addEventListener('click', () => copyLine(copy));
    box.append(copy);

    const limits = [...result.maxima.map(max => `Kufiri: ${max.sq}`), ...result.notices, result.safety].filter(Boolean);
    if (limits.length) {
      const fold = el('details', null, 'dz-fold');
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
    setPending(need.length ? `Shëno ${need.join(', ')}.` : 'Duke llogaritur…');
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
      el('p', `nga ${item.label}`, 'dz-hint')];
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
    [['liquid', 'Sirup / ampulë'], ['solid', 'Tabletë / kapsulë']].forEach(([value, label]) => {
      kinds.append(chip('dz-kind', value, label, '', state.kind === value,
        picked => { state.kind = picked; state.kindTouched = true; renderAnswer(); }));
    });
    wrap.append(kinds);

    const line = el('div', null, 'dz-editor-line');
    const mg = numberInput('mineMg', '125', 'mg');
    if (saved && saved.kind === state.kind) mg.input.value = String(saved.mg).replace('.', ',');
    line.append(mg.shell);
    let mL = null;
    if (state.kind === 'liquid') {
      line.append(el('span', 'në', 'dz-editor-sep'));
      mL = numberInput('mineMl', '5', 'mL');
      if (saved && saved.kind === 'liquid') mL.input.value = String(saved.mL).replace('.', ',');
      line.append(mL.shell);
    }
    wrap.append(line);

    const save = el('button', 'Ruaj për këtë bar', 'dz-save');
    save.type = 'button';
    save.addEventListener('click', () => {
      const value = num(mg.input.value);
      const volume = mL ? num(mL.input.value) : 1;
      if (!positive(value) || !positive(volume)) { mg.input.focus(); return; }
      saveProduct(regimen.drugId, state.kind === 'solid'
        ? { kind:'solid', mg:value, form:'tabletë' }
        : { kind:'liquid', mg:value, mL:volume });
      state.editing = false;
      state.productId = MINE;
      renderAnswer();
    });
    wrap.append(save);
    wrap.append(el('p', 'Ruhet vetëm në këtë pajisje dhe vlen si njësia jote për këtë bar.', 'dz-hint'));
    return wrap;
  }

  /* ------------------------------------------------------------------- copy */
  function copyLine(button) {
    const result = state.result;
    if (!result) return;
    const parts = [`${result.drug} ${result.dose ? range(result.dose.min, result.dose.max, result.dose.unitLabel) : ''}`.trim()];
    parts.push(result.routeText);
    if (result.frequencyNote) parts.push(result.frequencyNote);
    let line = parts.filter(Boolean).join(', ');
    if (result.durationNote) line += ` — ${result.durationNote}`;
    line += '.';
    const mg = doseMg(result.dose);
    const chosen = shelfItem(state.regimen, state.productId);
    if (result.conversion) line += ` Sasia: ${range(result.conversion.min, result.conversion.max, result.conversion.unitLabel)} nga ${result.conversion.product} ${result.conversion.strength}.`;
    else if (mg && chosen && result.dose.period !== 'day') {
      if (chosen.kind === 'solid') line += ` Sasia: ${fmt(mg.min / chosen.mg)}${mg.min === mg.max ? '' : '–' + fmt(mg.max / chosen.mg)} ${chosen.form} nga ${chosen.label}.`;
      else if (mgPerML(chosen)) line += ` Sasia: ${fmt(mg.min / mgPerML(chosen))}${mg.min === mg.max ? '' : '–' + fmt(mg.max / mgPerML(chosen))} mL nga ${chosen.label}.`;
    }
    navigator.clipboard?.writeText(line).then(() => {
      button.textContent = 'U kopjua';
      setTimeout(() => { button.textContent = 'Kopjo recetën'; }, 1600);
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
        const link = el('a', 'hap');
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
    try {
      await window.DRxDosageShell.ensureAuth();
      const response = await fetch('/api/dosage?view=master-catalog', { credentials:'same-origin', cache:'no-store' });
      if (!response.ok) throw new Error('Master-i nuk mund të ngarkohet.');
      const data = await response.json();
      state.rows = data.regimens;
      $('masterStatus').textContent = `${drugs().length} barna · ${state.rows.length} skema · Master v2.7`;
      renderDrugs();
    } catch (error) {
      $('masterStatus').textContent = error.message;
    }
  }

  ['drugPicker', 'indicationPicker', 'regimenPicker'].forEach(pinOpen);
  $('dosageSearch').addEventListener('input', renderDrugs);
  $('masterForm').addEventListener('submit', event => event.preventDefault());
  $('masterForm').addEventListener('input', schedule);
  $('masterForm').addEventListener('change', schedule);
  void boot();
})();
