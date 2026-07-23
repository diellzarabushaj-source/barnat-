const crypto = require('node:crypto');

const SPREADSHEET_ID = '19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw';
const SHEETS = {
  all: 1504864603,
  urgent: 285385409,
  critical: 255407421,
};
const CACHE_TTL_MS = 15 * 60 * 1000;
let memoryCache = null;

function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

function parseCsv(value) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const text = String(value || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function clean(value) { return String(value ?? '').trim(); }
function normalized(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tableFromCsv(csv) {
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex(row => {
    const normalizedCells = row.map(normalized);
    const hasCode = normalizedCells.includes('kodi icd 10') || normalizedCells.includes('kodi');
    return hasCode && normalizedCells.includes('emri ne shqip');
  });
  if (headerIndex < 0) throw new Error('Nuk u gjet rreshti i kolonave ICD-10 në Google Sheet.');
  const headers = rows[headerIndex].map(clean);
  return rows.slice(headerIndex + 1)
    .filter(row => row.some(cell => clean(cell)))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])])));
}

async function fetchCsv(gid) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(csvUrl(gid), {
      headers: { Accept: 'text/csv,*/*;q=0.8', 'User-Agent': 'MedIndex/1.2' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Google Sheet ktheu ${response.status}.`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function codeValue(row) {
  return clean(row['Kodi ICD-10'] || row.Kodi);
}

function codeSet(rows) {
  return new Set(rows.map(codeValue).filter(Boolean));
}

function keywords(value) {
  return clean(value).split(';').map(clean).filter(Boolean);
}

function level(value) {
  const token = normalized(value);
  if (token === 'kategori kryesore') return 'kategori';
  return 'kod';
}

function mapEntry(row, urgentCodes, criticalCodes) {
  const code = codeValue(row);
  const sourceUrl = clean(row['Burimi WHO']) || `https://icd.who.int/browse10/2019/en#/${encodeURIComponent(code)}`;
  return {
    number: clean(row['Nr.']),
    chapter: clean(row['Kapitulli']),
    chapterRange: clean(row['Intervali']).replace(/-/g, '–'),
    chapterTitle: clean(row['Emri i kapitullit']),
    group: clean(row['Grupi / nënkategoria klinike']),
    code,
    level: level(row['Niveli']),
    sourceLevel: clean(row['Niveli']),
    title: clean(row['Emri në shqip']),
    englishTitle: clean(row['Emri në anglisht']),
    primaryCare: clean(row['Mjekësi familjare']),
    emergency: clean(row['Urgjencë']),
    priority: clean(row['Prioriteti']),
    summary: clean(row['Përdorimi tipik']),
    keywords: keywords(row['Fjalë kyçe']),
    warning: clean(row['Shenja alarmi / kujdes']),
    sourceUrl,
    codingNotes: [clean(row['Shënim kodimi'])].filter(Boolean),
    includes: [],
    excludes: [],
    parent: clean(row['Grupi / nënkategoria klinike']) || clean(row['Intervali']),
    isFamilyMedicine: true,
    isEmergency: urgentCodes.has(code),
    isCritical: criticalCodes.has(code),
  };
}

async function loadDataset() {
  if (memoryCache && Date.now() - memoryCache.loadedAt < CACHE_TTL_MS) return memoryCache;
  const [allCsv, urgentCsv, criticalCsv] = await Promise.all([
    fetchCsv(SHEETS.all),
    fetchCsv(SHEETS.urgent),
    fetchCsv(SHEETS.critical),
  ]);
  const allRows = tableFromCsv(allCsv);
  const urgentRows = tableFromCsv(urgentCsv);
  const criticalRows = tableFromCsv(criticalCsv);
  const urgentCodes = codeSet(urgentRows);
  const criticalCodes = codeSet(criticalRows);
  const entries = allRows.map(row => mapEntry(row, urgentCodes, criticalCodes)).filter(entry => entry.code && entry.title);
  const unique = new Set(entries.map(entry => entry.code));
  if (unique.size !== entries.length) throw new Error('Google Sheet përmban kode ICD-10 të dyfishta.');
  if (!entries.length || !urgentCodes.size || !criticalCodes.size) throw new Error('Google Sheet nuk ktheu setet e plota ICD-10.');

  const data = {
    source: 'Google Sheet i dhënë nga përdoruesi',
    sourceSpreadsheetId: SPREADSHEET_ID,
    version: 'ICD-10-WHO 2019',
    generatedAt: new Date().toISOString(),
    counts: {
      total: entries.length,
      familyMedicine: entries.filter(entry => entry.isFamilyMedicine).length,
      emergency: entries.filter(entry => entry.isEmergency).length,
      critical: entries.filter(entry => entry.isCritical).length,
    },
    entries,
  };
  const body = JSON.stringify({ ok: true, data });
  memoryCache = {
    loadedAt: Date.now(),
    body,
    etag: `"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
    data,
  };
  return memoryCache;
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

module.exports = async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Metoda nuk lejohet.' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
  if (!(await authorized(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ error: 'Kërkohet autentikim.' });
  }

  try {
    const dataset = await loadDataset();
    res.setHeader('ETag', dataset.etag);
    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-MedIndex-ICD-Codes', String(dataset.data.counts.total));
    res.setHeader('X-MedIndex-ICD-Source', 'user-google-sheet');
    if (req.headers['if-none-match'] === dataset.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(dataset.body);
  } catch (error) {
    console.error('ICD Google Sheet load failed:', error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(502).json({ error: 'Të dhënat ICD-10 nuk u ngarkuan nga Google Sheet.' });
  }
};
