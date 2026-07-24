const XLSX = require('xlsx');
const zlib = require('zlib');
const crypto = require('node:crypto');
const registryQuality = require('../data/registry-quality.js');
const PrescriptionNotation = require('../prescription-notation.js');

const DRIVE_FILE_ID = '1SY2rb2Eqo3fVkRhgQ8ltJHCRrWyAUDvd';
const PRESCRIPTION_SHEET_ID = process.env.PRESCRIPTION_SHEET_ID || '1gGQjnJboj8W7txs0fhG15PXO06rdB9aetLQgFmmPHz8';
const PRESCRIPTION_SHEET_GID = process.env.PRESCRIPTION_SHEET_GID || '407106508';
const SOURCE_URLS = [
  `https://drive.usercontent.google.com/download?id=${DRIVE_FILE_ID}&export=download&confirm=t`,
  `https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}&confirm=t`,
  `https://docs.google.com/spreadsheets/d/${DRIVE_FILE_ID}/export?format=xlsx`,
];
const PRESCRIPTION_URLS = [
  `https://docs.google.com/spreadsheets/d/${PRESCRIPTION_SHEET_ID}/export?format=csv&gid=${PRESCRIPTION_SHEET_GID}`,
  `https://docs.google.com/spreadsheets/d/${PRESCRIPTION_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${PRESCRIPTION_SHEET_GID}`,
];
const MEMORY_CACHE_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;
const MAX_WORKBOOK_BYTES = 12 * 1024 * 1024;
const MIN_EXPECTED_ROWS = 3500;

let datasetCache = null;
let datasetCacheTime = 0;
let pendingDataset = null;
let payloadCache = null;
let payloadCacheTime = 0;

function isXlsxBuffer(buffer) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

async function fetchBuffer(url, { requireXlsx = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MedIndexRegistry/3.3)' },
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_WORKBOOK_BYTES) throw new Error('skedari tejkalon kufirin e madhësisë');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_WORKBOOK_BYTES) throw new Error('skedari tejkalon kufirin e madhësisë');
    if (requireXlsx && !isXlsxBuffer(buffer)) throw new Error('përgjigjja nuk ishte skedar Excel');
    if (!buffer.length) throw new Error('përgjigjja ishte bosh');
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadFrom(urls, options, label) {
  let lastError = null;
  for (const url of urls) {
    try { return await fetchBuffer(url, options); }
    catch (error) { lastError = error; }
  }
  throw new Error(`${label}: ${lastError?.message || 'gabim i panjohur'}.`);
}

const downloadWorkbook = () => downloadFrom(SOURCE_URLS, { requireXlsx:true }, 'Google Drive nuk e dha regjistrin Excel');
const downloadPrescriptionSheet = () => downloadFrom(PRESCRIPTION_URLS, {}, 'Google Sheets nuk e dha kolonën e recetës');

function normalizeHeader(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function rowHasData(row) {
  return row.some(value => value !== '' && value !== null && value !== undefined);
}

function bufferToRows(buffer, { minRows = MIN_EXPECTED_ROWS } = {}) {
  const workbook = XLSX.read(buffer, { type:'buffer', cellDates:false });
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(worksheet, { header:1, defval:'', raw:true, blankrows:false });
    const headerIndex = grid.findIndex(row => {
      const headers = row.map(normalizeHeader);
      return headers.includes('Substanca aktive') &&
        (headers.includes('Emri tregtar') || headers.includes('Si të shënohet në recetë')) &&
        (headers.includes('Nr rendor') || headers.includes('PDID'));
    });
    if (headerIndex === -1) continue;

    const headers = grid[headerIndex].map(normalizeHeader);
    const rows = grid.slice(headerIndex + 1).filter(rowHasData).map(row => {
      const record = {};
      headers.forEach((header, index) => { if (header) record[header] = row[index] ?? ''; });
      return record;
    }).filter(record => record['Emri tregtar'] !== '' || record['Substanca aktive'] !== '' || record.PDID !== '');

    if (rows.length >= minRows) return rows;
    if (rows.length) throw new Error(`Burimi ktheu vetëm ${rows.length} rreshta; pritej së paku ${minRows}.`);
  }
  throw new Error('Burimi nuk përmban tabelë të vlefshme të regjistrit.');
}

function rowKey(row) {
  return `${normalizeHeader(row.PDID)}|${normalizeHeader(row.ProtocolNo)}`;
}

function buildPrescriptionMap(rows) {
  const exact = new Map();
  const byPdid = new Map();
  rows.forEach(row => {
    const notation = normalizeHeader(row['Si të shënohet në recetë']);
    if (!notation) return;
    exact.set(rowKey(row), notation);
    const pdid = normalizeHeader(row.PDID);
    if (pdid && !byPdid.has(pdid)) byPdid.set(pdid, notation);
  });
  return { exact, byPdid };
}

function attachPrescriptionNotation(rows, prescriptionRows = []) {
  const maps = buildPrescriptionMap(prescriptionRows);
  let matched = 0;
  let generated = 0;
  const output = rows.map(row => {
    const pdid = normalizeHeader(row.PDID);
    const fromSheet = maps.exact.get(rowKey(row)) || maps.byPdid.get(pdid) || '';
    const notation = fromSheet || PrescriptionNotation.build(row).full;
    if (fromSheet) matched += 1;
    else generated += 1;
    return { ...row, 'Si të shënohet në recetë':notation };
  });
  return { rows:output, matched, generated, sheetRows:prescriptionRows.length };
}

async function buildDataset() {
  const startedAt = Date.now();
  const [workbookBuffer, prescriptionResult] = await Promise.all([
    downloadWorkbook(),
    downloadPrescriptionSheet().then(buffer => ({ rows:bufferToRows(buffer) })).catch(error => ({ rows:[], error:error.message })),
  ]);
  const sourceRows = bufferToRows(workbookBuffer);
  const enriched = attachPrescriptionNotation(sourceRows, prescriptionResult.rows);
  const quality = registryQuality.applyRows(enriched.rows);
  return {
    rows:quality.rows,
    meta:{
      version:quality.version,
      summary:quality.summary,
      sourceRows:sourceRows.length,
      prescriptionSheetId:PRESCRIPTION_SHEET_ID,
      prescriptionSheetRows:enriched.sheetRows,
      prescriptionMatched:enriched.matched,
      prescriptionGeneratedFallback:enriched.generated,
      prescriptionSheetError:prescriptionResult.error || '',
      generatedAt:new Date().toISOString(),
      buildMs:Date.now() - startedAt,
    },
  };
}

async function getRegistryDataset() {
  const now = Date.now();
  if (datasetCache && now - datasetCacheTime < MEMORY_CACHE_MS) return datasetCache;
  if (!pendingDataset) {
    pendingDataset = buildDataset().then(dataset => {
      datasetCache = dataset;
      datasetCacheTime = Date.now();
      payloadCache = null;
      return dataset;
    }).finally(() => { pendingDataset = null; });
  }
  return pendingDataset;
}

async function getPayload() {
  const now = Date.now();
  if (payloadCache && now - payloadCacheTime < MEMORY_CACHE_MS) return payloadCache;
  const dataset = await getRegistryDataset();
  const json = JSON.stringify(dataset.rows);
  const encoded = zlib.gzipSync(Buffer.from(json, 'utf8'), { level:9 }).toString('base64');
  const body = `window.DRUG_DATA_PARTS = [${JSON.stringify(encoded)}];\nwindow.REGISTRY_QUALITY_META = ${JSON.stringify(dataset.meta)};\n`;
  payloadCache = {
    body,
    etag:`"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
    meta:dataset.meta,
  };
  payloadCacheTime = Date.now();
  return payloadCache;
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function handler(req, res) {
  const startedAt = Date.now();
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).send('Method Not Allowed');
    }
    if (!(await authorized(req))) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(401).send('window.REGISTRY_LOAD_ERROR="Sesioni nuk është aktiv.";window.DRUG_DATA_PARTS=[];');
    }

    const payload = await getPayload();
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-cache, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('ETag', payload.etag);
    res.setHeader('Server-Timing', `registry;dur=${Date.now() - startedAt}`);
    res.setHeader('X-MedIndex-Rows', String(payload.meta.sourceRows));
    res.setHeader('X-MedIndex-Prescription-Rows', String(payload.meta.prescriptionMatched));

    if (req.headers['if-none-match'] === payload.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(payload.body);
  } catch (error) {
    console.error('Registry data error:', error);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(500).send(
      `window.REGISTRY_LOAD_ERROR = ${JSON.stringify(error.message || 'Gabim gjatë ngarkimit të regjistrit.')};\n` +
      'window.DRUG_DATA_PARTS = [];\n'
    );
  }
}

handler.getRegistryDataset = getRegistryDataset;
handler.authorized = authorized;
handler.attachPrescriptionNotation = attachPrescriptionNotation;
module.exports = handler;
