'use strict';

const crypto = require('node:crypto');
const FullIcd = require('./icd-full-hierarchy.js');

const SPREADSHEET_ID = '1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0';
const SHEET_GID = 329283560;
const SHEET_NAME = 'ICD-10 EN-SQ';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;
const MAX_CSV_BYTES = 6 * 1024 * 1024;

let cached = null;
let pending = null;

const clean = value => String(value ?? '').trim();
const csvUrl = () => `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
const revisionOf = text => crypto.createHash('sha256').update(text).digest('base64url').slice(0, 20);

function validateCsv(text, options = {}) {
  const value = String(text || '').replace(/^\uFEFF/, '');
  const declaredBytes = Number(options.declaredBytes || 0);
  const bytes = Buffer.byteLength(value, 'utf8');
  const contentType = clean(options.contentType).toLowerCase();
  const prefix = value.slice(0, 4096).toLowerCase();

  if (declaredBytes > MAX_CSV_BYTES || bytes > MAX_CSV_BYTES) {
    throw new Error('Dataset-i i plotë ICD-10 tejkalon kufirin e madhësisë.');
  }
  if (!value.trim()) throw new Error('Dataset-i i plotë ICD-10 ishte bosh.');
  if (contentType.includes('text/html') || /<!doctype\s+html|<html[\s>]/i.test(prefix)) {
    throw new Error('Google Sheet ICD-10 nuk u kthye si CSV publik. Kontrollo lejen “Anyone with the link — Viewer”.');
  }
  if (!value.includes('Kodi ICD-10') || !value.includes('Titulli zyrtar — English') || !value.includes('Titulli — Shqip')) {
    throw new Error('CSV-ja publike ICD-10 nuk përmban kolonat e pritura.');
  }

  return {
    text:value,
    bytes,
    revision:revisionOf(value),
  };
}

async function fetchCsv() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(csvUrl(), {
      headers:{ Accept:'text/csv,*/*;q=0.8', 'User-Agent':'MedIndex/2.0' },
      signal:controller.signal,
    });
    if (!response.ok) throw new Error(`Google Sheet i plotë ICD-10 ktheu ${response.status}.`);
    const text = await response.text();
    return {
      ...validateCsv(text, {
        declaredBytes:response.headers.get('content-length'),
        contentType:response.headers.get('content-type'),
      }),
      fetchMs:Date.now() - startedAt,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Google Sheet ICD-10 nuk u përgjigj brenda 20 sekondave.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function build() {
  const source = await fetchCsv();
  const buildStartedAt = Date.now();
  const data = FullIcd.buildDataset(source.text, { strictCounts:true });
  return {
    loadedAt:Date.now(),
    fetchMs:source.fetchMs,
    buildMs:Date.now() - buildStartedAt,
    csvBytes:source.bytes,
    sourceRevision:source.revision,
    sourceUrl:csvUrl(),
    data,
    stale:false,
  };
}

async function load(options = {}) {
  const force = Boolean(options.force);
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;
  if (!pending) {
    pending = build().then(result => {
      cached = result;
      return result;
    }).catch(error => {
      if (cached) {
        return {
          ...cached,
          stale:true,
          staleReason:String(error?.message || error).slice(0, 500),
        };
      }
      throw error;
    }).finally(() => {
      pending = null;
    });
  }
  return pending;
}

function sourceMeta(loaded) {
  return {
    type:'google-sheet',
    status:loaded?.stale ? 'stale' : 'live',
    visibility:'public-link',
    spreadsheetId:SPREADSHEET_ID,
    sheetName:SHEET_NAME,
    sheetGid:SHEET_GID,
    loadedAt:Number.isFinite(loaded?.loadedAt) ? new Date(loaded.loadedAt).toISOString() : null,
    csvBytes:Number(loaded?.csvBytes || 0),
    revision:clean(loaded?.sourceRevision),
    fetchMs:Number(loaded?.fetchMs || 0),
    buildMs:Number(loaded?.buildMs || 0),
  };
}

function resetForTests() {
  cached = null;
  pending = null;
}

module.exports = {
  SPREADSHEET_ID,
  SHEET_GID,
  SHEET_NAME,
  CACHE_TTL_MS,
  MAX_CSV_BYTES,
  csvUrl,
  validateCsv,
  sourceMeta,
  load,
  _test:{ revisionOf, resetForTests },
};
