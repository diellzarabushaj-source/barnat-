'use strict';

/* API server-side i kalkulatorit pediatrik.
 *
 * Kontrata klinike:
 * - klienti zgjedh barin dhe dërgon vetëm matjet e pacientit;
 * - numrat e dozimit vijnë vetëm nga Supabase;
 * - formula typed e `drugs.pediatric_*` lidhet vetëm me regjimin primar të
 *   deklaruar nga `pediatric_primary_regimen_id`;
 * - ajo fushë sot mban `dosage_regimens.source_key` (p.sh. card:17:pediatric),
 *   jo UUID-në e regjimit;
 * - një regjim tekstual tjetër i të njëjtit bar nuk mund ta huazojë formulën;
 * - kur indikacioni kërkohet, mungesa e binding-ut është fail-closed.
 */

const { neonRequest } = require('./medindex-data-api.js');
const { STATUS, classify } = require('./pediatric-readiness.js');
const { calculate } = require('./pediatric-calculation.js');

const SEARCH_VIEW = 'pediatric-search';
const PRODUCT_VIEW = 'pediatric-product';
const CALCULATE_VIEW = 'pediatric-calculate';

/* `regimenId` është i vetmi identifikues klinik që klienti lejohet të kthejë.
   Indikacioni nuk pranohet si tekst/ID nga klienti: ai vjen nga regjimi i
   lidhur në server. */
const FORBIDDEN_INPUT = /^(pediatric_|dose|concentration|max|conc$|indication(?:Id)?$)/i;
const MAX_BODY_BYTES = 4096;
const DEFAULT_SEARCH_LIMIT = 30;
const MAX_SEARCH_LIMIT = 50;
const MAX_QUERY_LENGTH = 96;
const MAX_SEARCH_TOKENS = 4;
const MAX_REGIMENS = 12;
const MAX_SEARCH_BINDINGS = 120;
const SAFE_SOURCE_KEY = /^[A-Za-z0-9:_.-]{1,128}$/;

const PEDIATRIC_COLUMNS = [
  'pediatric_dose_summary', 'pediatric_indication', 'pediatric_use_status',
  'pediatric_min_age_value', 'pediatric_min_age_unit', 'pediatric_max_age_value',
  'pediatric_max_age_unit', 'pediatric_min_weight_kg', 'pediatric_max_weight_kg',
  'pediatric_dose_min', 'pediatric_dose_max', 'pediatric_dose_unit', 'pediatric_dose_basis',
  'pediatric_doses_per_day', 'pediatric_interval_hours', 'pediatric_max_single_value',
  'pediatric_max_single_unit', 'pediatric_max_daily_value', 'pediatric_max_daily_unit',
  'pediatric_route', 'pediatric_restriction', 'pediatric_concentration_value',
  'pediatric_concentration_unit', 'pediatric_concentration_per_value',
  'pediatric_concentration_per_unit', 'pediatric_source_url', 'pediatric_source_section',
  'pediatric_verification_status', 'pediatric_verified_at', 'pediatric_primary_regimen_id',
];
const IDENTITY_COLUMNS = [
  'id', 'registry_number', 'pdid', 'trade_name', 'active_substance', 'strength',
  'pharmaceutical_form', 'atc_code', 'registry_search_text',
];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const numeric = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

function normalizeSearch(value) {
  return clean(value)
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function searchTokens(value) {
  const tokens = clean(value)
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[%*(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(token => token.slice(0, 48))
    .filter(token => token.length >= 2);

  return [...new Set(tokens)]
    .sort((left, right) => right.length - left.length || left.localeCompare(right, 'sq'))
    .slice(0, MAX_SEARCH_TOKENS);
}

function searchToken(value) {
  return searchTokens(value)[0] || '';
}

function rowSearchText(row) {
  return normalizeSearch([
    row.trade_name,
    row.active_substance,
    row.strength,
    row.pharmaceutical_form,
    row.atc_code,
    row.pdid,
    row.registry_number,
    row.registry_search_text,
  ].filter(Boolean).join(' '));
}

function rowMatchesTokens(row, tokens) {
  if (!tokens?.length) return false;
  const haystack = rowSearchText(row);
  return tokens.every(token => haystack.includes(normalizeSearch(token)));
}

function drugSelector(raw) {
  const value = clean(raw);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return { column:'id', value };
  }
  if (/^\d{1,7}$/.test(value)) return { column:'registry_number', value };
  return null;
}

function limitOf(raw) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, parsed));
}

function requestUrl(req) {
  try {
    return new URL(req?.url || '/api/dosage', 'http://medindex.local');
  } catch {
    return new URL('/api/dosage', 'http://medindex.local');
  }
}

async function readRows(path, label) {
  const { data } = await neonRequest(path, { timeoutMs:5000, label });
  if (!Array.isArray(data)) throw new Error(`${label}: Supabase nuk ktheu listë.`);
  return data;
}

function searchPath(token, limit) {
  const params = new URLSearchParams();
  params.set('select', [...IDENTITY_COLUMNS, ...PEDIATRIC_COLUMNS].join(','));
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');

  const conditions = [
    `trade_name.ilike.*${token}*`,
    `active_substance.ilike.*${token}*`,
    `strength.ilike.*${token}*`,
    `pharmaceutical_form.ilike.*${token}*`,
    `atc_code.ilike.*${token}*`,
    `pdid.ilike.*${token}*`,
    `registry_search_text.ilike.*${token}*`,
  ];
  if (/^\d{1,7}$/.test(token)) conditions.unshift(`registry_number.eq.${token}`);

  params.set('or', `(${conditions.join(',')})`);
  params.set('order', 'registry_number.asc');
  params.set('limit', String(limit));
  return `drugs?${params.toString()}`;
}

function productPath(selector) {
  const params = new URLSearchParams();
  params.set('select', [...IDENTITY_COLUMNS, ...PEDIATRIC_COLUMNS].join(','));
  params.set(selector.column, `eq.${selector.value}`);
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('limit', '1');
  return `drugs?${params.toString()}`;
}

/* Vetëm regjime pediatrike të publikuara dhe klinikisht të verifikuara. */
function regimenPath(drugId) {
  const params = new URLSearchParams();
  params.set('select', [
    'id', 'population', 'dose_text', 'route', 'frequency_text', 'duration_text',
    'maximum_text', 'warnings', 'indication_text', 'source_url', 'reviewed_at',
    'source_key', 'calculation_status',
  ].join(','));
  params.set('drug_id', `eq.${drugId}`);
  params.set('editorial_status', 'eq.published');
  params.set('calculation_status', 'in.(text_verified,calculable_verified)');
  params.set('population', 'ilike.*pediatric*');
  params.set('order', 'source_key.asc');
  params.set('limit', String(MAX_REGIMENS));
  return `dosage_regimens?${params.toString()}`;
}

function searchBindingPath(rows = []) {
  const pairs = rows
    .map(row => ({
      drugId:clean(row.id),
      sourceKey:clean(row.pediatric_primary_regimen_id),
      verdict:classify(row),
    }))
    .filter(item =>
      item.verdict.readiness === STATUS.CALCULATOR_READY
      && item.drugId
      && SAFE_SOURCE_KEY.test(item.sourceKey)
    );

  if (!pairs.length) return '';
  const drugIds = [...new Set(pairs.map(item => item.drugId))];
  const sourceKeys = [...new Set(pairs.map(item => item.sourceKey))];

  const params = new URLSearchParams();
  params.set('select', 'drug_id,source_key,calculation_status');
  params.set('drug_id', `in.(${drugIds.join(',')})`);
  params.set('source_key', `in.(${sourceKeys.join(',')})`);
  params.set('editorial_status', 'eq.published');
  params.set('calculation_status', 'in.(text_verified,calculable_verified)');
  params.set('population', 'ilike.*pediatric*');
  params.set('limit', String(Math.min(MAX_SEARCH_BINDINGS, pairs.length * 2 + 4)));
  return `dosage_regimens?${params.toString()}`;
}

function identityOf(row) {
  return {
    drugId:clean(row.id),
    registryNumber:numeric(row.registry_number),
    pdid:clean(row.pdid),
    name:clean(row.trade_name),
    substance:clean(row.active_substance),
    strength:clean(row.strength),
    form:clean(row.pharmaceutical_form),
    atcCode:clean(row.atc_code),
  };
}

function rankSearchRow(row, rawQuery) {
  const tokens = searchTokens(rawQuery).map(normalizeSearch);
  const needle = tokens[0] || '';
  const name = normalizeSearch(row.trade_name);
  const substance = normalizeSearch(row.active_substance);
  const atc = normalizeSearch(row.atc_code);
  const strength = normalizeSearch(row.strength);
  const form = normalizeSearch(row.pharmaceutical_form);

  if (needle && name === needle) return 0;
  if (needle && name.startsWith(needle)) return 1;
  if (needle && substance === needle) return 2;
  if (needle && substance.startsWith(needle)) return 3;
  if (needle && atc === needle) return 4;
  if (needle && atc.startsWith(needle)) return 5;

  const fields = [name, substance, atc, strength, form];
  const coverage = tokens.reduce((score, token) => score + (fields.some(field => field.includes(token)) ? 1 : 0), 0);
  if (coverage === tokens.length && coverage) return 10 - Math.min(coverage, 4);
  if (needle && name.includes(needle)) return 12;
  if (needle && substance.includes(needle)) return 13;
  if (needle && atc.includes(needle)) return 14;
  return 20;
}

function searchResult(row, bindingState = 'not-required') {
  const verdict = classify(row);
  const needsBinding = verdict.readiness === STATUS.CALCULATOR_READY;
  const calculable = needsBinding && bindingState === 'linked';
  return {
    ...identityOf(row),
    readiness:verdict.readiness,
    calculable,
    bindingState:needsBinding ? bindingState : 'not-required',
    indication:clean(row.pediatric_indication),
    useStatus:clean(row.pediatric_use_status),
    summary:clean(row.pediatric_dose_summary),
    requires:verdict.requires,
  };
}

function publicRegimen(row) {
  return {
    regimenId:clean(row.id),
    sourceKey:clean(row.source_key),
    population:clean(row.population),
    dose:clean(row.dose_text),
    route:clean(row.route),
    frequency:clean(row.frequency_text),
    duration:clean(row.duration_text),
    maximum:clean(row.maximum_text),
    warnings:clean(row.warnings),
    indication:clean(row.indication_text),
    sourceUrl:clean(row.source_url),
    reviewedAt:clean(row.reviewed_at),
    calculationStatus:clean(row.calculation_status),
  };
}

function typedRegimen(row, verdict) {
  return {
    basis:clean(row.pediatric_dose_basis),
    doseMin:numeric(row.pediatric_dose_min),
    doseMax:numeric(row.pediatric_dose_max),
    doseUnit:clean(row.pediatric_dose_unit),
    dosesPerDay:numeric(row.pediatric_doses_per_day),
    intervalHours:numeric(row.pediatric_interval_hours),
    route:clean(row.pediatric_route),
    indication:clean(row.pediatric_indication),
    minAge:{ value:numeric(row.pediatric_min_age_value), unit:clean(row.pediatric_min_age_unit) },
    maxAge:{ value:numeric(row.pediatric_max_age_value), unit:clean(row.pediatric_max_age_unit) },
    minWeightKg:numeric(row.pediatric_min_weight_kg),
    maxWeightKg:numeric(row.pediatric_max_weight_kg),
    caps:verdict.caps,
    concentration:verdict.volume.canConvertToVolume
      ? {
        value:numeric(row.pediatric_concentration_value),
        unit:clean(row.pediatric_concentration_unit),
        perValue:numeric(row.pediatric_concentration_per_value),
        perUnit:clean(row.pediatric_concentration_per_unit),
      }
      : null,
    primaryRegimenId:clean(row.pediatric_primary_regimen_id),
  };
}

/*
 * Binding-u klinik i formulës typed.
 *
 * `pediatric_primary_regimen_id` është historikisht emërtuar "id", por të
 * dhënat reale mbajnë `dosage_regimens.source_key`. Kjo është lidhja që përdorim.
 * Nuk bëjmë fuzzy match të indikacionit dhe nuk zgjedhim regimen sipas tekstit.
 */
function calculationBinding(row, verdict, regimens = []) {
  const required = Boolean(verdict.requires?.indication);
  const selectionId = clean(row.pediatric_primary_regimen_id);
  const indication = clean(row.pediatric_indication);

  if (!required) {
    return {
      required:false,
      valid:true,
      autoSelected:true,
      selectionId:selectionId || '',
      regimenUuid:'',
      indication,
      regimenIndication:'',
      route:clean(row.pediatric_route),
      calculationStatus:'',
      reason:'',
    };
  }

  if (!selectionId) {
    return {
      required:true, valid:false, autoSelected:false, selectionId:'', regimenUuid:'', indication,
      regimenIndication:'', route:clean(row.pediatric_route), calculationStatus:'',
      reason:'Indikacioni kërkohet, por formula typed nuk ka regjim primar të lidhur.',
    };
  }

  const linked = regimens.find(item => clean(item.sourceKey) === selectionId);
  if (!linked) {
    return {
      required:true, valid:false, autoSelected:false, selectionId, regimenUuid:'', indication,
      regimenIndication:'', route:clean(row.pediatric_route), calculationStatus:'',
      reason:'Regjimi primar i formulës nuk u gjet si regjim pediatrik i publikuar dhe i verifikuar.',
    };
  }

  if (!indication) {
    return {
      required:true, valid:false, autoSelected:false, selectionId, regimenUuid:linked.regimenId,
      indication:'', regimenIndication:linked.indication, route:clean(row.pediatric_route) || linked.route,
      calculationStatus:linked.calculationStatus,
      reason:'Regjimi është i lidhur, por indikacioni typed mungon.',
    };
  }

  return {
    required:true,
    valid:true,
    autoSelected:true,
    selectionId,
    regimenUuid:linked.regimenId,
    indication,
    regimenIndication:linked.indication,
    route:clean(row.pediatric_route) || linked.route,
    calculationStatus:linked.calculationStatus,
    reason:'',
  };
}

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (req.body.length > MAX_BODY_BYTES) throw new Error('Trupi i kërkesës është shumë i madh.');
    return JSON.parse(req.body);
  }
  if (typeof req.on !== 'function') return {};

  const raw = await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Trupi i kërkesës është shumë i madh.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
  return raw ? JSON.parse(raw) : {};
}

function patientFrom(body) {
  const age = body.age && typeof body.age === 'object' ? body.age : {};
  return {
    weightKg:numeric(body.weightKg ?? body.weight),
    heightCm:numeric(body.heightCm ?? body.height),
    ageValue:numeric(age.value ?? body.ageValue),
    ageUnit:clean(age.unit ?? body.ageUnit),
  };
}

function calculationDrug(product) {
  return {
    drugId:product.drugId,
    registryNumber:product.registryNumber,
    name:product.name,
    substance:product.substance,
    strength:product.strength,
    form:product.form,
  };
}

async function calculateDose(body) {
  const offending = Object.keys(body || {}).filter(key => FORBIDDEN_INPUT.test(key));
  if (offending.length) {
    return {
      error:`Dozimi dhe indikacioni vijnë nga baza, jo nga klienti. Hiq: ${offending.sort().join(', ')}.`,
      status:400,
    };
  }

  const outcome = await loadProduct(body?.drugId ?? body?.registryNumber);
  if (outcome.error) return outcome;

  const { row, product } = outcome;
  const binding = product.calculationRegimen;

  /* Nëse porta e binding-ut dështoi, formula nuk thirret fare. */
  if (!product.calculable) {
    return {
      calculation:{
        drug:calculationDrug(product),
        regimenId:binding?.selectionId || '',
        regimenUuid:binding?.regimenUuid || '',
        indication:binding?.indication || clean(row.pediatric_indication),
        route:binding?.route || clean(row.pediatric_route),
        outcome:'NOT_CALCULABLE',
        readiness:product.readiness,
        reasons:product.reasons,
        missing:product.missing,
        warnings:product.warnings,
      },
    };
  }

  const requestedRegimen = clean(body?.regimenId);
  const expectedRegimen = clean(binding?.selectionId);
  const expectedUuid = clean(binding?.regimenUuid);

  /* Një UUID i të njëjtit regjimi pranohet për kompatibilitet, por përgjigjja
     kthen gjithmonë `source_key` kanonik. Çdo regjim tjetër — edhe i të njëjtit
     bar — refuzohet. */
  if (requestedRegimen
    && requestedRegimen !== expectedRegimen
    && requestedRegimen !== expectedUuid) {
    return { error:'Regjimi i kërkuar nuk është regjimi primar i kësaj formule pediatrike.', status:400 };
  }

  const result = calculate(row, patientFrom(body));
  return {
    calculation:{
      drug:calculationDrug(product),
      regimenId:expectedRegimen,
      regimenUuid:expectedUuid,
      indication:binding?.indication || '',
      route:binding?.route || '',
      ...result,
    },
  };
}

function searchFacets(results = []) {
  const facets = { all:results.length, ready:0, text:0, blocked:0 };
  for (const item of results) {
    if (item.calculable === true) facets.ready += 1;
    else if (item.readiness === STATUS.TEXT_ONLY) facets.text += 1;
    else facets.blocked += 1;
  }
  return facets;
}

async function searchDrugs(rawQuery, rawLimit) {
  const tokens = searchTokens(rawQuery);
  const token = tokens[0] || '';
  if (token.length < 2) return { token:'', tokens:[], results:[], facets:searchFacets([]) };

  const rows = (await readRows(searchPath(token, limitOf(rawLimit)), 'Pediatric dosage search'))
    .filter(row => rowMatchesTokens(row, tokens))
    .map(row => ({ row, score:rankSearchRow(row, rawQuery) }))
    .sort((left, right) => left.score - right.score
      || (numeric(left.row.registry_number) ?? 0) - (numeric(right.row.registry_number) ?? 0))
    .map(item => item.row);

  const bindingPath = searchBindingPath(rows);
  let linkedKeys = new Set();
  let bindingReadFailed = false;
  if (bindingPath) {
    try {
      const bindings = await readRows(bindingPath, 'Pediatric dosage search bindings');
      linkedKeys = new Set(bindings.map(item => `${clean(item.drug_id)}|${clean(item.source_key)}`));
    } catch (error) {
      bindingReadFailed = true;
      console.error('Pediatric search binding read failed:', error.message);
    }
  }

  const results = rows.map(row => {
    const verdict = classify(row);
    if (verdict.readiness !== STATUS.CALCULATOR_READY) return searchResult(row);
    const sourceKey = clean(row.pediatric_primary_regimen_id);
    const linked = !bindingReadFailed && linkedKeys.has(`${clean(row.id)}|${sourceKey}`);
    return searchResult(row, linked ? 'linked' : (bindingReadFailed ? 'unavailable' : 'missing'));
  });

  return { token, tokens, results, facets:searchFacets(results) };
}

async function loadProduct(rawSelector) {
  const selector = drugSelector(rawSelector);
  if (!selector) return { error:'Identifikuesi i barit nuk është i vlefshëm.', status:400 };

  const rows = await readRows(productPath(selector), 'Pediatric dosage product');
  const row = rows[0];
  if (!row) return { error:'Bari nuk u gjet.', status:404 };

  const verdict = classify(row);
  const drugId = clean(row.id);
  let regimens = [];
  let regimenReadError = '';
  try {
    regimens = (await readRows(regimenPath(drugId), 'Pediatric dosage regimens')).map(publicRegimen);
  } catch (error) {
    regimenReadError = error.message;
    console.error('Pediatric regimen read failed:', error.message);
  }

  const binding = calculationBinding(row, verdict, regimens);
  const reasons = [...verdict.reasons];
  const warnings = [...verdict.warnings];
  if (verdict.readiness === STATUS.CALCULATOR_READY && !binding.valid && binding.reason) {
    reasons.push(binding.reason);
  }
  if (regimenReadError && verdict.requires?.indication) {
    warnings.push('Lidhja e regjimit nuk mund të verifikohej; kalkulatori mbetet i mbyllur.');
  }
  const calculable = verdict.readiness === STATUS.CALCULATOR_READY && binding.valid;

  return {
    row,
    product:{
      ...identityOf(row),
      readiness:verdict.readiness,
      calculable,
      requires:verdict.requires,
      reasons,
      warnings,
      missing:verdict.missing,
      useStatus:clean(row.pediatric_use_status),
      restriction:clean(row.pediatric_restriction),
      summary:clean(row.pediatric_dose_summary),
      regimen:typedRegimen(row, verdict),
      calculationRegimen:binding,
      textRegimens:regimens,
      source:{
        url:clean(row.pediatric_source_url),
        section:clean(row.pediatric_source_section),
        verificationStatus:clean(row.pediatric_verification_status),
        verifiedAt:clean(row.pediatric_verified_at),
      },
    },
  };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-MedIndex-Data-Source', 'Supabase');
  res.setHeader('X-MedIndex-Dosage-Policy', 'fail-closed');

  const url = requestUrl(req);
  const view = url.searchParams.get('view') || '';
  const allowed = view === CALCULATE_VIEW ? ['POST'] : ['GET', 'HEAD'];

  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
  }
  if (!(await authorized(req))) {
    return res.status(401).json({ ok:false, error:'Sesioni nuk është aktiv.' });
  }

  try {
    if (view === SEARCH_VIEW) {
      const { token, tokens, results, facets } = await searchDrugs(url.searchParams.get('q'), url.searchParams.get('limit'));
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).json({ ok:true, query:token, tokens, count:results.length, facets, results });
    }

    if (view === CALCULATE_VIEW) {
      let body;
      try {
        body = await readBody(req);
      } catch (error) {
        return res.status(400).json({ ok:false, error:`Trupi i kërkesës nuk u lexua: ${error.message}` });
      }
      const outcome = await calculateDose(body && typeof body === 'object' ? body : {});
      if (outcome.error) return res.status(outcome.status).json({ ok:false, error:outcome.error });
      return res.status(200).json({ ok:true, calculation:outcome.calculation });
    }

    const outcome = await loadProduct(url.searchParams.get('drugId') || url.searchParams.get('registryNumber'));
    if (outcome.error) return res.status(outcome.status).json({ ok:false, error:outcome.error });
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json({ ok:true, product:outcome.product });
  } catch (error) {
    console.error('Pediatric dosage API error:', error);
    return res.status(502).json({ ok:false, error:'Të dhënat pediatrike nuk u lexuan.' });
  }
}

handler.SEARCH_VIEW = SEARCH_VIEW;
handler.PRODUCT_VIEW = PRODUCT_VIEW;
handler.CALCULATE_VIEW = CALCULATE_VIEW;
handler.PEDIATRIC_COLUMNS = PEDIATRIC_COLUMNS;
handler.searchDrugs = searchDrugs;
handler.loadProduct = loadProduct;
handler.calculateDose = calculateDose;
handler._test = Object.freeze({
  normalizeSearch, searchTokens, searchToken, rowSearchText, rowMatchesTokens,
  drugSelector, limitOf, searchPath, productPath, regimenPath, searchBindingPath, rankSearchRow,
  searchResult, searchFacets, typedRegimen, publicRegimen, identityOf,
  calculationBinding, patientFrom, readBody, FORBIDDEN_INPUT, MAX_BODY_BYTES,
});

module.exports = handler;
