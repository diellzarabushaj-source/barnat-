'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'registry-personal-desktop-lite-v1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(path.join(ROOT, file), source.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const at = source.indexOf(before);
  if (at < 0) throw new Error(`${MARKER}: ${label} anchor not found.`);
  if (source.indexOf(before, at + before.length) >= 0) throw new Error(`${MARKER}: ${label} anchor is ambiguous.`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}

function replaceBlock(source, startNeedle, endNeedle, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error(`${MARKER}: ${label} start not found.`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`${MARKER}: ${label} end not found.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchDrugSearchApi() {
  const file = 'api/drug-search.js';
  let source = read(file);

  if (!source.includes(`${MARKER}: personal registry endpoint`)) {
    const generated = [
      `// ${MARKER}: personal registry endpoint`,
      '// Favorites/Notes are membership filters over the normal registry. Resolve',
      '// membership on the server and return the same lightweight row shape as',
      '// view=registry-page. The browser never needs the legacy full registry.',
      'function personalBody(req) {',
      "  if (req?.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;",
      "  if (typeof req?.body === 'string') { try { return JSON.parse(req.body); } catch {} }",
      '  return {};',
      '}',
      '',
      'function personalIdentifiers(req) {',
      '  const body = personalBody(req);',
      '  const raw = Array.isArray(body.identifiers) ? body.identifiers : [];',
      '  return [...new Set(raw.map(value => clean(value).slice(0, 320)).filter(Boolean))].slice(0, 1000);',
      '}',
      '',
      'function legacyRegistryListRow(row) {',
      '  return {',
      "    id:clean(row?.__neonDrugId), registryNumber:row?.['Nr rendor'] ?? null,",
      "    pdid:clean(row?.PDID), tradeName:clean(row?.['Emri tregtar']),",
      "    activeSubstance:clean(row?.['Substanca aktive']), atc:clean(row?.['ATC Code']),",
      "    drugClass:clean(row?.['Klasa / Çka është']), use:clean(row?.['Përdorimi (fjalë kyçe)']),",
      "    strength:clean(row?.['Fortësia']), form:clean(row?.['Forma farmaceutike']),",
      "    prescriptionNotation:clean(row?.['Si të shënohet në recetë']), productStatus:clean(row?.Statusi),",
      "    retailPrice:row?.['Çmimi me pakicë'] ?? null,",
      '  };',
      '}',
      '',
      'function legacyPersonalCandidates(row) {',
      "  const nr = clean(row?.['Nr rendor']);",
      '  const pdid = clean(row?.PDID);',
      "  const name = clean(row?.['Emri tregtar']);",
      "  const strength = clean(row?.['Fortësia']);",
      "  const atc = clean(row?.['ATC Code']).toUpperCase();",
      "  const key = [pdid, name, strength].join('|');",
      '  const candidates = new Set();',
      '  const add = value => { const item = clean(value); if (item) candidates.add(item); };',
      '  add(key); add(nr); add(name);',
      "  if (nr && name) add(nr + '|' + name);",
      "  if (name && atc) add(name + '|' + atc);",
      "  if (nr) add('registry:' + nr);",
      "  if (key.replace(/\\|/g, '')) add(('drug:' + key).slice(0, 300));",
      "  if (name || atc) add(('fallback:' + name + '|' + atc).slice(0, 300));",
      '  return candidates;',
      '}',
      '',
      'function personalTextMatch(row, rawQuery) {',
      '  const query = normalize(registrySearchTerm(rawQuery));',
      '  if (query.length < 2) return true;',
      '  const tokens = query.split(/\\s+/).filter(Boolean);',
      '  const haystack = normalize([',
      "    row?.['Emri tregtar'], row?.['Substanca aktive'], row?.['ATC Code'],",
      "    row?.['Klasa / Çka është'], row?.['Përdorimi (fjalë kyçe)'],",
      "    row?.['Fortësia'], row?.['Forma farmaceutike'], row?.PDID, row?.ProtocolNo,",
      "  ].join(' '));",
      '  return tokens.every(token => haystack.includes(token));',
      '}',
      '',
      'function personalSortValue(row, sort) {',
      "  if (sort === 'registry') {",
      "    const numeric = Number(row?.['Nr rendor']);",
      '    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;',
      '  }',
      '  const fields = {',
      "    name:'Emri tregtar', substance:'Substanca aktive', atc:'ATC Code',",
      "    strength:'Fortësia', form:'Forma farmaceutike', status:'Statusi', price:'Çmimi me pakicë',",
      '  };',
      "  const value = row?.[fields[sort] || 'Nr rendor'];",
      "  if (sort === 'price') {",
      '    const numeric = Number(value);',
      '    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;',
      '  }',
      "  return clean(value).toLocaleLowerCase('sq');",
      '}',
      '',
      'async function sendRegistryPersonal(req, res, startedAt) {',
      '  const body = personalBody(req);',
      '  const wanted = new Set(personalIdentifiers(req));',
      '  const page = integerInRange(body.page, 1, 1, 100000);',
      '  const pageSize = integerInRange(body.pageSize, REGISTRY_DEFAULT_PAGE_SIZE, 1, REGISTRY_MAX_PAGE_SIZE);',
      '  const status = exactFilter(body.status);',
      '  const formExact = exactFilter(body.formExact);',
      '  const formCategory = clean(body.formCategory).slice(0, 80);',
      '  const sort = clean(body.sort).toLowerCase();',
      "  const direction = clean(body.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';",
      '',
      '  let matched = [];',
      '  if (wanted.size) {',
      '    const dataset = await registryHandler.getRegistryDataset();',
      '    matched = (Array.isArray(dataset?.rows) ? dataset.rows : []).filter(row => {',
      '      for (const candidate of legacyPersonalCandidates(row)) if (wanted.has(candidate)) return true;',
      '      return false;',
      '    });',
      '  }',
      "  if (status) matched = matched.filter(row => clean(row?.Statusi) === status);",
      '  const categoryForms = registryFormCategoryValues(formCategory);',
      "  if (formExact) matched = matched.filter(row => clean(row?.['Forma farmaceutike']) === formExact);",
      "  else if (categoryForms.length) matched = matched.filter(row => categoryForms.includes(clean(row?.['Forma farmaceutike'])));",
      '  if (clean(body.q).length >= 2) matched = matched.filter(row => personalTextMatch(row, body.q));',
      '',
      '  matched.sort((a, b) => {',
      "    const av = personalSortValue(a, sort || 'registry');",
      "    const bv = personalSortValue(b, sort || 'registry');",
      '    let compared = 0;',
      "    if (typeof av === 'number' && typeof bv === 'number') compared = av - bv;",
      "    else compared = String(av).localeCompare(String(bv), 'sq', { numeric:true, sensitivity:'base' });",
      "    if (!compared) compared = Number(a?.['Nr rendor'] || 0) - Number(b?.['Nr rendor'] || 0);",
      "    return direction === 'desc' ? -compared : compared;",
      '  });',
      '',
      '  const total = matched.length;',
      '  const totalPages = Math.max(1, Math.ceil(total / pageSize));',
      '  const safePage = Math.min(page, totalPages);',
      '  const offset = (safePage - 1) * pageSize;',
      '  const rows = matched.slice(offset, offset + pageSize).map(legacyRegistryListRow);',
      '',
      "  res.setHeader('Cache-Control', 'private, no-store, max-age=0');",
      "  res.setHeader('Server-Timing', 'registrypersonal;dur=' + (Date.now() - startedAt));",
      "  res.setHeader('X-MedIndex-Data-Source', 'personal-registry');",
      '  return res.status(200).json({',
      '    ok:true, rows, personal:true,',
      '    pagination:{ page:safePage, pageSize, total, totalPages, hasPrevious:safePage > 1, hasNext:safePage < totalPages },',
      "    query:{ q:clean(body.q), status, formExact, formCategory, sort:sort || 'registry', direction },",
      '  });',
      '}',
      '',
      'async function sendRegistryPage(req, res, startedAt) {',
    ].join('\n');
    source = replaceOnce(source, 'async function sendRegistryPage(req, res, startedAt) {', generated, 'personal endpoint insertion');
  }

  if (!source.includes(`${MARKER}: allow personal POST`)) {
    source = replaceOnce(
      source,
      "  if (req.method !== 'GET') {\n    res.setHeader('Allow', 'GET');\n    return res.status(405).json({ error:'Metoda nuk lejohet.' });\n  }\n  if (!(await registryHandler.authorized(req))) {",
      `  // ${MARKER}: allow personal POST\n  const view = clean(req.query?.view).toLowerCase();\n  const personalPost = req.method === 'POST' && view === 'registry-personal';\n  if (req.method !== 'GET' && !personalPost) {\n    res.setHeader('Allow', 'GET, POST');\n    return res.status(405).json({ error:'Metoda nuk lejohet.' });\n  }\n  if (!(await registryHandler.authorized(req))) {`,
      'method gate',
    );
    source = replaceOnce(
      source,
      "  const view = clean(req.query?.view).toLowerCase();\n  if (view === 'registry-page') {",
      "  if (view === 'registry-personal') {\n    if (req.method !== 'POST') {\n      res.setHeader('Allow', 'POST');\n      return res.status(405).json({ error:'Pamja personale kërkon POST.' });\n    }\n    try { return await sendRegistryPersonal(req, res, startedAt); }\n    catch (error) {\n      console.error('Registry personal error:', error);\n      res.setHeader('Cache-Control', 'private, no-store, max-age=0');\n      return res.status(500).json({ error:'Favoritet ose Shënimet nuk u ngarkuan.' });\n    }\n  }\n  if (view === 'registry-page') {",
      'personal route',
    );
  }

  write(file, source);
}

function patchDesktopLite() {
  const file = 'registry-desktop-lite.js';
  let source = read(file);

  if (!source.includes(`${MARKER}: personal state`)) {
    source = replaceOnce(
      source,
      "    disabled:false,\n    rows:[],",
      `    disabled:false,\n    // ${MARKER}: personal state\n    personalMode:'all',\n    personalIdentifiers:[],\n    rows:[],`,
      'desktop-lite state',
    );
  }

  if (!source.includes(`${MARKER}: personal request`)) {
    const helper = [
      `  // ${MARKER}: personal request`,
      "  function isPersonalView() { return state.personalMode === 'favorites' || state.personalMode === 'notes'; }",
      '',
      '  async function fetchPersonalLogicalPage({ signal } = {}) {',
      "    const response = await fetch(API + '?view=registry-personal', {",
      "      method:'POST', credentials:'same-origin', cache:'no-store', signal,",
      "      headers:{ Accept:'application/json', 'Content-Type':'application/json' },",
      '      body:JSON.stringify({',
      '        identifiers:state.personalIdentifiers, page:state.page, pageSize:state.pageSize,',
      '        q:state.q, status:state.status, sort:state.sort, direction:state.direction,',
      "        formExact:state.formType === 'form' ? state.formValue : '',",
      "        formCategory:state.formType === 'category' ? state.formValue : '',",
      '      }),',
      '    });',
      "    if (response.status === 401) throw new Error('Sesioni ka skaduar.');",
      "    if (!response.ok) throw new Error('Favoritet ose Shënimet nuk u ngarkuan (' + response.status + ').');",
      '    const payload = await response.json();',
      "    if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Përgjigjja personale është e pavlefshme.');",
      '    const rawTotal = payload.pagination?.total;',
      '    const total = rawTotal === null || rawTotal === undefined ? null : Number(rawTotal);',
      '    return {',
      '      rows:payload.rows.slice(0, state.pageSize),',
      '      total:Number.isFinite(total) ? total : payload.rows.length,',
      '      last:payload, chunks:1,',
      '    };',
      '  }',
      '',
      '  function setBusy(value) {',
    ].join('\n');
    source = replaceOnce(source, '  function setBusy(value) {', helper, 'personal request helpers');
  }

  if (!source.includes(`${MARKER}: personal logical page`)) {
    source = replaceOnce(
      source,
      '  async function fetchLogicalPage({ includeTotal = false, signal } = {}) {\n    const requestedChunks = logicalChunkCount();',
      `  async function fetchLogicalPage({ includeTotal = false, signal } = {}) {\n    // ${MARKER}: personal logical page\n    // Personal subsets bypass chunk composition because the server already\n    // paginates the user's matched rows at the requested logical page size.\n    if (isPersonalView()) return fetchPersonalLogicalPage({ signal });\n    const requestedChunks = logicalChunkCount();`,
      'Phase 11 logical page personal branch',
    );
  }

  if (!source.includes(`${MARKER}: personal exact-count guard`)) {
    source = replaceOnce(
      source,
      '  async function refreshDesktopExactTotal(contextKey) {\n    if (state.disabled || state.q.length >= 2 || contextKey !== countContextKey()) return;',
      `  async function refreshDesktopExactTotal(contextKey) {\n    // ${MARKER}: personal exact-count guard\n    if (state.disabled || isPersonalView() || state.q.length >= 2 || contextKey !== countContextKey()) return;`,
      'personal exact-count refresh guard',
    );
    source = replaceOnce(
      source,
      '  function scheduleDesktopExactTotal() {\n    window.clearTimeout(countTimer);\n    countTimer = 0;\n    if (state.disabled || state.q.length >= 2) return;',
      `  function scheduleDesktopExactTotal() {\n    window.clearTimeout(countTimer);\n    countTimer = 0;\n    if (state.disabled || isPersonalView() || state.q.length >= 2) return;`,
      'personal exact-count schedule guard',
    );
  }

  if (!source.includes(`${MARKER}: no personal error handoff`)) {
    source = replaceOnce(
      source,
      "      if (!state.ready) requestFullRegistry('desktop-lite-error');",
      `      // ${MARKER}: no personal error handoff\n      // A personal-filter failure must never replace the canonical Barnat UI.\n      if (!state.ready && !isPersonalView()) requestFullRegistry('desktop-lite-error');`,
      'personal error ownership',
    );
  }

  if (!source.includes(`${MARKER}: personal owner API`)) {
    const ownerApi = [
      `  // ${MARKER}: personal owner API`,
      "  async function setPersonalView(mode = 'all', identifiers = []) {",
      '    if (state.disabled) return false;',
      "    const next = mode === 'favorites' || mode === 'notes' ? mode : 'all';",
      '    const cleanIdentifiers = [...new Set((Array.isArray(identifiers) ? identifiers : []).map(value => clean(value).slice(0, 320)).filter(Boolean))];',
      '    const changed = next !== state.personalMode',
      '      || cleanIdentifiers.length !== state.personalIdentifiers.length',
      '      || cleanIdentifiers.some((value, index) => value !== state.personalIdentifiers[index]);',
      '    state.personalMode = next;',
      '    state.personalIdentifiers = cleanIdentifiers;',
      '    state.page = 1;',
      '    state.total = null;',
      '    state.totalPages = null;',
      '    state.hasNext = false;',
      '    window.clearTimeout(countTimer);',
      '    countTimer = 0;',
      '    countController?.abort();',
      '    countController = null;',
      '    html.dataset.registryPersonalLiteView = next;',
      "    document.body.classList.toggle('medindex-personal-lite-active', next !== 'all');",
      '    if (!changed && state.ready) return true;',
      '    await loadPage({ includeTotal:true, scroll:false });',
      '    return true;',
      '  }',
      '',
      '  window.MEDINDEX_DESKTOP_LITE = {',
      '    version:VERSION,',
      '    reload:() => loadPage({ includeTotal:true, scroll:false }),',
      '    setPersonalView,',
    ].join('\n');
    source = replaceOnce(
      source,
      "  window.MEDINDEX_DESKTOP_LITE = {\n    version:VERSION,\n    reload:() => loadPage({ includeTotal:true, scroll:false }),",
      ownerApi,
      'desktop-lite personal owner API',
    );
  }

  if (!source.includes(`${MARKER}: ignore legacy personal handoff`)) {
    source = replaceOnce(
      source,
      "    window.addEventListener('medindex:registry-full-dataset-needed', event => {\n      if (state.disabled) return;\n      requestFullRegistry(clean(event?.detail?.reason) || 'full-dataset-requested');\n    });",
      `    window.addEventListener('medindex:registry-full-dataset-needed', event => {\n      if (state.disabled) return;\n      const reason = clean(event?.detail?.reason) || 'full-dataset-requested';\n      // ${MARKER}: ignore legacy personal handoff\n      if (reason.startsWith('personal-view-')) return;\n      requestFullRegistry(reason);\n    });`,
      'legacy personal full-dataset event guard',
    );
  }

  write(file, source);
}

function patchPersonalization() {
  const file = 'registry-user-personalization.js';
  let source = read(file);

  if (!source.includes(`${MARKER}: personal identifiers`)) {
    source = replaceOnce(
      source,
      "  function personalFilteredCount() {\n    const value = Number(runtime()?.getFilteredCount?.());\n    return Number.isFinite(value) && value >= 0 ? value : null;\n  }",
      `  // ${MARKER}: personal identifiers\n  function personalIdentifiersForView() {\n    if (activeView === VIEW_FAVORITES) return [...favorites];\n    if (activeView === VIEW_NOTES) return Object.keys(notes);\n    return [];\n  }\n  function desktopLitePersonalRuntime() {\n    const api = window.MEDINDEX_DESKTOP_LITE;\n    if (!api || window.MEDINDEX_DESKTOP_LITE_ACTIVE !== true || typeof api.setPersonalView !== 'function') return null;\n    return api;\n  }\n  function personalFilteredCount() {\n    const liteTotal = Number(desktopLitePersonalRuntime()?.getState?.()?.total);\n    if (activeView !== VIEW_ALL && Number.isFinite(liteTotal) && liteTotal >= 0) return liteTotal;\n    const value = Number(runtime()?.getFilteredCount?.());\n    return Number.isFinite(value) && value >= 0 ? value : null;\n  }`,
      'personal identifiers and count',
    );
  }

  if (!source.includes(`${MARKER}: exact Barnat chrome`)) {
    source = replaceOnce(
      source,
      '  function ensureToolbarViews() {',
      `  function ensureToolbarViews() {\n    // ${MARKER}: exact Barnat chrome\n    // Favorites/Notes do not get a second toolbar when the Barnat owner is active.\n    if (desktopLitePersonalRuntime()) { document.getElementById('registryPersonalViews')?.remove(); return; }`,
      'personal toolbar ownership',
    );
    source = replaceOnce(
      source,
      '  function ensureViewBanner() {\n    let banner = document.getElementById(\'registryPersonalViewBanner\');',
      `  function ensureViewBanner() {\n    let banner = document.getElementById('registryPersonalViewBanner');\n    // ${MARKER}: exact Barnat banner ownership\n    if (desktopLitePersonalRuntime()) { banner?.remove(); return null; }`,
      'personal banner ownership',
    );
    source = replaceOnce(
      source,
      "    document.body.classList.toggle('medindex-favorites-only', activeView === VIEW_FAVORITES);\n    document.body.classList.toggle('medindex-notes-only', activeView === VIEW_NOTES);",
      `    // ${MARKER}: no legacy personal layout classes\n    if (desktopLitePersonalRuntime()) {\n      document.body.classList.remove('medindex-favorites-only', 'medindex-notes-only');\n    } else {\n      document.body.classList.toggle('medindex-favorites-only', activeView === VIEW_FAVORITES);\n      document.body.classList.toggle('medindex-notes-only', activeView === VIEW_NOTES);\n    }`,
      'legacy personal layout classes',
    );
    source = replaceOnce(
      source,
      "  function updateEmptyState() {\n    document.getElementById('registryPersonalEmpty')?.remove();",
      `  function updateEmptyState() {\n    document.getElementById('registryPersonalEmpty')?.remove();\n    // ${MARKER}: exact Barnat empty-state ownership\n    // The canonical owner keeps empty feedback inside its existing tbody.\n    if (desktopLitePersonalRuntime()) return;`,
      'personal empty-state ownership',
    );
  }

  if (!source.includes(`${MARKER}: canonical desktop-lite view`)) {
    const replacement = [
      '  function applyRuntimeView() {',
      `    // ${MARKER}: canonical desktop-lite view`,
      '    // Favorites/Notes are row filters of the exact Barnat owner.',
      '    const lite = desktopLitePersonalRuntime();',
      '    if (lite) {',
      '      void lite.setPersonalView(activeView, personalIdentifiersForView()).then(() => {',
      "        document.body.classList.remove('medindex-personal-view-loading');",
      '        personalRuntimeRequested = false;',
      '        updateViewNav();',
      '        updateViewBanner();',
      '        updateEmptyState();',
      '        schedule(1);',
      '      }).catch(() => {',
      "        document.body.classList.remove('medindex-personal-view-loading');",
      '        personalRuntimeRequested = false;',
      '        updateViewNav();',
      '        updateViewBanner();',
      '      });',
      '      return true;',
      '    }',
      '',
      '    const api = runtime();',
      '    if (!api) return activeView === VIEW_ALL;',
      '    if (api.setPersonalView) api.setPersonalView(activeView);',
      '    else {',
      '      api.setFavoritesOnly?.(activeView === VIEW_FAVORITES);',
      '      api.setNotesOnly?.(activeView === VIEW_NOTES);',
      '    }',
      "    document.body.classList.remove('medindex-personal-view-loading');",
      '    personalRuntimeRequested = false;',
      '    updateViewBanner();',
      '    updateEmptyState();',
      '    return true;',
      '  }',
      '',
    ].join('\n');
    source = replaceBlock(source, '  function applyRuntimeView() {', '  function requestPersonalRuntime() {', replacement, 'canonical applyRuntimeView');
  }

  if (!source.includes(`${MARKER}: prefer canonical owner`)) {
    source = replaceOnce(
      source,
      '  function requestPersonalRuntime() {',
      `  function requestPersonalRuntime() {\n    // ${MARKER}: prefer canonical owner\n    if (desktopLitePersonalRuntime()) {\n      personalRuntimeRequested = false;\n      clearPersonalRuntimeRecovery({ resetCount:true });\n      applyRuntimeView();\n      return;\n    }`,
      'canonical personal runtime preference',
    );
  }

  if (!source.includes(`${MARKER}: desktop owner ready`)) {
    source = replaceOnce(
      source,
      "    window.addEventListener('medindex:registry-ready', () => {",
      `    // ${MARKER}: desktop owner ready\n    window.addEventListener('medindex:desktop-lite-ready', () => {\n      if (activeView !== VIEW_ALL) applyRuntimeView();\n      schedule(1);\n    });\n\n    // Refresh an active subset after its membership changes. This listener is\n    // delegated and survives every table rerender.\n    window.addEventListener('medindex:favorites-changed', () => {\n      if (activeView === VIEW_FAVORITES && desktopLitePersonalRuntime()) applyRuntimeView();\n    });\n    window.addEventListener('medindex:notes-changed', () => {\n      if (activeView === VIEW_NOTES && desktopLitePersonalRuntime()) applyRuntimeView();\n    });\n\n    window.addEventListener('medindex:registry-ready', () => {`,
      'desktop owner ready and membership listeners',
    );
  }

  write(file, source);
}

function verify() {
  const api = read('api/drug-search.js');
  const lite = read('registry-desktop-lite.js');
  const personal = read('registry-user-personalization.js');

  const requirements = [
    [api, `${MARKER}: personal registry endpoint`, 'server personal endpoint'],
    [api, "view === 'registry-personal'", 'personal route'],
    [api, 'registryHandler.getRegistryDataset()', 'server membership filter'],
    [api, 'registryFormCategoryValues(formCategory)', 'personal form-category parity'],
    [lite, `${MARKER}: personal owner API`, 'desktop owner API'],
    [lite, "API + '?view=registry-personal'", 'personal endpoint request'],
    [lite, `${MARKER}: personal logical page`, 'Phase 11 personal logical page'],
    [lite, `${MARKER}: personal exact-count guard`, 'personal exact-count guard'],
    [lite, `${MARKER}: no personal error handoff`, 'personal error ownership'],
    [lite, `${MARKER}: ignore legacy personal handoff`, 'legacy handoff guard'],
    [personal, `${MARKER}: canonical desktop-lite view`, 'canonical personal view'],
    [personal, `${MARKER}: exact Barnat chrome`, 'same toolbar ownership'],
    [personal, `${MARKER}: exact Barnat banner ownership`, 'same banner ownership'],
    [personal, `${MARKER}: no legacy personal layout classes`, 'legacy layout class guard'],
    [personal, 'personalIdentifiersForView()', 'personal membership identifiers'],
  ];
  for (const [source, needle, label] of requirements) {
    if (!source.includes(needle)) throw new Error(`${MARKER}: missing ${label}.`);
  }

  const start = personal.indexOf(`${MARKER}: canonical desktop-lite view`);
  const end = personal.indexOf('function requestPersonalRuntime()', start);
  const block = personal.slice(start, end);
  if (block.includes('MEDINDEX_LOAD_FULL_REGISTRY')) throw new Error(`${MARKER}: canonical personal view still calls the full loader.`);
}

patchDrugSearchApi();
patchDesktopLite();
patchPersonalization();
verify();

console.log('Canonical personal registry owner applied: Favorites/Notes use the exact Barnat desktop-lite chrome/table and only their rows change.');
