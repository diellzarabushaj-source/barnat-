const XLSX = require('xlsx');
const zlib = require('zlib');
const registryQuality = require('../data/registry-quality.js');

const DRIVE_FILE_ID = '1SY2rb2Eqo3fVkRhgQ8ltJHCRrWyAUDvd';
const SOURCE_URLS = [
  `https://drive.usercontent.google.com/download?id=${DRIVE_FILE_ID}&export=download&confirm=t`,
  `https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}&confirm=t`,
  `https://docs.google.com/spreadsheets/d/${DRIVE_FILE_ID}/export?format=xlsx`,
];

let memoryCache = null;
let memoryCacheTime = 0;
const MEMORY_CACHE_MS = 5 * 60 * 1000;

function isXlsxBuffer(buffer) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

async function downloadWorkbook() {
  let lastError = null;

  for (const url of SOURCE_URLS) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MedIndexRegistry/2.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!isXlsxBuffer(buffer)) {
        throw new Error('përgjigjja nuk ishte skedar Excel');
      }

      return buffer;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Google Drive nuk e dha skedarin Excel: ${lastError?.message || 'gabim i panjohur'}.`);
}

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
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
      return (
        headers.includes('Emri tregtar') &&
        headers.includes('Substanca aktive') &&
        headers.includes('ATC Code') &&
        (headers.includes('Nr rendor') || headers.includes('PDID'))
      );
    });

    if (headerIndex === -1) continue;

    const headers = grid[headerIndex].map(normalizeHeader);
    const rows = grid
      .slice(headerIndex + 1)
      .filter(rowHasData)
      .map(row => {
        const record = {};

        headers.forEach((header, index) => {
          if (!header) return;
          record[header] = row[index] ?? '';
        });

        return record;
      })
      .filter(record =>
        record['Emri tregtar'] !== '' ||
        record['Substanca aktive'] !== '' ||
        record.PDID !== ''
      );

    if (rows.length > 0) return rows;
  }

  throw new Error('Excel-i nuk përmban tabelë të vlefshme me kolonat e regjistrit.');
}

async function buildPayload() {
  const workbookBuffer = await downloadWorkbook();
  const sourceRows = workbookToRows(workbookBuffer);
  const quality = registryQuality.applyRows(sourceRows);
  const json = JSON.stringify(quality.rows);
  const encoded = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 }).toString('base64');
  const meta = {
    version: quality.version,
    summary: quality.summary,
    sourceRows: sourceRows.length,
  };

  return (
    `window.DRUG_DATA_PARTS = [${JSON.stringify(encoded)}];\n` +
    `window.REGISTRY_QUALITY_META = ${JSON.stringify(meta)};\n`
  );
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).send('Method Not Allowed');
    }

    const now = Date.now();

    if (!memoryCache || now - memoryCacheTime > MEMORY_CACHE_MS) {
      memoryCache = await buildPayload();
      memoryCacheTime = now;
    }

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(memoryCache);
  } catch (error) {
    console.error('Registry data error:', error);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).send(
      `window.REGISTRY_LOAD_ERROR = ${JSON.stringify(error.message || 'Gabim gjatë ngarkimit të regjistrit.')};\n` +
      'window.DRUG_DATA_PARTS = [];\n'
    );
  }
};
