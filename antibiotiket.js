(() => {
  'use strict';

  const guide = window.DRX_ANTIBIOTIC_GUIDE;
  if (!guide) return;

  const STATE_KEY = 'drx.antibiotics.context.v3-real-age';
  const protocols = window.DRX_PENICILLIN_PROTOCOLS;
  const weightAges = window.DRxPediatricWeightAge;
  const $ = id => document.getElementById(id);
  const el = {
    indicationChoice:$('indicationChoice'),
    age:$('ageSelect'),
    ageOptional:$('ageOptional'),

    weight:$('weightInput'),
    contextHint:$('contextHint'),
    refineBlock:$('refineBlock'),
    allergyField:$('allergyField'),
    allergyChoice:$('allergyChoice'),
    indicationPicker:$('indicationPicker'),
    indicationCurrent:$('indicationCurrent'),
    allergyPicker:$('allergyPicker'),
    allergyCurrent:$('allergyCurrent'),
    atypicalWrap:$('atypicalWrap'),
    atypical:$('atypicalInput'),
    utiTypeWrap:$('utiTypeWrap'),
    ageSuggestion:$('ageSuggestion'),
    resultsTitle:$('resultsTitle'),
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
    ageConfirmed:false,
    cephLowRiskConfirmed:false,
    pregnant:false,
    cultureSusceptible:false,
    aomPlan:'immediate',
    aomRisk:'routine',
    aomFailure:false,
    utiFluoro:false,utiSex:'',utiEgfr:'',utiAtTerm:false,utiAlternative:false,utiUpper:false,utiUrgent:false,utiCephTimes:2,
    gasPenicillinSource:'nice',
    gasConfirmed:false,
    gasUrgent:false,
    gasSchedule:'qds',
    gasAmoxSchedule:'daily',
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
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',');
  };

  function currentIndication() {
    const base = guide.indications.find(item => item.id === ctx.indication) || guide.indications[0];
    return protocols ? protocols.resolve(base, protocolContext()) : base;
  }

  function currentAgeBand() {
    return guide.ageBands.find(item => item.id === ctx.age) || null;
  }

  function protocolContext() {
    return {ageMonths:currentAgeBand()?.months,ageConfirmed:ctx.ageConfirmed,weightKg:weightState().value,pregnant:ctx.pregnant,cultureSusceptible:ctx.cultureSusceptible,atypical:ctx.atypical,aomPlan:ctx.aomPlan,aomRisk:ctx.aomRisk,aomFailure:ctx.aomFailure,utiFluoro:ctx.utiFluoro,utiSex:ctx.utiSex,utiEgfr:ctx.utiEgfr===''?null:Number(ctx.utiEgfr),utiAtTerm:ctx.utiAtTerm,utiAlternative:ctx.utiAlternative,utiCephTimes:ctx.utiCephTimes,gasPenicillinSource:ctx.gasPenicillinSource,gasConfirmed:ctx.gasConfirmed,gasSchedule:ctx.gasSchedule,gasAmoxSchedule:ctx.gasAmoxSchedule};
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
    if (!protocols && age && Number.isFinite(age.referenceWeightKg)) {
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
    if (protocols) {
      const suggested = weightAges?.suggestMonth(weight);
      if (!suggested) return null;
      const months = suggested.months;
      const id = suggestedAgeId(months);
      return guide.ageBands.find(b => b.id === id) || null;
    }
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

  function suggestedAgeId(months) {
    // Match the unchanged month/year select to the closest reference age.
    // The map ends at 16+; weight alone never selects adulthood or 17 years.
    return months === 0 ? 'newborn' : months < 12 ? `${months}m` : `${Math.min(16,Math.round(months / 12))}y`;
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
      if (dose.dailyValue && dose.dividedDoses) return `${fmt(dose.dailyValue)} mg/kg/ditë ÷ ${dose.dividedDoses} doza${component}${frequency ? ` · ${frequency}` : ''}`;
      return `${fmt(dose.value)} ${dose.unit}${component}${frequency ? ` · ${frequency}` : ''}${Number.isFinite(dose.maxDose) ? ` · ${maxText(dose)}` : ''}`;
    }
    if (dose.type === 'sequence') {
      return dose.steps.map(step => `${step.label}: ${fmt(step.value)} ${dose.unit}${Number.isFinite(step.maxDose) ? ` (maks. ${fmt(step.maxDose)} mg)` : ''}`).join(' · ');
    }
    if (dose.type === 'fixed' || dose.type === 'weight-bands') return `${dose.text}${frequency ? ` · ${frequency}` : ''}`;
    if (dose.type === 'combo') {
      return dose.parts.map(part => `${part.drug}: ${formulaForDose(part.dose, part.frequency)}`).join(' + ');
    }
    return frequency || '—';
  }

  function formulaText(option) {
    return formulaForDose(option.dose || {}, clean(option.frequency));
  }

  function calculateSimple(dose, weight) {
    if (!dose) return null;
    if (dose.type === 'fixed' && Number.isFinite(dose.value)) return {min:dose.value,max:Number.isFinite(dose.maxValue)?dose.maxValue:dose.value,capped:false};
    if (!weight) return null;
    if (dose.type === 'weight-bands') {
      const value = weight < dose.thresholdKg ? dose.belowMg : dose.atOrAboveMg;
      return { min:value, max:value, capped:false };
    }
    if (dose.type === 'fixed' && Number.isFinite(dose.value)) {
      return { min:dose.value, max:dose.value, capped:false };
    }
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

  function rangeText(range, dose, suffix='dozë', format=fmt) {
    const component = componentLabel(dose);
    const value = range.min === range.max ? format(range.min) : `${format(range.min)}–${format(range.max)}`;
    return `${value} mg${component}/${suffix}${range.capped ? ' · kufiri maksimal i burimit' : ''}`;
  }

  function calculatedValue(option, weight, format=fmt) {
    const dose = option.dose || {};
    if (dose.type === 'fixed') {
      if (dose.text) return dose.text;
      if (Number.isFinite(dose.value)) return `${format(dose.value)} mg/dozë`;
      return '';
    }
    if (!weight) return '';
    const simple = calculateSimple(dose, weight);
    if (simple && dose.ratio) return `${format(simple.min)}/${format(simple.min/dose.ratio)} mg/dozë`;
    if (simple) return rangeText(simple, dose, 'dozë', format);

    if (dose.type === 'sequence') {
      return dose.steps.map(step => {
        const result = cap(step.value * weight, step.maxDose);
        return `${step.label}: ${format(result.value)} mg${result.capped ? ' (maks.)' : ''}`;
      }).join(' · ');
    }

    if (dose.type === 'fixed') return dose.text;

    if (dose.type === 'combo') {
      return dose.parts.map(part => {
        const result = calculateSimple(part.dose, weight);
        const text = result ? rangeText(result, part.dose, 'dozë', format) : formulaForDose(part.dose, part.frequency);
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

  function doseLimits(option,weight=null) {
    const dose=option.dose||{};
    if(dose.type==='combo')return dose.parts.flatMap(part=>doseLimits(part,weight).map(line=>`${part.drug}: ${line}`));
    if(dose.type==='sequence')return dose.steps.filter(step=>Number.isFinite(step.maxDose)).map(step=>`${step.label}: ${fmt(weight?Math.min(step.value*weight,step.maxDose):step.maxDose)} mg/ditë`);
    if(!Number.isFinite(dose.maxDose))return [];
    const maximum=weight?calculateSimple(dose,weight)?.max:dose.maxDose;
    if(!Number.isFinite(maximum))return [];
    const component=componentLabel(dose),perDay=dosesPerDayFromFrequency(clean(option.frequency));
    const administration=`${fmt(maximum)} mg${component}/dozë`;
    if(typeof perDay==='number')return [`${administration} · deri ${fmt(maximum*perDay)} mg${component}/24 orë (${perDay} marrje)`];
    if(perDay)return [`${administration} · ${fmt(maximum*perDay.min)}–${fmt(maximum*perDay.max)} mg${component}/24 orë (${perDay.min}–${perDay.max} marrje)`];
    return [administration];
  }

  function dailyDose(option, weight) {
    const dose = option.dose || {};
    if (!weight && dose.type !== 'fixed') return null;

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

    if (typeof perDay === 'number' && (dose.ratio || dose.secondComponent)) {
      const first = perDose.min * perDay;
      const second = dose.secondComponent !== undefined ? dose.secondComponent * perDay : first / dose.ratio;
      return {text:`${fmt(first)}/${fmt(second)} mg (amoxicillin/clavulanate)/ditë`,working:`${perDay} marrje/ditë; të dy komponentët ruhen.`};
    }
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

  function marketCeilings(option, weight) {
    const parts=option.dose?.type==='combo'?option.dose.parts:[option];
    return parts.map(part=>{
      const dose=part.dose||{},absoluteMg=value=>Number.isFinite(value)?value:null;
      const rows=dose.type==='sequence'
        ? dose.steps.map(step=>({label:step.label,mg:weight?cap(step.value*weight,step.maxDose).value:null,absoluteMg:absoluteMg(step.maxDose)}))
        : [{label:'',mg:calculateSimple(dose,weight)?.max??null,absoluteMg:absoluteMg(dose.maxDose)}];
      return {drug:part.drug,frequency:part.frequency,fixed:['fixed','weight-bands'].includes(dose.type),rows};
    });
  }

  function calculationSteps(option, weight) {
    if (!weight) return [];
    const dose = option.dose || {};
    const kg = `${fmt(weight)} kg`;
    if (dose.type === 'weight-bands') return [`${kg} ${weight < dose.thresholdKg ? '<' : '≥'} ${dose.thresholdKg} kg → ${fmt(calculateSimple(dose, weight).min)} mg/dozë. Dozë fikse sipas pragut; nuk shumëzohet me kg.`];

    if (dose.type === 'single' || dose.type === 'range') {
      if (dose.dailyValue && dose.dividedDoses) return [`${fmt(dose.dailyValue)} mg/kg/ditë × ${kg} ÷ ${dose.dividedDoses} = ${fmt(dose.value * weight)} mg/dozë (shfaqje e rrumbullakosur; llogaritja ruan saktësinë).`];
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
    if (duration.type === 'fixed') return duration.severeText ? `${duration.text} · ${duration.severeText}` : duration.text;
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
    // A generic cephalosporin allergy does not establish tolerance to penicillins.
    // The 2022 practice parameter permits routine use only in the low-risk,
    // non-anaphylactic history; anaphylaxis/SCAR requires a separate assessment.
    if (ctx.allergy === 'a4' && (protocols?.isPenicillin(option.drug) || /amoxicillin|ampicillin|penicillin/i.test(option.drug)) && !ctx.cephLowRiskConfirmed) return false;
    const list = option.allergy || [];
    return list.includes('any') || list.includes(ctx.allergy);
  }

  function visibleOptions(indication) {
    let filtered = indication.options.filter(allergyAllowed);
    if (indication.id === 'gas' && protocols && !ctx.gasConfirmed) {
      filtered = filtered.filter(option => option.id !== 'amoxicillin-gas');
    }

    // CDC separates the pediatric Penicillin V regimen from adolescent/adult
    // dosing. The dataset stores the pediatric 250 mg BID/TID row, therefore we
    // only expose it when a child age-band is actually known. At 12+ (or when
    // age is unknown) amoxicillin remains available, but the child Penicillin V
    // row is withheld rather than silently under-dosing an adolescent.
    if (indication.id === 'gas' && !protocols) {
      const age = currentAgeBand();
      filtered = filtered.filter(option => option.id !== 'penicillin-gas' || (age && ctx.ageConfirmed && age.months < 144));
    }

    if (indication.id === 'pneumonia') {
      return filtered.filter(option => ctx.atypical || option.atypical !== true);
    }
    return filtered;
  }

  // An age threshold the source sets. Not knowing the age yet is not the same
  // as breaking the threshold: the first states the limit and still shows the
  // table, the second withholds a regimen the source does not cover.
  function eligibility(indication) {
    if(protocols && weightState().kind==='invalid')return {blocks:true,tone:'warn',text:'Pesha e shkruar nuk është valide. Shkruaj 1–200 kg ose hiqe për skemën fikse që nuk kërkon peshë.'};
    if (Number.isFinite(indication.minWeightKg)) {
      const state = weightState();
      if (state.kind === 'invalid') {
        return { blocks:true, tone:'warn', text:`Shkruaj një peshë reale valide për ta verifikuar pragun ≥${fmt(indication.minWeightKg)} kg të kësaj skeme.` };
      }
      if (state.kind === 'empty') {
        return { blocks:false, tone:'info', text:`Kjo skemë fikse vlen për pacientë ≥${fmt(indication.minWeightKg)} kg. Shkruaj peshën reale para finalizimit të recetës.` };
      }
      if (state.value < indication.minWeightKg) {
        return { blocks:true, tone:'warn', text:`Kjo skemë fikse 875/125 mg kërkon peshë ≥${fmt(indication.minWeightKg)} kg. Pesha e dhënë është ${fmt(state.value)} kg; përdor dozimin pediatrik sipas kg dhe formulimit.` };
      }
    }
    // This outpatient calculator deliberately excludes young infants. Its
    // routine schedules are not neonatal doses or a febrile-infant pathway.
    const minAgeMonths = Math.max(3, indication.minAgeMonths || 0);
    const age = currentAgeBand();
    const threshold = minAgeMonths < 12 ? `${minAgeMonths} muaj` : `${Math.round(minAgeMonths / 12)} vjeç`;
    if (!age || !ctx.ageConfirmed) {
      return { blocks:false, tone:'info', text:`Kjo skemë vlen për moshën ≥${threshold}. Konfirmo moshën reale; mosha e sugjeruar nga pesha nuk e konfirmon pragun.` };
    }
    if (age.months >= minAgeMonths) return null;
    return { blocks:true, tone:'warn', text:`Kjo skemë ambulatore kërkon moshën ≥${threshold}, ndërsa mosha e zgjedhur është ${age.label.toLocaleLowerCase('sq')}. Nevojitet vlerësim tjetër klinik / eskalim.` };
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

  // A phone has room for one decision at a time. Below this width the two
  // long pickers collapse to a row naming the current choice and reopen on a
  // tap; above it they are always open and the row is not rendered at all.
  const compact = window.matchMedia('(max-width:760px)');

  function collapsePicker(picker) {
    if (picker && compact.matches) picker.open = false;
  }

  // On a wide screen the summary is a label, not a control — CSS makes it
  // unclickable, and this keeps a keyboard toggle from stranding the group shut.
  function pinPickerOpen(picker) {
    if (!picker) return;
    picker.addEventListener('toggle', () => {
      if (!compact.matches && !picker.open) picker.open = true;
    });
  }

  function syncPickers() {
    const indication = currentIndication();
    if (el.indicationCurrent) el.indicationCurrent.textContent = indication?.short || indication?.label || '—';
    const bucket = allergyById(ctx.allergy);
    if (el.allergyCurrent) el.allergyCurrent.textContent = bucket?.short || bucket?.label || '—';
    if (compact.matches) return;
    if (el.indicationPicker) el.indicationPicker.open = true;
    if (el.allergyPicker) el.allergyPicker.open = true;
  }

  function buildIndicationChips() {
    buildChoice(
      el.indicationChoice,
      'abx-indication',
      guide.indications.map(item => ({ value:item.id, label:item.short || item.label, hint:item.label })),
      ctx.indication,
      value => { ctx.utiFluoro=false;ctx.utiUpper=false;ctx.utiUrgent=false;ctx.utiAlternative=false;ctx.utiSex='';ctx.utiEgfr='';ctx.utiAtTerm=false;ctx.cultureSusceptible=false;ctx.aomPlan='immediate';ctx.aomRisk='routine';ctx.aomFailure=false;ctx.gasPenicillinSource='nice';ctx.gasConfirmed=false;ctx.gasUrgent=false;ctx.gasSchedule='qds';ctx.gasAmoxSchedule='daily';ctx.indication = value; collapsePicker(el.indicationPicker); render(); },
      'abx-chip',
    );
  }

  function buildAllergySegments() {
    buildChoice(el.allergyChoice, 'abx-allergy', allergyOptions, ctx.allergy, value => {
      ctx.allergy = value;
      ctx.gasPenicillinSource='nice';
      ctx.gasSchedule='qds';
      ctx.cephLowRiskConfirmed = false;
      collapsePicker(el.allergyPicker);
      render();
    }, 'abx-segment');
  }

  function populateAges() {
    guide.ageBands.forEach(age => {
      const option = document.createElement('option');
      option.value = age.id;
      // Short enough to survive a narrow select; the hint line explains that
      // the second figure is the band's reference weight.
      option.textContent = protocols ? age.label : `${age.label} · ${age.referenceWeightLabel}`;
      el.age.append(option);
    });
  }

  function renderAgeHint(indication) {
    const age = currentAgeBand();
    const required = Number.isFinite(indication.minAgeMonths) || indication.options.some(option => option.kind !== 'procedure' && option.route !== 'topike');
    const derived = Boolean(age) && ctx.ageFromWeight;
    el.ageOptional.textContent = derived ? '— nga pesha' : required ? '— e nevojshme' : '— opsionale';
    el.age.classList.toggle('is-required', required && !age);
    el.age.dataset.source = derived ? 'weight' : 'chosen';
  }

  function renderAgeSuggestion() {
    if (!el.ageSuggestion) return;
    if (protocols) {
      const age = currentAgeBand();
      const bands = weightAges?.monthlySuggestionBands() || [];
      const monthly = age && age.months < 216 ? bands.filter(b => suggestedAgeId(b.months) === (age.months >= 192 ? '16y' : age.id)) : [];
      el.ageSuggestion.replaceChildren();
      el.ageSuggestion.hidden = !age;
      if (!age) return;
      let text = 'Pesha nuk dallon një të rritur nga një adoleshent. Përdor moshën reale.';
      if (monthly.length) {
        const min = monthly[0].minKg, max = monthly[monthly.length - 1].maxKg;
        // Round outwards only for the explanatory label, never for matching.
        const lo = fmt(Math.floor(min * 100) / 100), hi = max == null ? '' : fmt(Math.ceil(max * 100) / 100);
        text = max == null
          ? `Peshë orientuese ≥${lo} kg · grupi 16+. Pesha nuk dallon 16, 17 dhe ≥18 vjeç.`
          : `Peshë orientuese ≈${lo}–${hi} kg për sugjerimin e moshës; nuk është interval normal i rritjes.`;
      }
      el.ageSuggestion.append(make('span','abx-age-suggestion-copy',text));
      return;
    }
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

  // One line, and only the one that matters right now: what the dose is being
  // computed from, and — when the weight filled the age in — that it did.
  function renderContextHint(indication) {
    const state = weightState();
    const age = currentAgeBand();
    const needsAge = Number.isFinite(indication.minAgeMonths)
      || indication.options.some(option => option.kind !== 'procedure' && option.route !== 'topike');

    if (state.kind === 'invalid') {
      el.weight.setAttribute('aria-invalid', 'true');
      el.contextHint.dataset.tone = 'error';
      el.contextHint.textContent = 'Shkruaj një peshë ndërmjet 1 dhe 200 kg.';
      return;
    }
    el.weight.setAttribute('aria-invalid', 'false');

    if (state.kind === 'valid') {
      el.contextHint.dataset.tone = 'live';
      el.contextHint.textContent = ctx.ageFromWeight && age
        ? `Peshë reale ${fmt(state.value)} kg. Mosha është sugjerim nga pesha — ${ctx.ageConfirmed ? 'e konfirmuar nga ti' : 'konfirmoje ose ndryshoje para llogaritjes'}.`
        : `Doza llogaritet nga ${fmt(state.value)} kg.`;
      return;
    }

    if (protocols) {
      el.contextHint.dataset.tone = 'idle';
      el.contextHint.textContent = age ? 'Mosha reale u zgjodh. Pesha nevojitet vetëm për dozat sipas kg ose kufizimet e produktit.' : 'Zgjidh moshën reale, përfshirë opsionin ≥18 vjeç. Pesha nuk përcakton moshën.';
      return;
    }
    if (age) {
      el.contextHint.dataset.tone = 'reference';
      el.contextHint.textContent = `Pa peshë reale, doza llogaritet nga pesha referuese ${age.referenceWeightLabel} (CARPA/WBM) — vetëm orientuese.`;
      return;
    }
    el.contextHint.dataset.tone = 'idle';
    el.contextHint.textContent = needsAge
      ? 'Shkruaj peshën për dozën në mg. Mosha vendos pragun dhe kohëzgjatjen — pesha e plotëson vetë.'
      : 'Shkruaj peshën për dozën në mg. Pa të shfaqet vetëm formula e burimit.';
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

  function renderAomControls(indication) {
    const panel=$('aomClinicalPanel');if(!panel)return;
    panel.hidden=indication.id!=='aom';if(panel.hidden)return;
    $('aomRiskSelect').value=ctx.aomRisk;
    const adult=currentAgeBand()?.months>=216;
    $('aomRiskSelect').options[1].textContent=adult?'Otorre — vlerësim individual':'Otorre / fëmijë nën 2 vjeç me AOM bilaterale';
    const advice=ctx.aomRisk==='urgent'?'Dyshim për komplikim → referim urgjent.'
      :ctx.aomRisk==='high'?'Rrezik i lartë · vlerëso nevojën për spital.'
      :adult?'Kur antibiotiku indikohet · dozat 18+: NHS Fife.'
      :ctx.aomRisk==='benefit'?'Kur antibiotiku indikohet · zgjedhja e parë: amoxicillin.'
      :'Kur antibiotiku indikohet · dozat <18 vjeç: NICE NG91.';
    $('aomAdvice').textContent=advice;
    $('aomFailureInput').checked=ctx.aomFailure;
    $('aomFailureInput').disabled=ctx.aomRisk==='urgent';
  }

  function renderGasControls(indication) {
    const panel=$('gasClinicalPanel');if(!panel)return;
    panel.hidden=indication.id!=='gas';if(panel.hidden)return;
    const penicillin=['none','a0','a4'].includes(ctx.allergy);
    const erythro=ctx.pregnant&&['a1','a2','a3'].includes(ctx.allergy)&&currentAgeBand()?.months>=96;
    const native=ctx.gasPenicillinSource==='ospen'&&penicillin;
    $('gasSourceBack').hidden=!native;
    $('gasScheduleWrap').hidden=native||!(penicillin||erythro);
    $('gasScheduleLabel').textContent=erythro?'Erythromycin · sa herë në ditë?':'Penicillin V · sa herë në ditë?';
    $('gasScheduleSelect').value=ctx.gasSchedule;
    $('gasConfirmedInput').checked=ctx.gasConfirmed;
    $('gasAmoxScheduleWrap').hidden=!(ctx.gasConfirmed&&penicillin);
    $('gasAmoxScheduleSelect').value=ctx.gasAmoxSchedule;
    $('gasUrgentInput').checked=ctx.gasUrgent;
    $('gasAdvice').textContent=ctx.gasUrgent?'Dyshim për komplikim → referim urgjent.'
      :native?'Penicillin V në IU · skema e produktit Ospen (SmPC).':penicillin?'Kur antibiotiku indikohet · zgjedhja e parë: Penicillin V · NICE NG84.'
      :erythro?'Alergji në shtatzëni · erythromycin kur indikohet · NICE NG84.'
      :'Alergji ndaj penicilinës · alternativat sipas NICE NG84.';
  }

  function renderUtiControls(indication){
    const panel=$('utiClinicalPanel');if(!panel)return;
    const on=indication.id.startsWith('uti-'),lower=indication.id==='uti-cystitis';panel.hidden=!on;if(!on)return;
    $('utiFluoroWrap').hidden=lower||ctx.pregnant||!(currentAgeBand()?.months>=192);$('utiFluoroInput').checked=ctx.utiFluoro;
    $('utiSexWrap').hidden=!lower||currentAgeBand()?.months<192||ctx.pregnant;
    $('utiSexSelect').value=ctx.utiSex;$('utiEgfrWrap').hidden=!lower;$('utiEgfrInput').value=ctx.utiEgfr;
    $('utiAtTermWrap').hidden=!lower||!ctx.pregnant;$('utiAtTermInput').checked=ctx.utiAtTerm;
    $('utiUpperWrap').hidden=!lower;$('utiUpperInput').checked=ctx.utiUpper;
    $('utiUrgentInput').checked=ctx.utiUrgent;$('utiAlternativeInput').checked=ctx.utiAlternative;
    $('utiCephWrap').hidden=lower||!(currentAgeBand()?.months>=144);$('utiCephSelect').value=String(ctx.utiCephTimes);
    $('utiAdvice').textContent=lower?'Cistit pa ethe · NICE NG109 · dozat sipas profilit të pacientit.':'UTI febrile / pielonefrit · NICE NG111 · vetëm kur trajtimi oral është i përshtatshëm.';
  }

  function renderConditionalControls(indication) {
    renderUtiControls(indication);
    renderAomControls(indication);
    renderGasControls(indication);
    const usesAllergy = indication.usesAllergy !== false;
    el.allergyField.hidden = !usesAllergy;
    el.atypicalWrap.hidden = indication.id !== 'pneumonia';
    if (el.utiTypeWrap) el.utiTypeWrap.hidden = true;
    const pregnancy=$('pregnancyInput');if(pregnancy)pregnancy.checked=ctx.pregnant;
    const culture=$('cultureSusceptibleInput');if(culture)culture.checked=ctx.cultureSusceptible;
    const cultureWrap=$('cultureSusceptibleWrap');if(cultureWrap)cultureWrap.hidden=!indication.id.startsWith('uti-');

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
    let cephCheck = $('cephAllergyConfirmation');
    if (!cephCheck) {
      cephCheck = make('label', 'abx-age-confirmation');
      cephCheck.id = 'cephAllergyConfirmation';
      const input = make('input');input.type = 'checkbox';
      input.addEventListener('change', () => {ctx.cephLowRiskConfirmed = input.checked;render();});
      cephCheck.append(input, make('span', '', 'Histori e paverifikuar, e lehtë: pa anafilaksi, pa SCAR dhe pa alergji ndaj penicilinës.'));
      el.allergyField.append(cephCheck);
    }
    cephCheck.hidden = !usesAllergy || ctx.allergy !== 'a4';
    cephCheck.querySelector('input').checked = ctx.cephLowRiskConfirmed;
  }

  function doseRow(label, value, basisKind, role) {
    const row = make('div', 'abx-dose-row');
    row.dataset.role = role;
    row.append(make('span', 'abx-dose-row-label', label), make('strong', 'abx-dose-row-value', value));
    row.dataset.basis = basisKind;
    return row;
  }

  function recommendationCard(option, basis) {
    const scope=currentIndication();
    const block = protocols?.gate(option,protocolContext());
    if(block){
      const card=make('article','abx-option');card.dataset.regimenId=option.id;
      card.append(make('h3','',option.drug),make('p','abx-rx-blocked',block));return card;
    }
    if(option.nativeOspen){
      const card=make('article','abx-option tier-first');
      Object.assign(card.dataset,{regimenId:option.id,nativeOspen:'true',simpleUi:'true',ageConfirmed:String(ctx.ageConfirmed),ageMonths:String(currentAgeBand()?.months??''),protocolVersion:option.protocolVersion});
      const head=make('div','abx-option-head');head.append(make('h3','',option.drug),make('span','abx-tier','Skema Ospen · IU'));
      const meta=make('div','abx-option-meta');meta.append(make('span','','PO · skemë në IU'),make('span','abx-duration','10 ditë'),make('span','abx-option-source','SmPC · Ospen'));
      card.append(head,meta);return card;
    }
    const reviewAbove=option.doseReviewAboveKg??scope.doseReviewAboveKg;
    if(Number.isFinite(reviewAbove)&&basis.weight>reviewAbove){
      const blocked=make('article','abx-option');
      blocked.append(make('h3','',option.drug),make('p','','Kjo tabelë CPS nuk jep maksimum për dozën. Mbi 40 kg, verifiko skemën e të rriturit dhe produktin; kalkulatori nuk e zgjat automatikisht dozën sipas kg.'));
      return blocked;
    }
    if (option.frequencyByAge) {
      const age=currentAgeBand();
      if (!age || !ctx.ageConfirmed || age.months < option.minAgeMonths) {
        const blocked=make('article','abx-option');
        blocked.append(make('h3','',option.drug),make('p','','Konfirmo moshën reale ≥6 muaj për frekuencën: nën 5 vjeç, 2 herë/ditë; nga 5 vjeç, 1 herë/ditë.'));
        return blocked;
      }
      option={...option,frequency:age.months<60?'2 herë/ditë':'1 herë/ditë'};
    }
    const card = make('article', `abx-option tier-${option.tier || 'option'}`);
    card.dataset.regimenId = option.id;
    card.dataset.simpleUi=String(['aom','gas','uti-cystitis','uti-pyelo'].includes(scope.id));
    card.dataset.ageConfirmed = String(ctx.ageConfirmed);
    card.dataset.ageMonths = String(currentAgeBand()?.months ?? '');
    card.dataset.productRule = JSON.stringify(option.productRule || null);
    card.dataset.protocolVersion = option.protocolVersion || '';
    card.dataset.defaultDays = String(option.duration?.defaultDays ?? '');
    if(scope.id==='aom'&&ctx.aomPlan==='backup')card.dataset.prescriptionAdvice=protocols.aomBackupAdvice;
    card.dataset.weightRequired = String(option.requiresRealWeight === true || option.requiresProductWeight === true || ['single','range','weight-bands','sequence'].includes(option.dose?.type));
    card.dataset.ageRequired = String(option.kind !== 'procedure' && option.route !== 'topike');
    card.dataset.requiresRealWeight = String(option.requiresRealWeight === true || option.requiresProductWeight === true || option.dose?.type === 'weight-bands' || Number.isFinite(currentIndication()?.minWeightKg));
    // Converters consume the unrounded value, never the presentation rounding.
    card.dataset.exactDoseText = calculatedValue(option, basis.weight, value => String(value));
    card.dataset.doseFrequencies = JSON.stringify(option.dose?.type==='combo' ? option.dose.parts.map(part=>({drug:part.drug,frequency:part.frequency})) : [{drug:option.drug,frequency:option.frequency}]);
    card.dataset.doseCeilings = JSON.stringify(marketCeilings(option,basis.weight));
    const head = make('div', 'abx-option-head');
    head.append(make('h3', '', option.drug), make('span', 'abx-tier', tierLabels[option.tier] || 'Opsion'));

    const dose = make('div', 'abx-option-dose');
    // The fold under the answer: the source's own rule and the multiplication
    // behind the number, so a dose can be checked instead of trusted.
    const working = make('details', 'abx-working');
    working.append(make('summary', '', 'Si llogaritet'));
    const workingBody = make('div', 'abx-working-body');

    const value = calculatedValue(option, basis.weight);
    if (value) {
      if (basis.label && (option.dose?.type !== 'fixed' || option.requiresProductWeight || option.requiresRealWeight)) {
        const basisLine = make('span', 'abx-dose-basis', basis.label);
        basisLine.dataset.basis = basis.kind;
        workingBody.append(basisLine);
      }
      const rows = make('div', 'abx-dose-rows');
      rows.append(doseRow(option.kind === 'procedure' ? 'Veprimi' : 'Doza e vetme', value, basis.kind, 'single'));
      if (option.kind !== 'procedure') rows.append(make('span', 'abx-dose-explanation', 'Sasia për një marrje · ' + (option.frequency || 'sipas skemës')));
      const daily = dailyDose(option, basis.weight);
      if (daily) rows.append(doseRow('Doza ditore', daily.text, basis.kind, 'daily'));
      if (daily) rows.append(make('span', 'abx-daily-explanation', 'Totali i të gjitha marrjeve në 24 orë.'));
      dose.append(rows);

      const steps = calculationSteps(option, basis.weight);
      if (daily?.working) steps.push(daily.working);
      steps.forEach(step => workingBody.append(make('span', 'abx-dose-step', step)));

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
    workingBody.append(make('span', 'abx-dose-formula', `Rregulli i burimit: ${formulaText(option)}`));
    working.append(workingBody);

    // Route, frequency, duration and source on one strip. Its shape is a
    // contract: the formulation and prescription modules read the first span
    // and .abx-duration back out of it.
    const meta = make('div', 'abx-option-meta');
    const source = sourceById(option.source);
    meta.append(
      make('span', '', `${option.route || 'PO'} · ${option.frequency || '—'}`),
      make('span', 'abx-duration', durationText(option)),
      make('span', 'abx-option-source', source?.short || 'Burim'),
    );

    card.append(head, dose, meta);
    const limits=doseLimits(option);
    if(limits.length){
      const limitBox=make('div','abx-dose-limits');
      limitBox.append(make('strong','','Maksimumi i kësaj skeme'));
      if(basis.kind==='real')doseLimits(option,basis.weight).forEach(line=>limitBox.append(make('b','',`Për ${fmt(basis.weight)} kg: ${line}`)));
      limitBox.append(make('small','','Tavani i skemës, para kufizimit sipas peshës:'));
      limits.forEach(line=>limitBox.append(make('span','',line)));
      limitBox.append(make('small','','Kufiri për 24 orë llogaritet nga maksimumi për dozë dhe frekuenca e kësaj skeme.'));
      workingBody.append(limitBox);
    }
    const sourceLink = source?.url ? make('a', 'abx-verify-source', 'Kontrollo skemën në burim ↗') : null;
    if (sourceLink) {
      sourceLink.href = source.url;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      workingBody.append(sourceLink);
    }
    if (option.durationSource) {
      const durationSource = sourceById(option.durationSource);
      const link = make('a', 'abx-verify-source', `Kohëzgjatja: ${durationText(option)} · ${durationSource.short} ↗`);
      link.href = durationSource.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      workingBody.append(link);
    }
    if (option.productRule?.ratio) (['aom','gas','uti-cystitis','uti-pyelo'].includes(scope.id)?workingBody:card).append(make('p','abx-option-note',`Raporti i këtij formulimi: ${option.productRule.ratio}:1 amoxicillin/clavulanate.`));
    if (option.dose?.type === 'range') (['aom','gas','uti-cystitis','uti-pyelo'].includes(scope.id)?workingBody:card).append(make('p', 'abx-option-note', 'Ky është interval doze. Zgjidh një dozë të vetme brenda tij para përshkrimit.'));
    if (['single','range'].includes(option.dose?.type) && !Number.isFinite(option.dose.maxDose)) card.append(make('p', 'abx-missing-limit', 'Maksimumi nuk jepet nga ky burim. Rezultati është llogaritje sipas kg, pa kufizim automatik të dozës.'));
    if (option.conditional) (['aom','gas','uti-cystitis','uti-pyelo'].includes(scope.id)?workingBody:card).append(make('p', 'abx-option-note', `Kur përdoret: ${option.conditional}`));
    if (option.note) (['aom','gas','uti-cystitis','uti-pyelo'].includes(scope.id)?workingBody:card).append(make('p', 'abx-option-note', option.note));
    if (option.stewardship) (['aom','gas','uti-cystitis','uti-pyelo'].includes(scope.id)?workingBody:card).append(make('p', 'abx-option-note', `Stewardship: ${option.stewardship}`));
    card.append(working);
    return card;
  }

  function renderSources(indication) {
    el.sourceList.replaceChildren();
    const sourceIds = new Set([indication.source, 'chop-allergy-2025', 'jtfpp-allergy-2022', 'carpa']);
    if(indication.id==='aom')['cdc-aom-diagnosis','nhs-borders-aom','nice-ng143','nhs-mastoiditis'].forEach(id=>sourceIds.add(id));
    indication.options.forEach(option => {
      if (option.source) sourceIds.add(option.source);
      if (option.durationSource) sourceIds.add(option.durationSource);
    });

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
      ctx.pregnant = stored.pregnant === true;
      // A culture confirmation belongs to this clinical encounter; never restore it.
      ctx.cultureSusceptible = false;
      ctx.ageConfirmed = !ctx.ageFromWeight && stored.ageConfirmed === true && Boolean(ctx.age);
    }
    const requested = new URLSearchParams(location.search).get('indication');
    if (requested && guide.indications.some(item => item.id === requested)) ctx.indication = requested;
  }

  function render() {
    if(!protocols && document.documentElement?.dataset.penicillinProtocols==='required'){el.list.replaceChildren(make('p','abx-empty','Protokollet nuk u ngarkuan. Rifresko faqen; dozat e vjetra nuk përdoren si zëvendësim.'));return;}
    const indication = currentIndication();
    document.body?.classList.toggle('abx-simple-aom',indication.id==='aom');
    document.body?.classList.toggle('abx-simple-gas',indication.id==='gas');
    document.body?.classList.toggle('abx-simple-uti',indication.id.startsWith('uti-'));
    const utiLimit=indication.id.startsWith('uti-')?(ctx.utiUrgent?{blocks:true,tone:'warn',text:'STOP — referim urgjent për sepsë/obstruksion ose nevojë për trajtim parenteral.'}:ctx.pregnant&&currentAgeBand()?.months<144?{blocks:true,tone:'warn',text:'Shtatzëni nën 12 vjeç: vlerësim specialistik, pa skemë automatike.'}:indication.id==='uti-cystitis'&&ctx.utiUpper?{blocks:true,tone:'warn',text:'Kjo nuk është skemë për UTI febrile/prostatit. Zgjidh UTI febrile / pielonefrit ose kërko vlerësim për prostatit.'}:indication.id==='uti-cystitis'&&currentAgeBand()?.months>=192&&!ctx.pregnant&&!ctx.utiSex?{blocks:true,tone:'info',text:'Zgjidh profilin femër/mashkull; kohëzgjatja ndryshon sipas profilit.'}:null):null;
    const aomLimit=indication.id==='aom'?protocols?.aomDecision(protocolContext()):null;
    const gasLimit=indication.id==='gas'&&ctx.gasUrgent?{blocks:true,tone:'warn',text:'STOP — dyshim për komplikim supurativ ose infeksion sistemik të rëndë: referim urgjent. Mos përdor recetë rutinë ambulatore.'}:null;
    const limit = utiLimit || gasLimit || (ctx.aomRisk==='urgent'&&indication.id==='aom' ? aomLimit : protocols && !ctx.ageConfirmed ? {blocks:true,tone:'info',text:indication.contextMessage} : eligibility(indication)||aomLimit);
    el.list.dataset.gasBlocked=String(indication.id==='gas'&&Boolean(limit?.blocks));
    el.list.dataset.gasConfirmed=String(indication.id==='gas'&&ctx.gasConfirmed);
    el.list.dataset.aomBlocked=String(indication.id==='aom'&&Boolean(limit?.blocks));
    el.list.dataset.aomPlan=indication.id==='aom'?ctx.aomPlan:'';

    renderConditionalControls(indication);
    syncPickers();
    renderAgeHint(indication);
    renderContextHint(indication);
    renderAgeSuggestion();
    renderAgeConfirmation();
    renderDoseBasis();
    renderSources(indication);
    syncIndicationInUrl(indication);
    persistContext();

    const source = sourceById(indication.source);
    el.activeSource.textContent = source ? source.short : 'Burim';
    // The chip carries the short name; the full one heads the regimens it opened.
    el.resultsTitle.textContent = ['aom','gas','uti-cystitis','uti-pyelo'].includes(indication.id)?'3 · Doza dhe receta':indication.label;
    el.eligibility.hidden = !limit;
    el.eligibility.textContent = limit ? limit.text : '';
    el.eligibility.dataset.tone = limit ? limit.tone : 'info';
    el.list.replaceChildren();
    if (limit?.blocks) return;

    if (indication.warning && !['aom','gas','uti-cystitis','uti-pyelo'].includes(indication.id)) {
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

    if(indication.contextMessage && !['aom','gas','uti-cystitis','uti-pyelo'].includes(indication.id))el.list.append(make('p','abx-eligibility',indication.contextMessage));
    const options = visibleOptions(indication);
    if (!options.length) {
      if(indication.id==='aom')el.list.dataset.aomBlocked='true';
      const bucket = allergyById(ctx.allergy);
      const text = ctx.allergy === 'a5'
        ? 'Alergji ndaj alternativës / alergji të shumëfishta: DRx nuk bën zëvendësim automatik. Specifiko klasën konkrete dhe verifiko një regjim për këtë diagnozë.'
        : indication.id==='aom'&&ctx.aomFailure ? 'Përkeqësim pas trajtimit fillestar dhe alergji: konsulto mikrobiologun / ORL për zgjedhjen e dytë. Nuk përsëritet automatikisht alternativa e parë.' : `Nuk ka regjim të verifikuar për këtë kombinim${bucket ? ` (${bucket.short})` : ''}.`;
      el.list.append(make('div', 'abx-empty', text));
      return;
    }

    const basis = doseBasis();
    if (basis.kind === 'reference') {
      el.list.append(make('p', 'abx-orientational-note', 'Dozat numerike më poshtë përdorin peshën referuese të moshës dhe janë vetëm orientuese. Pesha reale duhet përdorur për dozën përfundimtare.'));
    }
    if(indication.id==='pneumonia'&&ctx.atypical)el.list.append(make('strong','abx-regimen-group','Trajtimi bazë · zgjidh një agjent kundër pneumokokut'));
    options.forEach(option => {
      if(indication.id==='pneumonia'&&ctx.atypical&&option.atypical)el.list.append(make('strong','abx-regimen-group','Shtesë për patogjen atipik · jepet bashkë me trajtimin bazë'));
      el.list.append(recommendationCard(option, basis));
    });
  }

  function applyAgeFromWeight(force=false) {
    const state = weightState();
    if (state.kind !== 'valid') {
      if (force || ctx.ageFromWeight) {
        ctx.age = '';
        ctx.ageFromWeight = false;
        ctx.ageConfirmed = false;
        el.age.value = '';
      }
      return;
    }
    if (!force && ctx.age && !ctx.ageFromWeight) return;
    const band = nearestAgeBand(state.value);
    if (!band) {
      if (force || ctx.ageFromWeight) {ctx.age='';ctx.ageFromWeight=false;ctx.ageConfirmed=false;el.age.value='';}
      return;
    }
    ctx.age = band.id;
    ctx.ageFromWeight = true;
    ctx.ageConfirmed = false;
    el.age.value = band.id;
  }

  function bind() {
    $('utiSexSelect')?.addEventListener('change',e=>{ctx.utiSex=e.target.value;ctx.utiAlternative=false;ctx.cultureSusceptible=false;render();});
    $('utiEgfrInput')?.addEventListener('input',e=>{ctx.utiEgfr=e.target.value;render();});
    $('utiCephSelect')?.addEventListener('change',e=>{ctx.utiCephTimes=Number(e.target.value);render();});
    for(const [id,key] of [['utiFluoroInput','utiFluoro'],['utiAtTermInput','utiAtTerm'],['utiAlternativeInput','utiAlternative'],['utiUpperInput','utiUpper'],['utiUrgentInput','utiUrgent']])$(id)?.addEventListener('change',e=>{ctx[key]=e.target.checked;render();});
    window.addEventListener('drx:ospen-request',()=>{if(ctx.indication==='gas'){ctx.gasPenicillinSource='ospen';render();if(!ctx.gasConfirmed){$('gasOptions').open=true;$('gasConfirmedInput').focus();}}});
    $('gasSourceBack')?.addEventListener('click',()=>{ctx.gasPenicillinSource='nice';render();});
    $('gasScheduleSelect')?.addEventListener('change',event=>{ctx.gasSchedule=event.target.value;render();});
    $('gasAmoxScheduleSelect')?.addEventListener('change',event=>{ctx.gasAmoxSchedule=event.target.value;render();});
    $('gasConfirmedInput')?.addEventListener('change',event=>{ctx.gasConfirmed=event.target.checked;render();});
    $('gasUrgentInput')?.addEventListener('change',event=>{ctx.gasUrgent=event.target.checked;render();});
    $('aomRiskSelect')?.addEventListener('change',event=>{ctx.aomRisk=event.target.value;ctx.aomPlan='immediate';ctx.aomFailure=false;render();});
    $('aomFailureInput')?.addEventListener('change',event=>{ctx.aomFailure=event.target.checked;if(ctx.aomFailure)ctx.aomPlan='immediate';render();});
    el.age.addEventListener('change', () => {
      ctx.age = el.age.value;
      ctx.ageFromWeight = false;
      ctx.ageConfirmed = Boolean(ctx.age);
      ctx.cultureSusceptible=false;
      ctx.gasConfirmed=false;
      ctx.utiFluoro=false;ctx.utiEgfr='';ctx.utiAlternative=false;ctx.utiAtTerm=false;
      ctx.aomFailure=false;
      render();
    });
    el.weight.addEventListener('input', () => {
      ctx.weight = el.weight.value;
      ctx.cultureSusceptible=false;
      ctx.gasConfirmed=false;
      ctx.utiFluoro=false;ctx.utiEgfr='';ctx.utiAlternative=false;ctx.utiAtTerm=false;
      ctx.aomFailure=false;
      applyAgeFromWeight(true);
      render();
    });
    $('pregnancyInput')?.addEventListener('change',event=>{ctx.pregnant=event.target.checked;ctx.utiFluoro=false;ctx.utiAlternative=false;ctx.cultureSusceptible=false;render();});
    $('cultureSusceptibleInput')?.addEventListener('change',event=>{ctx.cultureSusceptible=event.target.checked;render();});
    el.atypical.addEventListener('change', () => {
      ctx.atypical = el.atypical.checked;
      render();
    });
    // Rotating a phone, or opening the same page on a wide screen, must not
    // leave a picker folded shut with no way back.
    const onBreakpoint = () => {
      if (compact.matches) {
        collapsePicker(el.indicationPicker);
        collapsePicker(el.allergyPicker);
      }
      syncPickers();
    };
    if (compact.addEventListener) compact.addEventListener('change', onBreakpoint);
    else compact.addListener(onBreakpoint);
  }

  function renderAgeConfirmation() {
    let label=$('ageConfirmation');
    if(!label){
      label=make('label','abx-age-confirmation');label.id='ageConfirmation';
      const input=document.createElement('input');input.type='checkbox';
      input.addEventListener('change',()=>{ctx.ageConfirmed=input.checked;render();});
      label.append(input,make('span','','Konfirmoj moshën reale të pacientit'));
      el.age.parentElement.append(label);
    }
    label.hidden=ctx.ageConfirmed||!ctx.age;
    label.querySelector('input').checked=ctx.ageConfirmed;
  }

  restoreContext();
  populateAges();
  el.age.value = ctx.age;
  el.weight.value = ctx.weight;
  applyAgeFromWeight(weightState().kind!=='empty');
  el.atypical.checked = ctx.atypical;
  buildIndicationChips();
  buildAllergySegments();
  bind();
  // The markup ships open so a wide screen needs no script to look right; a
  // narrow one folds both pickers before the first paint the user sees.
  collapsePicker(el.indicationPicker);
  collapsePicker(el.allergyPicker);
  pinPickerOpen(el.indicationPicker);
  pinPickerOpen(el.allergyPicker);
  render();
})();
