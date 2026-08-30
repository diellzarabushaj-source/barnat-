'use strict';

const crypto = require('node:crypto');
const { neonRequest } = require('./medindex-data-api.js');
const DoseRuleNormalizer = require('./dose-rule-normalizer.js');
const Calculator = require('./dose-calculator-handler.js');
const V3Gate = require('./dose-v3-runtime-gate.js');
const V3Reader = require('./dose-v3-product-reader.js');
const Shadow = require('./dose-v3-shadow.js');
const Cutover = require('./dose-v3-cutover-control.js');

const MAX_LINKS = 100;
const MAX_RULES = 100;
const MAX_QUERY_VALUE = 180;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function requestUrl(req) {
  try { return new URL(req?.url || '/api/dosage', 'http://medindex.local'); }
  catch { return new URL('/api/dosage', 'http://medindex.local'); }
}

function selectorFromRequest(req) {
  const url = requestUrl(req);
  const productKey = clean(url.searchParams.get('productKey')).slice(0, MAX_QUERY_VALUE);
  const drugId = clean(url.searchParams.get('drugId')).slice(0, MAX_QUERY_VALUE);
  const registry = clean(url.searchParams.get('registryNumber')).slice(0, MAX_QUERY_VALUE);

  const supplied = [productKey, drugId, registry].filter(Boolean);
  if (supplied.length !== 1) return null;
  if (productKey) return { column:'product_key', value:productKey, publicKey:productKey };
  if (drugId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(drugId)) return { column:'drug_id', value:drugId, publicKey:drugId };
  if (registry && /^\d{1,7}$/.test(registry)) return { column:'registry_number', value:registry, publicKey:registry };
  return null;
}

function quoteIn(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function inFilter(values) {
  const unique = [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
  return unique.length ? 'in.(' + unique.map(quoteIn).join(',') + ')' : '';
}

function pathFor(table, select, filters = {}, limit = 100) {
  const params = new URLSearchParams();
  params.set('select', select);
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
  }
  params.set('limit', String(limit));
  return table + '?' + params.toString();
}

async function readRows(path, label) {
  const { data } = await neonRequest(path, { timeoutMs:5000, label });
  if (!Array.isArray(data)) throw new Error(label + ': Supabase nuk ktheu listë.');
  return data;
}

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function loadProduct(selector) {
  const rows = await readRows(pathFor(
    'dose_products_v2',
    [
      'product_key','drug_id','registry_number','pdid','trade_name','active_substance',
      'atc_code','pharmaceutical_form','route','patient_group','numerator_value',
      'numerator_unit','denominator_value','denominator_unit','tablet_split_denominator',
      'is_scored','measurable_increment_ml','rounding_mode','source_key',
      'editorial_status','version_no'
    ].join(','),
    {
      [selector.column]:'eq.' + selector.value,
      active:'eq.true',
      editorial_status:'eq.published',
    },
    1
  ), 'Dose fast path product');
  return rows[0] || null;
}

async function loadLinks(productKey) {
  return readRows(pathFor(
    'dose_rule_products_v2',
    'rule_product_key,rule_key,product_key,preferred,conversion_enabled,tablet_split_allowed,rounding_increment_value,rounding_increment_unit,conversion_status,editorial_status',
    {
      product_key:'eq.' + productKey,
      active:'eq.true',
      editorial_status:'eq.published',
    },
    MAX_LINKS
  ), 'Dose fast path bindings');
}

async function loadRules(ruleKeys) {
  const filter = inFilter(ruleKeys);
  if (!filter) return [];
  return readRows(pathFor(
    'dose_rules_v2',
    [
      'rule_key','indication_key','patient_group','calculation_method','dose_min_value',
      'dose_max_value','dose_unit','dose_basis','weight_basis','frequency_mode',
      'interval_min_hours','interval_max_hours','times_per_day','max_single_dose_mg',
      'max_daily_dose_mg','max_doses_24h','duration_mode','duration_min_days',
      'duration_max_days','review_after_days','min_age_months','max_age_months',
      'min_weight_kg','max_weight_kg','route','prn','renal_adjustment_required',
      'specialist_only','out_of_range_action','source_key','editorial_status',
      'verified_by','verified_at','clinical_notes','plain_language_template','version_no'
    ].join(','),
    {
      rule_key:filter,
      active:'eq.true',
      editorial_status:'eq.published',
    },
    MAX_RULES
  ), 'Dose fast path rules');
}

async function loadIndications(indicationKeys) {
  const filter = inFilter(indicationKeys);
  if (!filter) return [];
  return readRows(pathFor(
    'dose_indications_v2',
    'indication_key,indication_name,icd_code,patient_group,min_age_months,max_age_months,min_weight_kg,max_weight_kg,source_key,editorial_status',
    {
      indication_key:filter,
      active:'eq.true',
      editorial_status:'eq.published',
    },
    MAX_RULES
  ), 'Dose fast path indications');
}

async function loadSources(sourceKeys) {
  const filter = inFilter(sourceKeys);
  if (!filter) return [];
  return readRows(pathFor(
    'dose_sources_v2',
    'source_key,source_name,publisher,source_type,source_url,document_date,section_page,official_source,editorial_status',
    {
      source_key:filter,
      active:'eq.true',
      editorial_status:'eq.published',
    },
    MAX_RULES + 5
  ), 'Dose fast path sources');
}

function booleanValue(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function sourceUsable(row) {
  return Boolean(
    row
    && booleanValue(row.official_source)
    && Calculator._test.validHttps(row.source_url)
    && Calculator._test.statusAllowed(row.editorial_status)
  );
}

async function buildProductPayload(selector) {
  const product = await loadProduct(selector);
  if (!product) return null;

  const links = await loadLinks(clean(product.product_key));
  const rules = await loadRules(links.map(link => link.rule_key));
  const indications = await loadIndications(rules.map(rule => rule.indication_key));
  const sourceKeys = [
    product.source_key,
    ...rules.map(rule => rule.source_key),
    ...indications.map(indication => indication.source_key),
  ];
  const sources = await loadSources(sourceKeys);

  const sourceMap = new Map(sources.filter(sourceUsable).map(row => [clean(row.source_key), row]));
  const indicationMap = new Map(indications
    .filter(row => Calculator._test.statusAllowed(row.editorial_status) && sourceMap.has(clean(row.source_key)))
    .map(row => [clean(row.indication_key), row]));
  const ruleMap = new Map(rules
    .filter(row =>
      Calculator._test.statusAllowed(row.editorial_status)
      && DoseRuleNormalizer.ALLOWED_METHODS.has(clean(row.calculation_method))
      && indicationMap.has(clean(row.indication_key))
      && sourceMap.has(clean(row.source_key))
      && clean(row.verified_by)
      && row.verified_at
    )
    .map(row => [clean(row.rule_key), row]));

  const mappedRules = links
    .filter(link => Calculator._test.linkEligible(link, ruleMap))
    .map(link => {
      const rule = ruleMap.get(clean(link.rule_key));
      if (!rule || !Calculator._test.groupCovers(clean(product.patient_group), clean(rule.patient_group))) return null;
      const indication = indicationMap.get(clean(rule.indication_key));
      const source = sourceMap.get(clean(rule.source_key));
      return indication && source ? Calculator._test.rulePublic(rule, indication, source, link) : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.indicationName.localeCompare(b.indicationName, 'sq')
      || (a.minAgeMonths ?? -1) - (b.minAgeMonths ?? -1));

  const productSourcePresent = sourceMap.has(clean(product.source_key));
  const publicProduct = Calculator._test.productPublic(product, mappedRules);

  return {
    schemaVersion:'dose-product-fast-path-v1',
    product:publicProduct,
    meta:{
      dataSource:'supabase',
      failClosed:true,
      publishedOnly:true,
      officialVerifiedOnly:true,
      productSourcePresent,
      coverage:mappedRules.length && productSourcePresent ? 'verified_rules_available' : 'no_verified_rules',
      rules:mappedRules.length,
      dbReads:5,
    },
  };
}

async function readValidatedV3(selector) {
  if (!selector) return { payload:null,error:null };
  try {
    const payload = await V3Reader.build(selector);
    if (payload && !V3Gate.validateV3Payload(payload)) {
      return { payload:null,error:new Error('DRx V3 payload failed contract validation.') };
    }
    return { payload,error:null };
  } catch (error) {
    return { payload:null,error };
  }
}

async function buildShadowRuntime(selector,cutover){
  const startedAt=Date.now();
  const v2Payload=await buildProductPayload(selector);
  if(!Shadow.shadowEnabled()){
    return {payload:v2Payload,runtime:'v2',cutover,v3Available:null,fallbackUsed:false};
  }
  const shadowSelector=Shadow.v3Selector(selector,v2Payload);
  const v3Result=shadowSelector
    ? await readValidatedV3(shadowSelector)
    : {payload:null,error:null};
  const comparison=shadowSelector
    ? Shadow.comparePayloads(v2Payload,v3Result.payload,v3Result.error)
    : {
        status:'SKIPPED',
        diffCodes:['UNSUPPORTED_SELECTOR'],
        v2Hash:Shadow.payloadHash(v2Payload),
        v3Hash:null,
        v2RuleCount:Array.isArray(v2Payload?.product?.rules)?v2Payload.product.rules.length:null,
        v3RuleCount:null,
      };
  let telemetryStored=false;
  try{
    await Shadow.record({
      selector,
      runtimeServed:'v2-shadow',
      comparison,
      durationMs:Date.now()-startedAt,
    });
    telemetryStored=true;
  }catch(error){
    console.error('DRx V3 shadow telemetry error:',error);
  }
  return {
    payload:v2Payload,
    runtime:'v2-shadow',
    shadow:{status:comparison.status,diffCount:comparison.diffCodes.length,telemetryStored},
    cutover,
    v3Available:Boolean(v3Result.payload),
    fallbackUsed:false,
  };
}

async function buildRuntimePayload(selector) {
  const state=await Cutover.getState();
  const cutover=Cutover.decision(state,selector);

  // Phase 10B DB control is authoritative. Environment flags can still enable
  // comparison telemetry, but can no longer serve V3 or activate strict mode.
  if(cutover.mode==='SHADOW' || !cutover.selectedForV3){
    return buildShadowRuntime(selector,cutover);
  }

  let v2Payload=null;
  let v3Selector=selector;
  if(selector?.column==='registry_number'){
    v2Payload=await buildProductPayload(selector);
    v3Selector=Shadow.v3Selector(selector,v2Payload);
  }

  const v3Result=v3Selector
    ? await readValidatedV3(v3Selector)
    : {payload:null,error:null};

  if(v3Result.payload){
    return {
      payload:v3Result.payload,
      runtime:'v3',
      cutover,
      v3Available:true,
      fallbackUsed:false,
    };
  }

  return {
    payload:v2Payload || await buildProductPayload(selector),
    runtime:'v2-fallback',
    cutover,
    v3Available:false,
    fallbackUsed:true,
    v3Error:v3Result.error,
  };
}

async function handler(req, res) {
  try {
    if (!['GET','HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error:'Lejohet vetëm GET/HEAD.' });
    }
    if (!(await authorized(req))) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Vary', 'Cookie');
      return res.status(401).json({ error:'Sesioni nuk është aktiv.' });
    }

    const selector = selectorFromRequest(req);
    if (!selector) return res.status(400).json({
      error:'Jep saktësisht një nga productKey, drugId ose registryNumber.',
    });

    const runtimeStartedAt=Date.now();
    const runtimeResult = await buildRuntimePayload(selector);
    const payload = runtimeResult.payload;
    const cutover=runtimeResult.cutover || {};
    const recordRuntime=outcome=>Cutover.recordEvent({
      selector,
      stateAvailable:cutover.stateAvailable===true,
      controlVersion:cutover.controlVersion || 1,
      mode:cutover.mode || 'SHADOW',
      trafficBucket:Number.isInteger(cutover.trafficBucket)?cutover.trafficBucket:0,
      selectedForV3:cutover.selectedForV3===true,
      runtimeServed:runtimeResult.runtime || 'none',
      v3Available:runtimeResult.v3Available,
      fallbackUsed:runtimeResult.fallbackUsed===true,
      outcome,
      durationMs:Date.now()-runtimeStartedAt,
    }).catch(()=>({stored:false}));
    if (!payload) {
      void recordRuntime('NOT_FOUND');
      return res.status(404).json({ error:'Produkti i publikuar nuk u gjet.' });
    }

    const body = JSON.stringify(payload);
    const etag = '"' + crypto.createHash('sha256').update(body).digest('base64url') + '"';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-cache, max-age=0');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-DRx-Dose-Fast-Path', runtimeResult.runtime === 'v3' ? 'v3' : 'v2');
    res.setHeader('X-DRx-Dose-Runtime', runtimeResult.runtime);
    res.setHeader('X-DRx-Dose-Cutover-Mode', cutover.mode || 'SHADOW');
    res.setHeader('X-DRx-Dose-Cutover-Version', String(cutover.controlVersion || 1));
    res.setHeader('X-DRx-Dose-Traffic-Bucket', String(Number.isInteger(cutover.trafficBucket) ? cutover.trafficBucket : 0));
    res.setHeader('X-DRx-Dose-V3-Selected', cutover.selectedForV3 ? '1' : '0');
    if (runtimeResult.shadow) {
      res.setHeader('X-DRx-Dose-Shadow', runtimeResult.shadow.status);
      res.setHeader('X-DRx-Dose-Shadow-Diffs', String(runtimeResult.shadow.diffCount));
      res.setHeader('X-DRx-Dose-Shadow-Telemetry', runtimeResult.shadow.telemetryStored ? 'stored' : 'not-stored');
    }
    void recordRuntime('SERVED');
    if (req.headers?.['if-none-match'] === etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(body);
  } catch (error) {
    console.error('Dose product fast path error:', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      code:'DOSE_PRODUCT_FAST_PATH_UNAVAILABLE',
      error:'Dozimi i targetuar nuk mund të ngarkohet tani.',
      meta:{ failClosed:true },
    });
  }
}

handler.buildProductPayload = buildProductPayload;
handler.buildRuntimePayload = buildRuntimePayload;
handler._test = {
  clean,
  requestUrl,
  selectorFromRequest,
  quoteIn,
  inFilter,
  pathFor,
  sourceUsable,
};

module.exports = handler;
