'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');
const registryQuality = require('../data/registry-quality.js');
const PrescriptionNotation = require('../prescription-notation.js');
const Neon = require('../lib/neon-clinical-reader.js');
const Sheets = require('../lib/sheets-registry-reader.js');

const MEMORY_CACHE_MS = 6 * 60 * 60 * 1000;
const datasetCache = new Map();
const pendingDatasets = new Map();
const payloadCache = new Map();

function enrichRows(rows) {
  const quality = registryQuality.applyRows(rows);
  return {
    rows:quality.rows.map(row => {
      const generated = PrescriptionNotation.build(row);
      return {
        ...row,
        'Si të shënohet në recetë':row['Si të shënohet në recetë'] || generated.full,
        __sheetPrescriptionNotation:row.__sheetPrescriptionNotation || '',
        __prescriptionLine:generated.line,
        __packagingSummary:generated.packaging,
        __dispense:generated.dispense,
        __prescriptionRoute:generated.route,
      };
    }),
    quality,
  };
}

async function buildNeonDataset() {
  const startedAt = Date.now();
  const result = await Neon.getPublishedDrugs();
  const enriched = enrichRows(result.rows);
  return {
    rows:enriched.rows,
    meta:{
      version:enriched.quality.version,
      summary:enriched.quality.summary,
      sourceRows:result.rows.length,
      prescriptionSheetId:'',
      prescriptionSheetRows:0,
      prescriptionMatched:0,
      prescriptionGeneratedFallback:result.rows.length,
      prescriptionMatchedByOrdinal:0,
      prescriptionMatchedByIdentity:0,
      prescriptionMatchedByExact:0,
      prescriptionMatchedByPdid:0,
      prescriptionAmbiguousOrdinal:0,
      prescriptionAmbiguousIdentity:0,
      prescriptionAmbiguousExact:0,
      prescriptionAmbiguousPdid:0,
      prescriptionSheetError:'',
      generatedAt:new Date().toISOString(),
      buildMs:Date.now() - startedAt,
      neonQueryMs:result.queryMs,
      dataSource:'neon',
      publicationPolicy:result.publicationPolicy,
    },
  };
}

async function resolveDataset(mode = Neon.dataSourceMode()) {
  if (mode === 'sheets') return Sheets.buildSheetsRegistryDataset();
  try {
    return await buildNeonDataset();
  } catch (error) {
    if (!Neon.allowSheetsFallback(mode)) throw error;
    console.warn(`Registry Neon fallback: ${error.message}`);
    const dataset = await Sheets.buildSheetsRegistryDataset();
    dataset.meta.neonError = error.message;
    dataset.meta.dataSource = 'sheets-fallback';
    return dataset;
  }
}

async function getRegistryDataset() {
  const mode = Neon.dataSourceMode();
  const current = datasetCache.get(mode);
  if (current && Date.now() - current.loadedAt < MEMORY_CACHE_MS) return current.dataset;

  if (!pendingDatasets.has(mode)) {
    pendingDatasets.set(mode, resolveDataset(mode).then(dataset => {
      datasetCache.set(mode, { loadedAt:Date.now(), dataset });
      payloadCache.delete(mode);
      return dataset;
    }).finally(() => pendingDatasets.delete(mode)));
  }
  return pendingDatasets.get(mode);
}

async function getPayload() {
  const mode = Neon.dataSourceMode();
  const cached = payloadCache.get(mode);
  if (cached && Date.now() - cached.loadedAt < MEMORY_CACHE_MS) return cached;
  const dataset = await getRegistryDataset();
  const json = JSON.stringify(dataset.rows);
  const compressionStartedAt = Date.now();
  const encoded = zlib.gzipSync(Buffer.from(json, 'utf8'), { level:9 }).toString('base64');
  dataset.meta.compressionMs = Date.now() - compressionStartedAt;
  const body = `window.DRUG_DATA_PARTS = [${JSON.stringify(encoded)}];\nwindow.REGISTRY_QUALITY_META = ${JSON.stringify(dataset.meta)};\n`;
  const value = {
    loadedAt:Date.now(),
    body,
    etag:`"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
    meta:dataset.meta,
  };
  payloadCache.set(mode, value);
  return value;
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
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('ETag', payload.etag);
    res.setHeader('X-MedIndex-Data-Source', payload.meta.dataSource);
    res.setHeader('X-MedIndex-Rows', String(payload.meta.sourceRows));
    res.setHeader('X-MedIndex-Prescription-Rows', String(payload.meta.prescriptionMatched));
    res.setHeader('Server-Timing', [
      `registry;dur=${Date.now() - startedAt}`,
      payload.meta.neonQueryMs != null ? `neon;dur=${payload.meta.neonQueryMs}` : '',
      payload.meta.compressionMs != null ? `compress;dur=${payload.meta.compressionMs}` : '',
    ].filter(Boolean).join(', '));

    if (req.headers['if-none-match'] === payload.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(payload.body);
  } catch (error) {
    console.error('Registry data error:', error);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-MedIndex-Data-Source', 'unavailable');
    return res.status(500).send(
      `window.REGISTRY_LOAD_ERROR = ${JSON.stringify(error.message || 'Gabim gjatë ngarkimit të regjistrit.')};\n`
      + 'window.DRUG_DATA_PARTS = [];\n'
    );
  }
}

handler.getRegistryDataset = getRegistryDataset;
handler.authorized = authorized;
handler.attachPrescriptionNotation = Sheets.attachPrescriptionNotation;
handler.normalizeCellValue = Sheets.normalizeCellValue;
handler.buildNeonDataset = buildNeonDataset;
module.exports = handler;
