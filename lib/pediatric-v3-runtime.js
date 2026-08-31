'use strict';

const { supabaseRequest } = require('./medindex-data-api.js');
const Reader = require('./dose-v3-product-reader.js');
const Gate = require('./dose-v3-runtime-gate.js');
const Runtime = require('./dose-runtime-engine.js');
const Core = require('./dose-core.js');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const AGE_TO_DAYS = Object.freeze({
  'ditë':1,
  'dite':1,
  'day':1,
  'days':1,
  'javë':7,
  'jave':7,
  'week':7,
  'weeks':7,
});

const AGE_TO_MONTHS = Object.freeze({
  'ditë':1 / 30.4375,
  'dite':1 / 30.4375,
  'day':1 / 30.4375,
  'days':1 / 30.4375,
  'javë':7 / 30.4375,
  'jave':7 / 30.4375,
  'week':7 / 30.4375,
  'weeks':7 / 30.4375,
  'muaj':1,
  'month':1,
  'months':1,
  'vjet':12,
  'vit':12,
  'year':12,
  'years':12,
});

function selectorOf(value) {
  const raw = clean(value);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return { column:'drug_id', value:raw };
  }
  if (/^PROD-[A-Z0-9._-]+$/i.test(raw)) return { column:'product_key', value:raw };
  return null;
}

function pediatricRule(rule = {}) {
  const group = clean(rule.patientGroup).toLowerCase();
  if (!group) return false;
  if (group === 'adult_only') return false;
  return group.includes('pediatric') || group === 'age_band';
}

function ageMonthsFromBody(body = {}) {
  const age = body.age && typeof body.age === 'object' ? body.age : {};
  const value = finite(age.value ?? body.ageValue ?? body.ageMonths);
  if (value === null || value < 0) return null;
  const explicitMonths = finite(body.ageMonths);
  if (explicitMonths !== null && explicitMonths >= 0) return explicitMonths;
  const unit = clean(age.unit ?? body.ageUnit ?? 'muaj').toLowerCase();
  const factor = AGE_TO_MONTHS[unit];
  return factor ? value * factor : null;
}

function ageDaysFromBody(body = {}) {
  const explicit = finite(body.ageDays);
  if (explicit !== null && explicit >= 0) return explicit;
  const age = body.age && typeof body.age === 'object' ? body.age : {};
  const value = finite(age.value ?? body.ageValue);
  if (value === null || value < 0) return null;
  const unit = clean(age.unit ?? body.ageUnit ?? '').toLowerCase();
  const factor = AGE_TO_DAYS[unit];
  return factor ? value * factor : null;
}

function patientFromBody(body = {}) {
  return {
    weightKg:finite(body.weightKg ?? body.weight),
    heightCm:finite(body.heightCm ?? body.height),
    ageMonths:ageMonthsFromBody(body),
    ageDays:ageDaysFromBody(body),
    treatmentDay:finite(body.treatmentDay ?? body.treatment_day),
    clinicalVariant:clean(body.clinicalVariant ?? body.clinical_variant),
    crClMlMin:finite(body.crClMlMin ?? body.crcl),
    eGfrMlMin173m2:finite(body.eGfrMlMin173m2 ?? body.egfr),
    dialysisStatus:clean(body.dialysisStatus),
    childPughClass:clean(body.childPughClass),
    hepaticImpairment:clean(body.hepaticImpairment),
    cardiacStatus:clean(body.cardiacStatus),
  };
}

function inFilter(values = []) {
  const unique = [...new Set(values.map(clean).filter(Boolean))];
  return unique.length ? 'in.(' + unique.join(',') + ')' : '';
}

async function loadClinicalMetadata(productKey) {
  const key=clean(productKey);
  if (!key) throw new Error('V3 calculator product key missing.');
  const { data } = await supabaseRequest(
    'rpc/drx_pediatric_v3_calculator_metadata_v1',
    {
      method:'POST',
      body:{ p_product_key:key },
      timeoutMs:5000,
      label:'V3 pediatric calculator verified metadata',
    },
    { privileged:true }
  );
  if (!data || data.metadataVersion!=='drx-pediatric-v3-calculator-metadata-v1' || clean(data.productKey)!==key) {
    throw new Error('V3 calculator verified metadata unavailable.');
  }
  return data;
}

async function hydrateClinicalMetadata(payload) {
  const rules=Array.isArray(payload?.product?.rules) ? payload.product.rules : [];
  const metadata=await loadClinicalMetadata(payload?.product?.productKey);
  const sourceRows=Array.isArray(metadata.sources) ? metadata.sources : [];
  const renalRows=Array.isArray(metadata.renalAdjustments) ? metadata.renalAdjustments : [];
  const hepaticRows=Array.isArray(metadata.hepaticAdjustments) ? metadata.hepaticAdjustments : [];

  const sourceMap=new Map(sourceRows.map(row=>[clean(row.snapshotId),row]));
  const renalMap=new Map(renalRows.map(row=>[clean(row.adjustmentId),row]));
  const hepaticMap=new Map(hepaticRows.map(row=>[clean(row.adjustmentId),row]));

  function hydrateAdjustment(item,map) {
    const verification=map.get(clean(item.adjustmentId));
    if (!verification
        || clean(verification.reviewStatus)!=='verified'
        || !clean(verification.verifiedBy)
        || !clean(verification.verifiedAt)) return null;

    const sourceRow=sourceMap.get(clean(item?.source?.snapshotId));
    if (!sourceRow || !/^https:\/\//i.test(clean(sourceRow.sourceUrl))) return null;

    const provenance={
      sourceKey:clean(item?.source?.sourceKey),
      sourceSection:clean(item?.source?.section || '4.2'),
      sourceSectionSha256:clean(item?.source?.sectionSha256),
      sourceSnapshotId:clean(item?.source?.snapshotId),
      sourceEvidenceHash:clean(item?.source?.evidenceHash),
    };
    return {
      ...item,
      ...provenance,
      reviewStatus:clean(verification.reviewStatus),
      verifiedBy:clean(verification.verifiedBy),
      verifiedAt:clean(verification.verifiedAt),
      source:{
        ...item.source,
        url:clean(sourceRow.sourceUrl),
        sourceTier:clean(sourceRow.sourceTier),
        documentVersion:clean(sourceRow.documentVersion || item?.source?.documentVersion),
        documentDate:clean(sourceRow.documentDate || item?.source?.documentDate),
      },
    };
  }

  const hydratedRules=[];
  for (const rule of rules) {
    const sourceRow=sourceMap.get(clean(rule?.source?.snapshotId));
    if (!sourceRow || !/^https:\/\//i.test(clean(sourceRow.sourceUrl))) continue;

    const renal=(rule.renalAdjustments || []).map(item=>hydrateAdjustment(item,renalMap)).filter(Boolean);
    const hepatic=(rule.hepaticAdjustments || []).map(item=>hydrateAdjustment(item,hepaticMap)).filter(Boolean);

    if (rule.renalAdjustmentRequired===true && renal.length!==(rule.renalAdjustments || []).length) continue;
    if (rule.hepaticAdjustmentRequired===true && hepatic.length!==(rule.hepaticAdjustments || []).length) continue;

    hydratedRules.push({
      ...rule,
      renalAdjustments:renal,
      hepaticAdjustments:hepatic,
      source:{
        ...rule.source,
        url:clean(sourceRow.sourceUrl),
        sourceTier:clean(sourceRow.sourceTier),
        documentVersion:clean(sourceRow.documentVersion || rule?.source?.documentVersion),
        documentDate:clean(sourceRow.documentDate || rule?.source?.documentDate),
      },
    });
  }

  return {
    ...payload,
    product:{ ...payload.product, rules:hydratedRules },
    meta:{
      ...(payload.meta || {}),
      calculatorHydrated:true,
      calculatorMetadataVersion:metadata.metadataVersion,
    },
  };
}

function rulesByIndication(rules = []) {
  const groups = new Map();
  for (const rule of rules.filter(pediatricRule)) {
    const key = clean(rule.indicationId || rule.indicationKey);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rule);
  }
  return groups;
}

function advancedMeasures(rules = []) {
  const measures = new Set();
  for (const rule of rules) {
    for (const item of rule.renalAdjustments || []) measures.add(clean(item.measureType));
    for (const item of rule.hepaticAdjustments || []) measures.add(clean(item.measureType));
    if (rule.cardiacAdjustmentRequired === true) measures.add('cardiac_status');
  }
  return [...measures].filter(Boolean);
}

function requiresOf(rules = []) {
  const required = new Set();
  for (const rule of rules) for (const item of Core.requiredInputs(rule)) required.add(item);
  return {
    weight:required.has('weight_kg'),
    height:required.has('height_cm'),
    age:required.has('age_months'),
    ageDays:required.has('age_days'),
    treatmentDay:required.has('treatment_day'),
    clinicalVariant:required.has('clinical_variant'),
    advancedInputs:advancedMeasures(rules),
  };
}

function scheduleSummary(rule = {}) {
  if (finite(rule.timesPerDay) !== null) return { dosesPerDay:finite(rule.timesPerDay), intervalHours:null };
  if (finite(rule.intervalMinHours) !== null) return { dosesPerDay:null, intervalHours:finite(rule.intervalMinHours) };
  return { dosesPerDay:null, intervalHours:null };
}

function optionFromRules(indicationId, rules) {
  const first = rules[0] || {};
  const schedule = scheduleSummary(first);
  const routes = [...new Set(rules.map(rule => clean(rule.route)).filter(Boolean))];
  const sources = [...new Set(rules.map(rule => clean(rule?.source?.url)).filter(Boolean))];
  return {
    selectionId:indicationId,
    indicationId,
    indicationKey:clean(first.indicationKey),
    indication:clean(first.indicationName),
    route:routes.length === 1 ? routes[0] : '',
    valid:true,
    autoSelected:false,
    ruleCount:rules.length,
    requires:requiresOf(rules),
    regimen:{
      indication:clean(first.indicationName),
      route:routes.length === 1 ? routes[0] : '',
      basis:clean(first.doseBasis),
      dosesPerDay:schedule.dosesPerDay,
      intervalHours:schedule.intervalHours,
      minWeightKg:rules.reduce((v,rule) => {
        const n=finite(rule.minWeightKg); return n===null ? v : (v===null ? n : Math.min(v,n));
      }, null),
      maxWeightKg:rules.reduce((v,rule) => {
        const n=finite(rule.maxWeightKg); return n===null ? v : (v===null ? n : Math.max(v,n));
      }, null),
    },
    source:{
      url:sources.length === 1 ? sources[0] : '',
      section:'4.2',
      verificationStatus:'verified',
      verifiedAt:clean(first?.source?.documentDate || first?.source?.documentVersion),
    },
  };
}

function identity(product = {}) {
  const strength = product.numeratorValue != null && product.denominatorValue != null
    ? [product.numeratorValue, product.numeratorUnit].filter(v => v !== null && v !== '').join(' ')
      + (Number(product.denominatorValue) === 1
        ? ''
        : '/' + [product.denominatorValue, product.denominatorUnit].filter(Boolean).join(' '))
    : '';
  return {
    drugId:clean(product.drugId),
    registryNumber:product.registryNumber == null ? null : Number(product.registryNumber),
    pdid:clean(product.pdid),
    name:clean(product.tradeName),
    substance:clean(product.activeSubstance),
    strength,
    form:clean(product.pharmaceuticalForm),
    atcCode:clean(product.atcCode),
  };
}

async function readPayload(rawSelector) {
  const selector = selectorOf(rawSelector);
  if (!selector) return null;
  const base = await Reader.build(selector);
  if (!base || !Gate.validateV3Payload(base)) return null;
  const hydrated = await hydrateClinicalMetadata(base);
  if (!Gate.validateV3Payload(hydrated)) return null;
  if (!hydrated.product.rules.length) return null;
  return hydrated;
}

async function buildProduct(rawSelector) {
  const payload = await readPayload(rawSelector);
  if (!payload) return null;
  const groups = rulesByIndication(payload.product.rules);
  const options = [...groups.entries()]
    .map(([indicationId,rules]) => optionFromRules(indicationId,rules))
    .sort((a,b) => a.indication.localeCompare(b.indication,'sq'));
  if (!options.length) return null;

  const selected = options.length === 1 ? { ...options[0], autoSelected:true } : null;
  const firstRule = payload.product.rules[0];
  const id = identity(payload.product);
  return {
    ...id,
    runtime:'v3',
    runtimeLabel:'V3 live',
    readiness:'CALCULATOR_READY',
    calculable:true,
    requires:selected?.requires || { weight:false,height:false,age:false,advancedInputs:[] },
    reasons:[],
    warnings:[],
    missing:[],
    useStatus:clean(payload.product.patientGroup),
    populationKey:clean(payload.product.patientGroup).toUpperCase(),
    restriction:'',
    summary:options.length === 1
      ? 'Regjim V3 i publikuar dhe i verifikuar; rregulli i saktë zgjidhet server-side sipas pacientit.'
      : 'Zgjidh indikacionin e verifikuar; rregulli i saktë zgjidhet server-side sipas pacientit.',
    regimen:selected?.regimen || {},
    calculationRegimen:selected || { valid:false,selectionId:'',indication:'',route:'',requires:null },
    calculationOptions:options,
    textRegimens:[],
    source:selected?.source || {
      url:clean(firstRule?.source?.url),
      section:'4.2',
      verificationStatus:'verified',
      verifiedAt:clean(firstRule?.source?.documentDate || firstRule?.source?.documentVersion),
    },
    phase9Context:{
      contextVersion:'drx-phase10-v3-calculator-consumer-v1',
      identityStatus:'V3_PUBLISHED',
      formKey:clean(payload.product.pharmaceuticalForm),
      releaseKey:'',
      routeKey:clean(payload.product.route),
      v3Published:true,
      v3ProductKey:clean(payload.product.productKey),
      v3VersionNo:Number(payload.product.versionNo) || 1,
      source:{
        sourceKey:clean(firstRule?.source?.sourceKey),
        snapshotId:clean(firstRule?.source?.snapshotId),
        sourceTier:clean(firstRule?.source?.sourceTier),
        documentVersion:clean(firstRule?.source?.documentVersion),
        documentDate:clean(firstRule?.source?.documentDate),
      },
    },
    _v3:{ productKey:clean(payload.product.productKey) },
  };
}

function demographicsState(rule, patient) {
  const required = Core.requiredInputs(rule);
  const missing = [];
  if (required.includes('age_months') && patient.ageMonths === null) missing.push('age');
  if (required.includes('age_days') && patient.ageDays === null) missing.push('ageDays');
  if (required.includes('weight_kg') && patient.weightKg === null) missing.push('weightKg');
  if (required.includes('height_cm') && patient.heightCm === null) missing.push('heightCm');
  if (required.includes('treatment_day') && (patient.treatmentDay === null || patient.treatmentDay < 1)) missing.push('treatmentDay');
  if (required.includes('clinical_variant') && !clean(patient.clinicalVariant)) missing.push('clinicalVariant');
  if (missing.length) return { match:false,missing };

  const age=patient.ageMonths, ageDays=patient.ageDays, weight=patient.weightKg;
  const treatmentDay=patient.treatmentDay;
  const minAge=finite(rule.minAgeMonths), maxAge=finite(rule.maxAgeMonths);
  const minAgeDays=finite(rule.minAgeDays), maxAgeDays=finite(rule.maxAgeDays);
  const minWeight=finite(rule.minWeightKg), maxWeight=finite(rule.maxWeightKg);
  const startDay=finite(rule.startDay), endDay=finite(rule.endDay);
  const conditionRequired=rule.conditionReviewRequired === true;
  const optionKey=clean(rule.regimenOptionKey);
  const variant=clean(patient.clinicalVariant);

  if (age !== null && ((minAge !== null && age < minAge) || (maxAge !== null && age > maxAge))) return { match:false,missing:[],outOfRange:true };
  if (ageDays !== null && ((minAgeDays !== null && ageDays < minAgeDays) || (maxAgeDays !== null && ageDays > maxAgeDays))) return { match:false,missing:[],outOfRange:true };
  if (weight !== null && ((minWeight !== null && weight < minWeight) || (maxWeight !== null && weight > maxWeight))) return { match:false,missing:[],outOfRange:true };
  if (treatmentDay !== null && ((startDay !== null && treatmentDay < startDay) || (endDay !== null && treatmentDay > endDay))) return { match:false,missing:[],outOfRange:true };
  if (conditionRequired && optionKey && variant !== optionKey) return { match:false,missing:[],outOfRange:true };
  return { match:true,missing:[] };
}

function selectRule(rules, patient) {
  const states = rules.map(rule => ({ rule, state:demographicsState(rule,patient) }));
  const missing = [...new Set(states.flatMap(item => item.state.missing || []))];
  if (missing.length) return { status:'needs-input',missing };
  const matches = states.filter(item => item.state.match).map(item => item.rule);
  if (matches.length === 1) return { status:'matched',rule:matches[0] };
  if (matches.length === 0) return { status:'out-of-range' };
  return { status:'ambiguous',matches };
}

function measureObject(practical) {
  if (!practical || practical.min == null) return null;
  const kind = ['ml','mL'].includes(practical.unit) ? 'volume' : 'solid';
  return {
    min:{ amount:practical.min, unit:practical.unit, kind },
    max:{ amount:practical.max, unit:practical.unit, kind },
  };
}

function scheduleText(schedule = {}) {
  if (schedule.timesPerDay) return schedule.timesPerDay + '×/ditë';
  if (schedule.intervalMinHours) return 'çdo ' + schedule.intervalMinHours + ' orë';
  if (schedule.prn) return 'sipas nevojës, brenda kufijve të verifikuar';
  return 'sipas regjimit';
}

function publicCalculation(result, rule, product) {
  const map = {
    [Core.OUTCOME.CALCULATED]:'CALCULATED',
    [Core.OUTCOME.RANGE]:'CALCULATED',
    [Core.OUTCOME.DAILY_ONLY]:'CALCULATED',
    [Core.OUTCOME.NEEDS_INPUT]:'NEEDS_PATIENT_DATA',
    [Core.OUTCOME.OUT_OF_RANGE]:'OUT_OF_RANGE',
    [Core.OUTCOME.MANUAL_REVIEW]:'NOT_CALCULABLE',
    [Core.OUTCOME.INVALID_RULE]:'NOT_CALCULABLE',
  };
  const outcome = map[result.outcome] || 'NOT_CALCULABLE';
  const reasons = [...(result.reasons || [])];
  if (result.reason) reasons.push(result.reason);
  const schedule = result.schedule || {};
  const source = rule.source || {};
  return {
    outcome,
    runtime:'v3',
    drug:identity(product),
    regimenId:clean(rule.indicationId),
    regimenUuid:clean(rule.ruleId),
    indication:clean(rule.indicationName),
    route:clean(rule.route),
    readiness:'CALCULATOR_READY',
    doseUnit:clean(result.doseUnit),
    isRate:false,
    perDose:result.perDose || null,
    daily:result.daily || null,
    dosesPerDay:finite(schedule.timesPerDay),
    measure:measureObject(result.practicalMeasure),
    bsa:result.bsaM2 ?? null,
    cappedBy:result.cappedBy || [],
    warnings:[],
    reasons,
    missing:result.missing || [],
    schedule,
    scheduleText:scheduleText(schedule),
    steps:[
      result.patient?.weightKg != null ? {label:'Pesha',value:result.patient.weightKg,unit:'kg'} : null,
      result.patient?.ageMonths != null ? {label:'Mosha',value:result.patient.ageMonths,unit:'muaj'} : null,
      result.patient?.ageDays != null ? {label:'Mosha',value:result.patient.ageDays,unit:'ditë'} : null,
      result.patient?.treatmentDay != null ? {label:'Dita e trajtimit',value:result.patient.treatmentDay,unit:'ditë'} : null,
      {label:'Rregulli V3',value:clean(rule.ruleKey),unit:''},
    ].filter(Boolean),
    source:{
      url:clean(source.url),
      section:clean(source.section || '4.2'),
      verificationStatus:'verified',
      verifiedAt:clean(source.documentDate || source.documentVersion),
    },
    appliedAdjustments:result.appliedAdjustments || [],
  };
}

async function calculate(body = {}) {
  const payload = await readPayload(body.drugId ?? body.productKey);
  if (!payload) return { error:'Produkti V3 i publikuar nuk u gjet ose nuk kaloi validimin.', status:404 };

  const groups = rulesByIndication(payload.product.rules);
  const selection = clean(body.regimenId ?? body.indicationId);
  if (!selection) {
    if (groups.size !== 1) return { error:'Zgjidh indikacionin para llogaritjes.', status:400 };
  }
  const selectedId = selection || [...groups.keys()][0];
  const rules = groups.get(selectedId);
  if (!rules?.length) return { error:'Indikacioni i zgjedhur nuk i përket këtij produkti.', status:400 };

  const patient = patientFromBody(body);
  const chosen = selectRule(rules, patient);
  if (chosen.status === 'needs-input') {
    return { calculation:{
      outcome:'NEEDS_PATIENT_DATA',runtime:'v3',drug:identity(payload.product),
      regimenId:selectedId,indication:clean(rules[0]?.indicationName),route:clean(rules[0]?.route),
      missing:chosen.missing,reasons:[],warnings:[],
    }};
  }
  if (chosen.status === 'out-of-range') {
    return { calculation:{
      outcome:'OUT_OF_RANGE',runtime:'v3',drug:identity(payload.product),
      regimenId:selectedId,indication:clean(rules[0]?.indicationName),route:clean(rules[0]?.route),
      reasons:['Pacienti nuk përputhet me asnjë age/weight band të publikuar për këtë indikacion.'],
      warnings:[],
    }};
  }
  if (chosen.status === 'ambiguous') {
    return { calculation:{
      outcome:'NOT_CALCULABLE',runtime:'v3',drug:identity(payload.product),
      regimenId:selectedId,indication:clean(rules[0]?.indicationName),route:clean(rules[0]?.route),
      reasons:['Më shumë se një rregull V3 përputhet me pacientin; llogaritja u bllokua për review.'],
      warnings:[],
    }};
  }

  const result = Runtime.calculate(chosen.rule, patient, payload.product);
  return { calculation:publicCalculation(result, chosen.rule, payload.product) };
}

module.exports = {
  buildProduct,
  calculate,
  readPayload,
  _test:{
    clean,finite,selectorOf,pediatricRule,ageMonthsFromBody,ageDaysFromBody,patientFromBody,
    inFilter,loadClinicalMetadata,hydrateClinicalMetadata,rulesByIndication,advancedMeasures,requiresOf,scheduleSummary,
    optionFromRules,identity,demographicsState,selectRule,measureObject,scheduleText,
    publicCalculation,
  },
};
