'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Source = require('../lib/icd-public-source.js');

const fixture = [
  'ICD-10 WHO 2019 — KLASIFIKIMI I PLOTË',
  'Niveli,Kapitulli,Blloku,Kodi ICD-10,Titulli zyrtar — English,Titulli — Shqip,Kodi prind',
  'KAPITULL,I,,I,Chapter I — Certain infectious and parasitic diseases,Kapitulli I — Sëmundje infektive,',
].join('\n');

assert.equal(Source.SPREADSHEET_ID, '1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0');
assert.equal(Source.SHEET_GID, 329283560);
assert.equal(Source.SHEET_NAME, 'ICD-10 EN-SQ');
assert.match(Source.csvUrl(), /^https:\/\/docs\.google\.com\/spreadsheets\/d\//);
assert.match(Source.csvUrl(), /tqx=out:csv/);
assert.match(Source.csvUrl(), /gid=329283560/);

const first = Source.validateCsv(fixture, { contentType:'text/csv; charset=utf-8' });
const second = Source.validateCsv(fixture, { contentType:'text/csv' });
assert.equal(first.text, fixture);
assert.equal(first.bytes, Buffer.byteLength(fixture, 'utf8'));
assert.equal(first.revision, second.revision);
assert.match(first.revision, /^[A-Za-z0-9_-]{20}$/);

assert.throws(
  () => Source.validateCsv('<!doctype html><html><body>Sign in</body></html>', { contentType:'text/html' }),
  /nuk u kthye si CSV publik/,
);
assert.throws(() => Source.validateCsv('Niveli,Kodi', { contentType:'text/csv' }), /nuk përmban kolonat/);
assert.throws(
  () => Source.validateCsv(fixture, { contentType:'text/csv', declaredBytes:Source.MAX_CSV_BYTES + 1 }),
  /tejkalon kufirin/,
);

assert.deepEqual(Source.sourceMeta({
  loadedAt:Date.UTC(2026, 7, 2, 8, 0, 0),
  stale:false,
  csvBytes:4106422,
  sourceRevision:'abcdefghijklmnopqrst',
  fetchMs:321,
  buildMs:87,
}), {
  type:'google-sheet',
  status:'live',
  visibility:'public-link',
  spreadsheetId:Source.SPREADSHEET_ID,
  sheetName:Source.SHEET_NAME,
  sheetGid:Source.SHEET_GID,
  loadedAt:'2026-08-02T08:00:00.000Z',
  csvBytes:4106422,
  revision:'abcdefghijklmnopqrst',
  fetchMs:321,
  buildMs:87,
});
assert.equal(Source.sourceMeta({ stale:true }).status, 'stale');

const root = path.resolve(__dirname, '..');
const base = fs.readFileSync(path.join(root, 'lib/icd-api-base.js'), 'utf8');
const advanced = fs.readFileSync(path.join(root, 'lib/icd-advanced-handler.js'), 'utf8');
const publicSource = fs.readFileSync(path.join(root, 'lib/icd-public-source.js'), 'utf8');
const hierarchy = fs.readFileSync(path.join(root, 'lib/icd-full-hierarchy.js'), 'utf8');
for (const source of [base, advanced]) {
  assert.ok(source.includes("require('../lib/icd-public-source.js')"));
  assert.ok(source.includes('IcdPublicSource.load()'));
  assert.ok(!source.includes(Source.SPREADSHEET_ID), 'Full hierarchy spreadsheet ID must live only in the shared source module.');
}
assert.doesNotMatch(advanced, /gviz\/tq\?tqx=out:csv/);
assert.equal((publicSource.match(new RegExp(Source.SPREADSHEET_ID, 'g')) || []).length, 1);
for (const marker of ['attachIndexes', 'childrenByParent', 'childCountByCode', 'byChapter', 'byLevel']) {
  assert.ok(hierarchy.includes(marker), `Hierarchy runtime index missing ${marker}`);
}
new Function(publicSource);
new Function(base);
new Function(advanced);
new Function(hierarchy);

console.log('Public Google Sheet validation, shared loader and indexed ICD runtime contracts passed.');
