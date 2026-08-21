'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'registry-desktop-lite.js'), 'utf8').replace(/\r\n?/g, '\n');

function blockBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
  assert.ok(start >= 0 && end > start, `Missing runtime block: ${startMarker}`);
  return source.slice(start, end);
}

const ownership = blockBetween('  function pageRequestFingerprint', '  function buildPageUrl');
const loadPage = blockBetween('  async function loadPage', '  function start()');

(async () => {
  const context = {
    assert,
    AbortController,
    console,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;

  const harness = `
    const state = {
      page:1, pageSize:50, q:'first', status:'', formType:null, formValue:null,
      atc:'', sort:'registry', direction:'asc', total:null, totalPages:null,
      hasNext:false, disabled:false, ready:true, rows:[],
    };
    let pageController = null;
    let pageRequestGeneration = 0;
    let activePageRequestKey = '';
    const busy = [];
    const commits = [];
    const pending = [];
    let fetchCalls = 0;
    const html = { dataset:{} };
    const window = {
      MedIndexRegistryDosageLoader:null,
      dispatchEvent() {},
    };
    class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
    const document = { getElementById() { return null; } };
    function syncRegistryLocation() {}
    function publishRegistryAtcState() {}
    function setBusy(value) { busy.push(Boolean(value)); }
    function fetchLogicalPage() {
      fetchCalls += 1;
      return new Promise(resolve => pending.push(resolve));
    }
    function publishVisibleRows(rows) { state.rows = rows; commits.push(rows.map(row => row.id).join(',')); }
    function buildHeader() {}
    function renderRows() {}
    function renderCount() {}
    function renderPagination() {}
    function hidePageLoader() {}
    function requestFullRegistry() { throw new Error('Unexpected fallback during race test'); }

${ownership}
${loadPage}

    const first = loadPage({ includeTotal:false, scroll:false });
    assert.equal(fetchCalls, 1, 'first request must start');
    assert.equal(busy.at(-1), true, 'first request owns busy state');

    state.q = 'second';
    const second = loadPage({ includeTotal:false, scroll:false });
    assert.equal(fetchCalls, 2, 'new query must start a new request');

    // Deliberately resolve the aborted request anyway. This models a cache or
    // transport completion that arrives after abort. It must be completely inert.
    pending[0]({ rows:[{ id:'stale' }], total:null, last:{ pagination:{ hasNext:true } }, chunks:1 });
    await first;
    assert.deepEqual(commits, [], 'stale request must never publish rows');
    assert.equal(busy.at(-1), true, 'stale finally must not clear newer busy ownership');

    pending[1]({ rows:[{ id:'fresh' }], total:null, last:{ pagination:{ hasNext:false } }, chunks:1 });
    await second;
    assert.deepEqual(commits, ['fresh'], 'only the newest request may publish rows');
    assert.equal(busy.at(-1), false, 'active request releases busy state when finished');

    // Two identical loads while one is already in flight must share the work by
    // suppressing the duplicate request rather than hitting Supabase twice.
    state.q = 'same';
    const before = fetchCalls;
    const primary = loadPage({ includeTotal:false, scroll:false });
    const duplicate = loadPage({ includeTotal:false, scroll:false });
    assert.equal(fetchCalls, before + 1, 'identical in-flight request must be coalesced');
    pending.at(-1)({ rows:[{ id:'same' }], total:null, last:{ pagination:{ hasNext:false } }, chunks:1 });
    await Promise.all([primary, duplicate]);
    assert.equal(commits.at(-1), 'same', 'coalesced request still publishes its result');
  `;

  await vm.runInNewContext(`(async () => {${harness}})()`, context, { timeout:5000 });
  console.log('Registry request race test passed: stale completions cannot render, busy ownership is monotonic, and identical in-flight loads are coalesced.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
