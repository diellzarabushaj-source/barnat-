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
      '  const form = exactFilter(body.form);',
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
      "  if (form) matched = matched.filter(row => clean(row?.['Forma farmaceutike']) === form);",
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
      "    query:{ q:clean(body.q), status, form, sort:sort || 'registry', direction },",
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
    const generated = [
      `  // ${MARKER}: personal request`,
      "  function isPersonalView() { return state.personalMode === 'favorites' || state.personalMode === 'notes'; }",
      '',
      '  function requestConfig(includeTotal) {',
      '    if (!isPersonalView()) {',
      "      return { url:buildPageUrl({ includeTotal }), options:{ credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } } };",
      '    }',
      '    return {',
      "      url:API + '?view=registry-personal',",
      '      options:{',
      "        method:'POST', credentials:'same-origin', cache:'no-store',",
      "        headers:{ Accept:'application/json', 'Content-Type':'application/json' },",
      '        body:JSON.stringify({',
      "          identifiers:state.personalIdentifiers, page:state.page, pageSize:state.pageSize, q:state.q, status:state.status,",
      "          form:state.form || '', sort:state.sort, direction:state.direction, includeTotal:Boolean(includeTotal),",
      '        }),',
      '      },',
      '    };',
      '  }',
      '',
      '  function setBusy(value) {',
    ].join('\n');
    source = replaceOnce(source, '  function setBusy(value) {', generated, 'personal request config');
  }

  if (!source.includes(`${MARKER}: same-owner fetch`)) {
    source = replaceOnce(
      source,
      "      const response = await fetch(buildPageUrl({ includeTotal }), {\n        credentials:'same-origin', cache:'no-store', signal:pageController.signal,\n        headers:{ Accept:'application/json' },\n      });",
      `      // ${MARKER}: same-owner fetch\n      const request = requestConfig(includeTotal);\n      const response = await fetch(request.url, { ...request.options, signal:pageController.signal });`,
      'desktop-lite fetch',
    );
  }

  if (!source.includes(`${MARKER}: no personal error handoff`)) {
    source = replaceOnce(
      source,
      "      if (!state.ready) requestFullRegistry('desktop-lite-error');\n      else {",
      `      // ${MARKER}: no personal error handoff\n      // A personal-filter failure must never replace the Barnat UI with the\n      // historical full runtime. Keep the same table and expose a retry state.\n      if (!state.ready && !isPersonalView()) requestFullRegistry('desktop-lite-error');\n      else {`,
      'personal error ownership',
    );
  }

  if (!source.includes(`${MARKER}: personal owner API`)) {
    const generated = [
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
      generated,
      'desktop-lite API exposure',
    );
  }

  if (!source.includes(`${MARKER}: ignore legacy personal handoff`)) {
    source = replaceOnce(
      source,
      "    window.addEventListener('medindex:registry-full-dataset-needed', event => {\n      if (state.disabled) return;\n      requestFullRegistry(clean(event?.detail?.reason) || 'full-dataset-requested');\n    });",
      `    window.addEventListener('medindex:registry-full-dataset-needed', event => {\n      if (state.disabled) return;\n      const reason = clean(event?.detail?.reason) || 'full-dataset-requested';\n      // ${MARKER}: ignore legacy personal handoff\n      if (reason.startsWith('personal-view-')) return;\n      requestFullRegistry(reason);\n    });`,
      'full-dataset event gate',
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
      'personal identifiers/count',
    );
  }

  if (!source.includes(`${MARKER}: exact Barnat chrome`)) {
    source = replaceOnce(
      source,
      "  function ensureToolbarViews() {\n    if (phoneLiteOwnsViewport() || document.getElementById('registryPersonalViews')) return;",
      `  function ensureToolbarViews() {\n    // ${MARKER}: exact Barnat chrome\n    // The canonical Barnat toolbar already owns search/form/notes/columns. Do\n    // not add a second Favorites/Notes toolbar when a personal filter is active.\n    if (desktopLitePersonalRuntime()) { document.getElementById('registryPersonalViews')?.remove(); return; }\n    if (phoneLiteOwnsViewport() || document.getElementById('registryPersonalViews')) return;`,
      'personal toolbar suppression',
    );
    source = replaceOnce(
      source,
      "  function ensureViewBanner() {\n    let banner = document.getElementById('registryPersonalViewBanner');",
      `  function ensureViewBanner() {\n    let banner = document.getElementById('registryPersonalViewBanner');\n    // ${MARKER}: exact Barnat banner ownership\n    if (desktopLitePersonalRuntime()) { banner?.remove(); return null; }`,
      'personal banner suppression',
    );
    source = replaceOnce(
      source,
      "  function updateEmptyState() {\n    document.getElementById('registryPersonalEmpty')?.remove();",
      `  function updateEmptyState() {\n    document.getElementById('registryPersonalEmpty')?.remove();\n    // ${MARKER}: exact Barnat empty-state ownership\n    // Desktop-lite renders the empty message inside the same tbody/table.\n    if (desktopLitePersonalRuntime()) return;`,
      'personal empty-state suppression',
    );
  }

  if (!source.includes(`${MARKER}: canonical desktop-lite view`)) {
    const replacement = [
      '  function applyRuntimeView() {',
      `    // ${MARKER}: canonical desktop-lite view`,
      '    // Favorites and Notes are row filters of the exact Barnat owner.',
      '    const lite = desktopLitePersonalRuntime();',
      '    if (lite) {',
      '      void lite.setPersonalView(activeView, personalIdentifiersForView()).then(() => {',
      "        document.body.classList.remove('medindex-personal-view-loading');",
      '        personalRuntimeRequested = false;',
      '        updateViewBanner();',
      '        updateEmptyState();',
      '        schedule(1);',
      '      }).catch(() => {',
      "        document.body.classList.remove('medindex-personal-view-loading');",
      '        personalRuntimeRequested = false;',
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
    source = replaceBlock(source, '  function applyRuntimeView() {', '  function requestPersonalRuntime() {', replacement, 'applyRuntimeView');
  }

  if (!source.includes(`${MARKER}: prefer canonical owner`)) {
    source = replaceOnce(
      source,
      "  function requestPersonalRuntime() {\n    if (activeView === VIEW_ALL) {",
      `  function requestPersonalRuntime() {\n    // ${MARKER}: prefer canonical owner\n    if (desktopLitePersonalRuntime()) {\n      personalRuntimeRequested = false;\n      clearPersonalRuntimeRecovery({ resetCount:true });\n      applyRuntimeView();\n      return;\n    }\n    if (activeView === VIEW_ALL) {`,
      'requestPersonalRuntime desktop owner',
    );
  }

  if (!source.includes(`${MARKER}: desktop owner ready`)) {
    source = replaceOnce(
      source,
      "    window.addEventListener('medindex:registry-ready', () => {",
      `    // ${MARKER}: desktop owner ready\n    window.addEventListener('medindex:desktop-lite-ready', () => {\n      if (activeView !== VIEW_ALL) applyRuntimeView();\n      else desktopLitePersonalRuntime()?.setPersonalView?.(VIEW_ALL, []);\n      schedule(1);\n    });\n\n    window.addEventListener('medindex:registry-ready', () => {`,
      'desktop-lite ready listener',
    );
  }

  if (!source.includes(`${MARKER}: refresh favorite subset`)) {
    source = replaceOnce(
      source,
      "    window.dispatchEvent(new CustomEvent('medindex:favorites-changed', { detail:{ count:favorites.size, favorite:!active, key } }));",
      `    window.dispatchEvent(new CustomEvent('medindex:favorites-changed', { detail:{ count:favorites.size, favorite:!active, key } }));\n    // ${MARKER}: refresh favorite subset\n    if (activeView === VIEW_FAVORITES && desktopLitePersonalRuntime()) applyRuntimeView();`,
      'favorite subset refresh',
    );
  }

  if (!source.includes(`${MARKER}: refresh notes subset`)) {
    source = replaceOnce(
      source,
      "    window.dispatchEvent(new CustomEvent('medindex:notes-changed', { detail:{ key, count:noteCount(), hasNote:Boolean(text.trim()), source:phoneLiteOwnsViewport() ? 'mobile-lite' : 'registry' } }));",
      `    window.dispatchEvent(new CustomEvent('medindex:notes-changed', { detail:{ key, count:noteCount(), hasNote:Boolean(text.trim()), source:phoneLiteOwnsViewport() ? 'mobile-lite' : 'registry' } }));\n    // ${MARKER}: refresh notes subset\n    if (activeView === VIEW_NOTES && desktopLitePersonalRuntime()) applyRuntimeView();`,
      'notes subset refresh',
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
    [lite, `${MARKER}: personal owner API`, 'desktop owner API'],
    [lite, "API + '?view=registry-personal'", 'personal endpoint request'],
    [lite, `${MARKER}: no personal error handoff`, 'personal error ownership'],
    [lite, `${MARKER}: ignore legacy personal handoff`, 'legacy handoff guard'],
    [personal, `${MARKER}: canonical desktop-lite view`, 'canonical personal view'],
    [personal, `${MARKER}: exact Barnat chrome`, 'same toolbar ownership'],
    [personal, `${MARKER}: exact Barnat banner ownership`, 'same banner ownership'],
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
