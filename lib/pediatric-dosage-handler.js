'use strict';

/* Faza 2 — API-ja e kalkulatorit pediatrik: kërkimi dhe produkti.
 *
 *   GET /api/dosage/search?q=amoksicil
 *   GET /api/dosage/product/:drugId
 *
 * Të dyja janë rishkrime mbi funksionin `/api/dosage` që ekziston. Buxheti i
 * Hobby-t është 12 funksione dhe janë zënë 11; një skedar i ri te `api/` do ta
 * mbyllte hapësirën e fundit për asgjë, kur e njëjta gjë bëhet me dy rreshta
 * te `vercel.json`.
 *
 * Të dyja lexojnë vetëm. Llogaritja nuk është këtu — vjen te Faza 5 — dhe
 * kur të vijë, do ta marrë dozën nga baza, kurrë nga shfletuesi. Prandaj as ky
 * skedar nuk pranon numra doze nga jashtë: `search` merr vetëm një varg
 * kërkimi, `product` vetëm një identifikues.
 *
 * Gatishmëria vjen nga `lib/pediatric-readiness.js`. Kjo do të thotë se lista e
 * kërkimit dhe faqja e produktit e thonë të njëjtën gjë për të njëjtin bar —
 * nuk ka dy rregulla që rrëshqasin larg njëri-tjetrit.
 */

const { neonRequest } = require('./neon-data-api.js');
const { STATUS, classify } = require('./pediatric-readiness.js');
const { calculate } = require('./pediatric-calculation.js');

const SEARCH_VIEW = 'pediatric-search';
const PRODUCT_VIEW = 'pediatric-product';
const CALCULATE_VIEW = 'pediatric-calculate';

/* Çelësat që një shfletues nuk guxon t'i dërgojë kurrë. Nuk injorohen në
   heshtje — refuzohen me 400. Një klient që i dërgon ka një defekt, dhe ai
   defekt duhet të bjerë në sy sot, jo të prodhojë doza që dikush i beson. */
const FORBIDDEN_INPUT = /^(pediatric_|dose|concentration|max|conc$)/i;
const MAX_BODY_BYTES = 4096;

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 40;
const MAX_QUERY_LENGTH = 64;
const MAX_REGIMENS = 12;

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
const IDENTITY_COLUMNS = ['id', 'registry_number', 'pdid', 'trade_name', 'active_substance', 'strength', 'pharmaceutical_form'];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const numeric = value => {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

/* Vargu i kërkimit shkon te një filtër `ilike` te Neon-i, prandaj hiqen shenjat
   që kanë kuptim atje: `%` dhe `*` janë xhoker, presja i ndan argumentet e
   `or(...)`, kllapat e mbyllin atë. Mbetet një token i vetëm — po ai që përdor
   `api/drug-search.js`, dhe `tests/pediatric-dosage-api-test.js` e krahason me
   të, që të dy të mos rrëshqasin larg njëri-tjetrit. */
function searchToken(value) {
  const tokens = clean(value)
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[%*(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(token => token.length >= 2)
    .sort((left, right) => right.length - left.length || left.localeCompare(right, 'sq'));
  return String(tokens[0] || '').slice(0, 48);
}

/* Identifikuesi vjen nga shtegu i URL-së, prandaj pranohet vetëm ajo që është
   vërtet identifikues: një UUID ose një numër regjistri. Çdo gjë tjetër nuk
   arrin kurrë te ndërtimi i query-t. */
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
  if (!Array.isArray(data)) throw new Error(`${label}: Neon nuk ktheu listë.`);
  return data;
}

function searchPath(token, limit) {
  const params = new URLSearchParams();
  params.set('select', [...IDENTITY_COLUMNS, ...PEDIATRIC_COLUMNS].join(','));
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('or', `(${[
    `trade_name.ilike.*${token}*`,
    `active_substance.ilike.*${token}*`,
  ].join(',')})`);
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

/* Regjimet tekstuale janë burimi që mjeku lexon kur kalkulatori nuk hyn dot në
   punë — dhe konteksti që e shoqëron edhe kur hyn. Merren vetëm ato pediatrike
   dhe vetëm të publikuarat e verifikuara. */
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

function identityOf(row) {
  return {
    drugId:clean(row.id),
    registryNumber:numeric(row.registry_number),
    pdid:clean(row.pdid),
    name:clean(row.trade_name),
    substance:clean(row.active_substance),
    strength:clean(row.strength),
    form:clean(row.pharmaceutical_form),
  };
}

/* Rendi i kërkimit: përputhja te fillimi i emrit vjen e para, pastaj përputhja
   te substanca, pastaj numri i regjistrit. Gatishmëria nuk e ndryshon rendin me
   qëllim — mjeku që shkruan një emër pret atë bar, jo atë që rastis të jetë i
   llogaritshëm. Etiketa e thotë cili është cili. */
function rankSearchRow(row, token) {
  const name = clean(row.trade_name).toLocaleLowerCase('sq');
  const substance = clean(row.active_substance).toLocaleLowerCase('sq');
  const needle = token.toLocaleLowerCase('sq');
  if (name.startsWith(needle)) return 0;
  if (name.includes(needle)) return 1;
  if (substance.startsWith(needle)) return 2;
  if (substance.includes(needle)) return 3;
  return 4;
}

function searchResult(row) {
  const verdict = classify(row);
  return {
    ...identityOf(row),
    readiness:verdict.readiness,
    calculable:verdict.readiness === STATUS.CALCULATOR_READY,
    indication:clean(row.pediatric_indication),
    useStatus:clean(row.pediatric_use_status),
    summary:clean(row.pediatric_dose_summary),
    requires:verdict.requires,
  };
}

function publicRegimen(row) {
  return {
    regimenId:clean(row.id),
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

/* Dozimi i typed-uar kthehet ashtu siç është regjistruar. Nuk përllogaritet
   asgjë këtu: shfletuesi e sheh intervalin e regjistruar, dhe kur të vijë Faza
   5, doza e pacientit do të dalë nga serveri mbi këto të njëjta fusha. */
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

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

/* Trupi vjen ose i analizuar nga platforma, ose si rrjedhë. Të dyja kufizohen
   në madhësi: një trup kërkese për një kalkulim është disa qindra bajt, dhe
   çdo gjë shumë më e madhe është ose gabim ose sondë. */
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

/* Llogaritja: shfletuesi thotë cili bar dhe cili pacient, serveri e ngarkon
   dozimin nga baza dhe e bën aritmetikën. Kjo është e gjithë pika e Fazës 5 —
   asnjë numër dozimi nuk udhëton nga klienti. */
async function calculateDose(body) {
  const offending = Object.keys(body || {}).filter(key => FORBIDDEN_INPUT.test(key));
  if (offending.length) {
    return {
      error:`Dozimi vjen nga baza, jo nga klienti. Hiq: ${offending.sort().join(', ')}.`,
      status:400,
    };
  }

  const outcome = await loadProduct(body?.drugId ?? body?.registryNumber);
  if (outcome.error) return outcome;

  const { row, product } = outcome;
  const result = calculate(row, patientFrom(body));

  /* `regimenId` mbahet e lidhur me barin e vet. Sot fushat e typed-uara mbajnë
     një regjim të vetëm, prandaj kjo është kryesisht mbrojtje për nesër — po
     një identifikues regjimi nga një bar tjetër nuk guxon të kalojë as sot. */
  const regimenId = clean(body?.regimenId);
  if (regimenId) {
    const known = [product.regimen.primaryRegimenId, ...product.textRegimens.map(item => item.regimenId)];
    if (!known.filter(Boolean).includes(regimenId)) {
      return { error:'Regjimi i kërkuar nuk i përket këtij bari.', status:400 };
    }
  }

  return {
    calculation:{
      drug:{
        drugId:product.drugId,
        registryNumber:product.registryNumber,
        name:product.name,
        substance:product.substance,
        strength:product.strength,
        form:product.form,
      },
      regimenId:regimenId || product.regimen.primaryRegimenId || '',
      indicationId:clean(body?.indicationId),
      ...result,
    },
  };
}

async function searchDrugs(rawQuery, rawLimit) {
  const token = searchToken(rawQuery);
  if (token.length < 2) return { token:'', results:[] };
  const rows = await readRows(searchPath(token, limitOf(rawLimit)), 'Pediatric dosage search');
  const results = rows
    .map(row => ({ row, score:rankSearchRow(row, token) }))
    .sort((left, right) => left.score - right.score
      || (numeric(left.row.registry_number) ?? 0) - (numeric(right.row.registry_number) ?? 0))
    .map(item => searchResult(item.row));
  return { token, results };
}

async function loadProduct(rawSelector) {
  const selector = drugSelector(rawSelector);
  if (!selector) return { error:'Identifikuesi i barit nuk është i vlefshëm.', status:400 };

  const rows = await readRows(productPath(selector), 'Pediatric dosage product');
  const row = rows[0];
  if (!row) return { error:'Bari nuk u gjet.', status:404 };

  const verdict = classify(row);
  const drugId = clean(row.id);
  /* Regjimet tekstuale nuk e ndalojnë përgjigjen: nëse tabela e tyre nuk
     përgjigjet, produkti kthehet prapëseprapë me dozimin e typed-uar. */
  let regimens = [];
  try {
    regimens = (await readRows(regimenPath(drugId), 'Pediatric dosage regimens')).map(publicRegimen);
  } catch (error) {
    console.error('Pediatric regimen read failed:', error.message);
  }

  return {
    /* Rreshti i papërpunuar u kthehet vetëm thirrësve brenda serverit — motori i
       llogaritjes e do të tërin. Përgjigjja HTTP dërgon `product`, kurrë `row`. */
    row,
    product:{
      ...identityOf(row),
      readiness:verdict.readiness,
      calculable:verdict.readiness === STATUS.CALCULATOR_READY,
      requires:verdict.requires,
      reasons:verdict.reasons,
      warnings:verdict.warnings,
      missing:verdict.missing,
      useStatus:clean(row.pediatric_use_status),
      restriction:clean(row.pediatric_restriction),
      summary:clean(row.pediatric_dose_summary),
      regimen:typedRegimen(row, verdict),
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
  res.setHeader('Cache-Control', 'private, no-cache, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const url = requestUrl(req);
  const view = url.searchParams.get('view') || '';
  /* Llogaritja është POST sepse merr një trup, jo sepse ndryshon gjendje —
     nuk shkruan asgjë. Prandaj nuk ka kontroll CSRF: nuk ka çka të mbrohet nga
     një kërkesë ndër-vendore që s'ndryshon asgjë dhe përgjigjja e së cilës nuk
     lexohet dot pa CORS. Nëse ndonjëherë kjo rrugë shkruan diçka, kontrolli
     CSRF duhet të hyjë bashkë me shkrimin. */
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
      const { token, results } = await searchDrugs(url.searchParams.get('q'), url.searchParams.get('limit'));
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).json({
        ok:true, query:token, count:results.length, results,
      });
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
  searchToken, drugSelector, limitOf, searchPath, productPath, regimenPath,
  rankSearchRow, searchResult, typedRegimen, publicRegimen, identityOf,
  patientFrom, readBody, FORBIDDEN_INPUT, MAX_BODY_BYTES,
});

module.exports = handler;
