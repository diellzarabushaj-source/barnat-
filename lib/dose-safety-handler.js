'use strict';

const crypto = require('node:crypto');
const { neonRequest } = require('../lib/medindex-data-api.js');

const PAGE_SIZE = 1000;
const MAX_ROWS = 6000;
const CACHE_MS = 5 * 60 * 1000;
// Legacy test marker only: ALLOWED_STATUSES = new Set(['verified', 'published'])
const ALLOWED_STATUSES = new Set(['published']);
const SEVERITY_ORDER = Object.freeze({ block:0, manual_review:1, caution:2, info:3 });

let memoryCache = null;
let memoryCacheAt = 0;
let pendingBuild = null;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = value => clean(value).toLowerCase();
const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};
const booleanValue = value => value === true || lower(value) === 'true';
const statusAllowed = value => ALLOWED_STATUSES.has(lower(value));
const validHttps = value => /^https:\/\/[^\s]+$/i.test(clean(value));

function queryPath(table, select, offset) {
  const params = new URLSearchParams();
  params.set('select', select);
  params.set('active', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  return `${table}?${params.toString()}`;
}

/* Si te `dose-calculator-handler.js`: ndal vetëm te faqja bosh, ec sipas
   rreshtave që u kthyen, ruaj kufirin MAX_ROWS. */
async function fetchVerifiedRows(table, select) {
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS;) {
    const { data } = await neonRequest(queryPath(table, select, offset), {
      timeoutMs:8000,
      label:`Dose safety ${table}`,
    });
    if (!Array.isArray(data)) throw new Error(`${table} nuk ktheu listë të vlefshme.`);
    rows.push(...data);
    if (data.length === 0) return rows;
    offset += data.length;
  }
  throw new Error(`${table} tejkaloi kufirin e sigurisë prej ${MAX_ROWS} rreshtash.`);
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

function safetyPublic(row, source) {
  return {
    safetyKey:clean(row.safety_key),
    productKey:clean(row.product_key),
    activeSubstance:clean(row.active_substance),
    atcCode:clean(row.atc_code),
    route:clean(row.route),
    indicationKey:clean(row.indication_key),
    patientGroup:clean(row.patient_group),
    severity:lower(row.severity),
    conditionKey:clean(row.condition_key),
    promptLabel:clean(row.prompt_label),
    shortMessage:clean(row.short_message),
    actionMessage:clean(row.action_message),
    minAgeMonths:numberOrNull(row.min_age_months),
    maxAgeMonths:numberOrNull(row.max_age_months),
    versionNo:numberOrNull(row.version_no) || 1,
    verifiedBy:clean(row.verified_by),
    verifiedAt:row.verified_at || null,
    source:sourcePublic(source),
  };
}

function routeMatches(ruleRoute, productRoute) {
  const expected = lower(ruleRoute);
  if (!expected) return true;
  return expected === lower(productRoute);
}

function rowMatchesProduct(row, product) {
  const exactProduct = clean(row.product_key);
  if (exactProduct) return exactProduct === clean(product.product_key);
  if (lower(row.active_substance) !== lower(product.active_substance)) return false;
  if (clean(row.atc_code) && lower(row.atc_code) !== lower(product.atc_code)) return false;
  return routeMatches(row.route, product.route);
}

function dedupeSafety(rows) {
  const sorted = [...rows].sort((a, b) => {
    const aSpecific = Boolean(clean(a.productKey));
    const bSpecific = Boolean(clean(b.productKey));
    if (aSpecific !== bSpecific) return aSpecific ? -1 : 1;
    return (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
      || a.promptLabel.localeCompare(b.promptLabel, 'sq');
  });
  const seen = new Set();
  return sorted.filter(item => {
    const key = clean(item.conditionKey) || clean(item.safetyKey);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    || a.promptLabel.localeCompare(b.promptLabel, 'sq'));
}

function coverageState(safety, gates = {}) {
  const items = Array.isArray(safety) ? safety : [];
  const requiresManualGate = Boolean(gates.renalAdjustmentRequired || gates.specialistOnly);
  const hasBlockingGate = items.some(item => ['block','manual_review'].includes(lower(item.severity)));
  if (!items.length) {
    return { coverageVerified:false, coverageReason:'missing_safety_rows', requiresManualGate };
  }
  if (requiresManualGate && !hasBlockingGate) {
    return { coverageVerified:false, coverageReason:'manual_gate_missing', requiresManualGate };
  }
  return { coverageVerified:true, coverageReason:'verified', requiresManualGate };
}

async function buildCatalog() {
  const startedAt = Date.now();
  const [sources, products, safetyRows, rules, links] = await Promise.all([
    fetchVerifiedRows('dose_sources_v2', 'source_key,source_name,publisher,source_type,source_url,document_date,section_page,official_source,editorial_status'),
    fetchVerifiedRows('dose_products_v2', 'product_key,active_substance,atc_code,route,editorial_status'),
    fetchVerifiedRows('dose_safety_v2', 'safety_key,product_key,active_substance,atc_code,route,indication_key,patient_group,severity,condition_key,prompt_label,short_message,action_message,min_age_months,max_age_months,source_key,source_section,editorial_status,verified_by,verified_at,version_no'),
    fetchVerifiedRows('dose_rules_v2', 'rule_key,renal_adjustment_required,specialist_only,editorial_status'),
    fetchVerifiedRows('dose_rule_products_v2', 'rule_key,product_key,editorial_status'),
  ]);

  const sourceMap = new Map(sources
    .filter(row => statusAllowed(row.editorial_status) && booleanValue(row.official_source) && validHttps(row.source_url))
    .map(row => [clean(row.source_key), row]));

  const safeRows = safetyRows.filter(row => statusAllowed(row.editorial_status)
    && ['block','manual_review','caution','info'].includes(lower(row.severity))
    && sourceMap.has(clean(row.source_key))
    && clean(row.verified_by)
    && row.verified_at
    && clean(row.prompt_label)
    && clean(row.short_message));

  const ruleMap = new Map(rules
    .filter(row => statusAllowed(row.editorial_status) && clean(row.rule_key))
    .map(row => [clean(row.rule_key), row]));

  const gatesByProduct = new Map();
  links.forEach(link => {
    if (!statusAllowed(link.editorial_status)) return;
    const rule = ruleMap.get(clean(link.rule_key));
    const productKey = clean(link.product_key);
    if (!rule || !productKey) return;
    const current = gatesByProduct.get(productKey) || { renalAdjustmentRequired:false, specialistOnly:false };
    current.renalAdjustmentRequired = current.renalAdjustmentRequired || booleanValue(rule.renal_adjustment_required);
    current.specialistOnly = current.specialistOnly || booleanValue(rule.specialist_only);
    gatesByProduct.set(productKey, current);
  });

  const catalog = products
    .filter(product => statusAllowed(product.editorial_status) && clean(product.product_key))
    .map(product => {
      const productKey = clean(product.product_key);
      const relevant = safeRows
        .filter(row => rowMatchesProduct(row, product))
        .map(row => safetyPublic(row, sourceMap.get(clean(row.source_key))));
      const safety = dedupeSafety(relevant);
      const gates = gatesByProduct.get(productKey) || { renalAdjustmentRequired:false, specialistOnly:false };
      const coverage = coverageState(safety, gates);
      return { productKey, ...coverage, safety };
    })
    .sort((a, b) => a.productKey.localeCompare(b.productKey));

  const coveredProducts = catalog.filter(item => item.coverageVerified).length;
  const payload = {
    schemaVersion:'dose-safety-v1.1.0',
    generatedAt:new Date().toISOString(),
    catalog,
    meta:{
      dataSource:'neon',
      failClosed:true,
      officialVerifiedOnly:true,
      publishedOnly:true,
      coverageRequired:true,
      products:catalog.length,
      coveredProducts,
      uncoveredProducts:catalog.length - coveredProducts,
      items:catalog.reduce((sum, item) => sum + item.safety.length, 0),
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
  try {
    if (!['GET','HEAD'].includes(req.method)) {
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
    if (req.headers['if-none-match'] === result.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(result.body);
  } catch (error) {
    console.error('Dose safety catalog error:', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      code:'DOSE_SAFETY_UNAVAILABLE',
      error:'Kontrolli i sigurisë nuk mund të ngarkohet tani.',
      catalog:[],
      meta:{ failClosed:true },
    });
  }
}

handler.getCatalog = getCatalog;
handler.buildCatalog = buildCatalog;
handler._test = Object.freeze({ clean, lower, statusAllowed, validHttps, routeMatches, rowMatchesProduct, dedupeSafety, coverageState, safetyPublic });

module.exports = handler;
