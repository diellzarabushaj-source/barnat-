'use strict';

const crypto = require('node:crypto');
const { neonRequest } = require('./neon-data-api');

const MODES = new Set(['neon', 'hybrid', 'sheets']);
const PAGE_SIZE = 1000;
const QUERY_TIMEOUT_MS = 5000;
const MINIMUMS = Object.freeze({
  drugs: 3500,
  dosage: 1400,
  icd: 700,
  labs: 110,
});

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function dataSourceMode() {
  const requested = clean(process.env.MEDINDEX_DATA_SOURCE || 'hybrid').toLowerCase();
  return MODES.has(requested) ? requested : 'hybrid';
}

function allowNeon(mode = dataSourceMode()) {
  return mode !== 'sheets';
}

function allowSheetsFallback(mode = dataSourceMode()) {
  return mode !== 'neon';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function assertRows(scope, rows, minimum = MINIMUMS[scope] || 1, uniqueKey = null) {
  if (!Array.isArray(rows) || rows.length < minimum) {
    throw new Error(`Neon ${scope} ktheu ${Array.isArray(rows) ? rows.length : 0} rreshta; priten së paku ${minimum}.`);
  }
  if (uniqueKey) {
    const seen = new Set();
    for (const row of rows) {
      const key = clean(typeof uniqueKey === 'function' ? uniqueKey(row) : row?.[uniqueKey]);
      if (!key) throw new Error(`Neon ${scope} përmban çelës unik bosh.`);
      if (seen.has(key)) throw new Error(`Neon ${scope} përmban duplikatë për çelësin ${key}.`);
      seen.add(key);
    }
  }
  return rows;
}

async function withTimeout(factory, label, timeoutMs = QUERY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const value = await factory(controller.signal);
    return { value, durationMs:Date.now() - startedAt };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label} tejkaloi ${timeoutMs} ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAll(table, select, filters = '', options = {}) {
  const output = [];
  const pageSize = Math.min(1000, Math.max(50, Number(options.pageSize || PAGE_SIZE)));
  const maximum = Math.max(pageSize, Number(options.maximum || 10000));
  for (let offset = 0; offset < maximum; offset += pageSize) {
    const path = `${table}?select=${encodeURIComponent(select)}&limit=${pageSize}&offset=${offset}${filters}`;
    const { data } = await neonRequest(path, { signal:options.signal });
    const rows = Array.isArray(data) ? data : [];
    output.push(...rows);
    if (rows.length < pageSize) return output;
  }
  throw new Error(`Neon ${table} tejkaloi kufirin e pagination-it (${maximum}).`);
}

function mapDrugRow(record) {
  const source = plainObject(record.source_payload);
  return {
    ...source,
    'Nr rendor':record.registry_number ?? source['Nr rendor'] ?? '',
    ProtocolNo:clean(record.protocol_no ?? source.ProtocolNo),
    PDID:clean(record.pdid ?? source.PDID),
    'Emri tregtar':clean(record.trade_name ?? source['Emri tregtar']),
    'Substanca aktive':clean(record.active_substance ?? source['Substanca aktive']),
    'ATC Code':clean(record.atc_code ?? source['ATC Code']),
    'Klasa / Çka është':clean(record.drug_class ?? source['Klasa / Çka është']),
    'Përdorimi (fjalë kyçe)':clean(record.use_text ?? source['Përdorimi (fjalë kyçe)']),
    Fortësia:clean(record.strength ?? source.Fortësia),
    'Forma farmaceutike':clean(record.pharmaceutical_form ?? source['Forma farmaceutike']),
    'Madhësia e paketimit':clean(record.packaging ?? source['Madhësia e paketimit']),
    'Bartësi i Autorizim Marketingut':clean(record.marketing_authorization_holder ?? source['Bartësi i Autorizim Marketingut']),
    Prodhuesi:clean(record.manufacturer ?? source.Prodhuesi),
    'MA certifikata':clean(record.ma_certificate ?? source['MA certifikata']),
    'Statusi ':clean(record.product_status ?? source['Statusi ']),
    'Çmimi me shumicë':record.wholesale_price ?? source['Çmimi me shumicë'] ?? '',
    'Çmimi me marzhë':record.wholesale_with_margin ?? source['Çmimi me marzhë'] ?? '',
    TVSH:clean(record.vat_text ?? source.TVSH),
    'Çmimi me pakicë':record.retail_price ?? source['Çmimi me pakicë'] ?? '',
    'Afati i vlefshmërisë':clean(record.validity_text ?? source['Afati i vlefshmërisë']),
    __neonId:record.id,
    __neonSourceHash:clean(record.source_hash),
    __neonEditorialStatus:clean(record.editorial_status),
  };
}

function dosageMatchFields(record) {
  return {
    regimenId:clean(record.regimen_code || record.source_key),
    substance:clean(record.active_substance),
    atc:clean(record.atc_code),
    form:clean(record.pharmaceutical_form),
    indication:clean(record.indication_text),
    route:clean(record.route),
    frequency:clean(record.frequency_text),
    intervalHours:numberOrNull(record.interval_hours),
    duration:clean(record.duration_text),
    maxSingleMg:numberOrNull(record.max_single_mg),
    max24hMg:numberOrNull(record.max_daily_mg),
    signatura:clean(record.signatura_text || record.signatura_template),
    warnings:clean(record.warnings),
    sourceUrl:/^https:\/\//i.test(clean(record.source_url)) ? clean(record.source_url) : '',
    status:'VERIFIKUAR',
  };
}

function mapAdultRegimen(record, DosageEngine) {
  const result = {
    ...dosageMatchFields(record),
    referenceStrength:clean(record.reference_strength),
    population:'adult',
    doseMg:clean(record.dose_text),
    practicalUnit:'',
    unitCount:'',
    prn:false,
    prnIndication:'',
    maxUnits24h:'',
    dispense:'',
    renalHepatic:'',
    sourceDate:record.reviewed_at || '',
  };
  result.matchKey = DosageEngine.buildMatchKey(result);
  result.normalized = {
    atc:DosageEngine.normalizeAtc(result.atc),
    substance:DosageEngine.normalizeSubstance(result.substance),
    form:DosageEngine.normalizeForm(result.form),
    strength:DosageEngine.normalizeStrength(result.referenceStrength),
  };
  return result;
}

function pediatricBasis(type) {
  if (type === 'mg_per_kg_day') return 'ditë';
  if (type === 'mg_per_kg_dose' || type === 'mcg_per_kg_dose' || type === 'ml_per_kg_dose') return 'dozë';
  return '';
}

function mapPediatricRegimen(record, DosageEngine) {
  const type = clean(record.calculation_type);
  const value = numberOrNull(record.dose_value_min);
  const result = {
    ...dosageMatchFields(record),
    population:'pediatric',
    concentration:clean(record.reference_strength),
    minAgeMonths:numberOrNull(record.min_age_months),
    maxAgeMonths:numberOrNull(record.max_age_months),
    minWeightKg:numberOrNull(record.min_weight_kg),
    maxWeightKg:numberOrNull(record.max_weight_kg),
    regimenType:type,
    mgPerKg:type.startsWith('mg_per_kg_') ? value : null,
    basis:pediatricBasis(type),
    dosesPerDay:numberOrNull(record.doses_per_day),
    fixedDoseMg:type === 'fixed_dose' ? value : null,
    fixedVolumeMl:type === 'fixed_volume' ? value : null,
    maxDoses24h:null,
    dispense:'',
    formula:clean(record.formula_text),
    sourceDate:record.reviewed_at || '',
  };
  result.matchKey = DosageEngine.buildMatchKey(result);
  result.normalized = {
    atc:DosageEngine.normalizeAtc(result.atc),
    substance:DosageEngine.normalizeSubstance(result.substance),
    form:DosageEngine.normalizeForm(result.form),
    strength:DosageEngine.normalizeStrength(result.concentration),
  };
  return result;
}

function mapIcdEntry(record) {
  const code = clean(record.code).toUpperCase();
  const levelName = clean(record.level_name);
  const level = levelName.toLocaleLowerCase('sq').includes('kategori') ? 'kategori' : 'kod';
  const priority = numberOrNull(record.priority_level);
  return {
    number:'',
    chapter:clean(record.chapter_code),
    chapterRange:'',
    chapterTitle:clean(record.chapter_title),
    group:clean(record.group_name),
    code,
    level,
    sourceLevel:levelName,
    title:clean(record.title_sq),
    englishTitle:clean(record.title_en),
    primaryCare:record.is_family_medicine ? 'E rëndësishme' : '',
    emergency:record.is_emergency ? 'Shumë i rëndësishëm' : '',
    priority:priority == null ? '' : `${priority} – Prioritet`,
    summary:clean(record.typical_use || record.description_sq),
    keywords:Array.isArray(record.tags) ? record.tags.map(clean).filter(Boolean) : [],
    warning:clean(record.warning_text),
    sourceUrl:/^https:\/\/i.test(clean(record.source_url)) ? clean(record.source_url) : `https://icd.who.int/browse10/2019/en#/${encodeURIComponent(code)}`,
    codingNotes:[clean(record.coding_note)].filter(Boolean),
    includes:[],
    excludes:[],
    parent:clean(record.group_name || record.chapter_code),
    isFamilyMedicine:record.is_family_medicine === true,
    isEmergency:record.is_emergency === true,
    isCritical:record.is_critical === true,
  };
}

function labCategoryId(number) {
  return `category-${Number(number)}`;
}

function mapLabDataset(categories, tests) {
  const sortedCategories = [...categories].sort((a, b) => Number(a.category_number) - Number(b.category_number));
  const categoryMap = new Map(sortedCategories.map(row => [row.id, row]));
  const categoryCounts = new Map();
  const mappedTests = [...tests]
    .sort((a, b) => {
      const ac = Number(categoryMap.get(a.category_id)?.category_number || 999);
      const bc = Number(categoryMap.get(b.category_id)?.category_number || 999);
      return ac - bc || clean(a.form_name).localeCompare(clean(b.form_name), 'sq');
    })
    .map((row, index) => {
      const category = categoryMap.get(row.category_id);
      const number = Number(category?.category_number || 0);
      categoryCounts.set(number, (categoryCounts.get(number) || 0) + 1);
      return {
        id:clean(row.id || `lab-${index + 1}`),
        analysis:`Analiza ${index + 1}`,
        categoryId:labCategoryId(number),
        category:`Kategoria ${number} – ${clean(category?.title)}`,
        formName:clean(row.form_name),
        englishName:clean(row.full_name_en),
        albanianName:clean(row.full_name_sq),
        whatItShows:clean(row.what_it_shows),
        highPositiveAbnormal:clean(row.high_when),
        lowNegativeNormal:clean(row.low_when),
        sourceUrl:/^https:\/\//i.test(clean(row.source_url)) ? clean(row.source_url) : '',
      };
    });
  const mappedCategories = sortedCategories.map(row => {
    const number = Number(row.category_number);
    return {
      id:labCategoryId(number),
      number,
      label:`Kategoria ${number}`,
      title:clean(row.title),
      description:clean(row.description),
      count:categoryCounts.get(number) || 0,
    };
  });
  return {
    version:'neon-v1',
    generatedAt:new Date().toISOString(),
    sourceNote:'Të dhënat po lexohen nga kopja e sink