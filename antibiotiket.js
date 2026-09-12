(() => {
  'use strict';

  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  if (!guide) return;

  const $ = id => document.getElementById(id);
  const el = {
    indication:$('indicationSelect'),
    age:$('ageSelect'),
    ageHint:$('ageHint'),
    weight:$('weightInput'),
    weightHint:$('weightHint'),
    allergyField:$('allergyField'),
    allergy:$('allergySelect'),
    atypicalWrap:$('atypicalWrap'),
    atypical:$('atypicalInput'),
    utiTypeWrap:$('utiTypeWrap'),
    utiType:$('utiTypeSelect'),
    doseBasis:$('doseBasis'),
    selectionSummary:$('selectionSummary'),
    activeSource:$('activeSource'),
    eligibility:$('eligibilityMessage'),
    list:$('recommendationList'),
    sourceList:$('sourceList'),
  };

  const tierLabels = Object.freeze({
    first:'Zgjedhja e parë',
    second:'Zgjedhja e dytë',
    'allergy-nonsevere':'Alergji jo kërcënuese për jetën',
    'allergy-severe':'Alergji kërcënuese për jetën / alternativë',
    option:'Opsion i tabelës',
  });

  const allergyLabels = Object.freeze({
    none:'Pa alergji ndaj penicilinës',
    nonsevere:'Alergji jo kërcënuese për jetën',
    severe:'Alergji kërcënuese për jetën',
  });

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fmt = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ',');
  };

  function currentIndication() {
    return guide.indications.find(item => item.id === el.indication.value) || guide.indications[0];
  }

  function currentAgeBand() {
    return guide.ageBands.find(item => item.id === el.age.value) || null;
  }

  function weightState() {
    const raw = clean(el.weight.value).replace(',', '.');
    if (!raw) return { kind:'empty', value:null };
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 1 || value > 200) return { kind:'invalid', value:null };
    return { kind:'valid', value };
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

  function calculatedText(option, weight) {
    if (!weight) return '';
    const dose = option.dose || {};
    const label = `Për ${fmt(weight)} kg: `;

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

  function durationText(option) {
    const duration = option.duration || {};
    if (duration.type === 'fixed') return duration.text;
    if (duration.type === 'source-unspecified') return 'Nuk specifikohet në tabelë';
    if (duration.type === 'uti') return el.utiType.value === 'febrile' ? '7–10 ditë' : '3 ditë';
    if (duration.type === 'age') {
      const age = currentAgeBand();
      if (!age) return `<2 vjeç: ${duration.underText} · ≥2 vjeç: ${duration.otherText}`;
      return age.months < duration.underMonths ? duration.underText : duration.otherText;
    }
    return '—';
  }

  function visibleOptions(indication) {
    if (indication.id === 'uti') return indication.options;
    if (indication.id === 'pneumonia' && el.atypical.checked) {
      return indication.options.filter(option => option.atypical);
    }
    const allergy = el.allergy.value;
    return indication.options.filter(option => (option.allergy || []).includes(allergy) || (option.allergy || []).includes('any'));
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

  function renderAgeHint() {
    const age = currentAgeBand();
    if (!age) {
      el.ageHint.textContent = 'Mosha përdoret për kufijtë e burimit dhe kohëzgjatjen kur aplikohet.';
      return;
    }
    el.ageHint.textContent = `CARPA/WBM: peshë referuese ${age.referenceWeightLabel}. Nuk përdoret automatikisht për llogaritjen e dozës.`;
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
    el.weightHint.textContent = 'Pa peshë reale shfaqet formula e burimit, jo një dozë e llogaritur.';
  }

  function renderDoseBasis() {
    const state = weightState();
    el.doseBasis.textContent = state.kind === 'valid' ? `Peshë reale ${fmt(state.value)} kg` : 'Formula e burimit';
  }

  function renderConditionalControls(indication) {
    el.allergyField.hidden = indication.usesAllergy === false;
    el.atypicalWrap.hidden = indication.id !== 'pneumonia';
    el.utiTypeWrap.hidden = indication.id !== 'uti';
  }

  function renderSelectionSummary(indication) {
    const age = currentAgeBand();
    const weight = weightState();
    const pieces = [indication.short || indication.label];
    if (age) pieces.push(age.label);
    if (weight.kind === 'valid') pieces.push(`${fmt(weight.value)} kg`);
    if (indication.usesAllergy !== false) pieces.push(allergyLabels[el.allergy.value] || 'Alergjia e paspecifikuar');
    if (indication.id === 'pneumonia' && el.atypical.checked) pieces.push('dyshim për atipike');
    if (indication.id === 'uti') pieces.push(el.utiType.value === 'febrile' ? 'UTI febrile' : 'UTI jo febrile');
    el.selectionSummary.textContent = pieces.join(' · ');

    const source = sourceById(indication.source);
    el.activeSource.textContent = source ? source.short : 'Burim';
  }

  function recommendationCard(option, actualWeight) {
    const card = make('article', `recommendation-card tier-${option.tier || 'option'}`);

    const main = make('div', 'rec-main');
    main.append(
      make('span', 'rec-tier', tierLabels[option.tier] || 'Opsion i tabelës'),
      make('h3', '', option.drug),
      make('p', '', `${option.route || 'PO'} · ${option.frequency || '—'}`)
    );

    const dose = make('div', 'rec-dose');
    dose.append(make('strong', '', formulaText(option)));
    const calculated = calculatedText(option, actualWeight);
    if (calculated) {
      dose.append(make('span', 'calculated-dose', calculated));
    } else {
      dose.append(make('small', 'dose-helper', 'Vendos peshën reale për të llogaritur mg/dozë.'));
    }

    const duration = make('div', 'rec-duration');
    duration.append(make('span', '', 'Kohëzgjatja'), make('strong', '', durationText(option)));

    card.append(main, dose, duration);
    if (option.note) card.append(make('p', 'rec-source-note', option.note));
    return card;
  }

  function renderSources(indication) {
    el.sourceList.replaceChildren();
    guide.sources.forEach(source => {
      const row = make('article', `source-item${source.id === indication.source ? ' is-active' : ''}`);
      const copy = make('div', '');
      copy.append(make('strong', '', source.title), make('span', '', source.note));
      const badgeText = source.id === indication.source ? 'BURIMI I SKEMËS' : 'PESHË REFERUESE';
      row.append(copy, make('b', 'source-badge', badgeText));
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

  function render() {
    const indication = currentIndication();
    const problem = eligibilityProblem(indication);
    const weight = weightState();

    renderConditionalControls(indication);
    renderAgeHint();
    renderWeightHint();
    renderDoseBasis();
    renderSelectionSummary(indication);
    renderSources(indication);
    syncIndicationInUrl(indication);

    el.eligibility.hidden = !problem;
    el.eligibility.textContent = problem;
    el.list.replaceChildren();

    if (problem) return;

    const options = visibleOptions(indication);
    if (!options.length) {
      el.list.append(make('div', 'empty-state', 'Ky kombinim nuk ka skemë të specifikuar në tabelën burimore.'));
      return;
    }

    const actualWeight = weight.kind === 'valid' ? weight.value : null;
    options.forEach(option => el.list.append(recommendationCard(option, actualWeight)));
  }

  function populate() {
    const requested = new URLSearchParams(location.search).get('indication');
    guide.indications.forEach(indication => {
      const option = document.createElement('option');
      option.value = indication.id;
      option.textContent = indication.label;
      el.indication.append(option);
    });
    if (requested && guide.indications.some(item => item.id === requested)) el.indication.value = requested;

    guide.ageBands.forEach(age => {
      const option = document.createElement('option');
      option.value = age.id;
      option.textContent = `${age.label} · ref. ${age.referenceWeightLabel}`;
      el.age.append(option);
    });
  }

  [el.indication, el.age, el.allergy, el.utiType].forEach(node => node.addEventListener('change', render));
  el.weight.addEventListener('input', render);
  el.atypical.addEventListener('change', render);

  populate();
  render();
})();
