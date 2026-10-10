'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Source = require('../lib/icd-public-source.js');
const Normalizer = require('../lib/icd-hierarchy-source-normalizer.js');

const fixture = [
  'ICD-10 WHO 2019 — KLASIFIKIMI I PLOTË',
  'Niveli,Kapitulli,Blloku,Kodi ICD-10,Titulli zyrtar — English,Titulli — Shqip,Kodi prind',
  'KAPITULL,I,,I,Chapter I — Certain infectious and parasitic diseases,Kapitulli I — Sëmundje infektive,',
].join('\n');

const tolerantFixture = [
  '\uFEFFICD-10 WHO 2019',
  'Përditësuar më 2026-08-03',
  '',
  '',
  '',
  ' Level ,Chapter,Block,ICD 10 Code,Official Title English,Albanian Title,Parent Code,Path,Source,Translation ',
  'KAPITULL,I,,I,Chapter I — Certain infectious and parasitic diseases,Kapitulli I — Sëmundje infektive,,,WHO,Draft',
].join('\n');

assert.equal(Source.SPREADSHEET_ID, '1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0');
assert.equal(Source.SHEET_GID, 329283560);
assert.equal(Source.SHEET_NAME, 'ICD-10 EN-SQ');
assert.equal(Source.SOURCE_URLS.length, 2);
assert.equal(Source.csvUrl(), Source.SOURCE_URLS[0]);
assert.match(Source.SOURCE_URLS[0], /\/gviz\/tq\?tqx=out:csv&gid=329283560&range=A:J$/);
assert.match(Source.SOURCE_URLS[1], /\/export\?format=csv&single=true&gid=329283560&range=A:J$/);
assert.equal(new Set(Source.SOURCE_URLS).size, Source.SOURCE_URLS.length);

const first = Source.validateCsv(fixture, { contentType:'text/csv; charset=utf-8' });
const second = Source.validateCsv(fixture, { contentType:'text/csv' });
assert.equal(first.text, fixture);
assert.equal(first.headerRow, 2);
assert.equal(first.bytes, Buffer.byteLength(fixture, 'utf8'));
assert.equal(first.revision, second.revision);
assert.match(first.revision, /^[A-Za-z0-9_-]{20}$/);

const tolerant = Source.validateCsv(tolerantFixture, { contentType:'text/csv' });
assert.equal(tolerant.headerRow, 6);
assert.match(tolerant.text, /Niveli,Kapitulli,Blloku,Kodi ICD-10,Titulli zyrtar — English,Titulli — Shqip,Kodi prind,Rruga e plotë,Burimi,Përkthimi/);
const tolerantDataset = require('../lib/icd-full-hierarchy.js').buildDataset(tolerant.text, { strictCounts:false });
assert.equal(tolerantDataset.nodes[0].code, 'I');
assert.equal(tolerantDataset.nodes[0].level, 'chapter');
assert.equal(Normalizer.canonicalHeader(' Titulli zyrtar - English '), 'Titulli zyrtar — English');
assert.equal(Normalizer.canonicalHeader('Kodi\u00a0ICD-10'), 'Kodi ICD-10');
assert.equal(Normalizer.inspectRows(require('../lib/icd-full-hierarchy.js').parseCsv(tolerantFixture)).index, 5);

assert.throws(
  () => Source.validateCsv('<!doctype html><html><body>Sign in</body></html>', { contentType:'text/html' }),
  /nuk u kthye si CSV publik/,
);
assert.throws(
  () => Source.validateCsv('PK\u0003\u0004workbook', { contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  /workbook\/ZIP/,
);
assert.throws(
  () => Source.validateCsv('Niveli,Kodi', { contentType:'text/csv' }),
  error => error?.code === 'ICD_HIERARCHY_HEADER_MISSING' && /Mungojnë/.test(error.message),
);
assert.throws(
  () => Source.validateCsv(fixture, { contentType:'text/csv', declaredBytes:Source.MAX_CSV_BYTES + 1 }),
  /tejkalon kufirin/,
);

assert.deepEqual(Source.sourceMeta({
  loadedAt:Date.UTC(2026, 7, 2, 8, 0, 0),
  stale:false,
  headerRow:6,
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
  headerRow:6,
  loadedAt:'2026-08-02T08:00:00.000Z',
  csvBytes:4106422,
  revision:'abcdefghijklmnopqrst',
  fetchMs:321,
  buildMs:87,
  activatedAt:null,
});
assert.equal(Source.sourceMeta({ stale:true }).status, 'stale');
assert.deepEqual(Source.sourceMeta({
  sourceType:'neon',
  spreadsheetId:Source.SPREADSHEET_ID,
  sheetName:Source.SHEET_NAME,
  sheetGid:Source.SHEET_GID,
  headerRow:6,
  loadedAt:Date.UTC(2026, 7, 3, 3, 0, 0),
  csvBytes:4106422,
  sourceRevision:'neonrevision12345678',
  fetchMs:45,
  buildMs:12,
  activatedAt:'2026-08-03T02:59:00.000Z',
}), {
  type:'neon',
  status:'active',
  visibility:'private-mirror',
  spreadsheetId:Source.SPREADSHEET_ID,
  sheetName:Source.SHEET_NAME,
  sheetGid:Source.SHEET_GID,
  headerRow:6,
  loadedAt:'2026-08-03T03:00:00.000Z',
  csvBytes:4106422,
  revision:'neonrevision12345678',
  fetchMs:45,
  buildMs:12,
  activatedAt:'2026-08-03T02:59:00.000Z',
});

const root = path.resolve(__dirname, '..');
const base = fs.readFileSync(path.join(root, 'lib/icd-api-base.js'), 'utf8');
const advanced = fs.readFileSync(path.join(root, 'lib/icd-advanced-handler.js'), 'utf8');
const publicSource = fs.readFileSync(path.join(root, 'lib/icd-public-source.js'), 'utf8');
const normalizer = fs.readFileSync(path.join(root, 'lib/icd-hierarchy-source-normalizer.js'), 'utf8');
const hierarchy = fs.readFileSync(path.join(root, 'lib/icd-full-hierarchy.js'), 'utf8');
for (const source of [base, advanced]) {
  assert.ok(source.includes("require('../lib/icd-public-source.js')"));
  assert.ok(source.includes('IcdPublicSource.load()'));
  assert.ok(!source.includes(Source.SPREADSHEET_ID), 'Full hierarchy spreadsheet ID must live only in the shared source module.');
}
assert.doesNotMatch(advanced, /gviz\/tq\?tqx=out:csv/);
assert.match(publicSource, /gviz\/tq\?tqx=out:csv/);
assert.match(publicSource, /\/export\?format=csv&single=true&gid=/);
assert.match(publicSource, /for \(const url of SOURCE_URLS\)/);
assert.match(publicSource, /redirect:'follow'/);
assert.match(publicSource, /cache:'no-store'/);
assert.equal((publicSource.match(new RegExp(Source.SPREADSHEET_ID, 'g')) || []).length, 1);
assert.match(publicSource, /normalizeCsvHeaders/);
assert.match(publicSource, /NeonHierarchy\.load/);
assert.match(publicSource, /sheetOnly/);
assert.match(normalizer, /ICD_HIERARCHY_HEADER_MISSING/);
assert.match(normalizer, /maxHeaderRows = 40/);
for (const marker of ['attachIndexes', 'childrenByParent', 'childCountByCode', 'byChapter', 'byLevel']) {
  assert.ok(hierarchy.includes(marker), `Hierarchy runtime index missing ${marker}`);
}
new Function(publicSource);
new Function(normalizer);
new Function(base);
new Function(advanced);
new Function(hierarchy);

console.log('Dual public CSV fallback, canonical headers, Neon-first metadata and indexed ICD runtime contracts passed.');


const vm = require('node:vm');
const sourceRequire = require('node:module').createRequire(path.join(root, 'lib/icd-public-source.js'));

function retryHarness(fetchImpl, options = {}) {
  const timers = new Map();
  const calls = [];
  let nextTimer = 1;
  const clock = { now:0 };
  const setTimer = (callback, ms) => {
    const id = nextTimer++;
    timers.set(id, { at:clock.now + ms, callback });
    return id;
  };
  const wait = (ms, signal) => new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimer(finish, ms);
    const abort = () => {
      timers.delete(timer);
      signal?.removeEventListener('abort', abort);
      const error = new Error('Synthetic aborted read');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once:true });
  });
  const response = (text = fixture, settings = {}) => ({
    ok:(settings.status || 200) < 400,
    status:settings.status || 200,
    headers:{ get:key => key === 'content-type' ? (settings.contentType || 'text/csv') : (settings.declaredBytes || null) },
    body:{ cancel:async () => { settings.onCancel?.(); } },
    text:async () => {
      if (settings.bodyDelay) await wait(settings.bodyDelay, settings.signal);
      return text;
    },
  });
  const module = { exports:{} };
  vm.runInNewContext(publicSource, {
    module, exports:module.exports, Buffer, AbortController,
    Date:class extends Date { static now() { return clock.now; } },
    setTimeout:setTimer, clearTimeout:id => timers.delete(id),
    fetch:async (url, settings) => {
      const call = { url, signal:settings.signal, at:clock.now };
      calls.push(call);
      return fetchImpl({ ...call, index:calls.length, calls, wait, response });
    },
    require(name) {
      if (name === './icd-full-hierarchy.js' && options.stubDataset) return {
        buildDataset(text, settings) {
          assert.equal(settings.strictCounts, true);
          return { nodes:[], counts:{ total:12542 } };
        },
      };
      return sourceRequire(name);
    },
  }, { filename:'lib/icd-public-source.js' });
  const run = async promise => {
    let settled = false;
    let value;
    let error;
    promise.then(result => { value = result; settled = true; }, failure => { error = failure; settled = true; });
    for (let turn = 0; !settled && turn < 100; turn += 1) {
      // Drain fetch/body/validation continuations before advancing virtual time.
      for (let microtask = 0; microtask < 40; microtask += 1) await Promise.resolve();
      if (settled) break;
      assert.ok(timers.size, 'A pending source read must have a bounded timer.');
      const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      clock.now = timer.at;
      timers.delete(id);
      timer.callback();
    }
    assert.ok(settled, 'Source retry test did not settle within its bounded attempts.');
    assert.equal(timers.size, 0, 'Fetch/body/backoff timers must be cleared after settlement.');
    if (error) throw error;
    return value;
  };
  return { source:module.exports, calls, clock, run };
}

async function boundedSourceRetries() {
  assert.equal(Source.FETCH_TIMEOUT_MS, 6500);
  assert.deepEqual(Source.SYNC_FETCH_POLICY, { timeoutMs:20000, maxRounds:3, retryDelayMs:1000, overallTimeoutMs:90000 });

  const runtime = retryHarness(async ({ wait, signal, response }) => {
    await wait(30000, signal);
    return response();
  });
  await assert.rejects(runtime.run(runtime.source._test.fetchCsv()), /timeout pas 6500ms.*timeout pas 6500ms/);
  assert.equal(runtime.clock.now, 13000);
  assert.equal(runtime.calls.length, 2, 'Website reads keep one short URL round.');
  assert.ok(runtime.calls.every(call => call.signal.aborted));

  const delayedBody = retryHarness(async ({ response, signal }) => response(fixture, { bodyDelay:8500, signal }));
  const delayed = await delayedBody.run(delayedBody.source._test.fetchCsv(delayedBody.source.SYNC_FETCH_POLICY));
  assert.equal(delayed.fetchMs, 8500, 'The maintenance budget includes reading the CSV body.');
  assert.equal(delayed.fetchAttempts, 1);
  assert.equal(delayed.revision, first.revision);

  let cancelledResponses = 0;
  const transient = retryHarness(async ({ index, response }) => {
    if (index === 1) throw new TypeError('Synthetic connection reset');
    if (index <= 3) return response('', { status:503, onCancel:() => cancelledResponses++ });
    return response();
  });
  const recovered = await transient.run(transient.source._test.fetchCsv(transient.source.SYNC_FETCH_POLICY));
  assert.equal(recovered.fetchAttempts, 4);
  assert.equal(recovered.fetchMs, 1000);
  assert.equal(recovered.sourceUrl, Source.SOURCE_URLS[1]);
  assert.equal(recovered.revision, first.revision);
  assert.equal(cancelledResponses, 2, 'Failed HTTP response bodies are released.');

  for (const status of [408, 429, 500, 503]) {
    const http = retryHarness(async ({ index, response }) => index <= 2 ? response('', { status }) : response());
    const loaded = await http.run(http.source._test.fetchCsv(http.source.SYNC_FETCH_POLICY));
    assert.equal(loaded.fetchAttempts, 3, `Transient HTTP ${status} should retry within the same budget.`);
  }

  const invalidThenValid = retryHarness(async ({ index, response }) => index === 1
    ? response('<html>Sign in</html>', { contentType:'text/html' }) : response());
  const alternate = await invalidThenValid.run(invalidThenValid.source._test.fetchCsv(invalidThenValid.source.SYNC_FETCH_POLICY));
  assert.equal(alternate.sourceUrl, Source.SOURCE_URLS[1], 'A valid alternate remains allowed after invalid primary CSV.');
  assert.equal(invalidThenValid.calls.length, 2);

  const invalidAndTransient = retryHarness(async ({ index, response }) => {
    if (index === 1) return response('<html>Sign in</html>', { contentType:'text/html' });
    if (index === 2) throw new TypeError('Synthetic network outage');
    return response();
  });
  await invalidAndTransient.run(invalidAndTransient.source._test.fetchCsv(invalidAndTransient.source.SYNC_FETCH_POLICY));
  assert.deepEqual(invalidAndTransient.calls.map(call => call.url), [Source.SOURCE_URLS[0], Source.SOURCE_URLS[1], Source.SOURCE_URLS[1]], 'Invalid endpoints never rejoin later retry rounds.');

  for (const invalid of [
    { text:'<html>Sign in</html>', contentType:'text/html' },
    { text:'PK\u0003\u0004workbook', contentType:'application/zip' },
    { text:'Niveli,Kodi', contentType:'text/csv' },
    { text:'', contentType:'text/csv' },
    { text:fixture, declaredBytes:Source.MAX_CSV_BYTES + 1 },
    { status:401 }, { status:403 }, { status:404 },
  ]) {
    const permanent = retryHarness(async ({ response }) => response(invalid.text ?? fixture, invalid));
    await assert.rejects(permanent.run(permanent.source._test.fetchCsv(permanent.source.SYNC_FETCH_POLICY)), /Burimet publike ICD-10 dështuan/);
    assert.equal(permanent.calls.length, 2, 'Validation and permanent HTTP failures are never retried.');
    assert.equal(permanent.clock.now, 0);
  }

  for (const phase of ['request', 'body']) {
    const exhausted = retryHarness(async ({ wait, response, signal }) => {
      if (phase === 'request') await wait(120000, signal);
      return response(fixture, { bodyDelay:120000, signal });
    });
    await assert.rejects(exhausted.run(exhausted.source._test.fetchCsv(exhausted.source.SYNC_FETCH_POLICY)), /timeout pas 7000ms/);
    assert.equal(exhausted.clock.now, 90000, `${phase} reads must obey the overall 90-second budget.`);
    assert.equal(exhausted.calls.length, 5);
    assert.ok(exhausted.calls.every(call => call.signal.aborted));
  }

  const slowCancellation = retryHarness(async ({ response }) => ({
    ...response('', { status:403 }),
    body:{ cancel:() => new Promise(() => {}) },
  }));
  await assert.rejects(slowCancellation.run(slowCancellation.source._test.fetchCsv(slowCancellation.source.SYNC_FETCH_POLICY)), /ktheu 403/);
  assert.equal(slowCancellation.calls.length, 2, 'Releasing a permanent error body cannot delay or retry the failure.');
  assert.equal(slowCancellation.clock.now, 0);

  const rounds = retryHarness(async ({ response }) => response('', { status:503 }));
  await assert.rejects(rounds.run(rounds.source._test.fetchCsv(rounds.source.SYNC_FETCH_POLICY)), /Google Sheet i plotë ICD-10 ktheu 503/);
  assert.equal(rounds.calls.length, 6, 'Transient failures stop after three rounds of two sources.');
  assert.equal(rounds.clock.now, 3000);

  const isolated = retryHarness(async ({ url, response, signal }) => url === Source.SOURCE_URLS[0]
    ? response(fixture, { bodyDelay:8000, signal })
    : response(fixture.replace('Certain infectious', 'Public alternate infectious')), { stubDataset:true });
  const [maintenance, web] = await isolated.run(Promise.all([
    isolated.source.loadForSync(), isolated.source.load({ force:true, sheetOnly:true }),
  ]));
  assert.equal(maintenance.fetchMs, 8000);
  assert.equal(maintenance.sourceUrl, Source.SOURCE_URLS[0]);
  assert.equal(web.fetchMs, 6500);
  assert.equal(web.sourceUrl, Source.SOURCE_URLS[1]);
  assert.equal(isolated.calls.length, 3, 'Maintenance reads cannot share website pending requests.');
  const cachedWeb = await isolated.source.load({ sheetOnly:true });
  assert.equal(cachedWeb.sourceRevision, web.sourceRevision);
  assert.notEqual(cachedWeb.sourceRevision, maintenance.sourceRevision, 'Maintenance reads cannot replace website caches.');

  const incomplete = retryHarness(async ({ response }) => response());
  await assert.rejects(incomplete.run(incomplete.source.loadForSync()), /full hierarchy validation failed/);
  assert.equal(incomplete.calls.length, 1, 'Partial hierarchies remain fatal before sync staging.');

  console.log('Isolated ICD maintenance retries, body deadlines, terminal failures and strict hierarchy validation passed.');
}

boundedSourceRetries().catch(error => { console.error(error); process.exitCode = 1; });
