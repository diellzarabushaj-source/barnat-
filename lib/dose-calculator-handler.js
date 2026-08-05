'use strict';

const crypto = require('node:crypto');
const { neonRequest } = require('../lib/neon-data-api.js');

const PAGE_SIZE = 1000;
const MAX_ROWS = 6000;
const CACHE_MS = 5 * 60 * 1000;
const ALLOWED_STATUSES = new Set(['verified', 'published']);
const ALLOWED_METHODS = new Set([
  'fixed_dose',
  'fixed_volume',
  'dose_per_kg_per_dose',
  'dose_per_kg_per_day',
  'dose_per_m2_per_dose',
  'dose_per_m2_per_day',
  'age_band_fixed',
  'manual_only',
]);

let memoryCache = null;
let memoryCacheAt = 0;
let pendingBuild = null;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};
const booleanValue = value => value === true || String(value).toLowerCase() === 'true';
const validHttps = value => /^https:\/\/[^\s]+$/i.test(clean(value));
const statusAllowed = value => ALLOWED_STATUSES.has(clean(value).toLowerCase());

function queryPath(table, select, offset) {
  const params = new URLSearchParams();
  params.set('select', select);
  params.set('active', 'eq.true');
  params.set('editorial_status', 'in.(verified,published)');
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  return `${table}?${params.toString()}`;
}

async function fetchVerifiedRows(table, select) {
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data } = await neonRequest(queryPath(table, select, offset), {
      timeoutMs:8000,
      label:`Dose calculator ${table}`,
    });
    if (!Array.isArray(data)) throw new Error(`${table} nuk ktheu listë të vlefshme.`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${table} tejkaloi kufirin e sigurisë prej ${MAX_ROWS} rreshtash.`);
}

function groupCovers(productGroup, ruleGroup) {
  if (productGroup === 'pediatric_and_adult') return true;
  return productGroup === ruleGroup;
}

function sourcePublic(row) {
  return {
    sourceKey:clean(row.source_key),
    name:clean(row.source_name),
    publisher:clean(row.publisher),
    type:clean(row.source_type),
    url:clean(row.source_url),
    documentDate:row.document_date || null,
    sectionPage:clean(row.section_page),
    official:true,
  };
}

function rulePublic(rule, indication, source, link) {
  return {
    ruleKey:clean(rule.rule_key),
    indicationKey:clean(rule.indication_key),
    indicationName:clean(indication.indication_name),
    icdCode:clean(indication.icd_code),
    patientGroup:clean(rule.patient_group),
    calculationMethod:clean(rule.calculation_method),
    doseMinValue:numberOrNull(rule.dose_min_value),
    doseMaxValue:numberOrNull(rule.dose_max_value),
    doseUnit:clean(rule.dose_unit),
    doseBasis:clean(rule.dose_basis),
    weightBasis:clean(rule.weight_basis),
    frequencyMode:clean(rule.frequency_mode),
    intervalMinHours:numberOrNull(rule.interval_min_hours),
    intervalMaxHours:numberOrNull(rule.interval_max_hours),
    timesPerDay:numberOrNull(rule.times_per_day),
    maxSingleDoseMg:numberOrNull(rule.max_single_dose_mg),
    maxDailyDoseMg:numberOrNull(rule.max_daily_dose_mg),
    maxDoses24h:numberOrNull(rule.max_doses_24h),
    durationMode:clean(rule.duration_mode),
    durationMinDays:numberOrNull(rule.duration_min_days),
    durationMaxDays:numberOrNull(rule.duration_max_days),
    reviewAfterDays:numberOrNull(rule.review_after_days),
    minAgeMonths:numberOrNull(rule.min_age_months ?? indication.min_age_months),
    maxAgeMonths:numberOrNull(rule.max_age_months ?? indication.max_age_months),
    minWeightKg:numberOrNull(rule.min_weight_kg ?? indication.min_weight_kg),
    maxWeightKg:numberOrNull(rule.max_weight_kg ?? indication.max_weight_kg),
    route:clean(rule.route),
    prn:booleanValue(rule.prn),
    renalAdjustmentRequired:booleanValue(rule.renal_adjustment_required),
    specialistOnly:booleanValue(rule.specialist_only),
    outOfRangeAction:clean(rule.out_of_range_action) || 'block',
    clinicalNotes:clean(rule.clinical_notes),
    plainLanguageTemplate:clean(rule.plain_language_template),
    versionNo:numberOrNull(rule.version_no) || 1,
    verifiedBy:clean(rule.verified_by),
    verifiedAt:rule.verified_at || null,
    conversion:{
      enabled:booleanValue(link.conversion_enabled),
      tabletSplitAllowed:booleanValue(link.tablet_split_allowed),
      roundingIncrementValue:numberOrNull(link.rounding_increment_value),
      roundingIncrementUnit:clean(link.rounding_increment_unit),
      status:clean(link.conversion_status),
    },
    source:sourcePublic(source),
  };
}

function productPublic(product, rules) {
  const numerator = numberOrNull(product.numerator_value);
  const denominator = numberOrNull(product.denominator_value);
  const numeratorUnit = clean(product.numerator_unit);
  const denominatorUnit = clean(product.denominator_unit);
  const strength = numerator !== null && denominator !== null
    ? `${numerator} ${numeratorUnit}/${denominator} ${denominatorUnit}`
    : '';
  return {
    productKey:clean(product.product_key),
    drugId:clean(product.drug_id),
    registryNumber:numberOrNull(product.registry_number),
    pdid:clean(product.pdid),
    tradeName:clean(product.trade_name),
    activeSubstance:clean(product.active_substance),
    atcCode:clean(product.atc_code),
    pharmaceuticalForm:clean(product.pharmaceutical_form),
    route:clean(product.route),
    patientGroup:clean(product.patient_group),
    numeratorValue:numerator,
    numeratorUnit,
    denominatorValue:denominator,
    denominatorUnit,
    displayLabel:[clean(product.trade_name), strength].filter(Boolean).join(' — '),
    tabletSplitDenominator:numberOrNull(product.tablet_split_denominator) || 1,
    isScored:booleanValue(product.is_scored),
    measurableIncrementMl:numberOrNull(product.measurable_increment_ml),
    roundingMode:clean(product.rounding_mode) || 'exact',
    versionNo:numberOrNull(product.version_no) || 1,
    rules,
  };
}

async function buildCatalog() {
  const startedAt = Date.now();
  const [sources, indications, products, rules, links] = await Promise.all([
    fetchVerifiedRows('dose_sources_v2', 'source_key,source_name,publisher,source_type,source_url,document_date,section_page,official_source,editorial_status'),
    fetchVerifiedRows('dose_indications_v2', 'indication_key,indication_name,icd_code,patient_group,min_age_months,max_age_months,min_weight_kg,max_weight_kg,source_key,editorial_status'),
    fetchVerifiedRows('dose_products_v2', 'product_key,drug_id,registry_number,pdid,trade_name,active_substance,atc_code,pharmaceutical_form,route,patient_group,numerator_value,numerator_unit,denominator_value,denominator_unit,tablet_split_denominator,is_scored,measurable_increment_ml,rounding_mode,source_key,editorial_status,version_no'),
    fetchVerifiedRows('dose_rules_v2', 'rule_key,indication_key,patient_group,calculation_method,dose_min_value,dose_max_value,dose_unit,dose_basis,weight_basis,frequency_mode,interval_min_hours,interval_max_hours,times_per_day,max_single_dose_mg,max_daily_dose_mg,max_doses_24h,duration_mode,duration_min_days,duration_max_days,review_after_days,min_age_months,max_age_months,min_weight_kg,max_weight_kg,route,prn,renal_adjustment_required,specialist_only,out_of_range_action,source_key,editorial_status,verified_by,verified_at,clinical_notes,plain_language_template,version_no'),
    fetchVerifiedRows('dose_rule_products_v2', 'rule_product_key,rule_key,product_key,preferred,conversion_enabled,tablet_split_allowed,rounding_increment_value,rounding_increment_unit,conversion_status,editorial_status'),
  ]);

  const sourceMap = new Map(sources
    .filter(row => statusAllowed(row.editorial_status) && booleanValue(row.official_source) && validHttps(row.source_url))
    .map(row => [clean(row.source_key), row]));
  const indicationMap = new Map(indications
    .filter(row => statusAllowed(row.editorial_status) && sourceMap.has(clean(row.source_key)))
    .map(row => [clean(row.indication_key), row]));
  const ruleMap = new Map(rules
    .filter(row => statusAllowed(row.editorial_status)
      && ALLOWED_METHODS.has(clean(row.calculation_method))
      && indicationMap.has(clean(row.indication_key))
      && sourceMap.has(clean(row.source_key))
      && clean(row.verified_by)
      && row.verified_at)
    .map(row => [clean(row.rule_key), row]));

  const linksByProduct = new Map();
  links.forEach(link => {
    const productKey = clean(link.product_key);
    const rule = ruleMap.get(clean(link.rule_key));
    if (!productKey || !rule || !statusAllowed(link.editorial_status)) return;
    if (!booleanValue(link.conversion_enabled) || clean(link.conversion_status) === 'not_allowed') return;
    if (!linksByProduct.has(productKey)) linksByProduct.set(productKey, []);
    linksByProduct.get(productKey).push({ link, rule });
  });

  const catalog = [];
  products.forEach(product => {
    const productKey = clean(product.product_key);
    const productSource = sourceMap.get(clean(product.source_key));
    const connected = linksByProduct.get(productKey) || [];
    if (!productKey || !productSource || !statusAllowed(product.editorial_status) || !connected.length) return;
    const mappedRules = connected
      .filter(({ rule }) => groupCovers(clean(product.patient_group), clean(rule.patient_group)))
      .map(({ link, rule }) => {
        const indication = indicationMap.get(clean(rule.indication_key));
        const source = sourceMap.get(clean(rule.source_key));
        return indication && source ? rulePublic(rule, indication, source, link) : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.indicationName.localeCompare(b.indicationName, 'sq'));
    if (mappedRules.length) catalog.push(productPublic(product, mappedRules));
  });

  catalog.sort((a, b) => a.tradeName.localeCompare(b.tradeName, 'sq') || String(a.pdid).localeCompare(String(b.pdid)));
  const payload = {
    schemaVersion:'dose-calculator-v2.0.0',
    generatedAt:new Date().toISOString(),
    catalog,
    meta:{
      dataSource:'neon',
      failClosed:true,
      officialVerifiedOnly:true,
      products:catalog.length,
      rules:catalog.reduce((sum, product) => sum + product.rules.length, 0),
      buildMs:Date.now() - startedAt,
    },
  };
  const body = JSON.stringify(payload);
  return {
    payload,
    body,
    etag:`"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
  };
}

async function getCatalog() {
  const now = Date.now();
  if (memoryCache && now - memoryCacheAt < CACHE_MS) return memoryCache;
  if (!pendingBuild) {
    pendingBuild = buildCatalog()
      .then(result => {
        memoryCache = result;
        memoryCacheAt = Date.now();
        return result;
      })
      .finally(() => { pendingBuild = null; });
  }
  return pendingBuild;
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function handler(req, res) {
  const startedAt = Date.now();
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error:'Lejohet vetëm GET/HEAD.' });
    }
    if (!(await authorized(req))) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Vary', 'Cookie');
      return res.status(401).json({ error:'Sesioni nuk është aktiv.', catalog:[] });
    }

    const result = await getCatalog();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-cache, max-age=0');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('ETag', result.etag);
    res.setHeader('Server-Timing', `dose-calculator;dur=${Date.now() - startedAt}`);
    res.setHeader('X-MedIndex-Dose-Calculator-Products', String(result.payload.catalog.length));
    if (req.headers['if-none-match'] === result.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(result.body);
  } catch (error) {
    console.error('Dose calculator catalog error:', error);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      code:'DOSE_CALCULATOR_UNAVAILABLE',
      error:'Kalkulatori i dozës nuk mund të ngarkohet tani.',
      catalog:[],
      meta:{ failClosed:true },
    });
  }
}

handler.getCatalog = getCatalog;
handler.buildCatalog = buildCatalog;
handler._test = Object.freeze({
  clean,
  numberOrNull,
  groupCovers,
  statusAllowed,
  validHttps,
  rulePublic,
  productPublic,
});

module.exports = handler;
