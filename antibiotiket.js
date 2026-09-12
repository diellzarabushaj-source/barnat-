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
    allergy:$('allergySelect'),
    atypicalWrap:$('atypicalWrap'),
    atypical:$('atypicalInput'),
    utiTypeWrap:$('utiTypeWrap'),
    utiType:$('utiTypeSelect'),
    doseBasis:$('doseBasis'),
    eligibility:$('eligibilityMessage'),
    list:$('recommendationList'),
    sourceList:$('sourceList'),
  };

  const tierLabels = Object.freeze({
    first:'Zgjedhja e parë',
    second:'Zgjedhja e dytë',
    'allergy-nonsevere':'Alergji jo e rëndë',
    'allergy-severe':'Alergji e rëndë / alternativë',
    option:'Opsion empirik',
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

  function actualWeight() {
    const value = Number(String(el.weight.value || '').replace(',', '.'));
    return Number.isFinite(value) && value >= 1 && value <= 200 ? value : null;
  }

  function doseWeight() {
    const actual = actualWeight();
    if (actual) return { value:actual, source:'actual' };
    const age = currentAgeBand();
    if (age?.referenceWeightKg) return { value:age.referenceWeightKg, source:'reference' };
    return { value:null, source:'none' };
  }

  function maxText(dose) {
    if (!dose?.maxDose) return '';
    return dose.maxLabel || `maks. ${fmt(dose.maxDose)} mg/dozë`;
  }

  function formulaText(option) {
    const dose = option.dose || {};
    const frequency = clean(option.frequency);
    if (dose.type === 'range') {
      const component = dose.component ? `, sipas ${dose.component}` : '';
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

  function clampDose(value, max) {
    return max ? Math.min(value, max) : value;
  }

  function calculatedText(option, weightInfo) {
    const weight = weightInfo.value;
    const dose = option.dose || {};
    if (!weight) return '';
    const prefix = weightInfo.source === 'reference' ? '≈ ' : '';

    if (dose.type === 'range') {
      const low = clampDose(dose.min * weight, dose.maxDose);
      const high = clampDose(dose.max * weight, dose.maxDose);
      return low === high
        ? `${prefix}${fmt(low)} mg/dozë`
        : `${prefix}${fmt(low)}–${fmt(high)} mg/dozë`;
    }
    if (dose.type === 'single') {
      return `${prefix}${fmt(clampDose(dose.value * weight, dose.maxDose))} mg/dozë`;
    }
    if (dose.type === 'sequence') {
      return dose.steps.map(step => `${step.label}: ${prefix}${fmt(clampDose(step.value * weight, step.maxDose))} mg`).join(' · ');
    }
    if (dose.type === 'weight-threshold') {
      return weight < dose.thresholdKg ? dose.below : dose.atOrAbove;
    }
    if (dose.type === 'amoxclav-uti') {
      if (weight >= 35) return '500/125 mg 3×/ditë ose 875/125 mg 2×/ditë';
      const low = Math.min(15 * weight, 500);
      const high = Math.min(20 * weight, 500);
      return `${prefix}${fmt(low)}–${fmt(high)} mg amoxicillin/dozë`;
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

  function renderAgeHint() {
    const age = currentAgeBand();
    if (!age) {
      el.ageHint.textContent = 'Peshat referuese vijnë nga tabela CARPA STM/WBM.';
      return;
    }
    el.ageHint.textContent = `Pesha referuese e tabelës: ${fmt(age.referenceWeightKg)} kg.`;
  }

  function renderDoseBasis() {
    const weight = doseWeight();
    if (weight.source === 'actual') {
      el.doseBasis.textContent = `Peshë reale ${fmt(weight.value)} kg`;
      el.weightHint.textContent = 'Llogaritja po përdor peshën reale të pacientit.';
      return;
    }
    if (weight.source === 'reference') {
      el.doseBasis.textContent = `Referencë ${fmt(weight.value)} kg`;
      el.weightHint.textContent = 'Nuk ka peshë reale; llogaritja përdor peshën referuese CARPA/WBM.';
      return;
    }
    el.doseBasis.textContent = 'Pa peshë';
    el.weightHint.textContent = 'Vendos peshën reale për llogaritje mg/dozë.';
  }

  function eligibilityProblem(indication) {
    const age = currentAgeBand();
    if (!age || !Number.isFinite(indication.minAgeMonths)) return '';
    if (age.months >= indication.minAgeMonths) return '';
    const threshold = indication.minAgeMonths === 3 ? '3 muaj' : indication.minAgeMonths === 6 ? '6 muaj' : `${indication.minAgeMonths} muaj`;
    return `Ky burim e kufizon këtë skemë në moshën ≥${threshold}. Për moshën e zgjedhur nuk po shfaqet skemë automatike.`;
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function recommendationCard(option, weightInfo) {
    const card = make('article', 'recommendation-card');
    const main = make('div', 'rec-main');
    main.append(
      make('span', 'rec-tier', tierLabels[option.tier] || 'Opsion'),
      make('h3', '', option.drug),
      make('p', '', `${option.route || 'PO'} · ${option.frequency || '—'}`)
    );

    const dose = make('div', 'rec-dose');
    dose.append(make('strong', '', formulaText(option)));
    const calculated = calculatedText(option, weightInfo);
    if (calculated) dose.append(make('span', 'calculated-dose', calculated));
    if (weightInfo.source === 'reference' && calculated) {
      dose.append(make('small', '', 'Llogaritje orientuese me peshën referuese të tabelës; pesha reale ka përparësi.'));
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
      const row = make('div', 'source-item');
      const copy = make('div', '');
      copy.append(make('strong', '', source.title), make('span', '', source.note));
      const badge = make('b', 'source-badge', source.id === indication.source ? 'DOZA / INDIKACIONI' : 'PESHA REFERUESE');
      row.append(copy, badge);
      el.sourceList.append(row);
    });
  }

  function render() {
    const indication = currentIndication();
    const problem = eligibilityProblem(indication);
    const weightInfo = doseWeight();

    el.atypicalWrap.hidden = indication.id !== 'pneumonia';
    el.utiTypeWrap.hidden = indication.id !== 'uti';
    renderAgeHint();
    renderDoseBasis();
    renderSources(indication);

    el.eligibility.hidden = !problem;
    el.eligibility.textContent = problem;
    el.list.replaceChildren();

    if (problem) return;

    const options = visibleOptions(indication);
    if (!options.length) {
      el.list.append(make('div', 'empty-state', 'Nuk ka opsion të specifikuar në burim për këtë kombinim.'));
      return;
    }

    options.forEach(option => el.list.append(recommendationCard(option, weightInfo)));
  }

  function populate() {
    guide.indications.forEach(indication => {
      const option = document.createElement('option');
      option.value = indication.id;
      option.textContent = indication.label;
      el.indication.append(option);
    });
    guide.ageBands.forEach(age => {
      const option = document.createElement('option');
      option.value = age.id;
      option.textContent = `${age.label} · ref. ${fmt(age.referenceWeightKg)} kg`;
      el.age.append(option);
    });
  }

  [el.indication, el.age, el.allergy, el.utiType].forEach(node => node.addEventListener('change', render));
  el.weight.addEventListener('input', render);
  el.atypical.addEventListener('change', render);

  populate();
  render();
})();
