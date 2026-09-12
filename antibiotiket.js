(() => {
  'use strict';

  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  if (!guide) return;

  // drx-antibiotics-minimal-v5: two actions to an answer — tap the infection,
  // type the real weight. Everything the source does not need for that stays
  // out of the way, and nothing the clinician chose is lost on a refresh.
  const STATE_KEY = 'drx.antibiotics.context.v1';

  const $ = id => document.getElementById(id);
  const el = {
    indicationChoice:$('indicationChoice'),
    age:$('ageSelect'),
    ageOptional:$('ageOptional'),
    ageHint:$('ageHint'),
    weight:$('weightInput'),
    weightHint:$('weightHint'),
    refineBlock:$('refineBlock'),
    allergyField:$('allergyField'),
    allergyChoice:$('allergyChoice'),
    atypicalWrap:$('atypicalWrap'),
    atypical:$('atypicalInput'),
    utiTypeWrap:$('utiTypeWrap'),
    utiTypeChoice:$('utiTypeChoice'),
    doseBasis:$('doseBasis'),
    activeSource:$('activeSource'),
    eligibility:$('eligibilityMessage'),
    list:$('recommendationList'),
    sourceList:$('sourceList'),
  };

  // The clinical context lives here, not in the DOM, so a reload can restore it
  // exactly as the clinician left it.
  const ctx = {
    indication:guide.indications[0]?.id || '',
    age:'',
    weight:'',
    allergy:'none',
    atypical:false,
    utiType:'nonfebrile',
  };

  const tierLabels = Object.freeze({
    first:'Zgjedhja e parë',
    second:'Zgjedhja e dytë',
    'allergy-nonsevere':'Alergji jo kërcënuese për jetën',
    'allergy-severe':'Alergji kërcënuese për jetën / alternativë',
    option:'Opsion i tabelës',
  });

  // The source splits the alternatives on "life-threatening or not", so the
  // control has to say exactly that rather than a shorter paraphrase.
  const allergyOptions = Object.freeze([
    { value:'none', label:'Jo' },
    { value:'nonsevere', label:'Po, jo kërcënuese për jetën' },
    { value:'severe', label:'Po, kërcënuese për jetën' },
  ]);

  const allergyLabels = Object.freeze({
    none:'Pa alergji ndaj penicilinës',
    nonsevere:'Alergji jo kërcënuese për jetën',
    severe:'Alergji kërcënuese për jetën',
  });

  const utiOptions = Object.freeze([
    { value:'nonfebrile', label:'Pa temperaturë' },
    { value:'febrile', label:'Febrile' },
  ]);

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fmt = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ',');
  };

  function currentIndication() {
    return guide.indications.find(item => item.id === ctx.indication) || guide.indications[0];
  }

  function currentAgeBand() {
    return guide.ageBands.find(item => item.id === ctx.age) || null;
  }

  function weightState() {
    const raw = clean(ctx.weight).replace(',', '.');
    if (!raw) return { kind:'empty', value:null };
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 1 || value > 200) return { kind:'invalid', value:null };
    return { kind:'valid', value };
  }

  // Which weight the numbers come from. A real weight always wins; the age band
  // only supplies the source's reference weight, which is orientational.
  function doseBasis() {
    const state = weightState();
    if (state.kind === 'valid') {
      return { kind:'real', weight:state.value, label:`Për ${fmt(state.value)} kg` };
    }
    const age = currentAgeBand();
    if (age && Number.isFinite(age.referenceWeightKg)) {
      return {
        kind:'reference',
        weight:age.referenceWeightKg,
        label:`Sipas moshës ${age.label.toLocaleLowerCase('sq')} · ${fmt(age.referenceWeightKg)} kg`,
      };
    }
    return { kind:'none', weight:null, label:'' };
  }

  function maxText(dose) {
    if (!dose?.maxDose) return '';
    return dose.maxLabel || `maks. ${fmt(dose.maxDose)} mg/dozë`;
  }

  function formulaText(option) {
    const dose = option.dose || {};
    const frequency = clean(option.frequency);
    if (dose.type === 'range') {
      const component = dose.component ? ` · sipas ${dose.component}` : '';
      return `${fmt(dose.min)}–${fmt(dose.max)} ${dose.unit}${component} · ${frequency}${dose.maxDose ? ` · ${maxText(dose)}` : ''}`;
    }
    if (dose.type === 'single') {
      return `${fmt(dose.value)} ${dose.unit} · ${frequency}${dose.maxDose ? ` · ${maxText(dose)}` : ''}`;
    }
    if (dose.type === 'sequence') {
      return dose.steps.map(step => `${step.label}: ${fmt(step.value)} ${dose.unit}${step.maxDose ? ` (maks. ${fmt(step.maxDose)} mg)` : ''}`).join(' · ');
    }
    if (dose.type === 'weight-threshold') {
      return `<${fmt(dose.thresholdKg)} kg: ${dose.below} · ≥${fmt(dose.thresholdKg)} kg: ${dose.atOrAbove} · ${frequency}`;
    }
    if (dose.type === 'amoxclav-uti') {
      return '<35 kg: 15–20 mg/kg/dozë PO 3 herë/ditë (maks. 500 mg amoxicillin/dozë) · ≥35 kg: 500/125 mg 3 herë/ditë ose 875/125 mg 2 herë/ditë';
    }
    return frequency || '—';
  }

  function cap(value, max) {
    if (!max || value <= max) return { value, capped:false };
    return { value:max, capped:true };
  }

  function calculatedText(option, weight, prefix) {
    if (!weight) return '';
    const dose = option.dose || {};
    const label = `${prefix || `Për ${fmt(weight)} kg`}: `;

    if (dose.type === 'range') {
      const low = cap(dose.min * weight, dose.maxDose);
      const high = cap(dose.max * weight, dose.maxDose);
      const value = low.value === high.value
        ? `${fmt(low.value)} mg/dozë`
        : `${fmt(low.value)}–${fmt(high.value)} mg/dozë`;
      return `${label}${value}${low.capped || high.capped ? ' · kufiri maksimal i tabelës' : ''}`;
    }
    if (dose.type === 'single') {
      const result = cap(dose.value * weight, dose.maxDose);
      return `${label}${fmt(result.value)} mg/dozë${result.capped ? ' · kufiri maksimal i tabelës' : ''}`;
    }
    if (dose.type === 'sequence') {
      const steps = dose.steps.map(step => {
        const result = cap(step.value * weight, step.maxDose);
        return `${step.label}: ${fmt(result.value)} mg${result.capped ? ' (maks.)' : ''}`;
      });
      return `${label}${steps.join(' · ')}`;
    }
    if (dose.type === 'weight-threshold') {
      return `${label}${weight < dose.thresholdKg ? dose.below : dose.atOrAbove}`;
    }
    if (dose.type === 'amoxclav-uti') {
      if (weight >= 35) return `${label}500/125 mg 3×/ditë ose 875/125 mg 2×/ditë`;
      const low = cap(15 * weight, 500);
      const high = cap(20 * weight, 500);
      return `${label}${fmt(low.value)}–${fmt(high.value)} mg amoxicillin/dozë${low.capped || high.capped ? ' · kufiri maksimal i tabelës' : ''}`;
    }
    return '';
  }

  // The arithmetic, written out. This never decides a dose — calculatedText()
  // owns that — it only shows the multiplication behind the number so it can be
  // checked at a glance.
  function calculationSteps(option, weight) {
    if (!weight) return [];
    const dose = option.dose || {};
    const kg = `${fmt(weight)} kg`;
    const cap = max => `kufizuar në maks. ${fmt(max)} mg/dozë nga tabela`;

    if (dose.type === 'range') {
      const low = dose.min * weight;
      const high = dose.max * weight;
      const steps = [`${fmt(dose.min)}–${fmt(dose.max)} mg/kg × ${kg} = ${fmt(low)}–${fmt(high)} mg/dozë`];
      if (dose.maxDose && high > dose.maxDose) steps.push(cap(dose.maxDose));
      return steps;
    }
    if (dose.type === 'single') {
      const value = dose.value * weight;
      const steps = [`${fmt(dose.value)} mg/kg × ${kg} = ${fmt(value)} mg/dozë`];
      if (dose.maxDose && value > dose.maxDose) steps.push(cap(dose.maxDose));
      return steps;
    }
    if (dose.type === 'sequence') {
      return dose.steps.map(step => {
        const value = step.value * weight;
        const capped = step.maxDose && value > step.maxDose;
        return `${step.label}: ${fmt(step.value)} mg/kg × ${kg} = ${fmt(value)} mg${capped ? ` → maks. ${fmt(step.maxDose)} mg` : ''}`;
      });
    }
    if (dose.type === 'weight-threshold') {
      const below = weight < dose.thresholdKg;
      return [`${kg} ${below ? '<' : '≥'} ${fmt(dose.thresholdKg)} kg → ${below ? dose.below : dose.atOrAbove}`];
    }
    if (dose.type === 'amoxclav-uti') {
      if (weight >= 35) return [`${kg} ≥ 35 kg → doza fikse: 500/125 mg 3×/ditë ose 875/125 mg 2×/ditë`];
      const low = 15 * weight;
      const high = 20 * weight;
      const steps = [`${kg} < 35 kg → 15–20 mg/kg × ${kg} = ${fmt(low)}–${fmt(high)} mg amoxicillin/dozë`];
      if (high > 500) steps.push(cap(500));
      return steps;
    }
    return [];
  }

  function durationText(option) {
    const duration = option.duration || {};
    if (duration.type === 'fixed') return duration.text;
    if (duration.type === 'source-unspecified') return 'Nuk specifikohet në tabelë';
    if (duration.type === 'uti') return ctx.utiType === 'febrile' ? '7–10 ditë' : '3 ditë';
    if (duration.type === 'age') {
      const age = currentAgeBand();
      if (!age) return `<2 vjeç: ${duration.underText} · ≥2 vjeç: ${duration.otherText}`;
      return age.months < duration.underMonths ? duration.underText : duration.otherText;
    }
    return '—';
  }

  function visibleOptions(indication) {
    if (indication.id === 'uti') return indication.options;
    if (indication.id === 'pneumonia' && ctx.atypical) {
      return indication.options.filter(option => option.atypical);
    }
    return indication.options.filter(option => (option.allergy || []).includes(ctx.allergy) || (option.allergy || []).includes('any'));
  }

  function eligibilityProblem(indication) {
    if (!Number.isFinite(indication.minAgeMonths)) return '';
    const age = currentAgeBand();
    const threshold = indication.minAgeMonths === 3 ? '3 muaj' : indication.minAgeMonths === 6 ? '6 muaj' : `${indication.minAgeMonths} muaj`;
    if (!age) return `Zgjidh moshën për të kontrolluar nëse kjo skemë e burimit aplikohet (pragu: ≥${threshold}).`;
    if (age.months >= indication.minAgeMonths) return '';
    return `Kjo tabelë e kufizon skemën në moshën ≥${threshold}. Për moshën e zgjedhur nuk po shfaqet skemë automatike.`;
  }

  function sourceById(id) {
    return guide.sources.find(source => source.id === id) || null;
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // --- controls ------------------------------------------------------------

  function buildChoice(container, name, options, current, onPick, className) {
    container.replaceChildren();
    options.forEach(option => {
      const label = make('label', className);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = option.value;
      input.checked = option.value === current;
      input.addEventListener('change', () => { if (input.checked) onPick(option.value); });
      label.append(input, make('span', '', option.label));
      if (option.hint) label.append(make('small', '', option.hint));
      container.append(label);
    });
  }

  function buildIndicationChips() {
    buildChoice(
      el.indicationChoice,
      'abx-indication',
      guide.indications.map(item => ({ value:item.id, label:item.short || item.label, hint:item.short ? item.label : '' })),
      ctx.indication,
      value => { ctx.indication = value; render(); },
      'abx-chip',
    );
  }

  function buildAllergySegments() {
    buildChoice(el.allergyChoice, 'abx-allergy', allergyOptions, ctx.allergy, value => {
      ctx.allergy = value;
      render();
    }, 'abx-segment');
  }

  function buildUtiSegments() {
    buildChoice(el.utiTypeChoice, 'abx-uti', utiOptions, ctx.utiType, value => {
      ctx.utiType = value;
      render();
    }, 'abx-segment');
  }

  function populateAges() {
    guide.ageBands.forEach(age => {
      const option = document.createElement('option');
      option.value = age.id;
      option.textContent = `${age.label} · ref. ${age.referenceWeightLabel}`;
      el.age.append(option);
    });
  }

  // --- rendering -----------------------------------------------------------

  function renderAgeHint(indication) {
    const age = currentAgeBand();
    const required = Number.isFinite(indication.minAgeMonths);
    el.ageOptional.textContent = required ? '— e nevojshme' : '— opsionale';
    el.age.classList.toggle('is-required', required && !age);
    if (!age) {
      el.ageHint.textContent = required
        ? 'Kjo skemë ka prag moshe në burim, prandaj mosha duhet zgjedhur.'
        : 'Zgjidh moshën për peshën referuese, kufijtë e burimit dhe kohëzgjatjen.';
      return;
    }
    el.ageHint.textContent = `CARPA/WBM: peshë referuese ${age.referenceWeightLabel}.`;
  }

  function renderWeightHint() {
    const state = weightState();
    if (state.kind === 'valid') {
      el.weight.setAttribute('aria-invalid', 'false');
      el.weightHint.textContent = 'Pesha reale po përdoret vetëm për llogaritjen matematikore të mg/dozë.';
      return;
    }
    if (state.kind === 'invalid') {
      el.weight.setAttribute('aria-invalid', 'true');
      el.weightHint.textContent = 'Shkruaj një peshë reale ndërmjet 1 dhe 200 kg.';
      return;
    }
    el.weight.removeAttribute('aria-invalid');
    const age = currentAgeBand();
    el.weightHint.textContent = age
      ? `Pa peshë reale doza llogaritet nga pesha referuese ${age.referenceWeightLabel} — vetëm orientuese.`
      : 'Pa peshë reale shfaqet formula e burimit, jo një dozë e llogaritur.';
  }

  function renderDoseBasis() {
    const basis = doseBasis();
    if (basis.kind === 'real') {
      el.doseBasis.textContent = `Peshë reale ${fmt(basis.weight)} kg`;
      el.doseBasis.dataset.tone = 'live';
      return;
    }
    if (basis.kind === 'reference') {
      el.doseBasis.textContent = `Peshë referuese ${fmt(basis.weight)} kg · orientuese`;
      el.doseBasis.dataset.tone = 'reference';
      return;
    }
    el.doseBasis.textContent = 'Formula e burimit';
    el.doseBasis.dataset.tone = 'formula';
  }

  // A refinement is only shown when the source actually branches on it.
  function renderConditionalControls(indication) {
    const usesAllergy = indication.usesAllergy !== false && !(indication.id === 'pneumonia' && ctx.atypical);
    el.allergyField.hidden = !usesAllergy;
    el.atypicalWrap.hidden = indication.id !== 'pneumonia';
    el.utiTypeWrap.hidden = indication.id !== 'uti';
    el.refineBlock.hidden = el.allergyField.hidden && el.atypicalWrap.hidden && el.utiTypeWrap.hidden;
  }

  function recommendationCard(option, basis) {
    const card = make('article', `abx-option tier-${option.tier || 'option'}`);

    const head = make('div', 'abx-option-head');
    head.append(
      make('h3', '', option.drug),
      make('span', 'abx-tier', tierLabels[option.tier] || 'Opsion i tabelës'),
    );

    const dose = make('div', 'abx-option-dose');
    const calculated = calculatedText(option, basis.weight, basis.label);
    if (calculated) {
      const value = make('strong', 'abx-dose-value', calculated);
      value.dataset.basis = basis.kind;
      dose.append(value);

      // Show the multiplication, so the number can be checked without trusting it.
      const steps = calculationSteps(option, basis.weight);
      if (steps.length) {
        const working = make('div', 'abx-dose-working');
        working.append(make('span', 'abx-dose-working-label', 'Si llogaritet'));
        steps.forEach(step => working.append(make('span', 'abx-dose-step', step)));
        dose.append(working);
      }

      dose.append(make('span', 'abx-dose-formula', formulaText(option)));
    } else {
      dose.append(make('strong', 'abx-dose-formula-lead', formulaText(option)));
      dose.append(make('span', 'abx-dose-formula', 'Zgjidh moshën ose shkruaj peshën reale për mg/dozë.'));
    }

    const meta = make('div', 'abx-option-meta');
    meta.append(
      make('span', '', `${option.route || 'PO'} · ${option.frequency || '—'}`),
      make('span', 'abx-duration', durationText(option)),
    );

    card.append(head, dose, meta);
    if (option.note) card.append(make('p', 'abx-option-note', option.note));
    return card;
  }

  function renderSources(indication) {
    el.sourceList.replaceChildren();
    guide.sources.forEach(source => {
      const row = make('article', `abx-source${source.id === indication.source ? ' is-active' : ''}`);
      const copy = make('div', '');
      copy.append(make('strong', '', source.title), make('span', '', source.note));
      const badgeText = source.id === indication.source ? 'BURIMI I SKEMËS' : 'PESHË REFERUESE';
      row.append(copy, make('b', 'abx-source-badge', badgeText));
      el.sourceList.append(row);
    });
  }

  function syncIndicationInUrl(indication) {
    try {
      const url = new URL(location.href);
      url.searchParams.set('indication', indication.id);
      history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
    } catch {}
  }

  function persistContext() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(ctx)); }
    catch {}
  }

  function restoreContext() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
    catch { stored = null; }
    if (stored && typeof stored === 'object') {
      if (guide.indications.some(item => item.id === stored.indication)) ctx.indication = stored.indication;
      if (guide.ageBands.some(item => item.id === stored.age)) ctx.age = stored.age;
      if (typeof stored.weight === 'string') ctx.weight = stored.weight.slice(0, 8);
      if (allergyOptions.some(item => item.value === stored.allergy)) ctx.allergy = stored.allergy;
      if (utiOptions.some(item => item.value === stored.utiType)) ctx.utiType = stored.utiType;
      ctx.atypical = stored.atypical === true;
    }
    // A shared link wins over the remembered context.
    const requested = new URLSearchParams(location.search).get('indication');
    if (requested && guide.indications.some(item => item.id === requested)) ctx.indication = requested;
  }

  function render() {
    const indication = currentIndication();
    const problem = eligibilityProblem(indication);
    const weight = weightState();

    renderConditionalControls(indication);
    renderAgeHint(indication);
    renderWeightHint();
    renderDoseBasis();
    renderSources(indication);
    syncIndicationInUrl(indication);
    persistContext();

    const source = sourceById(indication.source);
    el.activeSource.textContent = source ? source.short : 'Burim';

    el.eligibility.hidden = !problem;
    el.eligibility.textContent = problem;
    el.list.replaceChildren();

    if (problem) return;

    const options = visibleOptions(indication);
    if (!options.length) {
      el.list.append(make('div', 'abx-empty', 'Ky kombinim nuk ka skemë të specifikuar në tabelën burimore.'));
      return;
    }

    const basis = doseBasis();
    if (basis.kind === 'reference') {
      el.list.append(make(
        'p',
        'abx-orientational-note',
        'Këto doza janë llogaritur nga pesha referuese e moshës dhe janë vetëm orientuese. Shkruaj peshën reale për dozën përfundimtare.',
      ));
    }
    options.forEach(option => el.list.append(recommendationCard(option, basis)));
  }

  function bind() {
    el.age.addEventListener('change', () => { ctx.age = el.age.value; render(); });
    el.weight.addEventListener('input', () => { ctx.weight = el.weight.value; render(); });
    el.atypical.addEventListener('change', () => { ctx.atypical = el.atypical.checked; render(); });
  }

  restoreContext();
  populateAges();
  el.age.value = ctx.age;
  el.weight.value = ctx.weight;
  el.atypical.checked = ctx.atypical;
  buildIndicationChips();
  buildAllergySegments();
  buildUtiSegments();
  bind();
  render();
})();
