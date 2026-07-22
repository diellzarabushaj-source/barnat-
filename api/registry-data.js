const XLSX = require('xlsx');
const zlib = require('zlib');

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
          'User-Agent': 'Mozilla/5.0 (compatible; BarnatRegistry/1.0)',
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

function workbookToRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: true,
    });

    if (rows.length > 0) return rows;
  }

  throw new Error('Excel-i nuk përmban asnjë tabelë me të dhëna.');
}

async function buildPayload() {
  const workbookBuffer = await downloadWorkbook();
  const rows = workbookToRows(workbookBuffer);
  const json = JSON.stringify(rows);
  const encoded = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 }).toString('base64');

  return `window.DRUG_DATA_PARTS = [${JSON.stringify(encoded)}];\n`;
}

module.exports = async function handler(req, res) {
  try {
    const now = Date.now();

    if (!memoryCache || now - memoryCacheTime > MEMORY_CACHE_MS) {
      memoryCache = await buildPayload();
      memoryCacheTime = now;
    }

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
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
