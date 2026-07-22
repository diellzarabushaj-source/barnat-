const XLSX = require('xlsx');

const DEFAULT_DOSAGE_FILE_ID = '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo';
const MEMORY_CACHE_MS = 5 * 60 * 1000;

let memoryCache = null;
let memoryCacheTime = 0;

function normalizeHeader(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeToken(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function isYes(value) {
  return ['PO', 'YES', 'TRUE', '1'].includes(String(value ?? '').trim().toUpperCase());
}

function isVerified(value) {
  return String(value ?? '').trim().toUpperCase() === 'VERIFIKUAR';
}

function environmentFlag(name) {
  return ['TRUE', '1', 'YES', 'PO'].includes(String(process.env[name] ?? '').trim().toUpperCase());
}

function isXlsxBuffer(buffer) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function sourceUrls(fileId) {
  return [
    `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
  ];
}

async function downloadWorkbook(fileId) {
  let lastError = null;

  for (const url of sourceUrls(fileId)) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MedIndexDosage/1.0)',
        },
      });

      if (!response.ok) throw new Error(`status ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!isXlsxBuffer(buffer)) throw new Error('përgjigjja nuk ishte skedar Excel');
      return buffer;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Google Sheets nuk e dha workbook-un e dozologjisë: ${lastError?.message || 'gabim i panjohur'}.`);
}

function sheetToRecords(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  const grid = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  if (!grid.length) return [];
  const headers = grid[0].map(normalizeHeader);

  return grid.slice(1).map(row => {
    const record = {};
    headers.forEach((header, index) => {
      if (header) record[header] = row[index] ?? '';
    });
    return record;
  }).filter(record => Object.values(record).some(value => String(value ?? '').trim() !== ''));
}

function configFromRows(rows) {
  const config = {};
  rows.forEach(row => {
    const key = normalizeHeader(row['Çelësi']);
    if (key) config[key] = row['Vlera'];
  });
  return config;
}

function numberOrNull(value) {
  const normalized = String(value ?? '').replace(',', '.').trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function mapForm(row) {
  const publishRoute = isYes(row['Publiko rrugën?']);
  return {
    form: normalizeHeader(row['Forma në databazë']),
    formKey: normalizeHeader(row.FormaKey) || normalizeToken(row['Forma në databazë']),
    category: normalizeHeader(row.Kategoria),
    prefix: normalizeHeader(row['Parashtesa MedIndex']),
    route: publishRoute ? normalizeHeader(row['Rruga default']) : '',
    routeSuggested: publishRoute,
    unit: normalizeHeader(row['Njësia e dozës']),
    safetyNote: normalizeHeader(row['Vërejtje sigurie']),
    version: normalizeHeader(row.Versioni),
    reviewedAt: normalizeHeader(row['Kontrolluar më']),
  };
}

function mapAdult(row) {
  return {
    regimenId: normalizeHeader(row.RegimenID),
    substance: normalizeHeader(row['Substanca aktive']),
    atc: normalizeHeader(row.ATC),
    form: normalizeHeader(row.Forma),
    referenceStrength: normalizeHeader(row['Fortësia referencë']),
    indication: normalizeHeader(row.Indikacioni),
    icd: normalizeHeader(row['Kodi ICD (opsional)']),
    population: normalizeHeader(row.Popullata),
    doseMg: normalizeHeader(row['Doza për marrje (mg)']),
    practicalUnit: normalizeHeader(row['Njësia praktike']),
    unitCount: normalizeHeader(row['Numri i njësive']),
    route: normalizeHeader(row.Rruga),
    frequency: normalizeHeader(row.Shpeshtësia),
    intervalHours: normalizeHeader(row['Intervali (orë)']),
    duration: normalizeHeader(row['Kohëzgjatja default']),
    prn: isYes(row['PRN?']),
    prnIndication: normalizeHeader(row['Indikacioni PRN']),
    maxSingleMg: numberOrNull(row['Maks. për marrje (mg)']),
    max24hMg: numberOrNull(row['Maks. 24h (mg)']),
    maxUnits24h: normalizeHeader(row['Maks. njësi/24h']),
    dispense: normalizeHeader(row['Dispenso default']),
    signatura: normalizeHeader(row['Signatura draft']),
    warnings: normalizeHeader(row['Udhëzime / alarme']),
    renalHepatic: normalizeHeader(row['Renal / hepatik']),
    sourceUrl: normalizeHeader(row['Burimi URL']),
    sourceDate: normalizeHeader(row['Data e burimit']),
    status: 'VERIFIKUAR',
  };
}

function mapPediatric(row) {
  return {
    regimenId: normalizeHeader(row.RegimenID),
    substance: normalizeHeader(row['Substanca aktive']),
    atc: normalizeHeader(row.ATC),
    form: normalizeHeader(row.Forma),
    concentration: normalizeHeader(row.Përqendrimi),
    indication: normalizeHeader(row.Indikacioni),
    icd: normalizeHeader(row['ICD (opsional)']),
    minAgeMonths: numberOrNull(row['Mosha min (muaj)']),
    maxAgeMonths: numberOrNull(row['Mosha max (muaj)']),
    minWeightKg: numberOrNull(row['Pesha min (kg)']),
    maxWeightKg: numberOrNull(row['Pesha max (kg)']),
    regimenType: normalizeHeader(row['Lloji i skemës']),
    mgPerKg: numberOrNull(row['Vlera mg/kg']),
    basis: normalizeHeader(row['Baza (dozë/ditë)']),
    dosesPerDay: numberOrNull(row['Nr. dozave/ditë']),
    fixedDoseMg: numberOrNull(row['Doza fikse (mg)']),
    fixedVolumeMl: numberOrNull(row['Vëllimi fikse (mL)']),
    route: normalizeHeader(row.Rruga),
    frequency: normalizeHeader(row.Shpeshtësia),
    intervalHours: normalizeHeader(row['Intervali (orë)']),
    maxSingleMg: numberOrNull(row['Maks. për marrje (mg)']),
    max24hMg: numberOrNull(row['Maks. 24h (mg)']),
    maxDoses24h: numberOrNull(row['Maks. nr. dozave/24h']),
    duration: normalizeHeader(row['Kohëzgjatja default']),
    formula: normalizeHeader(row['Formula e llogaritjes']),
    signatura: normalizeHeader(row['Signatura draft']),
    warnings: normalizeHeader(row['Udhëzime / alarme']),
    sourceUrl: normalizeHeader(row['Burimi URL']),
    status: 'VERIFIKUAR',
  };
}

function isPublishedDosage(row) {
  return isVerified(row.Statusi) && isYes(row['Auto-fill']);
}

function isPublishedForm(row) {
  return isVerified(row.Statusi) && isYes(row['Publiko parashtesën?']) && normalizeHeader(row['Parashtesa MedIndex']);
}

async function buildPayload() {
  const fileId = process.env.DOSAGE_SHEET_ID || DEFAULT_DOSAGE_FILE_ID;
  const clinicalAutoFillEnabled = environmentFlag('ENABLE_DOSAGE_AUTOFILL');
  const workbookBuffer = await downloadWorkbook(fileId);
  const workbook = XLSX.read(workbookBuffer, { type: 'buffer', cellDates: false });

  const configRows = sheetToRecords(workbook, 'CONFIG');
  const config = configFromRows(configRows);
  const formsSheet = normalizeHeader(config.FORMS_SHEET) || 'FORMA_DHE_SHKURTESA';
  const adultSheet = normalizeHeader(config.ADULT_SHEET) || 'DOZA_TE_RRITUR';
  const pediatricSheet = normalizeHeader(config.PEDIATRIC_SHEET) || 'DOZA_PEDIATRIKE';

  const formRows = sheetToRecords(workbook, formsSheet);
  const adultRows = sheetToRecords(workbook, adultSheet);
  const pediatricRows = sheetToRecords(workbook, pediatricSheet);

  const forms = formRows.filter(isPublishedForm).map(mapForm);
  const verifiedAdult = adultRows.filter(isPublishedDosage).map(mapAdult);
  const verifiedPediatric = pediatricRows.filter(isPublishedDosage).map(mapPediatric);
  const adult = clinicalAutoFillEnabled ? verifiedAdult : [];
  const pediatric = clinicalAutoFillEnabled ? verifiedPediatric : [];

  return {
    schemaVersion: normalizeHeader(config.SCHEMA_VERSION) || '1.0.0',
    datasetVersion: normalizeHeader(config.DATASET_VERSION) || '',
    mode: normalizeHeader(config.WEBSITE_MODE) || 'SAFE_VERIFIED_ONLY',
    generatedAt: new Date().toISOString(),
    forms,
    adult,
    pediatric,
    meta: {
      sourceFileId: fileId,
      cacheSeconds: numberOrNull(config.CACHE_SECONDS) || 300,
      clinicalAutoFillEnabled,
      publishedForms: forms.length,
      publishedAdultRegimens: adult.length,
      publishedPediatricRegimens: pediatric.length,
      eligibleAdultRegimens: verifiedAdult.length,
      eligiblePediatricRegimens: verifiedPediatric.length,
      draftAdultRegimens: adultRows.filter(row => !isPublishedDosage(row)).length,
      draftPediatricRegimens: pediatricRows.filter(row => !isPublishedDosage(row)).length,
      geminiForDosage: false,
    },
  };
}

module.exports = async function handler(req, res) {
  try {
    const now = Date.now();
    if (!memoryCache || now - memoryCacheTime > MEMORY_CACHE_MS) {
      memoryCache = await buildPayload();
      memoryCacheTime = now;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).json(memoryCache);
  } catch (error) {
    console.error('Dosage data error:', error);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({
      error: error.message || 'Gabim gjatë ngarkimit të dozologjisë.',
      forms: [],
      adult: [],
      pediatric: [],
      meta: { clinicalAutoFillEnabled: false, geminiForDosage: false },
    });
  }
};
