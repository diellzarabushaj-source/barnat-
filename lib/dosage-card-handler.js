'use strict';

const { neonRequest } = require('./neon-data-api.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REGIMENS = 16;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const safeUrl = value => /^https:\/\/[^\s]+$/i.test(clean(value)) ? clean(value) : '';

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function requestDrugId(req) {
  try {
    const url = new URL(req?.url || '/api/dosage', 'http://medindex.local');
    return clean(url.searchParams.get('id'));
  } catch {
    return '';
  }
}

async function readRows(path, label) {
  const { data } = await neonRequest(path, { timeoutMs:4500, label });
  if (!Array.isArray(data)) throw new Error(`${label}: Neon nuk ktheu listë.`);
  return data;
}

function regimenPath(drugId) {
  const params = new URLSearchParams();
  params.set('select', [
    'population','dose_text','route','frequency_text','duration_text','maximum_text','warnings',
    'indication_text','source_url','reviewed_at','source_key','calculation_status',
  ].join(','));
  params.set('drug_id', `eq.${drugId}`);
  params.set('editorial_status', 'eq.published');
  params.set('calculation_status', 'in.(text_verified,calculable_verified)');
  params.set('order', 'population.asc,source_key.asc');
  params.set('limit', String(MAX_REGIMENS));
  return `dosage_regimens?${params.toString()}`;
}

function profilePath(drugId) {
  const params = new URLSearchParams();
  params.set('select', [
    'verification_status','clinical_summary','indications_text','contraindications','warnings','interactions',
    'pregnancy_lactation','renal_adjustment','hepatic_adjustment','monitoring','administration_notes',
    'source_urls','reviewed_at',
  ].join(','));
  params.set('drug_id', `eq.${drugId}`);
  params.set('limit', '1');
  return `drug_clinical_profiles?${params.toString()}`;
}

function publicRegimen(row) {
  if (!row) return null;
  return {
    population:clean(row.population),
    dose:clean(row.dose_text),
    route:clean(row.route),
    frequency:clean(row.frequency_text),
    duration:clean(row.duration_text),
    maximum:clean(row.maximum_text),
    warnings:clean(row.warnings),
    indication:clean(row.indication_text),
    sourceUrl:safeUrl(row.source_url),
    reviewedAt:row.reviewed_at || null,
    verification:clean(row.calculation_status),
  };
}

function chooseRegimen(rows, population) {
  const candidates = rows.filter(row => clean(row.population) === population);
  if (!candidates.length) return null;
  const card = candidates.find(row => /^card:/i.test(clean(row.source_key)) && clean(row.dose_text));
  return publicRegimen(card || candidates.find(row => clean(row.dose_text)) || candidates[0]);
}

function publicProfile(row) {
  const value = row || {};
  return {
    verificationStatus:clean(value.verification_status),
    summary:clean(value.clinical_summary),
    indications:clean(value.indications_text),
    contraindications:clean(value.contraindications),
    warnings:clean(value.warnings),
    interactions:clean(value.interactions),
    pregnancyLactation:clean(value.pregnancy_lactation),
    renalAdjustment:clean(value.renal_adjustment),
    hepaticAdjustment:clean(value.hepatic_adjustment),
    monitoring:clean(value.monitoring),
    administrationNotes:clean(value.administration_notes),
    sourceUrls:Array.isArray(value.source_urls) ? value.source_urls.map(safeUrl).filter(Boolean).slice(0, 8) : [],
    reviewedAt:value.reviewed_at || null,
  };
}

function sourceList(adult, pediatric, profile) {
  return [...new Set([
    adult?.sourceUrl,
    pediatric?.sourceUrl,
    ...(profile.sourceUrls || []),
  ].map(safeUrl).filter(Boolean))].slice(0, 8);
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

    const [regimens, profiles] = await Promise.all([
      readRows(regimenPath(drugId), 'Clinical card dosage'),
      readRows(profilePath(drugId), 'Clinical card profile'),
    ]);
    const adult = chooseRegimen(regimens, 'adult');
    const pediatric = chooseRegimen(regimens, 'pediatric');
    const profile = publicProfile(profiles[0]);
    const sources = sourceList(adult, pediatric, profile);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-MedIndex-Data-Source', 'neon');
    res.setHeader('Server-Timing', `clinicalcard;dur=${Date.now() - startedAt}`);
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json({
      ok:true,
      drugId,
      adult,
      pediatric,
      profile,
      sources,
      meta:{ dataSource:'neon', regimenRows:regimens.length, targeted:true },
    });
  } catch (error) {
    console.error('Targeted clinical card error:', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error:'Detajet klinike nuk u ngarkuan.', ok:false });
  }
}

handler._test = Object.freeze({ requestDrugId, regimenPath, profilePath, chooseRegimen, publicRegimen, publicProfile, sourceList });
module.exports = handler;
