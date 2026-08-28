'use strict';

const { neonRequest } = require('./neon-data-api.js');
const NeonClinical = require('./neon-clinical-reader.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REGIMENS = 64;
const REGIMEN_SELECT = [
  'id','drug_id','population','dose_text','route','frequency_text','duration_text','maximum_text','warnings',
  'calculation_status','calculation_type','dose_value_min','dose_value_max','doses_per_day','interval_hours',
  'max_single_mg','max_daily_mg','concentration_mg','concentration_ml','min_age_months','max_age_months',
  'min_weight_kg','max_weight_kg','signatura_template','reviewed_at','source_key','regimen_code','atc_code',
  'active_substance','pharmaceutical_form','reference_strength','indication_text','source_url','signatura_text','formula_text',
].join(',');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const regimenGroup = row => clean(row?.source_key).split(':')[0].toLowerCase();

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function requestUrl(req) {
  try { return new URL(req?.url || '/api/dosage', 'http://medindex.local'); }
  catch { return new URL('/api/dosage', 'http://medindex.local'); }
}

function requestDrugId(req) {
  return clean(requestUrl(req).searchParams.get('id'));
}

function regimenPath(drugId) {
  const params = new URLSearchParams();
  params.set('select', REGIMEN_SELECT);
  params.set('drug_id', `eq.${drugId}`);
  params.set('editorial_status', 'eq.published');
  params.set('calculation_status', 'in.(text_verified,calculable_verified)');
  params.set('order', 'source_key.asc');
  params.set('limit', String(MAX_REGIMENS));
  return `dosage_regimens?${params.toString()}`;
}

function mapPrescriptionRegimens(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const adult = source
    .filter(row => regimenGroup(row) === 'adult' && clean(row.population).toLowerCase() === 'adult')
    .map(NeonClinical.adultRegimen);
  const pediatric = source
    .filter(row => regimenGroup(row) === 'pediatric'
      && clean(row.population).toLowerCase() === 'pediatric'
      && clean(row.calculation_status).toLowerCase() === 'calculable_verified')
    .map(NeonClinical.pediatricRegimen);
  return { adult, pediatric };
}

function setHeaders(res, startedAt) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-MedIndex-Data-Source', 'supabase');
  res.setHeader('Server-Timing', `prescriptiondosage;dur=${Date.now() - startedAt}`);
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
      return res.status(401).json({ error:'Sesioni nuk është aktiv.' });
    }

    const drugId = requestDrugId(req);
    if (!UUID_RE.test(drugId)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({ error:'ID e barit është e pavlefshme.' });
    }

    const { data } = await neonRequest(regimenPath(drugId), {
      timeoutMs:4500,
      label:'Targeted prescription dosage',
    });
    if (!Array.isArray(data)) throw new Error('Supabase nuk ktheu listë të dozologjisë së recetës.');
    const mapped = mapPrescriptionRegimens(data);

    setHeaders(res, startedAt);
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json({
      ok:true,
      drugId,
      adult:mapped.adult,
      pediatric:mapped.pediatric,
      meta:{ dataSource:'supabase', targeted:true, regimenRows:data.length, maxRegimens:MAX_REGIMENS },
    });
  } catch (error) {
    console.error('Targeted prescription dosage error:', error);
    res.setHeader('Cache-Control', 'no-store');
    if (/timed out|token is not available|Supabase|Data API/i.test(String(error?.message || ''))) {
      res.setHeader('Retry-After', '30');
      return res.status(503).json({ error:'Dozologjia e barit nuk është përkohësisht e disponueshme.', ok:false });
    }
    return res.status(500).json({ error:'Dozologjia e barit nuk u ngarkua.', ok:false });
  }
}

handler._test = Object.freeze({
  UUID_RE,
  MAX_REGIMENS,
  REGIMEN_SELECT,
  requestDrugId,
  regimenPath,
  regimenGroup,
  mapPrescriptionRegimens,
});

module.exports = handler;
