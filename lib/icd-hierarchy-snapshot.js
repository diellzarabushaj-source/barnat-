'use strict';

const fs = require('node:fs');
const zlib = require('node:zlib');
const FullIcd = require('./icd-full-hierarchy.js');

const SNAPSHOT_PATH = require.resolve('../data/icd-hierarchy-snapshot.json.gz');
let cached = null;

function expectedCountsMatch(value) {
  return Object.entries(FullIcd.EXPECTED_COUNTS)
    .every(([key, expected]) => Number(value?.[key]) === expected);
}

function load() {
  if (cached) return cached;
  const startedAt = Date.now();
  const snapshot = JSON.parse(zlib.gunzipSync(fs.readFileSync(SNAPSHOT_PATH)).toString('utf8'));
  if (
    snapshot?.formatVersion !== 1
    || !expectedCountsMatch(snapshot?.data?.counts)
    || snapshot?.data?.nodes?.length !== FullIcd.EXPECTED_COUNTS.total
  ) throw new Error('Snapshot-i lokal ICD-10 nuk e ka hierarkinë e plotë të validuar.');
  FullIcd.attachIndexes(snapshot.data);
  cached = {
    loadedAt:Date.now(),
    snapshotGeneratedAt:String(snapshot.generatedAt || ''),
    fetchMs:0,
    buildMs:Date.now() - startedAt,
    csvBytes:Number(snapshot.source.csvBytes || 0),
    sourceRevision:String(snapshot.source.revision || ''),
    sourceHash:String(snapshot.source.revision || ''),
    sourceType:'local-snapshot',
    sourceUrl:`https://docs.google.com/spreadsheets/d/${encodeURIComponent(snapshot.source.spreadsheetId)}/edit#gid=${Number(snapshot.source.sheetGid || 0)}`,
    spreadsheetId:String(snapshot.source.spreadsheetId || ''),
    sheetName:String(snapshot.source.sheetName || ''),
    sheetGid:Number(snapshot.source.sheetGid || 0),
    headerRow:Number(snapshot.source.headerRow || 0) || null,
    counts:snapshot.data.counts,
    data:snapshot.data,
    stale:true,
    staleReason:'BUNDLED_SNAPSHOT',
  };
  return cached;
}

function resetForTests() {
  cached = null;
}

module.exports = { SNAPSHOT_PATH, expectedCountsMatch, load, _test:{ resetForTests } };
