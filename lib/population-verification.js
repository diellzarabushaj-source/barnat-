'use strict';

const crypto = require('node:crypto');
const { neonRequest } = require('./neon-data-api.js');
const AdminAccess = require('./admin-access.js');

const PAGE_SIZE = 1000;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_BATCH = 500;
const POPULATIONS = new Set(['adult', 'pediatric']);
const POSITIVE_STATUSES = new Set(['text_verified', 'calculable_verified']);
const NEGATIVE_STATUSES = new Set(['not_recommended', 'contraindicated']);

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const nowIso = () => new Date().toISOString();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function text(value, maximum = 4000) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, maximum);
}

function httpsUrl(value) {
  const candidate = clean(value);
  return /^https:\/\/[^\s]+$/i.test(candidate) ? candidate : '';
}

function bodySize(req) {
  const declared = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declared) && declared > 0) return declared;
  try { return Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8'); }
  catch { return MAX_BODY_BYTES + 1; }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
}

function queryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return req.query[key];
  try { return new URL(String(req.url || ''), 'https://medindex.local').searchParams.get(key); }
  catch { return null; }
}

function sameOrigin(req) {
  const origin = clean(req.headers?.origin);
  if (!origin) return true;
  const host = clean(req.headers?.['x-forwarded-host'] || req.headers?.host);
  try { return !host || new URL(origin).host === host; }
  catch { return false; }
}

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

// Reading population decisions is part of rendering the registry, so any signed-in
// account may do it. Writing one changes shared clinical content for everyone, so it
// requires an admin whose standing is re-verified against Supabase on this request.
async function requireDecisionAdmin(req) {
  return AdminAccess.requireAdminSession(req);
}

// Attributes a shared clinical decision to the admin who made it.
function decisionActor(actor) {
  const name = clean(actor?.name);
  const email = clean(actor?.email);
  if (name && email) return `${name} <${email}>`;
  return email || name || 'admin';
}

/* Shih `lib/clinical-editor.js`: një faqe e shkurtër është tavani i serverit,
   jo fundi i tabelës. Ndalo vetëm te faqja bosh. */
async function fetchPaged(table, select, filters = '', order = '') {
  const output = [];
  for (let offset = 0; ;) {
    const path = `${table}?select=${encodeURIComponent(select)}&limit=${PAGE_SIZE}&offset=${offset}`
      + filters + (order ? `&order=${encodeURIComponent(order)}` : '');
    const { data } = await neonRequest(path);
    const rows = Array.isArray(data) ? data : [];
    output.push(...rows);
    if (rows.length === 0) break;
    offset += rows.length;
    if (output.length > 10000) throw new Error(`${table}: kufiri i leximit u tejkalua.`);
  }
  return output;
}

async function fetchOne(table, select, filters) {
  const { data } = await neonRequest(`${table}?select=${encodeURIComponent(select)}${filters}&limit=1`);
  return Array.isArray(data) ? data[0] || null : null;
}

function parseRegistryNumbers(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(',');
  const numbers = [...new Set(source.map(item => Number(clean(item)))
    .filter(item => Number.isInteger(item) && item > 0 && item <= 100000))];
  if (!numbers.length) throw new HttpError(400, 'Kërkohet së paku një numër valid i regjistrit.');
  if (numbers.length > MAX_BATCH) throw new HttpError(400, `Mund të verifikohen së shumti ${MAX_BATCH} barna njëherësh.`);
  return numbers;
}

function relevantRow(row) {
  const key = clean(row?.source_key).toLowerCase();
  return key.startsWith('card:') || key.startsWith('population:');
}

function affirmativeRow(row) {
  return relevantRow(row)
    && row?.editorial_status === 'published'
    && POSITIVE_STATUSES.has(clean(row?.calculation_status))
    && Boolean(clean(row?.dose_text))
    && Boolean(clean(row?.route))
    && Boolean(httpsUrl(row?.source_url));
}

function negativeRow(row) {
  const key = clean(row?.source_key).toLowerCase();
  return key.startsWith('population:')
    && row?.editorial_status === 'published'
    && NEGATIVE_STATUSES.has(clean(row?.calculation_status))
    && Boolean(text(row?.warnings || row?.dose_text, 4000))
    && Boolean(httpsUrl(row?.source_url));
}

function newest(rows) {
  return [...rows].sort((left, right) => String(right?.reviewed_at || right?.updated_at || '')
    .localeCompare(String(left?.reviewed_at || left?.updated_at || '')))[0] || null;
}

function populationDecision(rows, population) {
  if (!POPULATIONS.has(population)) throw new Error('Popullata nuk është valide.');
  const populationRows = (Array.isArray(rows) ? rows : []).filter(row => row?.population === population);
  const affirmative = newest(populationRows.filter(affirmativeRow));
  const negativeRows = populationRows.filter(negativeRow);
  const contraindicated = newest(negativeRows.filter(row => row.calculation_status === 'contraindicated'));
  const negative = contraindicated || newest(negativeRows);

  if (affirmative && negative) {
    return {
      state:'conflict', code:clean(negative.calculation_status), label:'Konflikt',
      reason:'Ekziston njëkohësisht dozë e verifikuar dhe vendim negativ. Kërkohet rishikim manual.',
      sourceUrl:httpsUrl(negative.source_url), reviewedAt:negative.reviewed_at || negative.updated_at || '',
    };
  }
  if (negative) {
    const code = clean(negative.calculation_status);
    return {
      state:'no', code, label:code === 'contraindicated' ? 'Kundërindikuar' : 'Nuk rekomandohet',
      reason:text(negative.warnings || negative.dose_text, 700), sourceUrl:httpsUrl(negative.source_url),
      reviewedAt:negative.reviewed_at || negative.updated_at || '',
    };
  }
  if (affirmative) {
    return {
      state:'yes', code:clean(affirmative.calculation_status), label:'Po',
      reason:'Ka dozë të publikuar, rrugë administrimi dhe burim HTTPS të verifikuar.',
      sourceUrl:httpsUrl(affirmative.source_url), reviewedAt:affirmative.reviewed_at || affirmative.updated_at || '',
    };
  }
  return {
    state:'unknown', code:'insufficient_evidence', label:'Pa të dhëna',
    reason:'Nuk ka të dhëna të mjaftueshme për vendim po/jo. Mungesa e dozës nuk interpretohet si kundërindikacion.',
    sourceUrl:'', reviewedAt:'',
  };
}

async function getDecisions(registryNumbers) {
  const numbers = parseRegistryNumbers(registryNumbers);
  const numberFilter = numbers.join(',');
  const drugs = await fetchPaged(
    'drugs',
    'id,registry_number,trade_name',
    `&registry_number=in.(${numberFilter})&is_published=eq.true`,
    'registry_number.asc'
  );
  if (!drugs.length) return [];

  const drugIds = drugs.map(row => clean(row.id)).filter(Boolean);
  const idFilter = drugIds.join(',');
  const regimens = idFilter ? await fetchPaged(
    'dosage_regimens',
    'drug_id,population,dose_text,route,warnings,calculation_status,editorial_status,reviewed_at,updated_at,source_key,source_url',
    `&drug_id=in.(${idFilter})`,
    'updated_at.desc'
  ) : [];
  const byDrug = new Map();
  regimens.forEach(row => {
    if (!byDrug.has(row.drug_id)) byDrug.set(row.drug_id, []);
    byDrug.get(row.drug_id).push(row);
  });

  return drugs.map(drug => {
    const rows = byDrug.get(drug.id) || [];
    return {
      registryNumber:Number(drug.registry_number), tradeName:clean(drug.trade_name),
      adult:populationDecision(rows, 'adult'), pediatric:populationDecision(rows, 'pediatric'),
    };
  });
}

function normalizeDecisionPayload(payload) {
  const registryNumber = Number(payload?.registryNumber);
  const population = clean(payload?.population).toLowerCase();
  const decision = clean(payload?.decision).toLowerCase();
  const sourceUrl = httpsUrl(payload?.sourceUrl);
  const evidence = text(payload?.evidence, 3000);
  if (!Number.isInteger(registryNumber) || registryNumber < 1 || registryNumber > 100000) {
    throw new HttpError(400, 'Numri i barit nuk është valid.');
  }
  if (!POPULATIONS.has(population)) throw new HttpError(400, 'Popullata nuk është valide.');
  if (!['auto', 'not_recommended', 'contraindicated'].includes(decision)) {
    throw new HttpError(400, 'Vendimi duhet të jetë automatik, nuk rekomandohet ose kundërindikuar.');
  }
  if (decision !== 'auto' && (!sourceUrl || evidence.length < 12)) {
    throw new HttpError(400, 'Vendimi negativ kërkon burim HTTPS dhe arsyetim të qartë (së paku 12 karaktere).');
  }
  return { registryNumber, population, decision, sourceUrl, evidence };
}

async function saveDecision(payload, actor = null) {
  const input = normalizeDecisionPayload(payload);
  const drug = await fetchOne('drugs', 'id,registry_number,trade_name,active_substance,atc_code,pharmaceutical_form,strength',
    `&registry_number=eq.${input.registryNumber}&is_published=eq.true`);
  if (!drug) throw new HttpError(404, 'Bari nuk u gjet.');
  const sourceKey = `population:${input.registryNumber}:${input.population}`;
  const timestamp = nowIso();

  if (input.decision === 'auto') {
    await neonRequest(`dosage_regimens?source_key=eq.${encodeURIComponent(sourceKey)}&editorial_override=eq.true`, {
      method:'PATCH',
      body:{ editorial_status:'archived', calculation_status:'pending', reviewed_by:null, reviewed_at:null, updated_at:timestamp },
      prefer:'return=minimal',
    });
  } else {
    const label = input.decision === 'contraindicated' ? 'Kundërindikuar' : 'Nuk rekomandohet';
    const row = {
      drug_id:drug.id, population:input.population, dose_text:`${label}: ${input.evidence}`, route:null,
      warnings:input.evidence, calculation_status:input.decision, editorial_status:'published',
      reviewed_by:decisionActor(actor), reviewed_at:timestamp, source_key:sourceKey,
      regimen_code:`POP-${input.registryNumber}-${input.population === 'adult' ? 'ADULT' : 'PED'}`,
      atc_code:clean(drug.atc_code) || null, active_substance:clean(drug.active_substance) || null,
      pharmaceutical_form:clean(drug.pharmaceutical_form) || null, reference_strength:clean(drug.strength) || null,
      source_url:input.sourceUrl, signatura_template:null, signatura_text:null,
      source_hash:hash({ drugId:drug.id, ...input }), editorial_override:true, updated_at:timestamp,
    };
    await neonRequest('dosage_regimens?on_conflict=source_key', {
      method:'POST', body:[row], prefer:'resolution=merge-duplicates,return=minimal',
    });
  }

  await neonRequest('audit_logs', {
    method:'POST',
    body:[{
      entity_type:'drug', entity_id:drug.id, action:'population_verification_update', old_data:null,
      new_data:{ registryNumber:input.registryNumber, population:input.population, decision:input.decision,
        sourceUrl:input.sourceUrl, evidence:input.evidence },
      changed_by:decisionActor(actor), source:'population_verification', changed_at:timestamp,
    }],
    prefer:'return=minimal',
  });

  const items = await getDecisions([input.registryNumber]);
  return items[0] || null;
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!(await authorized(req))) return res.status(401).json({ ok:false, error:'Sesioni nuk është aktiv.' });
  if (!sameOrigin(req)) return res.status(403).json({ ok:false, error:'Origjina e kërkesës nuk lejohet.' });

  try {
    if (req.method === 'GET') {
      const raw = queryValue(req, 'registryNumbers') || queryValue(req, 'registryNumber');
      return res.status(200).json({ ok:true, items:await getDecisions(raw) });
    }
    if (req.method === 'PUT') {
      const admin = await requireDecisionAdmin(req);
      if (!/^application\/json\b/i.test(clean(req.headers?.['content-type']))) throw new HttpError(415, 'Kërkohet application/json.');
      if (bodySize(req) > MAX_BODY_BYTES) throw new HttpError(413, 'Kërkesa është tepër e madhe.');
      return res.status(200).json({ ok:true, item:await saveDecision(parseBody(req), admin) });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
  } catch (error) {
    console.error('Population verification error:', error);
    return res.status(error.status || 500).json({ ok:false, error:clean(error.message || error).slice(0, 700) });
  }
}

module.exports = {
  handle, getDecisions, saveDecision,
  _test:{ decisionActor, requireDecisionAdmin, affirmativeRow, negativeRow, populationDecision, normalizeDecisionPayload, parseRegistryNumbers, sameOrigin },
};
