'use strict';

const Core = require('./dose-core.js');
const CATALOG = require('../data/drx-generic-pediatric-dose-v1.json');

const VERSION = CATALOG.schemaVersion;
const FORBIDDEN_INPUT = /^(pediatric_|dose|concentration|max|conc$|indication(?:Id)?$)/i;
const TARGET_IDS = new Set(CATALOG.substances.map(item => item.id));
const byId = new Map(CATALOG.substances.map(item => [item.id, item]));

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function decimal(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function isGenericId(value) {
  return TARGET_IDS.has(clean(value).toUpperCase());
}

function sourceFor(item) {
  const source = CATALOG.sources[item.sourceRef] || {};
  return {
    url:clean(source.url),
    section:clean(source.section || '4.2'),
    verificationStatus:'official-source-verified',
    verifiedAt:clean(source.retrievedAt || CATALOG.updatedAt),
    sourceKey:clean(source.sourceKey),
    authority:clean(source.authority),
  };
}

function normalizeText(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function aliases(item) {
  const base = [item.canonicalName, item.atcCode, item.id];
  if (item.id === 'GENERIC-AMOXICILLIN-CLAVULANIC-ACID') {
    base.push('amoxicillin clavulanic acid','amoxicillin clavulanate','co-amoxiclav','amoksiklav','amoksicilin klavulanik');
  }
  if (item.id === 'GENERIC-SULFAMETHOXAZOLE-TRIMETHOPRIM') {
    base.push('trimethoprim sulfamethoxazole','co-trimoxazole','cotrimoxazole','bactrim','tmp smx');
  }
  if (item.id === 'GENERIC-CEFTRIAXONE') base.push('ceftriaxon','ceftriakson');
  if (item.id === 'GENERIC-AMOXICILLIN') base.push('amoksicilin','amoxicilin');
  return base.map(normalizeText);
}

function matches(item, query) {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const haystack = aliases(item).join(' ');
  return tokens.every(token => haystack.includes(token));
}

function facets(results) {
  return { all:results.length, ready:results.length, text:0, blocked:0 };
}

function searchResult(item) {
  return {
    drugId:item.id,
    registryNumber:null,
    pdid:'',
    name:item.canonicalName,
    substance:item.canonicalName,
    strength:'',
    form:'Substancë aktive',
    atcCode:item.atcCode,
    readiness:'CALCULATOR_READY',
    calculable:true,
    useStatus:'pediatric_only',
    indication:'Dozim pediatrik sipas SmPC',
    summary:item.summary,
    runtime:'generic-smpc',
    genericSubstance:true,
  };
}

function search(query, rawLimit = 20) {
  const limit = Math.max(1, Math.min(20, Number(rawLimit) || 20));
  const results = CATALOG.substances.filter(item => matches(item, query)).slice(0, limit).map(searchResult);
  return { results, facets:facets(results) };
}

function ageParts(body = {}) {
  const age = body.age && typeof body.age === 'object' ? body.age : {};
  const value = finite(age.value ?? body.ageValue ?? body.ageMonths);
  if (value === null || value < 0) return { value:null, unit:'', days:null, months:null };
  const unit = clean(age.unit ?? body.ageUnit ?? (body.ageMonths != null ? 'muaj' : '')).toLowerCase();
  const dayFactor = {
    'ditë':1,'dite':1,'day':1,'days':1,
    'javë':7,'jave':7,'week':7,'weeks':7,
    'muaj':30.4375,'month':30.4375,'months':30.4375,
    'vjet':365.25,'vit':365.25,'year':365.25,'years':365.25,
  }[unit];
  if (!dayFactor) return { value, unit, days:null, months:null };
  const days = value * dayFactor;
  return { value, unit, days, months:days / 30.4375 };
}

function patient(body = {}) {
  const age = ageParts(body);
  return {
    weightKg:finite(body.weightKg ?? body.weight),
    ageDays:age.days,
    ageMonths:age.months,
    crClMlMin:finite(body.crClMlMin ?? body.crcl),
    clinicalVariant:clean(body.clinicalVariant ?? body.clinical_variant),
  };
}

function optionRequirements(item, option) {
  const advancedInputs = [];
  let clinicalVariant = false;
  if (option.renalPolicy === 'coamoxiclav_crcl') advancedInputs.push('CrCl_mL_min');
  if (option.renalPolicy === 'amoxicillin' || option.renalPolicy === 'ceftriaxone' || option.clinicalPolicy === 'cotrimoxazole_normal_only') {
    clinicalVariant = true;
  }
  return {
    weight:true,
    height:false,
    age:Boolean(option.minAgeDays != null || option.minAgeMonths != null || option.maxAgeMonths != null),
    ageDays:false,
    treatmentDay:false,
    clinicalVariant,
    advancedInputs,
  };
}

function variantsFor(item, option) {
  if (option.renalPolicy === 'amoxicillin' || option.renalPolicy === 'ceftriaxone') return item.renalVariants || [];
  if (option.clinicalPolicy === 'cotrimoxazole_normal_only') return item.clinicalVariants || [];
  return [];
}

function optionPublic(item, option) {
  const source = sourceFor(item);
  const variants = variantsFor(item, option);
  return {
    selectionId:option.id,
    indicationId:option.id,
    indicationKey:option.id,
    indication:option.label,
    route:option.route,
    valid:true,
    autoSelected:false,
    ruleCount:1,
    requires:optionRequirements(item, option),
    clinicalVariants:variants,
    treatmentDayRange:null,
    regimen:{
      indication:option.label,
      route:option.route,
      basis:option.method === 'dose_per_kg_per_day' ? 'per_day' : 'per_dose',
      dosesPerDay:option.timesPerDay,
      intervalHours:option.timesPerDay === 2 ? 12 : option.timesPerDay === 3 ? 8 : option.timesPerDay === 1 ? 24 : null,
      minWeightKg:null,
      maxWeightKg:option.maxWeightKg ?? null,
      durationText:option.durationText || '',
      selectionNote:option.selectionNote || '',
    },
    source,
  };
}

function identity(item) {
  return {
    drugId:item.id,
    registryNumber:null,
    pdid:'',
    name:item.canonicalName,
    substance:item.canonicalName,
    strength:'',
    form:'Substancë aktive',
    atcCode:item.atcCode,
  };
}

function informationalRegimens(item) {
  return (item.informationalRegimens || []).map((entry,index) => ({
    id:`${item.id}-INFO-${index + 1}`,
    source_key:`${item.id}-INFO-${index + 1}`,
    indication:entry.indication,
    dose_text:entry.text,
    route:'',
    calculation_status:'manual_review',
    verification_status:'official-source-verified',
  }));
}

function buildProduct(rawId) {
  const id = clean(rawId).toUpperCase();
  const item = byId.get(id);
  if (!item) return null;
  const options = item.options.map(option => optionPublic(item, option));
  const selected = options.length === 1 ? { ...options[0], autoSelected:true } : null;
  const source = sourceFor(item);
  return {
    ...identity(item),
    runtime:'generic-smpc',
    runtimeLabel:'SmPC generic',
    readiness:'CALCULATOR_READY',
    calculable:true,
    requires:selected?.requires || {weight:false,height:false,age:false,ageDays:false,treatmentDay:false,clinicalVariant:false,advancedInputs:[]},
    reasons:[],
    warnings:[...(item.warnings || [])],
    missing:[],
    useStatus:'pediatric_only',
    populationKey:'PEDIATRIC_ONLY',
    restriction:'',
    summary:item.summary,
    regimen:selected?.regimen || {},
    calculationRegimen:selected || {valid:false,selectionId:'',indication:'',route:'',requires:null},
    calculationOptions:options,
    textRegimens:informationalRegimens(item),
    source,
    genericSubstance:true,
    phase9Context:{
      contextVersion:VERSION,
      identityStatus:'GENERIC_ACTIVE_SUBSTANCE',
      formKey:'GENERIC_SUBSTANCE',
      releaseKey:'',
      routeKey:'',
      v3Published:false,
      v3ProductKey:'',
      v3VersionNo:null,
      source:{
        sourceKey:source.sourceKey,
        snapshotId:'',
        sourceTier:'official_smpc',
        documentVersion:'SmPC current at retrieval',
        documentDate:source.verifiedAt,
      },
    },
  };
}

function rangeText(range, unit) {
  if (!range) return '';
  const low = decimal(range.min);
  const high = decimal(range.max);
  return low === high ? `${low} ${unit}` : `${low}–${high} ${unit}`;
}

function baseRule(option) {
  return {
    ruleKey:option.id,
    patientGroup:'source_defined_age_band',
    calculationMethod:option.method,
    doseMinValue:option.doseMin,
    doseMaxValue:option.doseMax,
    doseUnit:'mg',
    doseBasis:option.method === 'dose_per_kg_per_day' ? 'per_day' : 'per_dose',
    timesPerDay:option.timesPerDay,
    maxSingleDoseMg:option.maxSingleDoseMg ?? null,
    maxDailyDoseMg:option.maxDailyDoseMg ?? null,
    minWeightKg:null,
    maxWeightKg:option.maxWeightKg ?? null,
    route:option.route,
  };
}

function eligibility(option, p) {
  const missing=[];
  if (!(p.weightKg > 0)) missing.push('weightKg');
  const needsAge = option.minAgeDays != null || option.minAgeMonths != null || option.maxAgeMonths != null;
  if (needsAge && p.ageDays === null) missing.push('age');
  if (option.renalPolicy === 'coamoxiclav_crcl' && p.crClMlMin === null) missing.push('CrCl_mL_min');
  if ((option.renalPolicy === 'amoxicillin' || option.renalPolicy === 'ceftriaxone' || option.clinicalPolicy === 'cotrimoxazole_normal_only') && !p.clinicalVariant) missing.push('clinicalVariant');
  if (missing.length) return {status:'needs-input',missing};

  if (option.maxWeightKg != null && p.weightKg > option.maxWeightKg) return {status:'out-of-range',reason:`Pesha është jashtë kufirit pediatrik të këtij regjimi (≤${option.maxWeightKg} kg).`};
  if (option.minAgeDays != null && p.ageDays < option.minAgeDays) return {status:'out-of-range',reason:`Mosha është nën kufirin e burimit (${option.minAgeDays} ditë).`};
  if (option.minAgeMonths != null && p.ageMonths < option.minAgeMonths) return {status:'out-of-range',reason:`Mosha është nën kufirin e burimit (${option.minAgeMonths} muaj).`};
  if (option.maxAgeMonths != null && p.ageMonths > option.maxAgeMonths) return {status:'out-of-range',reason:`Mosha është mbi kufirin pediatrik të këtij regjimi (${option.maxAgeMonths / 12} vjeç).`};
  return {status:'ok'};
}

function applyAmoxicillinRenal(option, p, warnings) {
  const variant = p.clinicalVariant;
  if (!['gfr_gt_30','gfr_10_30','gfr_lt_10','hemodialysis'].includes(variant)) {
    return {blocked:'Zgjidh kategorinë renale të verifikuar nga SmPC.'};
  }
  if (variant === 'gfr_gt_30') return {rule:baseRule(option)};
  if (variant === 'gfr_10_30') {
    warnings.push('Rregull renal SmPC: 15 mg/kg për dozë, 2×/ditë; maksimum 500 mg për dozë.');
    return {rule:{...baseRule(option),calculationMethod:'dose_per_kg_per_dose',doseMinValue:15,doseMaxValue:15,doseBasis:'per_dose',timesPerDay:2,maxSingleDoseMg:500,maxDailyDoseMg:1000}};
  }
  if (variant === 'gfr_lt_10') {
    warnings.push('Rregull renal SmPC: 15 mg/kg një herë/ditë; maksimum 500 mg/ditë.');
    return {rule:{...baseRule(option),calculationMethod:'dose_per_kg_per_dose',doseMinValue:15,doseMaxValue:15,doseBasis:'per_dose',timesPerDay:1,maxSingleDoseMg:500,maxDailyDoseMg:500}};
  }
  warnings.push('Hemodializë: 15 mg/kg/ditë një herë (max 500 mg), plus 15 mg/kg para dhe 15 mg/kg pas hemodializës sipas SmPC. Dozat suplementare shfaqen si paralajmërim dhe nuk shtohen automatikisht në totalin ditor bazë.');
  return {rule:{...baseRule(option),calculationMethod:'dose_per_kg_per_dose',doseMinValue:15,doseMaxValue:15,doseBasis:'per_dose',timesPerDay:1,maxSingleDoseMg:500,maxDailyDoseMg:500}};
}

function applyCeftriaxoneContext(option, p, warnings) {
  const variant = p.clinicalVariant;
  if (!['standard_context','crcl_lt10_hepatic_not_impaired','severe_renal_and_hepatic'].includes(variant)) {
    return {blocked:'Zgjidh kontekstin renal/hepatik të verifikuar nga SmPC.'};
  }
  if (variant === 'severe_renal_and_hepatic') return {blocked:'Dëmtimi renal dhe hepatik i rëndë kërkon monitorim klinik të afërt; auto-kalkulimi bllokohet.'};
  const rule=baseRule(option);
  if (variant === 'crcl_lt10_hepatic_not_impaired') {
    rule.maxDailyDoseMg = rule.maxDailyDoseMg ? Math.min(rule.maxDailyDoseMg,2000) : 2000;
    warnings.push('CrCl <10 mL/min: doza ditore e ceftriaxone nuk duhet të kalojë 2 g sipas SmPC.');
  }
  return {rule};
}

function applyCoamoxContext(option, p, warnings) {
  if (p.crClMlMin < 30) return {blocked:'Për formulimin 7:1, CrCl <30 mL/min nuk rekomandohet sepse SmPC nuk jep skemë rregullimi.'};
  warnings.push('CrCl ≥30 mL/min: SmPC nuk kërkon rregullim doze për formulimin 7:1.');
  return {rule:baseRule(option)};
}

function applyCotrimoxazoleContext(option, p) {
  if (p.clinicalVariant !== 'normal_renal_no_hepatic_impairment') {
    return {blocked:'Te fëmijët ≤12 vjeç SmPC nuk jep skemë për insuficiencë renale dhe nuk jep të dhëna dozimi për dëmtim hepatik; kërkohet review manual.'};
  }
  return {rule:baseRule(option)};
}

function scheduleText(option, result) {
  if (option.scheduleText) return option.scheduleText;
  if (result?.schedule?.timesPerDay) return `${result.schedule.timesPerDay}×/ditë`;
  return 'sipas regjimit';
}

function publicCalculation(item, option, p, result, warnings, paired) {
  const source = sourceFor(item);
  const reasons = [...(result.reasons || [])];
  if (result.reason) reasons.push(result.reason);
  const outcomeMap={
    [Core.OUTCOME.CALCULATED]:'CALCULATED',
    [Core.OUTCOME.RANGE]:'CALCULATED',
    [Core.OUTCOME.DAILY_ONLY]:'CALCULATED',
    [Core.OUTCOME.NEEDS_INPUT]:'NEEDS_PATIENT_DATA',
    [Core.OUTCOME.OUT_OF_RANGE]:'OUT_OF_RANGE',
    [Core.OUTCOME.MANUAL_REVIEW]:'NOT_CALCULABLE',
    [Core.OUTCOME.INVALID_RULE]:'NOT_CALCULABLE',
  };
  const outputWarnings=[...(item.warnings || []),...warnings];
  if (option.selectionNote) outputWarnings.push(option.selectionNote);
  if (option.durationText) outputWarnings.push(`Kohëzgjatja nga burimi: ${option.durationText}.`);
  if (paired) outputWarnings.push(paired.warning);
  return {
    outcome:outcomeMap[result.outcome] || 'NOT_CALCULABLE',
    runtime:'generic-smpc',
    drug:identity(item),
    regimenId:option.id,
    regimenUuid:option.id,
    indication:option.label,
    route:option.route,
    readiness:'CALCULATOR_READY',
    doseUnit:paired?.primaryUnit || 'mg',
    isRate:false,
    perDose:result.perDose || null,
    daily:result.daily || null,
    dosesPerDay:option.timesPerDay,
    measure:null,
    bsa:null,
    cappedBy:result.cappedBy || [],
    warnings:outputWarnings,
    reasons,
    missing:result.missing || [],
    schedule:result.schedule || {},
    scheduleText:scheduleText(option,result),
    steps:[
      p.weightKg != null ? {label:'Pesha',value:p.weightKg,unit:'kg'} : null,
      p.ageDays != null && (option.minAgeDays != null || option.minAgeMonths != null || option.maxAgeMonths != null) ? {label:'Mosha',value:decimal(p.ageDays,1),unit:'ditë (ekuivalent)'} : null,
      paired?.perDose ? {label:paired.pairedLabel + ' / dozë',value:paired.perDose.min===paired.perDose.max?paired.perDose.min:paired.perDose.max,unit:paired.pairedUnit} : null,
      paired?.daily ? {label:paired.pairedLabel + ' / ditë',value:paired.daily.min===paired.daily.max?paired.daily.min:paired.daily.max,unit:paired.pairedUnit} : null,
    ].filter(Boolean),
    componentBreakdown:paired || null,
    source,
  };
}

function pairedComponent(option, p, item) {
  if (option.pairedDoseMin == null || option.pairedDoseMax == null) return null;
  const daily = {
    min:decimal(option.pairedDoseMin * p.weightKg),
    max:decimal(option.pairedDoseMax * p.weightKg),
  };
  const perDose = option.timesPerDay
    ? {min:decimal(daily.min / option.timesPerDay),max:decimal(daily.max / option.timesPerDay)}
    : {...daily};
  if (item.id === 'GENERIC-AMOXICILLIN-CLAVULANIC-ACID') {
    return {
      primaryUnit:'mg amoxicillin',
      primaryLabel:'Amoxicillin',
      pairedLabel:'Clavulanic acid',
      pairedUnit:'mg',
      perDose,daily,
      warning:`Komponenti clavulanic acid: ${rangeText(perDose,'mg/dozë')} (${rangeText(daily,'mg/ditë')}).`,
    };
  }
  return {
    primaryUnit:'mg TMP',
    primaryLabel:'Trimethoprim',
    pairedLabel:'Sulfamethoxazole',
    pairedUnit:'mg SMX',
    perDose,daily,
    warning:`Komponenti sulfamethoxazole: ${rangeText(perDose,'mg SMX/dozë')} (${rangeText(daily,'mg SMX/ditë')}).`,
  };
}

function blockedCalculation(item, option, outcome, reasons, missing = []) {
  return {
    outcome,
    runtime:'generic-smpc',
    drug:identity(item),
    regimenId:option?.id || '',
    indication:option?.label || '',
    route:option?.route || '',
    readiness:'CALCULATOR_READY',
    reasons:Array.isArray(reasons)?reasons:[reasons].filter(Boolean),
    missing,
    warnings:[...(item.warnings || [])],
    source:sourceFor(item),
  };
}

function calculate(body = {}) {
  const offending=Object.keys(body || {}).filter(key=>FORBIDDEN_INPUT.test(key));
  if(offending.length) return {error:`Dozimi dhe indikacioni vijnë nga katalogu server-side. Hiq: ${offending.sort().join(', ')}.`,status:400};
  const id=clean(body.drugId).toUpperCase();
  const item=byId.get(id);
  if (!item) return {error:'Substanca aktive nuk u gjet në katalogun generic.',status:404};
  const optionId=clean(body.regimenId);
  if (!optionId) return {error:'Zgjidh indikacionin para llogaritjes.',status:400};
  const option=item.options.find(row=>row.id===optionId);
  if (!option) return {error:'Indikacioni i zgjedhur nuk i përket kësaj substance aktive.',status:400};

  const p=patient(body);
  const eligible=eligibility(option,p);
  if (eligible.status==='needs-input') return {calculation:blockedCalculation(item,option,'NEEDS_PATIENT_DATA',[],eligible.missing)};
  if (eligible.status==='out-of-range') return {calculation:blockedCalculation(item,option,'OUT_OF_RANGE',eligible.reason)};

  const warnings=[];
  let context;
  if (option.renalPolicy==='amoxicillin') context=applyAmoxicillinRenal(option,p,warnings);
  else if (option.renalPolicy==='coamoxiclav_crcl') context=applyCoamoxContext(option,p,warnings);
  else if (option.renalPolicy==='ceftriaxone') context=applyCeftriaxoneContext(option,p,warnings);
  else if (option.clinicalPolicy==='cotrimoxazole_normal_only') context=applyCotrimoxazoleContext(option,p,warnings);
  else context={rule:baseRule(option)};

  if (context.blocked) return {calculation:blockedCalculation(item,option,'NOT_CALCULABLE',context.blocked)};
  const result=Core.calculate(context.rule,{weightKg:p.weightKg});
  const paired=pairedComponent(option,p,item);
  return {calculation:publicCalculation(item,option,p,result,warnings,paired)};
}

module.exports={
  VERSION,
  CATALOG,
  isGenericId,
  search,
  buildProduct,
  calculate,
  _test:{FORBIDDEN_INPUT,clean,finite,normalizeText,aliases,matches,ageParts,patient,eligibility,baseRule,pairedComponent,sourceFor,optionPublic,applyAmoxicillinRenal,applyCoamoxContext,applyCeftriaxoneContext,applyCotrimoxazoleContext},
};
