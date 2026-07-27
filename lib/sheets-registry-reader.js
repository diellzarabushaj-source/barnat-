'use strict';

const XLSX = require('xlsx');
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
const FETCH_TIMEOUT_MS = 12000;
const MAX_WORKBOOK_BYTES = 12 * 1024 * 1024;
const MIN_EXPECTED_ROWS = 3500;

function isXlsxBuffer(buffer) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

async function fetchBuffer(url, { requireXlsx = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect:'follow',
      signal:controller.signal,
      headers:{ 'User-Agent':'Mozilla/5.0 (compatible; MedIndexRegistry/3.4)' },
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

function normalizeCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return value;
  return value
    .replace(/[ \t]*_x000D_[ \t]*(?:\r?\n)?/gi, '\n')
    .replace(/\r\n?/g, '\n');
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
      return headers.includes('Substanca aktive')
        && (headers.includes('Emri tregtar') || headers.includes('Si të shënohet në recetë'))
        && (headers.includes('Nr rendor') || headers.includes('PDID'));
    });
    if (headerIndex === -1) continue;

    const headers = grid[headerIndex].map(normalizeHeader);
    const rows = grid.slice(headerIndex + 1).filter(rowHasData).map(row => {
      const record = {};
      headers.forEach((header, index) => {
        if (header) record[header] = normalizeCellValue(row[index]);
      });
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
function ordinalKey(row) { return normalizeHeader(row['Nr rendor']); }
function identityKey(row) {
  return [
    row['Emri tregtar'], row['Substanca aktive'], row['ATC Code'],
    row['Fortësia'], row['Forma farmaceutike'], row['Madhësia e paketimit'],
  ].map(normalizeHeader).join('|');
}

function buildUniqueMap(rows, keyForRow) {
  const values = new Map();
  const ambiguous = new Set();
  rows.forEach(row => {
    const notation = normalizeHeader(row['Si të shënohet në recetë']);
    const key = keyForRow(row);
    if (!notation || !key || ambiguous.has(key)) return;
    if (values.has(key) && values.get(key) !== notation) {
      values.delete(key);
      ambiguous.add(key);
      return;
    }
    values.set(key, notation);
  });
  return { values, ambiguous };
}

function buildPrescriptionMap(rows) {
  return {
    byOrdinal:buildUniqueMap(rows, ordinalKey),
    byIdentity:buildUniqueMap(rows, identityKey),
    exact:buildUniqueMap(rows, rowKey),
    byPdid:buildUniqueMap(rows, row => normalizeHeader(row.PDID)),
  };
}

function attachPrescriptionNotation(rows, prescriptionRows = []) {
  const maps = buildPrescriptionMap(prescriptionRows);
  const stats = { matched:0, generated:0, matchedByOrdinal:0, matchedByIdentity:0, matchedByExact:0, matchedByPdid:0 };
  const output = rows.map(row => {
    const candidates = [
      ['matchedByOrdinal', maps.byOrdinal.values.get(ordinalKey(row))],
      ['matchedByIdentity', maps.byIdentity.values.get(identityKey(row))],
      ['matchedByExact', maps.exact.values.get(rowKey(row))],
      ['matchedByPdid', maps.byPdid.values.get(normalizeHeader(row.PDID))],
    ];
    const match = candidates.find(([, value]) => value);
    const fromSheet = match?.[1] || '';
    const notation = fromSheet || PrescriptionNotation.build(row).full;
    if (fromSheet) {
      stats.matched += 1;
      stats[match[0]] += 1;
    } else stats.generated += 1;
    return { ...row, 'Si të shënohet në recetë':notation, __sheetPrescriptionNotation:fromSheet };
  });
  return {
    rows:output,
    ...stats,
    sheetRows:prescriptionRows.length,
    ambiguousOrdinal:maps.byOrdinal.ambiguous.size,
    ambiguousIdentity:maps.byIdentity.ambiguous.size,
    ambiguousExact:maps.exact.ambiguous.size,
    ambiguousPdid:maps.byPdid.ambiguous.size,
  };
}

async function buildSheetsRegistryDataset() {
  const startedAt = Date.now();
  const [workbookBuffer, prescriptionResult] = await Promise.all([
    downloadWorkbook(),
    downloadPrescriptionSheet()
      .then(buffer => ({ rows:bufferToRows(buffer) }))
      .catch(error => ({ rows:[], error:error.message })),
  ]);
  const sourceRows = bufferToRows(workbookBuffer);
  const enriched = attachPrescriptionNotation(sourceRows, prescriptionResult.rows);
  const quality = registryQuality.applyRows(enriched.rows);
  const rows = quality.rows.map(row => {
    const generated = PrescriptionNotation.build(row);
    return {
      ...row,
      __prescriptionLine:generated.line,
      __packagingSummary:generated.packaging,
      __dispense:generated.dispense,
      __prescriptionRoute:generated.route,
    };
  });
  return {
    rows,
    meta:{
      version:quality.version,
      summary:quality.summary,
      sourceRows:sourceRows.length,
      prescriptionSheetId:PRESCRIPTION_SHEET_ID,
      prescriptionSheetRows:enriched.sheetRows,
      prescriptionMatched:enriched.matched,
      prescriptionGeneratedFallback:enriched.generated,
      prescriptionMatchedByOrdinal:enriched.matchedByOrdinal,
      prescriptionMatchedByIdentity:enriched.matchedByIdentity,
      prescriptionMatchedByExact:enriched.matchedByExact,
      prescriptionMatchedByPdid:enriched.matchedByPdid,
      prescriptionAmbiguousOrdinal:enriched.ambiguousOrdinal,
      prescriptionAmbiguousIdentity:enriched.ambiguousIdentity,
      prescriptionAmbiguousExact:enriched.ambiguousExact,
      prescriptionAmbiguousPdid:enriched.ambiguousPdid,
      prescriptionSheetError:prescriptionResult.error || '',
      generatedAt:new Date().toISOString(),
      buildMs:Date.now() - startedAt,
      dataSource:'sheets-fallback',
    },
  };
}

module.exports = {
  buildSheetsRegistryDataset,
  attachPrescriptionNotation,
  normalizeCellValue,
  bufferToRows,
};
