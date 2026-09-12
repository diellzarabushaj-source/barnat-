(() => {
  'use strict';

  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  if (!guide) return;

  const STATE_KEY = 'drx.antibiotics.context.v2';
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
    ageSuggestion:$('ageSuggestion'),
    doseBasis:$('doseBasis'),
    activeSource:$('activeSource'),
    eligibility:$('eligibilityMessage'),
    list:$('recommendationList'),
    sourceList:$('sourceList'),
  };

  const ctx = {
    indication:guide.indications[0]?.id || '',
    age:'',
    weight:'',
    allergy:'none',
    atypical:false,
    orbitalRedFlags:false,
    ageFromWeight:false,
  };

  const tierLabels = Object.freeze({
    first:'Zgjedhja e parë',
    second:'Zgjedhja e dytë',
    option:'Opsion',
    'allergy-low':'Alternativë sipas alergjisë',
    'allergy-severe':'Alternativë jo-beta-laktam',
    reserve:'Rezervë / me kushte',
    atypical:'Patogjen atipik',
    procedure:'Source control',
  });

  const allergyOptions = Object.freeze((guide.allergyBuckets || []).map(item => ({
    value:item.id,
    label:item.short || item.label,
    hint:item.label,
  })));
  const allergyById = id => (guide.allergyBuckets || []).find(item => item.id === id) || null;

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

  function doseBasis() {
    const state = weightState();
    if (state.kind === 'valid') return { kind:'real', weight:state.value, label:`Për ${fmt(state.value)} kg` };
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

  function nearestAgeBand(weight) {
    if (!Number.isFinite(weight)) return null;
    return guide.ageBands.reduce((best, band) => {
      if (!Number.isFinite(band.referenceWeightKg)) return best;
      if (!best) return band;
      const gap = Math.abs(band.referenceWeightKg - weight);
      const bestGap = Math.abs(best.referenceWeightKg - weight);
      if (gap < bestGap) return band;
      if (gap === bestGap && band.months < best.months) return band;
      return best;
    }, null);
  }

  function cap(value, max) {
    if (!Number.isFinite(max) || value <= max) return { value, capped:false };
    return { value:max, capped:true };
  }

  function componentLabel(dose) {
    return dose?.component ? ` ${dose.component}` : '';
  }

  function maxText(dose) {
    if (!Number.isFinite(dose?.maxDose)) return '';
    return dose.maxLabel || `maks. ${fmt(dose.maxDose)} mg${componentLabel(dose)}/dozë`;
  }

  function formulaForDose(dose, frequency='') {
    if (!dose) return frequency || '—';
    if (dose.type === 'range') {
      const component = dose.component ? ` · sipas ${dose.component}` : '';
      return `${fmt(dose.min)}–${fmt(dose.max)} ${dose.unit}${component}${frequency ? ` · ${frequency}` : ''}${Number.isFinite(dose.maxDose) ? ` · ${maxText(dose)}` : ''}`;
    }
    if (dose.type === 'single') {
      const component = dose.component ? ` · sipas ${dose.component}` : '';
      return `${fmt(dose.value)} ${dose.unit}${component}${frequency ? ` · ${frequency}` : ''}${Number.isFinite(dose.maxDose) ? ` · ${maxText(dose)}` : ''}`;
    }
    if (dose.type === 'sequence') {
      return dose.steps.map(step => `${step.label}: ${fmt(step.value)} ${dose.unit}${Number.isFinite(step.maxDose) ? ` (maks. ${fmt(step.maxDose)} mg)` : ''}`).join(' · ');
    }
    if (dose.type === 'fixed') return `${dose.text}${frequency ? ` · ${frequency}` : ''}`;
    if (dose.type === 'combo') {
      return dose.parts.map(part => `${part.drug}: ${formulaForDose(part.dose, part.frequency)}`).join(' + ');
    }
    return frequency || '—';
  }

  function formulaText(option) {
    return formulaForDose(option.dose || {}, clean(option.frequency));
  }

  function calculateSimple(dose, weight) {
    if (!weight || !dose) return null;
    if (dose.type === 'single') {
      const result = cap(dose.value * weight, dose.maxDose);
      return { min:result.value, max:result.value, capped:result.capped };
    }
    if (dose.type === 'range') {
      const low = cap(dose.min * weight, dose.maxDose);
      const high = cap(dose.max * weight, dose.maxDose);
      return { min:low.value, max:high.value, capped:low.capped || high.capped };
    }
    return null;
  }

  function rangeText(range, dose, suffix='dozë') {
    const component = componentLabel(dose);
    const value = range.min === range.max ? fmt(range.min) : `${fmt(range.min)}–${fmt(range.max)}`;
    return `${value} mg${component}/${suffix}${range.capped ? ' · kufiri maksimal i burimit' : ''}`;
  }

  function calculatedValue(option, weight) {
    if (!weight) return '';
    const dose = option.dose || {};
    const simple = calculateSimple(dose, weight);
    if (simple) return rangeText(simple, dose);

    if (dose.type === 'sequence') {
      return dose.steps.map(step => {
        const result = cap(step.value * weight, step.maxDose);
        return `${step.label}: ${fmt(result.value)} mg${result.capped ? ' (maks.)' : ''}`;
      }).join(' · ');
    }

    if (dose.type === 'fixed') return dose.text;

    if (dose.type === 'combo') {
      return dose.parts.map(part => {
        const result = calculateSimple(part.dose, weight);
        const text = result ? rangeText(result, part.dose) : formulaForDose(part.dose, part.frequency);
        return `${part.drug}: ${text} · ${part.frequency}`;
      }).join(' + ');
    }
    return '';
  }

  function dosesPerDayFromFrequency(frequency) {
    const value = clean(frequency);
    let match = /^(\d+) herë\/ditë$/.exec(value);
    if (match) return Number(match[1]);
    match = /^(\d+) ose (\d+) herë\/ditë$/.exec(value);
    if (match) return { min:Number(match[1]), max:Number(match[2]) };
    return null;
  }

  function dailyDose(option, weight) {
    if (!weight) return null;
    const dose = option.dose || {};

    if (dose.type === 'sequence') {
      return {
        text:dose.steps.map(step => `${step.label}: ${fmt(cap(step.value * weight, step.maxDose).value)} mg/ditë`).join(' · '),
        working:'Doza është e shprehur për ditë; nuk shumëzohet përsëri me frekuencën.',
      };
    }

    if (dose.type === 'combo') {
      const rows = [];
      const workings = [];
      dose.parts.forEach(part => {
        const perDose = calculateSimple(part.dose, weight);
        const perDay = dosesPerDayFromFrequency(part.frequency);
        if (!perDose || !perDay || typeof perDay !== 'number') return;
        const daily = { min:perDose.min * perDay, max:perDose.max * perDay };
        rows.push(`${part.drug}: ${rangeText(daily, part.dose, 'ditë')}`);
        workings.push(`${part.drug}: ${rangeText(perDose, part.dose)} × ${perDay}/ditë`);
      });
      return rows.length ? { text:rows.join(' + '), working:workings.join(' · ') } : null;
    }

    const perDose = calculateSimple(dose, weight);
    const perDay = dosesPerDayFromFrequency(option.frequency);
    if (!perDose || !perDay) return null;

    if (typeof perDay === 'number') {
      const daily = { min:perDose.min * perDay, max:perDose.max * perDay, capped:false };
      return {
        text:rangeText(daily, dose, 'ditë'),
        working:`${rangeText(perDose, dose)} × ${perDay} herë/ditë`,
      };
    }

    const daily = { min:perDose.min * perDay.min, max:perDose.max * perDay.max, capped:false };
    return {
      text:rangeText(daily, dose, 'ditë'),
      working:`${rangeText(perDose, dose)} × ${perDay.min}–${perDay.max} herë/ditë`,
    };
  }

  function calculationSteps(option, weight) {
    if (!weight) return [];
    const dose = option.dose || {};
    const kg = `${fmt(weight)} kg`;

    if (dose.type === 'single' || dose.type === 'range') {
      const values = dose.type === 'single' ? [dose.value] : [dose.min, dose.max];
      const raw = values.map(v => v * weight);
      const source = values.length === 1 ? `${fmt(values[0])} mg/kg × ${kg}` : `${fmt(values[0])}–${fmt(values[1])} mg/kg × ${kg}`;
      const result = raw.length === 1 ? `${fmt(raw[0])} mg/dozë` : `${fmt(raw[0])}–${fmt(raw[1])} mg/dozë`;
      const steps = [`${source} = ${result}`];
      if (Number.isFinite(dose.maxDose) && Math.max(...raw) > dose.maxDose) steps.push(`kufizuar në maks. ${fmt(dose.maxDose)} mg/dozë nga burimi`);
      return steps;
    }

    if (dose.type === 'sequence') {
      return dose.steps.map(step => {
        const raw = step.value * weight;
        const capped = Number.isFinite(step.maxDose) && raw > step.maxDose;
        return `${step.label}: ${fmt(step.value)} mg/kg × ${kg} = ${fmt(raw)} mg${capped ? ` → maks. ${fmt(step.maxDose)} mg` : ''}`;
      });
    }

    if (dose.type === 'combo') {
      return dose.parts.flatMap(part => {
        const tempOption = { dose:part.dose, frequency:part.frequency };
        return calculationSteps(tempOption, weight).map(step => `${part.drug}: ${step}`);
      });
    }

    return [];
  }

  function durationText(option) {
    const duration = option.duration || {};
    if (duration.type === 'fixed') return duration.text;
    if (duration.type === 'age-bands') {
      const age = currentAgeBand();
      let text = '';
      if (!age) {
        const parts = (duration.bands || []).map((band, index) => {
          const start = index === 0 ? 0 : duration.bands[index - 1].maxMonths;
          return `${start ? `≥${Math.round(start / 12)} vjeç dhe ` : ''}<${Math.round(band.maxMonths / 12)} vjeç: ${band.text}`;
        });
        parts.push(`më i madh: ${duration.defaultText}`);
        text = parts.join(' · ');
      } else {
        const band = (duration.bands || []).find(item => age.months < item.maxMonths);
        text = band ? band.text : duration.defaultText;
      }
      return duration.severeText ? `${text} · ${duration.severeText}` : text;
    }
    return '—';
  }

  function allergyAllowed(option) {
    const list = option.allergy || [];
    return list.includes('any') || list.includes(ctx.allergy);
  }

  function visibleOptions(indication) {
    let filtered = indication.options.filter(allergyAllowed);

    // CDC separates the pediatric Penicillin V regimen from adolescent/adult
    // dosing. The dataset stores the pediatric 250 mg BID/TID row, therefore we
    // only expose it when a child age-band is actually known. At 12+ (or when
    // age is unknown) amoxicillin remains available, but the child Penicillin V
    // row is withheld rather than silently under-dosing an adolescent.
    if (indication.id === 'gas') {
      const age = currentAgeBand();
      filtered = filtered.filter(option => option.id !== 'penicillin-gas' || (age && age.months < 144));
    }

    if (indication.id === 'pneumonia') {
      return filtered.filter(option => ctx.atypical ? option.atypical === true : option.atypical !== true);
    }
    return filtered;
  }

  function eligibilityProblem(indication) {
    if (!Number.isFinite(indication.minAgeMonths)) return '';
    const age = currentAgeBand();
    const threshold = indication.minAgeMonths < 12 ? `${indication.minAgeMonths} muaj` : `${Math.round(indication.minAgeMonths / 12)} vjeç`;
    if (!age) return `Zgjidh moshën për të kontrolluar pragun e kësaj skeme (≥${threshold}).`;
    if (age.months >= indication.minAgeMonths) return '';
    return `Kjo skemë ambulatore kërkon moshën ≥${threshold}. Për moshën e zgjedhur nevojitet vlerësim tjetër klinik / eskalim.`;
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
      label.title = option.hint || option.label;
      label.append(input, make('span', '', option.label));
      container.append(label);
    });
  }

  function buildIndicationChips() {
    buildChoice(
      el.indicationChoice,
      'abx-indication',
      guide.indications.map(item => ({ value:item.id, label:item.short || item.label, hint:item.label })),
      ctx.indication,
      value => { ctx.indication = value; render(); },
      'abx-chip',
    );
  }

  function buildAllergySegments() {
    el.allergyChoice.style.flexWrap = 'wrap';
    el.allergyChoice.style.maxWidth = '100%';
    buildChoice(el.allergyChoice, 'abx-allergy', allergyOptions, ctx.allergy, value => {
      ctx.allergy = value;
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

  function renderAgeHint(indication) {
    const age = currentAgeBand();
    const required = Number.isFinite(indication.minAgeMonths) || indication.options.some(option => option.duration?.type === 'age-bands');
    const derived = Boolean(age) && ctx.ageFromWeight;
    el.ageOptional.textContent = derived ? '— nga pesha' : required ? '— e nevojshme' : '— opsionale';
    el.age.classList.toggle('is-required', required && !age);
    el.age.dataset.source = derived ? 'weight' : 'chosen';
    if (!age) {
      el.ageHint.textContent = required
        ? 'Mosha nevojitet për pragun ose kohëzgjatjen. Nëse vendoset nga pesha, korrigjoje nëse mosha reale është tjetër.'
        : 'Mosha përdoret për peshën referuese dhe kufijtë klinikë.';
      return;
    }
    el.ageHint.textContent = derived
      ? `Vendosur automatikisht nga pesha ${fmt(weightState().value)} kg. Ndryshoje nëse mosha reale është tjetër.`
      : `CARPA/WBM: peshë referuese ${age.referenceWeightLabel}.`;
  }

  function renderAgeSuggestion() {
    if (!el.ageSuggestion) return;
    const state = weightState();
    const suggestion = state.kind === 'valid' ? nearestAgeBand(state.value) : null;
    const chosen = currentAgeBand();
    if (!suggestion || ctx.ageFromWeight || (chosen && chosen.id === suggestion.id)) {
      el.ageSuggestion.hidden = true;
      el.ageSuggestion.replaceChildren();
      return;
    }
    el.ageSuggestion.hidden = false;
    el.ageSuggestion.replaceChildren();
    const copy = chosen
      ? `Mosha e zgjedhur është ${chosen.label.toLocaleLowerCase('sq')}; ${fmt(state.value)} kg afrohet me bandën ${suggestion.label.toLocaleLowerCase('sq')}. Zgjedhja jote mbetet.`
      : `${fmt(state.value)} kg afrohet me bandën ${suggestion.label.toLocaleLowerCase('sq')} sipas peshës referuese.`;
    el.ageSuggestion.append(make('span', 'abx-age-suggestion-copy', copy));
  }

  function renderWeightHint() {
    const state = weightState();
    if (state.kind === 'valid') {
      el.weight.setAttribute('aria-invalid', 'false');
      el.weightHint.textContent = 'Pesha reale përdoret për llogaritjen matematikore të mg/dozë.';
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

  function ensureOrbitalRedFlagsControl() {
    let wrap = $('orbitalRedFlagsWrap');
    if (wrap) return wrap;

    wrap = make('div', 'abx-refine-item abx-refine-toggle');
    wrap.id = 'orbitalRedFlagsWrap';
    const label = make('label', 'abx-toggle');
    const input = document.createElement('input');
    input.id = 'orbitalRedFlagsInput';
    input.type = 'checkbox';
    input.checked = ctx.orbitalRedFlags;
    input.addEventListener('change', () => {
      ctx.orbitalRedFlags = input.checked;
      render();
    });
    label.append(input, make('span', '', 'Ka red flags orbitale / ekzaminim jo adekuat'));
    wrap.append(label);
    el.refineBlock.append(wrap);
    return wrap;
  }

  function renderConditionalControls(indication) {
    const usesAllergy = indication.usesAllergy !== false;
    el.allergyField.hidden = !usesAllergy;
    el.atypicalWrap.hidden = indication.id !== 'pneumonia';
    if (el.utiTypeWrap) el.utiTypeWrap.hidden = true;

    const orbitalWrap = ensureOrbitalRedFlagsControl();
    const orbitalInput = $('orbitalRedFlagsInput');
    orbitalWrap.hidden = indication.id !== 'preseptal';
    if (orbitalInput) orbitalInput.checked = ctx.orbitalRedFlags;

    el.refineBlock.hidden = el.allergyField.hidden && el.atypicalWrap.hidden && orbitalWrap.hidden;

    let hint = $('allergyHintPhase2');
    if (!hint) {
      hint = make('p', 'abx-hint');
      hint.id = 'allergyHintPhase2';
      el.allergyField.append(hint);
    }
    const bucket = allergyById(ctx.allergy);
    hint.textContent = bucket?.note || '';
    hint.hidden = !usesAllergy;
  }

  function doseRow(label, value, basisKind, role) {
    const row = make('div', 'abx-dose-row');
    row.dataset.role = role;
    row.append(make('span', 'abx-dose-row-label', label), make('strong', 'abx-dose-row-value', value));
    row.dataset.basis = basisKind;
    return row;
  }

  function recommendationCard(option, basis) {
    const card = make('article', `abx-option tier-${option.tier || 'option'}`);
    const head = make('div', 'abx-option-head');
    head.append(make('h3', '', option.drug), make('span', 'abx-tier', tierLabels[option.tier] || 'Opsion'));

    const dose = make('div', 'abx-option-dose');
    const value = calculatedValue(option, basis.weight);
    if (value) {
      if (basis.label) {
        const basisLine = make('span', 'abx-dose-basis', basis.label);
        basisLine.dataset.basis = basis.kind;
        dose.append(basisLine);
      }
      const rows = make('div', 'abx-dose-rows');
      rows.append(doseRow(option.kind === 'procedure' ? 'Veprimi' : 'Doza e vetme', value, basis.kind, 'single'));
      const daily = dailyDose(option, basis.weight);
      if (daily) rows.append(doseRow('Doza ditore', daily.text, basis.kind, 'daily'));
      dose.append(rows);

      const steps = calculationSteps(option, basis.weight);
      if (daily?.working) steps.push(daily.working);
      if (steps.length) {
        const working = make('div', 'abx-dose-working');
        working.append(make('span', 'abx-dose-working-label', 'Si llogaritet'));
        steps.forEach(step => working.append(make('span', 'abx-dose-step', step)));
        dose.append(working);
      }
      dose.append(make('span', 'abx-dose-formula', formulaText(option)));
      if (!daily && !option.frequencyNotComputable && !['fixed','combo'].includes(option.dose?.type) && option.kind !== 'procedure') {
        dose.append(make('span', 'abx-dose-note', 'Doza ditore nuk llogaritet automatikisht për këtë formulim/frekuencë.'));
      }
      if (option.frequencyNotComputable) {
        dose.append(make('span', 'abx-dose-note', 'Frekuenca ndryshon sipas moshës; kontrollo moshën reale para përshkrimit.'));
      }
    } else {
      dose.append(make('strong', 'abx-dose-formula-lead', formulaText(option)));
      if (option.dose?.type !== 'fixed') dose.append(make('span', 'abx-dose-formula', 'Shkruaj peshën reale ose zgjidh moshën për llogaritje orientuese.'));
    }

    const meta = make('div', 'abx-option-meta');
    const source = sourceById(option.source);
    meta.append(
      make('span', '', `${option.route || 'PO'} · ${option.frequency || '—'}`),
      make('span', 'abx-duration', durationText(option)),
      make('span', '', source?.short || 'Burim'),
    );

    card.append(head, dose, meta);
    if (option.conditional) card.append(make('p', 'abx-option-note', `Kur përdoret: ${option.conditional}`));
    if (option.note) card.append(make('p', 'abx-option-note', option.note));
    if (option.stewardship) card.append(make('p', 'abx-option-note', `Stewardship: ${option.stewardship}`));
    return card;
  }

  function renderSources(indication) {
    el.sourceList.replaceChildren();
    const sourceIds = new Set([indication.source, 'chop-allergy-2025', 'carpa']);
    indication.options.forEach(option => { if (option.source) sourceIds.add(option.source); });

    guide.sources.filter(source => sourceIds.has(source.id)).forEach(source => {
      const row = make('article', `abx-source${source.id === indication.source ? ' is-active' : ''}`);
      const copy = make('div', '');
      copy.append(make('strong', '', source.title), make('span', '', source.note));
      if (source.url) {
        const link = make('a', '', 'Hap burimin');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        copy.append(link);
      }
      const badgeText = source.id === indication.source
        ? 'BURIMI KRYESOR'
        : source.id === 'chop-allergy-2025'
          ? 'ALERGJIA'
          : source.id === 'carpa'
            ? 'PESHË REF.'
            : 'BURIM REGJIMI';
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
      ctx.atypical = stored.atypical === true;
      ctx.orbitalRedFlags = stored.orbitalRedFlags === true;
      ctx.ageFromWeight = stored.ageFromWeight === true;
    }
    const requested = new URLSearchParams(location.search).get('indication');
    if (requested && guide.indications.some(item => item.id === requested)) ctx.indication = requested;
  }

  function render() {
    const indication = currentIndication();
    const problem = eligibilityProblem(indication);

    renderConditionalControls(indication);
    renderAgeHint(indication);
    renderWeightHint();
    renderAgeSuggestion();
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

    if (indication.warning) {
      const warning = make('div', 'abx-eligibility', indication.warning);
      warning.dataset.kind = indication.warning.startsWith('HARD STOP') ? 'hard-stop' : 'clinical-warning';
      el.list.append(warning);
    }

    // This is a real safety gate, not warning copy: when orbital red flags (or
    // an inadequate eye exam) are marked, no outpatient antibiotic regimen is
    // rendered. The clinician is sent to urgent/specialist assessment instead.
    if (indication.id === 'preseptal' && ctx.orbitalRedFlags) {
      el.list.append(make('div', 'abx-empty', 'STOP — mos përdor skemë ambulatore nga ky kalkulator. Kërko vlerësim urgjent / oftalmologji-ORL-pediatri sipas kontekstit.'));
      return;
    }

    const options = visibleOptions(indication);
    if (!options.length) {
      const bucket = allergyById(ctx.allergy);
      const text = ctx.allergy === 'a5'
        ? 'Alergji ndaj alternativës / alergji të shumëfishta: DRx nuk bën zëvendësim automatik. Specifiko klasën konkrete dhe verifiko një regjim për këtë diagnozë.'
        : `Nuk ka regjim të verifikuar për këtë kombinim${bucket ? ` (${bucket.short})` : ''}.`;
      el.list.append(make('div', 'abx-empty', text));
      return;
    }

    const basis = doseBasis();
    if (basis.kind === 'reference') {
      el.list.append(make('p', 'abx-orientational-note', 'Dozat numerike më poshtë përdorin peshën referuese të moshës dhe janë vetëm orientuese. Pesha reale duhet përdorur për dozën përfundimtare.'));
    }
    options.forEach(option => el.list.append(recommendationCard(option, basis)));
  }

  function applyAgeFromWeight() {
    const state = weightState();
    if (state.kind !== 'valid') {
      if (ctx.ageFromWeight) {
        ctx.age = '';
        ctx.ageFromWeight = false;
        el.age.value = '';
      }
      return;
    }
    const band = nearestAgeBand(state.value);
    if (!band) return;
    ctx.age = band.id;
    ctx.ageFromWeight = true;
    el.age.value = band.id;
  }

  function bind() {
    el.age.addEventListener('change', () => {
      ctx.age = el.age.value;
      ctx.ageFromWeight = false;
      render();
    });
    el.weight.addEventListener('input', () => {
      ctx.weight = el.weight.value;
      applyAgeFromWeight();
      render();
    });
    el.atypical.addEventListener('change', () => {
      ctx.atypical = el.atypical.checked;
      render();
    });
  }

  restoreContext();
  populateAges();
  el.age.value = ctx.age;
  el.weight.value = ctx.weight;
  el.atypical.checked = ctx.atypical;
  buildIndicationChips();
  buildAllergySegments();
  bind();
  render();
})();