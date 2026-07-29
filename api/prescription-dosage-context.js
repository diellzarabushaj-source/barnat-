const Dosage = require('./dosage.js');
const Engine = require('../dosage-engine.js');

const ROUTES = new Set(['IV', 'IM', 'SC']);
const PARENTERAL_FORM = /ampul|ampoule|injeks|injection|infuz|infusion|flakon|vial/i;
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const bool = value => ['1', 'true', 'yes', 'po'].includes(clean(value).toLowerCase());

function routeTokens(value) {
  const source = clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const routes = [];
  if (/\bi\.?v\.?\b|intraveno/.test(source)) routes.push('IV');
  if (/\bi\.?m\.?\b|intramusk/.test(source)) routes.push('IM');
  if (/\bs\.?c\.?\b|subkutan|subcutan/.test(source)) routes.push('SC');
  if (/\bp\.?o\.?\b|oral|nga goja/.test(source)) routes.push('PO');
  if (/inhal/.test(source)) routes.push('INH');
  if (/rektal|rectal/.test(source)) routes.push('PR');
  if (/topik|topical|kutan|cutan/.test(source)) routes.push('TOP');
  return routes;
}

function isParenteral(regimen = {}) {
  return routeTokens(regimen.route).some(route => ROUTES.has(route)) || PARENTERAL_FORM.test(clean(regimen.form));
}

function parseContext(query = {}) {
  const pediatric = clean(query.population).toLowerCase() === 'pediatric';
  const parenteral = bool(query.parenteral);
  const route = clean(query.route).toUpperCase();
  const ageMonths = Number(query.ageMonths);
  const weightKg = Number(query.weightKg);
  const errors = [];

  if (parenteral && !ROUTES.has(route)) errors.push('Zgjidh një rrugë të vetme: IV, IM ose SC.');
  if (pediatric) {
    if (!Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths > 216) errors.push('Mosha pediatrike duhet të jetë ndërmjet 0 dhe 216 muaj.');
    if (!Number.isFinite(weightKg) || weightKg < 0.5 || weightKg > 200) errors.push('Pesha pediatrike duhet të jetë ndërmjet 0.5 dhe 200 kg.');
  }

  return {
    valid:errors.length === 0,
    errors,
    pediatric,
    population:pediatric ? 'pediatric' : 'adult',
    parenteral,
    route:parenteral ? route : '',
    patient:pediatric ? { ageMonths, weightKg } : {},
  };
}

function routeMatches(regimen, context) {
  if (isParenteral(regimen) !== context.parenteral) return false;
  if (!context.parenteral) return true;
  const routes = routeTokens(regimen.route);
  return routes.length === 1 && routes[0] === context.route;
}

function prepareRegimen(regimen, context) {
  if (!routeMatches(regimen, context)) return null;
  if (!context.pediatric) {
    return {
      ...regimen,
      _medindexPopulation:'adult',
      serverSignature:Engine.buildSignature(regimen, 'adult'),
      serverContextVerified:true,
    };
  }

  const eligibility = Engine.pediatricEligibility(regimen, context.patient);
  if (!eligibility.eligible) return null;
  const calculation = Engine.calculatePediatricDose(regimen, context.patient);
  if (calculation.status !== 'calculated') return null;
  return {
    ...regimen,
    _medindexPopulation:'pediatric',
    serverCalculation:calculation,
    serverSignature:Engine.buildSignature(regimen, 'pediatric', calculation),
    serverContextVerified:true,
  };
}

function contextualize(payload, context) {
  const adult = context.pediatric
    ? []
    : (payload.adult || []).map(regimen => prepareRegimen(regimen, context)).filter(Boolean);
  const pediatric = context.pediatric
    ? (payload.pediatric || []).map(regimen => prepareRegimen(regimen, context)).filter(Boolean)
    : [];

  return {
    ...payload,
    adult,
    pediatric,
    meta:{
      ...payload.meta,
      clinicalContextApplied:true,
      population:context.population,
      parenteral:context.parenteral,
      route:context.route,
      serverFilteredAdultRegimens:adult.length,
      serverFilteredPediatricRegimens:pediatric.length,
      pediatricCalculation:'server-verified',
    },
  };
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function handler(req, res) {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error:'Lejohet vetëm GET/HEAD.' });
    }
    if (!(await authorized(req))) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({ error:'Sesioni nuk është aktiv.', forms:[], adult:[], pediatric:[], cards:[] });
    }

    const context = parseContext(req.query || {});
    if (!context.valid) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({
        code:'INVALID_CLINICAL_CONTEXT',
        error:'Konteksti klinik nuk është i plotë.',
        details:context.errors,
        forms:[], adult:[], pediatric:[], cards:[],
      });
    }

    const source = await Dosage.getPayload();
    const payload = contextualize(source.payload, context);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-MedIndex-Clinical-Context', `${context.population};${context.parenteral ? context.route : 'non-parenteral'}`);
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Prescription dosage context error:', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      code:'PRESCRIPTION_DOSAGE_CONTEXT_UNAVAILABLE',
      error:'Dozologjia e kontekstualizuar nuk mund të ngarkohet tani.',
      forms:[], adult:[], pediatric:[], cards:[],
    });
  }
}

handler._test = Object.freeze({ routeTokens, isParenteral, parseContext, routeMatches, prepareRegimen, contextualize });
module.exports = handler;
