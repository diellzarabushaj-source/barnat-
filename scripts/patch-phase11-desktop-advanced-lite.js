'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 11 desktop advanced-lite patch could not find ${label}.`);
  return source.replace(before, after);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
  if (start < 0 || end < 0) throw new Error(`Phase 11 desktop advanced-lite patch could not find ${label}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchDesktopLargePages() {
  let source = read('registry-desktop-lite.js');

  source = replaceOnce(
    source,
    `  const DEFAULT_PAGE_SIZE = 50;\n  const SEARCH_DEBOUNCE_MS = 250;`,
    `  const DEFAULT_PAGE_SIZE = 50;\n  const SERVER_PAGE_SIZE = 50;\n  const MAX_LOGICAL_PAGE_SIZE = 500;\n  const MAX_PAGE_CHUNKS = 10;\n  const CHUNK_CONCURRENCY = 3;\n  const SEARCH_DEBOUNCE_MS = 250;`,
    'bounded large-page constants',
  );

  const pageUrlBlock = `  function buildPageUrl({ includeTotal = false, page = state.page, pageSize = SERVER_PAGE_SIZE } = {}) {
    const boundedPageSize = Math.min(SERVER_PAGE_SIZE, Math.max(1, Number(pageSize) || SERVER_PAGE_SIZE));
    const params = new URLSearchParams({
      view:'registry-page',
      page:String(Math.max(1, Number(page) || 1)),
      pageSize:String(boundedPageSize),
      sort:state.sort,
      direction:state.direction,
    });
    if (state.q.length >= 2) params.set('q', state.q);
    if (state.status) params.set('status', state.status);
    if (includeTotal) params.set('includeTotal', '1');
    return API + '?' + params.toString();
  }

  function logicalChunkCount(pageSize = state.pageSize) {
    const logicalSize = Math.min(MAX_LOGICAL_PAGE_SIZE, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));
    return Math.min(MAX_PAGE_CHUNKS, Math.max(1, Math.ceil(logicalSize / SERVER_PAGE_SIZE)));
  }

  function firstServerPage(logicalPage = state.page, pageSize = state.pageSize) {
    return ((Math.max(1, Number(logicalPage) || 1) - 1) * logicalChunkCount(pageSize)) + 1;
  }

  async function fetchRegistryChunk(serverPage, { includeTotal = false, signal } = {}) {
    const response = await fetch(buildPageUrl({ includeTotal, page:serverPage, pageSize:SERVER_PAGE_SIZE }), {
      credentials:'same-origin', cache:'no-store', signal,
      headers:{ Accept:'application/json' },
    });
    if (response.status === 401) throw new Error('Sesioni ka skaduar.');
    if (!response.ok) throw new Error('Lista e barnave nuk u ngarkua (' + response.status + ').');
    const payload = await response.json();
    if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Përgjigjja e regjistrit është e pavlefshme.');
    return payload;
  }

  async function fetchLogicalPage({ includeTotal = false, signal } = {}) {
    const requestedChunks = logicalChunkCount();
    const serverStart = firstServerPage();
    const first = await fetchRegistryChunk(serverStart, { includeTotal, signal });
    const payloads = [first];
    const payloadTotal = Number(first.pagination?.total);
    const knownTotal = Number.isFinite(payloadTotal) ? payloadTotal : state.total;
    let chunksToFetch = requestedChunks;

    if (Number.isFinite(knownTotal)) {
      const logicalOffset = (state.page - 1) * state.pageSize;
      const rowsRemaining = Math.max(0, knownTotal - logicalOffset);
      const rowsNeeded = Math.min(state.pageSize, rowsRemaining);
      chunksToFetch = Math.max(1, Math.min(requestedChunks, Math.ceil(rowsNeeded / SERVER_PAGE_SIZE)));
    } else if (!first.pagination?.hasNext || first.rows.length < SERVER_PAGE_SIZE) {
      chunksToFetch = 1;
    }

    for (let chunk = 1; chunk < chunksToFetch; chunk += CHUNK_CONCURRENCY) {
      const batch = [];
      const end = Math.min(chunksToFetch, chunk + CHUNK_CONCURRENCY);
      for (let index = chunk; index < end; index += 1) {
        batch.push(fetchRegistryChunk(serverStart + index, { includeTotal:false, signal }));
      }
      payloads.push(...await Promise.all(batch));
    }

    return {
      rows:payloads.flatMap(payload => payload.rows).slice(0, state.pageSize),
      total:Number.isFinite(knownTotal) ? knownTotal : null,
      last:payloads[payloads.length - 1] || first,
      chunks:payloads.length,
    };
  }

`;
  source = replaceBlock(
    source,
    '  function buildPageUrl({ includeTotal = false } = {}) {',
    '  function setBusy',
    pageUrlBlock,
    'bounded page URL and chunk loader',
  );

  source = replaceOnce(
    source,
    `    const pageSize = document.getElementById('pageSize');\n    pageSize?.addEventListener('change', event => {\n      const requested = Number(event.currentTarget.value) || DEFAULT_PAGE_SIZE;\n      if (requested > 50) {\n        event.preventDefault();\n        event.currentTarget.value = '50';\n        requestFullRegistry('desktop-large-page-size', () => {\n          const control = document.getElementById('pageSize');\n          if (control) { control.value = String(requested); control.dispatchEvent(new Event('change', { bubbles:true })); }\n        });\n        return;\n      }\n      state.pageSize = Math.max(1, requested);\n      state.page = 1;\n      void loadPage({ includeTotal:true, scroll:false });\n    });`,
    `    const pageSize = document.getElementById('pageSize');\n    pageSize?.addEventListener('change', event => {\n      const requested = Number(event.currentTarget.value) || DEFAULT_PAGE_SIZE;\n      state.pageSize = Math.min(MAX_LOGICAL_PAGE_SIZE, Math.max(DEFAULT_PAGE_SIZE, requested));\n      event.currentTarget.value = String(state.pageSize);\n      state.page = 1;\n      void loadPage({ includeTotal:true, scroll:false });\n    });`,
    'large page-size control without full-registry handoff',
  );

  const loadPageBlock = `  async function loadPage({ includeTotal = false, scroll = false } = {}) {
    if (state.disabled) return;
    pageController?.abort();
    pageController = new AbortController();
    setBusy(true);
    try {
      const logical = await fetchLogicalPage({ includeTotal, signal:pageController.signal });
      state.hasNext = Number.isFinite(logical.total)
        ? state.page * state.pageSize < logical.total
        : Boolean(logical.last?.pagination?.hasNext);
      if (Number.isFinite(logical.total)) {
        state.total = logical.total;
        state.totalPages = Math.max(1, Math.ceil(logical.total / state.pageSize));
      }

      publishVisibleRows(logical.rows);
      buildHeader();
      renderRows(state.rows);
      renderCount();
      renderPagination();
      state.ready = true;
      html.dataset.registryDesktopLiteReady = '1';
      html.dataset.registryDesktopLiteState = 'ready';
      html.dataset.registryDesktopLiteChunks = String(logical.chunks);
      window.MedIndexRegistryDosageLoader?.schedule?.();
      window.dispatchEvent(new CustomEvent('medindex:desktop-lite-ready', {
        detail:{ page:state.page, pageSize:state.pageSize, total:state.total, chunks:logical.chunks, source:'neon' }
      }));
      hidePageLoader();
      if (scroll) document.getElementById('registryContent')?.scrollIntoView({ block:'start', behavior:'smooth' });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Desktop lightweight registry failed:', error);
      html.dataset.registryDesktopLiteState = 'error';
      if (!state.ready) requestFullRegistry('desktop-lite-error');
      else {
        const badge = document.getElementById('countBadge');
        if (badge) badge.textContent = 'Gabim · provo përsëri';
      }
    } finally {
      setBusy(false);
    }
  }

`;
  source = replaceBlock(
    source,
    '  async function loadPage({ includeTotal = false, scroll = false } = {}) {',
    '  function start()',
    loadPageBlock,
    'logical-page loader',
  );

  if (source.includes("requestFullRegistry('desktop-large-page-size'")) {
    throw new Error('Phase 11 large page sizes must not hand off to the full registry.');
  }
  if (!source.includes('const MAX_LOGICAL_PAGE_SIZE = 500;')) throw new Error('Phase 11 500-row logical cap is missing.');
  if (!source.includes('const MAX_PAGE_CHUNKS = 10;')) throw new Error('Phase 11 bounded chunk cap is missing.');
  if (!source.includes('pageSize:String(boundedPageSize)')) throw new Error('Phase 11 server page-size bound is missing.');
  if (!source.includes('payloads.flatMap(payload => payload.rows).slice(0, state.pageSize)')) {
    throw new Error('Phase 11 logical page composition is missing.');
  }

  write('registry-desktop-lite.js', source);
}

function removeLegacyFormHandoff() {
  const file = 'registry-desktop-lite.js';
  const handoffLine = "      ['formPickerBtn', 'form-picker'],\n";
  const source = read(file);
  if (source.includes(handoffLine)) write(file, source.replace(handoffLine, ''));
}

patchDesktopLargePages();
removeLegacyFormHandoff();
require('./patch-phase11-form-picker-lite.js');
require('./patch-phase12-targeted-detail-wiring.js');
console.log('Phase 11 desktop logical page sizes 50/100/250/500 use bounded 50-row Neon chunks without full-registry handoff.');
