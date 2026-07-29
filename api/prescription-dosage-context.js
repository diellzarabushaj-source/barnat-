const Dosage = require('./dosage.js');
const Engine = require('../dosage-engine.js');
const Administration = require('../administration-routes.js');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const bool = value => ['1', 'true', 'yes', 'po'].includes(clean(value).toLowerCase());

function parseContext(query = {}) {
  const pediatric = clean(query.population).toLowerCase() === 'pediatric';
  const legacyParenteral = bool(query.parenteral);
  const category = Administration.normalizeCategory(query.category)
    || (legacyParenteral ? 'PARENTERAL' : 'ENTERAL');
  const route = Administration.normalizeRoute(query.route)
    || (!query.route && category === 'ENTERAL' ? 'PO' : '');
  const ageMonths = Number(query.ageMonths);
  const weightKg = Number(query.weightKg);
  const errors = [];

  if (!category) errors.push('Zgjidh kategorinë e administrimit.');
  if (!route || !Administration.routeBelongsToCategory(route, category)) {
    errors.push(`Zgjidh një rrugë të vlefshme për kategorinë ${Administration.categoryLabel(category) || category}.`);
  }
  if (pediatric) {
    if (!Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths > 216) errors.push('Mosha pediatrike duhet të jetë ndërmjet 0 dhe 216 muaj.');
    if (!Number.isFinite(weightKg) || weightKg < 0.5 || weightKg > 200) errors.push('Pesha pediatrike duhet të jetë ndërmjet 0.5 dhe 200 kg.');
  }

  return {
    valid:errors.length === 0,
    errors,
    pediatric,
    population:pediatric ? 'pediatric' : 'adult',
    category,
    route,
    parenteral:category === 'PARENTERAL',
    patient:pediatric ? { ageMonths, weightKg } : {},
  };
}

function regimenAdministration(regimen = {}) {
  return Administration.inferAdministration({
    administrationCategory:regimen.administrationCategory,
    allowedRoutes:regimen.allowedRoutes,
    form:regimen.form,
    route:regimen.route,
  });
}

function routeMatches(regimen, context) {
  const administration = regimenAdministration(regimen);
  if (administration.category !== context.category) return false;
  const routes = Administration.routeTokens(regimen.route || administration.routes.join(' '));
  return routes.length === 1 && routes[0] === context.route;
}

function prepareRegimen(regimen, context) {
  if (!routeMatches(regimen, context)) return null;
  const base = {
    ...regimen,
    administrationCategory:context.category,
    route:context.route,
    serverContextVerified:true,
  };
  if (!context.pediatric) {
    return { ...base, _medindexPopulation:'adult', serverSignature:Engine.buildSignature(base, 'adult') };
  }

  const eligibility = Engine.pediatricEligibility(base, context.patient);
  if (!eligibility.eligible) return null;
  const calculation = Engine.calculatePediatricDose(base, context.patient);
  if (!['calculated', 'range-calculated'].includes(calculation.status)) return null;
  return {
    ...base,
    _medindexPopulation:'pediatric',
    serverCalculation:calculation,
    serverSignature:calculation.status === 'calculated' ? Engine.buildSignature(base, 'pediatric', calculation) : '',
    serverDoseRange:Engine.calculatedRangeText(calculation),
    serverRequiresDoseSelection:calculation.status === 'range-calculated',
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
      administrationCategory:context.category,
      parenteral:context.parenteral,
      route:context.route,
      serverFilteredAdultRegimens:adult.length,
      serverFilteredPediatricRegimens:pediatric.length,
      pediatricCalculation:'server-verified-formula-only',
      rangePolicy:'CALCULATE_RANGE_REQUIRE_CLINICIAN_SELECTION',
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
    res.setHeader('X-MedIndex-Clinical-Context', `${context.population};${context.category};${context.route}`);
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

handler._test = Object.freeze({ parseContext, regimenAdministration, routeMatches, prepareRegimen, contextualize });
module.exports = handler;