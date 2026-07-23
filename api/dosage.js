const XLSX = require('xlsx');
const crypto = require('node:crypto');

const DEFAULT_DOSAGE_FILE_ID = '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo';
const MEMORY_CACHE_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;
const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;

let memoryCache = null;
let memoryCacheTime = 0;
let memoryCacheKey = '';
let pendingBuild = null;
let pendingBuildKey = '';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const token = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const yes = value => ['PO', 'YES', 'TRUE', '1'].includes(clean(value).toUpperCase());
const verified = value => clean(value).toUpperCase() === 'VERIFIKUAR';
const envFlag = name => ['TRUE', '1', 'YES', 'PO'].includes(clean(process.env[name]).toUpperCase());
const httpsUrl = value => /^https:\/\/[^\s]+$/i.test(clean(value)) ? clean(value) : '';
const numberOrNull = value => {
  const raw = clean(value);
  const parsed = Number(raw.replace(',', '.'));
  return raw && Number.isFinite(parsed) ? parsed : null;
};

function sourceUrls(fileId) {
  return [
    `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
  ];
}

async function fetchWorkbook(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MedIndexDosage/2.1)' },
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > MAX_WORKBOOK_BYTES) throw new Error('workbook-u është tepër i madh');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_WORKBOOK_BYTES) throw new Error('workbook-u është tepër i madh');
    if (!(buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b)) throw new Error('përgjigjja nuk ishte Excel');
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadWorkbook(fileId) {
  let lastError;
  for (const url of sourceUrls(fileId)) {
    try { return await fetchWorkbook(url); }
    catch (error) { lastError = error; }
  }
  throw new Error(`Google Sheets nuk e dha workbook-un: ${lastError?.message || 'gabim i panjohur'}.`);
}

function sheetToRecords(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Mungon tab-i ${sheetName}.`);
  const grid = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, blankrows: false });
  if (!grid.length) return [];
  const headers = grid[0].map(clean);
  const nonEmptyHeaders = headers.filter(Boolean);
  if (new Set(nonEmptyHeaders).size !== nonEmptyHeaders.length) throw new Error(`Tab-i ${sheetName} ka header-a të dyfishtë.`);
  return grid.slice(1).map(row => {
    const record = {};
    headers.forEach((header, index) => { if (header) record[header] = row[index] ?? ''; });
    return record;
  }).filter(record => Object.values(record).some(value => clean(value)));
}

function configFromRows(rows) {
  return Object.fromEntries(rows.map(row => [clean(row['Çelësi']), row['Vlera']]).filter(([key]) => key));
}

function safeSingleRoute(value) {
  const route = clean(value);
  if (!route || /sipas|\bor\b|\bose\b|\//i.test(route)) return '';
  return route;
}

function mapForm(row) {
  const route = yes(row['Publiko rrugën?']) ? safeSingleRoute(row['Rruga default']) : '';
  return {
    form: clean(row['Forma në databazë']), formKey: clean(row.FormaKey) || token(row['Forma në databazë']),
    category: clean(row.Kategoria), prefix: clean(row['Parashtesa MedIndex']), route,
    routeSuggested: Boolean(route), unit: clean(row['Njësia e dozës']), safetyNote: clean(row['Vërejtje sigurie']),
    version: clean(row.Versioni), reviewedAt: clean(row['Kontrolluar më']),
  };
}

function mapAdult(row) {
  return {
    regimenId: clean(row.RegimenID), substance: clean(row['Substanca aktive']), atc: clean(row.ATC), form: clean(row.Forma),
    referenceStrength: clean(row['Fortësia referencë']), indication: clean(row.Indikacioni), icd: clean(row['Kodi ICD (opsional)']),
    population: clean(row.Popullata), doseMg: clean(row['Doza për marrje (mg)']), practicalUnit: clean(row['Njësia praktike']),
    unitCount: clean(row['Numri i njësive']), route: clean(row.Rruga), frequency: clean(row.Shpeshtësia),
    intervalHours: clean(row['Intervali (orë)']), duration: clean(row['Kohëzgjatja default']), prn: yes(row['PRN?']),
    prnIndication: clean(row['Indikacioni PRN']), maxSingleMg: numberOrNull(row['Maks. për marrje (mg)']),
    max24hMg: numberOrNull(row['Maks. 24h (mg)']), maxUnits24h: clean(row['Maks. njësi/24h']),
    dispense: clean(row['Dispenso default']), signatura: clean(row['Signatura draft']), warnings: clean(row['Udhëzime / alarme']),
    renalHepatic: clean(row['Renal / hepatik']), sourceUrl: httpsUrl(row['Burimi URL']), sourceDate: clean(row['Data e burimit']),
    status: 'VERIFIKUAR',
  };
}

function mapPediatric(row) {
  return {
    regimenId: clean(row.RegimenID), substance: clean(row['Substanca aktive']), atc: clean(row.ATC), form: clean(row.Forma),
    concentration: clean(row.Përqendrimi), indication: clean(row.Indikacioni), icd: clean(row['ICD (opsional)']),
    minAgeMonths: numberOrNull(row['Mosha min (muaj)']), maxAgeMonths: numberOrNull(row['Mosha max (muaj)']),
    minWeightKg: numberOrNull(row['Pesha min (kg)']), maxWeightKg: numberOrNull(row['Pesha max (kg)']),
    regimenType: clean(row['Lloji i skemës']), mgPerKg: numberOrNull(row['Vlera mg/kg']), basis: clean(row['Baza (dozë/ditë)']),
    dosesPerDay: numberOrNull(row['Nr. dozave/ditë']), fixedDoseMg: numberOrNull(row['Doza fikse (mg)']),
    fixedVolumeMl: numberOrNull(row['Vëllimi fikse (mL)']), route: clean(row.Rruga), frequency: clean(row.Shpeshtësia),
    intervalHours: clean(row['Intervali (orë)']), maxSingleMg: numberOrNull(row['Maks. për marrje (mg)']),
    max24hMg: numberOrNull(row['Maks. 24h (mg)']), maxDoses24h: numberOrNull(row['Maks. nr. dozave/24h']),
    duration: clean(row['Kohëzgjatja default']), dispense: clean(row['Dispenso default']), formula: clean(row['Formula e llogaritjes']),
    signatura: clean(row['Signatura draft']), warnings: clean(row['Udhëzime / alarme']), sourceUrl: httpsUrl(row['Burimi URL']),
    status: 'VERIFIKUAR',
  };
}

const publishedForm = row => verified(row.Statusi) && yes(row['Publiko parashtesën?']) && clean(row['Forma në databazë']) && clean(row['Parashtesa MedIndex']);
const requestedDosage = row => verified(row.Statusi) && yes(row['Auto-fill']);

function validAdult(row) {
  return requestedDosage(row) && clean(row.RegimenID) && clean(row['Substanca aktive']) && clean(row.ATC) && clean(row.Forma) &&
    clean(row['Fortësia referencë']) && clean(row.Indikacioni) && clean(row.Rruga) && clean(row.Shpeshtësia) &&
    clean(row['Signatura draft']) && httpsUrl(row['Burimi URL']);
}

function validPediatric(row) {
  const hasDoseRule = numberOrNull(row['Vlera mg/kg']) != null || numberOrNull(row['Doza fikse (mg)']) != null || numberOrNull(row['Vëllimi fikse (mL)']) != null;
  return requestedDosage(row) && clean(row.RegimenID) && clean(row['Substanca aktive']) && clean(row.ATC) && clean(row.Forma) &&
    clean(row.Përqendrimi) && clean(row.Indikacioni) && clean(row.Rruga) && clean(row.Shpeshtësia) && hasDoseRule && httpsUrl(row['Burimi URL']);
}

function uniqueBy(items, keyName) {
  const seen = new Set();
  const output = [];
  let duplicates = 0;
  for (const item of items) {
    const key = token(item[keyName]);
    if (!key || seen.has(key)) { duplicates += 1; continue; }
    seen.add(key);
    output.push(item);
  }
  return { output, duplicates };
}

async function buildPayload(fileId) {
  const startedAt = Date.now();
  const workbook = XLSX.read(await downloadWorkbook(fileId), { type: 'buffer', cellDates: false });
  const config = configFromRows(sheetToRecords(workbook, 'CONFIG'));
  const clinicalAutoFillEnabled = envFlag('ENABLE_DOSAGE_AUTOFILL') || yes(config.CLINICAL_AUTOFILL_ENABLED);
  const formRows = sheetToRecords(workbook, clean(config.FORMS_SHEET) || 'FORMA_DHE_SHKURTESA');
  const adultRows = sheetToRecords(workbook, clean(config.ADULT_SHEET) || 'DOZA_TE_RRITUR');
  const pediatricRows = sheetToRecords(workbook, clean(config.PEDIATRIC_SHEET) || 'DOZA_PEDIATRIKE');

  const formsResult = uniqueBy(formRows.filter(publishedForm).map(mapForm), 'formKey');
  const eligibleAdultResult = uniqueBy(adultRows.filter(validAdult).map(mapAdult), 'regimenId');
  const eligiblePediatricResult = uniqueBy(pediatricRows.filter(validPediatric).map(mapPediatric), 'regimenId');
  const adult = clinicalAutoFillEnabled ? eligibleAdultResult.output : [];
  const pediatric = clinicalAutoFillEnabled ? eligiblePediatricResult.output : [];

  const payload = {
    schemaVersion: clean(config.SCHEMA_VERSION) || '1.0.0', datasetVersion: clean(config.DATASET_VERSION),
    mode: clean(config.WEBSITE_MODE) || 'SAFE_VERIFIED_ONLY', generatedAt: new Date().toISOString(),
    forms: formsResult.output, adult, pediatric,
    meta: {
      sourceFileId: fileId, clinicalAutoFillEnabled,
      activationSource: envFlag('ENABLE_DOSAGE_AUTOFILL') ? 'vercel-env' : clinicalAutoFillEnabled ? 'sheet-config' : 'disabled',
      autoApplyPolicy: clean(config.AUTO_APPLY_POLICY) || 'UNIQUE_EXACT_MATCH_AUTO_APPLY',
      publishedForms: formsResult.output.length, publishedAdultRegimens: adult.length, publishedPediatricRegimens: pediatric.length,
      eligibleAdultRegimens: eligibleAdultResult.output.length, eligiblePediatricRegimens: eligiblePediatricResult.output.length,
      rejectedAdultRegimens: adultRows.filter(requestedDosage).length - eligibleAdultResult.output.length,
      rejectedPediatricRegimens: pediatricRows.filter(requestedDosage).length - eligiblePediatricResult.output.length,
      duplicateForms: formsResult.duplicates, duplicateAdultRegimens: eligibleAdultResult.duplicates,
      duplicatePediatricRegimens: eligiblePediatricResult.duplicates,
      draftAdultRegimens: adultRows.filter(row => !requestedDosage(row)).length,
      draftPediatricRegimens: pediatricRows.filter(row => !requestedDosage(row)).length,
      buildMs: Date.now() - startedAt, geminiForDosage: false,
    },
  };
  const body = JSON.stringify(payload);
  return { payload, body, etag: `"${crypto.createHash('sha256').update(body).digest('base64url')}"` };
}

async function getPayload() {
  const fileId = process.env.DOSAGE_SHEET_ID || DEFAULT_DOSAGE_FILE_ID;
  const key = `${fileId}:${envFlag('ENABLE_DOSAGE_AUTOFILL')}:config-v4`;
  const now = Date.now();
  if (memoryCache && memoryCacheKey === key && now - memoryCacheTime < MEMORY_CACHE_MS) return memoryCache;
  if (!pendingBuild || pendingBuildKey !== key) {
    pendingBuildKey = key;
    pendingBuild = buildPayload(fileId).then(result => {
      memoryCache = result; memoryCacheTime = Date.now(); memoryCacheKey = key; return result;
    }).finally(() => { pendingBuild = null; pendingBuildKey = ''; });
  }
  return pendingBuild;
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error: 'Lejohet vetëm GET/HEAD.' });
    }
    if (!(await authorized(req))) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Vary', 'Cookie');
      return res.status(401).json({ error: 'Sesioni nuk është aktiv.', forms: [], adult: [], pediatric: [] });
    }

    const result = await getPayload();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-cache, max-age=0');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('ETag', result.etag);
    res.setHeader('Server-Timing', `dosage;dur=${Date.now() - startedAt}`);
    if (req.headers['if-none-match'] === result.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(result.body);
  } catch (error) {
    console.error('Dosage data error:', error);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      error: error.message || 'Gabim gjatë ngarkimit të dozologjisë.', forms: [], adult: [], pediatric: [],
      meta: { clinicalAutoFillEnabled: false, geminiForDosage: false },
    });
  }
};
