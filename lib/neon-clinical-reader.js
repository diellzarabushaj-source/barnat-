'use strict';

const DosageEngine = require('../dosage-engine.js');
const Administration = require('../administration-routes.js');
const { neonRequest } = require('./neon-data-api.js');

const PAGE_SIZE = 1000;
const QUERY_TIMEOUT_MS = 8000;
const EXPECTED_MINIMUMS = Object.freeze({ drugs:3500, dosageRegimens:1400, icdCodes:650, labTests:100 });

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};
const sourceUrls = value => clean(value).split(/\s*;\s*/).filter(url => /^https:\/\//i.test(url));
const token = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq').replace(/[^a-z0-9]+/g, '');

function dataSourceMode() {
  const value = clean(process.env.MEDINDEX_DATA_SOURCE || 'hybrid').toLowerCase();
  return ['neon', 'hybrid', 'sheets'].includes(value) ? value : 'hybrid';
}
const shouldReadNeon = () => dataSourceMode() !== 'sheets';
const allowsSheetsFallback = () => dataSourceMode() === 'hybrid';

function queryPath(table, options = {}, offset = 0) {
  const params = new URLSearchParams();
  params.set('select', options.select || '*');
  params.set('limit', String(options.pageSize || PAGE_SIZE));
  params.set('offset', String(offset));
  for (const [key, value] of Object.entries(options.filters || {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  if (options.order) params.set('order', options.order);
  return `${table}?${params.toString()}`;
}

async function requestPage(path, timeoutMs = QUERY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data } = await neonRequest(path, { signal:controller.signal });
    if (!Array.isArray(data)) throw new Error('Neon Data API nuk ktheu listë të vlefshme.');
    return data;
  } finally { clearTimeout(timer); }
}

async function fetchPaged(table, options = {}) {
  const pageSize = options.pageSize || PAGE_SIZE;
  const maximum = options.maximum || 10000;
  const rows = [];
  for (let offset = 0; offset < maximum; offset += pageSize) {
    const page = await requestPage(queryPath(table, { ...options, pageSize }, offset), options.timeoutMs);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  if (rows.length >= maximum) throw new Error(`${table}: query tejkaloi kufirin ${maximum}.`);
  const minimum = Number(options.minimum || 0);
  if (minimum && rows.length < minimum) throw new Error(`${table}: Neon ktheu ${rows.length} rreshta; pritej së paku ${minimum}.`);
  return rows;
}

function mapDrugRow(row) {
  const source = row?.source_payload && typeof row.source_payload === 'object' ? { ...row.source_payload } : {};
  const mapped = {
    ...source,
    'Nr rendor':row.registry_number ?? source['Nr rendor'] ?? '',
    ProtocolNo:clean(row.protocol_no || source.ProtocolNo),
    PDID:clean(row.pdid || source.PDID),
    'Emri tregtar':clean(row.trade_name || source['Emri tregtar']),
    'Substanca aktive':clean(row.active_substance || source['Substanca aktive']),
    'ATC Code':clean(row.atc_code || source['ATC Code']),
    'Klasa / Çka është':clean(row.drug_class || source['Klasa / Çka është']),
    'Përdorimi (fjalë kyçe)':clean(row.use_text || source['Përdorimi (fjalë kyçe)']),
    Fortësia:clean(row.strength || source.Fortësia),
    'Forma farmaceutike':clean(row.pharmaceutical_form || source['Forma farmaceutike']),
    'Madhësia e paketimit':clean(row.packaging || source['Madhësia e paketimit']),
    'Bartësi i Autorizim Marketingut':clean(row.marketing_authorization_holder || source['Bartësi i Autorizim Marketingut']),
    Prodhuesi:clean(row.manufacturer || source.Prodhuesi),
    'MA certifikata':clean(row.ma_certificate || source['MA certifikata']),
    'Statusi ':clean(row.product_status || source['Statusi ']),
    'Çmimi me shumicë':row.wholesale_price ?? source['Çmimi me shumicë'] ?? '',
    'Çmimi me marzhë':row.wholesale_with_margin ?? source['Çmimi me marzhë'] ?? '',
    TVSH:clean(row.vat_text || source.TVSH),
    'Çmimi me pakicë':row.retail_price ?? source['Çmimi me pakicë'] ?? '',
    'Afati i vlefshmërisë':clean(row.validity_text || source['Afati i vlefshmërisë']),
    'Si të shënohet në recetë':clean(source['Si të shënohet në recetë']),
    __neonDrugId:clean(row.id),
    __neonSourceHash:clean(row.source_hash),
  };
  const administration = Administration.inferAdministration(mapped);
  mapped['Kategoria e administrimit'] = clean(source['Kategoria e administrimit'] || administration.category);
  mapped['Rrugët e lejuara'] = clean(source['Rrugët e lejuara'] || administration.routes.join('; '));
  mapped.__administrationCategory = mapped['Kategoria e administrimit'];
  mapped.__allowedRoutes = Administration.routeTokens(mapped['Rrugët e lejuara']);
  return mapped;
}

async function getPublishedDrugRecords() {
  return fetchPaged('drugs', {
    select:'id,registry_number,pdid,trade_name,active_substance,strength,pharmaceutical_form,atc_code,drug_class,use_text,protocol_no,packaging,marketing_authorization_holder,manufacturer,ma_certificate,product_status,wholesale_price,wholesale_with_margin,vat_text,retail_price,validity_text,source_payload,source_hash,updated_at',
    filters:{ is_published:'eq.true', editorial_status:'eq.published' }, order:'registry_number.asc', minimum:EXPECTED_MINIMUMS.drugs, maximum:6000,
  });
}
const getPublishedDrugs = async () => (await getPublishedDrugRecords()).map(mapDrugRow);
const regimenGroup = row => clean(row.source_key).split(':')[0].toLowerCase();

function addAdministration(result) {
  const inferred = Administration.inferAdministration(result);
  result.administrationCategory = inferred.category;
  result.allowedRoutes = inferred.routes;
  return result;
}

function adultRegimen(row) {
  const result = addAdministration({
    regimenId:clean(row.regimen_code || row.source_key), substance:clean(row.active_substance), atc:clean(row.atc_code),
    form:clean(row.pharmaceutical_form), referenceStrength:clean(row.reference_strength), indication:clean(row.indication_text), icd:'',
    population:'adult', doseMg:clean(row.dose_text), practicalUnit:'', unitCount:'', route:clean(row.route),
    frequency:clean(row.frequency_text), intervalHours:numberOrNull(row.interval_hours), duration:clean(row.duration_text),
    prn:false, prnIndication:'', maxSingleMg:numberOrNull(row.max_single_mg), max24hMg:numberOrNull(row.max_daily_mg),
    maxUnits24h:'', dispense:'', signatura:clean(row.signatura_text || row.signatura_template), warnings:clean(row.warnings),
    renalHepatic:'', sourceUrl:/^https:\/\//i.test(clean(row.source_url)) ? clean(row.source_url) : '',
    sourceDate:row.reviewed_at || '', status:'VERIFIKUAR',
  });
  result.matchKey = DosageEngine.buildMatchKey(result);
  result.normalized = {
    atc:DosageEngine.normalizeAtc(result.atc), substance:DosageEngine.normalizeSubstance(result.substance),
    form:DosageEngine.normalizeForm(result.form), strength:DosageEngine.normalizeStrength(result.referenceStrength),
  };
  return result;
}

function pediatricRegimen(row) {
  const type = clean(row.calculation_type);
  const minimum = numberOrNull(row.dose_value_min);
  const maximum = numberOrNull(row.dose_value_max);
  const weightBased = /^mg_per_kg_(dose|day)(?:_range)?$/.test(type);
  const basis = /day/.test(type) ? 'ditë' : /dose/.test(type) ? 'dozë' : '';
  const result = addAdministration({
    regimenId:clean(row.regimen_code || row.source_key), substance:clean(row.active_substance), atc:clean(row.atc_code),
    form:clean(row.pharmaceutical_form), concentration:clean(row.reference_strength), indication:clean(row.indication_text), icd:'',
    minAgeMonths:numberOrNull(row.min_age_months), maxAgeMonths:numberOrNull(row.max_age_months),
    minWeightKg:numberOrNull(row.min_weight_kg), maxWeightKg:numberOrNull(row.max_weight_kg), regimenType:type,
    mgPerKg:weightBased && (maximum == null || maximum === minimum) ? minimum : null,
    mgPerKgMin:weightBased ? minimum : null, mgPerKgMax:weightBased ? (maximum ?? minimum) : null, basis,
    dosesPerDay:numberOrNull(row.doses_per_day), fixedDoseMg:type === 'fixed_dose' ? minimum : null,
    fixedVolumeMl:type === 'fixed_volume' ? minimum : null, concentrationMg:numberOrNull(row.concentration_mg),
    concentrationMl:numberOrNull(row.concentration_ml), route:clean(row.route), frequency:clean(row.frequency_text),
    intervalHours:numberOrNull(row.interval_hours), maxSingleMg:numberOrNull(row.max_single_mg),
    max24hMg:numberOrNull(row.max_daily_mg), maxDoses24h:null, duration:clean(row.duration_text), dispense:'',
    formula:clean(row.formula_text), signatura:clean(row.signatura_text || row.signatura_template), warnings:clean(row.warnings),
    sourceUrl:/^https:\/\//i.test(clean(row.source_url)) ? clean(row.source_url) : '',
    sourceDate:row.reviewed_at || '', status:'VERIFIKUAR',
  });
  result.matchKey = DosageEngine.buildMatchKey(result);
  result.normalized = {
    atc:DosageEngine.normalizeAtc(result.atc), substance:DosageEngine.normalizeSubstance(result.substance),
    form:DosageEngine.normalizeForm(result.form), strength:DosageEngine.normalizeStrength(result.concentration),
  };
  return result;
}

function cardFromPair(drug, adult, pediatric) {
  const source = drug?.source_payload && typeof drug.source_payload === 'object' ? drug.source_payload : {};
  const sourceList = [...new Set([...sourceUrls(adult?.source_url), ...sourceUrls(pediatric?.source_url)])];
  const administration = Administration.inferAdministration({
    form:drug.pharmaceutical_form,
    route:[adult?.route, pediatric?.route, source['Rrugët e lejuara']].filter(Boolean).join(' '),
    administrationCategory:source['Kategoria e administrimit'],
  });
  return {
    cardKey:[clean(drug.pdid), clean(drug.trade_name), clean(drug.strength)].join('|'), nr:clean(drug.registry_number),
    pdid:clean(drug.pdid), tradeName:clean(drug.trade_name), substance:clean(drug.active_substance), atc:clean(drug.atc_code),
    form:clean(drug.pharmaceutical_form), strength:clean(drug.strength), drugClass:clean(drug.drug_class || source['Klasa / Çka është']),
    use:clean(drug.use_text || source['Përdorimi (fjalë kyçe)']), adultDose:clean(adult?.dose_text), adultRoute:clean(adult?.route),
    pediatricDose:clean(pediatric?.dose_text), pediatricRoute:clean(pediatric?.route), sourceUrls:sourceList,
    auditedAt:adult?.reviewed_at || pediatric?.reviewed_at || '', auditNote:clean(adult?.warnings || pediatric?.warnings),
    administrationCategory:administration.category, allowedRoutes:administration.routes, status:'VERIFIKUAR',
  };
}

function formRowsFromDrugs(drugs) {
  const map = new Map();
  for (const row of drugs) {
    const form = clean(row.pharmaceutical_form);
    const formKey = token(form);
    if (!form || !formKey || map.has(formKey)) continue;
    const administration = Administration.inferAdministration({ form });
    map.set(formKey, {
      form, formKey, category:administration.category, prefix:'', route:administration.route,
      routeSuggested:Boolean(administration.route), unit:'', safetyNote:'', version:'neon-v2', reviewedAt:'',
    });
  }
  return [...map.values()].sort((a, b) => a.form.localeCompare(b.form, 'sq'));
}

async function getPublishedDosageRegimens() {
  const [regimens, drugs] = await Promise.all([
    fetchPaged('dosage_regimens', {
      select:'id,drug_id,population,dose_text,route,frequency_text,duration_text,maximum_text,warnings,calculation_status,calculation_type,dose_value_min,dose_value_max,doses_per_day,interval_hours,max_single_mg,max_daily_mg,concentration_mg,concentration_ml,min_age_months,max_age_months,min_weight_kg,max_weight_kg,signatura_template,reviewed_at,source_key,regimen_code,atc_code,active_substance,pharmaceutical_form,reference_strength,indication_text,source_url,signatura_text,formula_text,source_hash',
      filters:{ editorial_status:'eq.published', calculation_status:'in.(text_verified,calculable_verified)' },
      order:'source_key.asc', minimum:EXPECTED_MINIMUMS.dosageRegimens, maximum:2500,
    }),
    getPublishedDrugRecords(),
  ]);
  const adults = regimens.filter(row => regimenGroup(row) === 'adult' && row.population === 'adult').map(adultRegimen);
  const pediatric = regimens
    .filter(row => regimenGroup(row) === 'pediatric' && row.population === 'pediatric' && row.calculation_status === 'calculable_verified')
    .map(pediatricRegimen);
  const cardRows = regimens.filter(row => regimenGroup(row) === 'card' && row.drug_id);
  const byDrug = new Map();
  for (const row of cardRows) {
    if (!byDrug.has(row.drug_id)) byDrug.set(row.drug_id, {});
    byDrug.get(row.drug_id)[row.population] = row;
  }
  const cards = drugs.filter(drug => byDrug.has(drug.id))
    .map(drug => cardFromPair(drug, byDrug.get(drug.id).adult, byDrug.get(drug.id).pediatric))
    .filter(card => card.pdid && card.adultDose && card.adultRoute);
  if (cards.length < 600) throw new Error(`dosage cards: Neon ktheu vetëm ${cards.length}; pritej së paku 600.`);
  return { forms:formRowsFromDrugs(drugs), adult:adults, pediatric, cards, rawCount:regimens.length };
}

function mapIcdRow(row) {
  const priorityNumber = numberOrNull(row.priority_level);
  const priority = priorityNumber == null ? '' : `${priorityNumber} – I rëndësishëm`;
  return {
    code:clean(row.code), title:clean(row.title_sq), englishTitle:clean(row.title_en),
    level:/kategori/i.test(clean(row.level_name)) ? 'kategori' : 'kod', sourceLevel:clean(row.level_name),
    chapter:clean(row.chapter_code), chapterRange:'', chapterTitle:clean(row.chapter_title), group:clean(row.group_name),
    primaryCare:row.is_family_medicine ? 'E rëndësishme' : '', emergency:row.is_emergency ? 'Shumë i rëndësishëm' : '',
    priority, summary:clean(row.typical_use || row.description_sq), keywords:Array.isArray(row.tags) ? row.tags.map(clean).filter(Boolean) : [],
    warning:clean(row.warning_text), sourceUrl:/^https:\/\//i.test(clean(row.source_url)) ? clean(row.source_url) : '',
    codingNotes:[clean(row.coding_note)].filter(Boolean), includes:[], excludes:[], parent:clean(row.group_name || row.chapter_code),
    isFamilyMedicine:row.is_family_medicine === true, isEmergency:row.is_emergency === true, isCritical:row.is_critical === true,
  };
}

async function getPublishedIcdCodes() {
  const rows = await fetchPaged('icd_codes', {
    select:'code,title_sq,title_en,description_sq,chapter_code,chapter_title,priority_level,is_family_medicine,is_emergency,tags,level_name,group_name,typical_use,warning_text,coding_note,is_critical,source_url,updated_at',
    filters:{ is_published:'eq.true', editorial_status:'eq.published' }, order:'code.asc', minimum:EXPECTED_MINIMUMS.icdCodes, maximum:1500,
  });
  const entries = rows.map(mapIcdRow);
  return {
    source:'Neon Postgres', version:'ICD-10-WHO 2019', generatedAt:new Date().toISOString(),
    counts:{ total:entries.length, familyMedicine:entries.filter(entry => entry.isFamilyMedicine).length,
      emergency:entries.filter(entry => entry.isEmergency).length, critical:entries.filter(entry => entry.isCritical).length },
    entries,
  };
}

async function getPublishedLabTests() {
  const [categories, tests] = await Promise.all([
    fetchPaged('lab_categories', { select:'id,category_number,title,description', order:'category_number.asc', minimum:10, maximum:100 }),
    fetchPaged('lab_tests', {
      select:'id,category_id,form_name,full_name_en,full_name_sq,what_it_shows,high_when,low_when,source_url,updated_at',
      filters:{ is_published:'eq.true', editorial_status:'eq.published' }, order:'form_name.asc', minimum:EXPECTED_MINIMUMS.labTests, maximum:500,
    }),
  ]);
  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const counts = new Map();
  tests.forEach(test => counts.set(test.category_id, (counts.get(test.category_id) || 0) + 1));
  const mappedCategories = categories.map(category => ({
    id:`category-${category.category_number}`, number:Number(category.category_number), label:`Kategoria ${category.category_number}`,
    title:clean(category.title), description:clean(category.description), count:counts.get(category.id) || 0,
  }));
  const categoryIds = new Map(categories.map(category => [category.id, `category-${category.category_number}`]));
  const mappedTests = tests.map((test, index) => {
    const category = categoryMap.get(test.category_id);
    return {
      id:clean(test.id) || `lab-${index + 1}`, categoryId:categoryIds.get(test.category_id) || '',
      category:category ? `Kategoria ${category.category_number} – ${clean(category.title)}` : '', analysis:`Analiza ${index + 1}`,
      formName:clean(test.form_name), englishName:clean(test.full_name_en), albanianName:clean(test.full_name_sq),
      whatItShows:clean(test.what_it_shows), highPositiveAbnormal:clean(test.high_when), lowNegativeNormal:clean(test.low_when),
      sourceUrl:/^https:\/\//i.test(clean(test.source_url)) ? clean(test.source_url) : '',
    };
  });
  return {
    source:'Neon Postgres', sourceUrl:'',
    sourceNote:'Të dhënat e publikuara ruhen në Neon Postgres dhe sinkronizohen nga burimi editorial i aprovuar.',
    generatedAt:new Date().toISOString(),
    headers:{ highPositiveAbnormal:'Kur rritet / rezulton pozitive / gjetje jonormale', lowNegativeNormal:'Kur ulet / rezulton negative / gjetje normale' },
    categories:mappedCategories, tests:mappedTests,
  };
}

module.exports = {
  EXPECTED_MINIMUMS, dataSourceMode, shouldReadNeon, allowsSheetsFallback, fetchPaged, mapDrugRow,
  adultRegimen, pediatricRegimen, mapIcdRow, getPublishedDrugs, getPublishedDrugRecords,
  getPublishedDosageRegimens, getPublishedIcdCodes, getPublishedLabTests,
};