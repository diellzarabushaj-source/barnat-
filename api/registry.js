const XLSX = require('xlsx');
const zlib = require('zlib');
const crypto = require('node:crypto');
const registryQuality = require('../data/registry-quality.js');

const DRIVE_FILE_ID = '1SY2rb2Eqo3fVkRhgQ8ltJHCRrWyAUDvd';
const SOURCE_URLS = [
  `https://drive.usercontent.google.com/download?id=${DRIVE_FILE_ID}&export=download&confirm=t`,
  `https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}&confirm=t`,
  `https://docs.google.com/spreadsheets/d/${DRIVE_FILE_ID}/export?format=xlsx`,
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

async function fetchBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MedIndexRegistry/3.2)' },
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_WORKBOOK_BYTES) throw new Error('skedari tejkalon kufirin e madhësisë');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_WORKBOOK_BYTES) throw new Error('skedari tejkalon kufirin e madhësisë');
    if (!isXlsxBuffer(buffer)) throw new Error('përgjigjja nuk ishte skedar Excel');
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadWorkbook() {
  let lastError = null;
  for (const url of SOURCE_URLS) {
    try { return await fetchBuffer(url); }
    catch (error) { lastError = error; }
  }
  throw new Error(`Google Drive nuk e dha skedarin Excel: ${lastError?.message || 'gabim i panjohur'}.`);
}

function normalizeHeader(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function rowHasData(row) {
  return row.some(value => value !== '' && value !== null && value !== undefined);
}

function workbookToRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: false,
    });

    const headerIndex = grid.findIndex(row => {
      const headers = row.map(normalizeHeader);
      return headers.includes('Emri tregtar') &&
        headers.includes('Substanca aktive') &&
        headers.includes('ATC Code') &&
        (headers.includes('Nr rendor') || headers.includes('PDID'));
    });
    if (headerIndex === -1) continue;

    const headers = grid[headerIndex].map(normalizeHeader);
    const rows = grid.slice(headerIndex + 1).filter(rowHasData).map(row => {
      const record = {};
      headers.forEach((header, index) => {
        if (header) record[header] = row[index] ?? '';
      });
      return record;
    }).filter(record => record['Emri tregtar'] !== '' || record['Substanca aktive'] !== '' || record.PDID !== '');

    if (rows.length >= MIN_EXPECTED_ROWS) return rows;
    if (rows.length) throw new Error(`Regjistri ktheu vetëm ${rows.length} rreshta; pritej së paku ${MIN_EXPECTED_ROWS}.`);
  }
  throw new Error('Excel-i nuk përmban tabelë të vlefshme me kolonat e regjistrit.');
}

async function buildDataset() {
  const startedAt = Date.now();
  const workbookBuffer = await downloadWorkbook();
  const sourceRows = workbookToRows(workbookBuffer);
  const quality = registryQuality.applyRows(sourceRows);
  return {
    rows: quality.rows,
    meta: {
      version: quality.version,
      summary: quality.summary,
      sourceRows: sourceRows.length,
      generatedAt: new Date().toISOString(),
      buildMs: Date.now() - startedAt,
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
  const encoded = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 }).toString('base64');
  const body = `window.DRUG_DATA_PARTS = [${JSON.stringify(encoded)}];\nwindow.REGISTRY_QUALITY_META = ${JSON.stringify(dataset.meta)};\n`;
  payloadCache = {
    body,
    etag: `"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
    meta: dataset.meta,
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
module.exports = handler;
