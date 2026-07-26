const crypto = require('node:crypto');

const SPREADSHEET_ID = '19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw';
const SHEETS = { all:1504864603, urgent:285385409, critical:255407421 };
const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;
const MAX_CSV_BYTES = 6 * 1024 * 1024;
let memoryCache = null;
let pendingLoad = null;

const clean = value => String(value ?? '').trim();
const normalized = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const httpsUrl = value => /^https:\/\/[^\s]+$/i.test(clean(value)) ? clean(value) : '';
const csvUrl = gid => `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;

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
      if (char === '"' && next === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
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

function tableFromCsv(csv) {
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex(row => {
    const cells = row.map(normalized);
    return (cells.includes('kodi icd 10') || cells.includes('kodi')) && cells.includes('emri ne shqip');
  });
  if (headerIndex < 0) throw new Error('Nuk u gjet rreshti i kolonave ICD-10 në Google Sheet.');
  const headers = rows[headerIndex].map(clean);
  const nonEmpty = headers.filter(Boolean);
  if (new Set(nonEmpty).size !== nonEmpty.length) throw new Error('Google Sheet ICD-10 ka header-a të dyfishtë.');
  return rows.slice(headerIndex + 1)
    .filter(row => row.some(cell => clean(cell)))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])])));
}

async function fetchCsv(gid) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(csvUrl(gid), {
      headers:{ Accept:'text/csv,*/*;q=0.8', 'User-Agent':'MedIndex/1.3' },
      signal:controller.signal,
    });
    if (!response.ok) throw new Error(`Google Sheet ktheu ${response.status}.`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_CSV_BYTES) throw new Error('Google Sheet ICD-10 tejkalon kufirin e madhësisë.');
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) throw new Error('Google Sheet ICD-10 tejkalon kufirin e madhësisë.');
    if (!text.trim()) throw new Error('Google Sheet ICD-10 ishte bosh.');
    return text;
  } finally { clearTimeout(timeout); }
}

const codeValue = row => clean(row['Kodi ICD-10'] || row.Kodi);
const codeSet = rows => new Set(rows.map(codeValue).filter(Boolean));
const keywords = value => clean(value).split(';').map(clean).filter(Boolean);
const level = value => normalized(value) === 'kategori kryesore' ? 'kategori' : 'kod';

function mapEntry(row, urgentCodes, criticalCodes) {
  const code = codeValue(row);
  const officialFallback = `https://icd.who.int/browse10/2019/en#/${encodeURIComponent(code)}`;
  return {
    number:clean(row['Nr.']), chapter:clean(row.Kapitulli), chapterRange:clean(row.Intervali).replace(/-/g, '–'),
    chapterTitle:clean(row['Emri i kapitullit']), group:clean(row['Grupi / nënkategoria klinike']), code,
    level:level(row.Niveli), sourceLevel:clean(row.Niveli), title:clean(row['Emri në shqip']),
    englishTitle:clean(row['Emri në anglisht']), primaryCare:clean(row['Mjekësi familjare']), emergency:clean(row.Urgjencë),
    priority:clean(row.Prioriteti), summary:clean(row['Përdorimi tipik']), keywords:keywords(row['Fjalë kyçe']),
    warning:clean(row['Shenja alarmi / kujdes']), sourceUrl:httpsUrl(row['Burimi WHO']) || officialFallback,
    codingNotes:[clean(row['Shënim kodimi'])].filter(Boolean), includes:[], excludes:[],
    parent:clean(row['Grupi / nënkategoria klinike']) || clean(row.Intervali),
    isFamilyMedicine:true, isEmergency:urgentCodes.has(code), isCritical:criticalCodes.has(code),
  };
}

async function buildDataset() {
  const [allCsv, urgentCsv, criticalCsv] = await Promise.all([
    fetchCsv(SHEETS.all), fetchCsv(SHEETS.urgent), fetchCsv(SHEETS.critical),
  ]);
  const allRows = tableFromCsv(allCsv);
  const urgentCodes = codeSet(tableFromCsv(urgentCsv));
  const criticalCodes = codeSet(tableFromCsv(criticalCsv));
  const entries = allRows.map(row => mapEntry(row, urgentCodes, criticalCodes)).filter(entry => entry.code && entry.title);
  const unique = new Set(entries.map(entry => entry.code));
  if (unique.size !== entries.length) throw new Error('Google Sheet përmban kode ICD-10 të dyfishta.');
  if (!entries.length || !urgentCodes.size || !criticalCodes.size) throw new Error('Google Sheet nuk ktheu setet e plota ICD-10.');
  const data = {
    source:'Google Sheet i dhënë nga përdoruesi', sourceSpreadsheetId:SPREADSHEET_ID,
    version:'ICD-10-WHO 2019', generatedAt:new Date().toISOString(),
    counts:{
      total:entries.length,
      familyMedicine:entries.filter(entry => entry.isFamilyMedicine).length,
      emergency:entries.filter(entry => entry.isEmergency).length,
      critical:entries.filter(entry => entry.isCritical).length,
    },
    entries,
  };
  const body = JSON.stringify({ ok:true, data });
  return { loadedAt:Date.now(), body, etag:`"${crypto.createHash('sha256').update(body).digest('base64url')}"`, data };
}

async function loadDataset() {
  if (memoryCache && Date.now() - memoryCache.loadedAt < CACHE_TTL_MS) return memoryCache;
  if (!pendingLoad) {
    pendingLoad = buildDataset().then(dataset => { memoryCache = dataset; return dataset; })
      .finally(() => { pendingLoad = null; });
  }
  return pendingLoad;
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
  if (!(await authorized(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ error:'Kërkohet autentikim.', ok:false, data:null });
  }
  try {
    const dataset = await loadDataset();
    res.setHeader('ETag', dataset.etag);
    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-MedIndex-ICD-Codes', String(dataset.data.counts.total));
    res.setHeader('X-MedIndex-ICD-Source', 'user-google-sheet');
    res.setHeader('Server-Timing', `icd;dur=${Date.now() - startedAt}`);
    if (req.headers['if-none-match'] === dataset.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(dataset.body);
  } catch (error) {
    console.error('ICD Google Sheet load failed:', error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(502).json({ error:'Të dhënat ICD-10 nuk u ngarkuan nga Google Sheet.', ok:false, data:null });
  }
};