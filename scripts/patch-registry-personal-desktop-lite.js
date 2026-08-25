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
    source = replaceOnce(
      source,
      'async function sendRegistryPage(req, res, startedAt) {',
      `// ${MARKER}: personal registry endpoint\n// Favorites/Notes are membership filters over the normal registry. Resolve\n// that membership on the server and return the exact same lightweight row\n// shape as view=registry-page, so the browser never swaps to the legacy full\n// registry runtime just to show a personal subset.\nfunction personalBody(req) {\n  if (req?.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;\n  if (typeof req?.body === 'string') {\n    try { return JSON.parse(req.body); } catch {}\n  }\n  return {};\n}\n\nfunction personalIdentifiers(req) {\n  const body = personalBody(req);\n  const raw = Array.isArray(body.identifiers) ? body.identifiers : [];\n  return [...new Set(raw.map(value => clean(value).slice(0, 320)).filter(Boolean))].slice(0, 1000);\n}\n\nfunction legacyRegistryListRow(row) {\n  return {\n    id:clean(row?.__neonDrugId),\n    registryNumber:row?.['Nr rendor'] ?? null,\n    pdid:clean(row?.PDID),\n    tradeName:clean(row?.['Emri tregtar']),\n    activeSubstance:clean(row?.['Substanca aktive']),\n    atc:clean(row?.['ATC Code']),\n    drugClass:clean(row?.['Klasa / Çka është']),\n    use:clean(row?.['Përdorimi (fjalë kyçe)']),\n    strength:clean(row?.['Fortësia']),\n    form:clean(row?.['Forma farmaceutike']),\n    prescriptionNotation:clean(row?.['Si të shënohet në recetë']),\n    productStatus:clean(row?.Statusi),\n    retailPrice:row?.['Çmimi me pakicë'] ?? null,\n  };\n}\n\nfunction legacyPersonalCandidates(row) {\n  const nr = clean(row?.['Nr rendor']);\n  const pdid = clean(row?.PDID);\n  const name = clean(row?.['Emri tregtar']);\n  const strength = clean(row?.['Fortësia']);\n  const atc = clean(row?.['ATC Code']).toUpperCase();\n  const key = [pdid, name, strength].join('|');\n  const candidates = new Set();\n  const add = value => { const item = clean(value); if (item) candidates.add(item); };\n  add(key); add(nr); add(name);\n  if (nr && name) add(\`${nr}|${name}\`);\n  if (name && atc) add(\`${name}|${atc}\`);\n  if (nr) add(\`registry:${nr}\`);\n  if (key.replace(/\\|/g, '')) add(\`drug:${key}\`.slice(0, 300));\n  if (name || atc) add(\`fallback:${name}|${atc}\`.slice(0, 300));\n  return candidates;\n}\n\nfunction personalTextMatch(row, rawQuery) {\n  const query = normalize(registrySearchTerm(rawQuery));\n  if (query.length < 2) return true;\n  const tokens = query.split(/\\s+/).filter(Boolean);\n  const haystack = normalize([\n    row?.['Emri tregtar'], row?.['Substanca aktive'], row?.['ATC Code'],\n    row?.['Klasa / Çka është'], row?.['Përdorimi (fjalë kyçe)'],\n    row?.['Fortësia'], row?.['Forma farmaceutike'], row?.PDID, row?.ProtocolNo,\n  ].join(' '));\n  return tokens.every(token => haystack.includes(token));\n}\n\nfunction personalSortValue(row, sort) {\n  if (sort === 'registry') {\n    const numeric = Number(row?.['Nr rendor']);\n    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;\n  }\n  const fields = {\n    name:'Emri tregtar', substance:'Substanca aktive', atc:'ATC Code',\n    strength:'Fortësia', form:'Forma farmaceutike', status:'Statusi',\n    price:'Çmimi me pakicë',\n  };\n  const value = row?.[fields[sort] || 'Nr rendor'];\n  if (sort === 'price') {\n    const numeric = Number(value);\n    return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;\n  }\n  return clean(value).toLocaleLowerCase('sq');\n}\n\nasync function sendRegistryPersonal(req, res, startedAt) {\n  const body = personalBody(req);\n  const identifiers = personalIdentifiers(req);\n  const wanted = new Set(identifiers);\n  const page = integerInRange(body.page, 1, 1, 100000);\n  const pageSize = integerInRange(body.pageSize, REGISTRY_DEFAULT_PAGE_SIZE, 1, REGISTRY_MAX_PAGE_SIZE);\n  const status = exactFilter(body.status);\n  const form = exactFilter(body.form);\n  const sort = clean(body.sort).toLowerCase();\n  const direction = clean(body.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';\n\n  let matched = [];\n  if (wanted.size) {\n    const dataset = await registryHandler.getRegistryDataset();\n    matched = (Array.isArray(dataset?.rows) ? dataset.rows : []).filter(row => {\n      for (const candidate of legacyPersonalCandidates(row)) if (wanted.has(candidate)) return true;\n      return false;\n    });\n  }\n\n  if (status) matched = matched.filter(row => clean(row?.Statusi) === status);\n  if (form) matched = matched.filter(row => clean(row?.['Forma farmaceutike']) === form);\n  if (clean(body.q).length >= 2) matched = matched.filter(row => personalTextMatch(row, body.q));\n\n  matched.sort((a, b) => {\n    const av = personalSortValue(a, sort || 'registry');\n    const bv = personalSortValue(b, sort || 'registry');\n    let compared = 0;\n    if (typeof av === 'number' && typeof bv === 'number') compared = av - bv;\n    else compared = String(av).localeCompare(String(bv), 'sq', { numeric:true, sensitivity:'base' });\n    if (!compared) compared = Number(a?.['Nr rendor'] || 0) - Number(b?.['Nr rendor'] || 0);\n    return direction === 'desc' ? -compared : compared;\n  });\n\n  const total = matched.length;\n  const totalPages = Math.max(1, Math.ceil(total / pageSize));\n  const safePage = Math.min(page, totalPages);\n  const offset = (safePage - 1) * pageSize;\n  const rows = matched.slice(offset, offset + pageSize).map(legacyRegistryListRow);\n\n  res.setHeader('Cache-Control', 'private, no-store, max-age=0');\n  res.setHeader('Server-Timing', \`registrypersonal;dur=${Date.now() - startedAt}\`);\n  res.setHeader('X-MedIndex-Data-Source', 'personal-registry');\n  return res.status(200).json({\n    ok:true, rows, personal:true,\n    pagination:{\n      page:safePage, pageSize, total, totalPages,\n      hasPrevious:safePage > 1, hasNext:safePage < totalPages,\n    },\n    query:{ q:clean(body.q), status, form, sort:sort || 'registry', direction },\n  });\n}\n\nasync function sendRegistryPage(req, res, startedAt) {`,
      'personal endpoint insertion',
    );
  }

  if (!source.includes(`${MARKER}: allow personal POST`)) {
    source = replaceOnce(
      source,
      `  if (req.method !== 'GET') {\n    res.setHeader('Allow', 'GET');\n    return res.status(405).json({ error:'Metoda nuk lejohet.' });\n  }\n  if (!(await registryHandler.authorized(req))) {`,
      `  // ${MARKER}: allow personal POST\n  const view = clean(req.query?.view).toLowerCase();\n  const personalPost = req.method === 'POST' && view === 'registry-personal';\n  if (req.method !== 'GET' && !personalPost) {\n    res.setHeader('Allow', 'GET, POST');\n    return res.status(405).json({ error:'Metoda nuk lejohet.' });\n  }\n  if (!(await registryHandler.authorized(req))) {`,
      'method gate',
    );
    source = replaceOnce(
      source,
      `  const view = clean(req.query?.view).toLowerCase();\n  if (view === 'registry-page') {`,
      `  if (view === 'registry-personal') {\n    if (req.method !== 'POST') {\n      res.setHeader('Allow', 'POST');\n      return res.status(405).json({ error:'Pamja personale kërkon POST.' });\n    }\n    try { return await sendRegistryPersonal(req, res, startedAt); }\n    catch (error) {\n      console.error('Registry personal error:', error);\n      res.setHeader('Cache-Control', 'private, no-store, max-age=0');\n      return res.status(500).json({ error:'Favoritet ose Shënimet nuk u ngarkuan.' });\n    }\n  }\n  if (view === 'registry-page') {`,
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
      `    disabled:false,\n    rows:[],`,
      `    disabled:false,\n    // ${MARKER}: personal state\n    personalMode:'all',\n    personalIdentifiers:[],\n    rows:[],`,
      'desktop-lite state',
    );
  }

  if (!source.includes(`${MARKER}: personal request`)) {
    source = replaceOnce(
      source,
      `  function setBusy(value) {`,
      `  // ${MARKER}: personal request\n  function isPersonalView() { return state.personalMode === 'favorites' || state.personalMode === 'notes'; }\n\n  function requestConfig(includeTotal) {\n    if (!isPersonalView()) {\n      return {\n        url:buildPageUrl({ includeTotal }),\n        options:{ credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' } },\n      };\n    }\n    return {\n      url:\`${API}?view=registry-personal\`,\n      options:{\n        method:'POST', credentials:'same-origin', cache:'no-store',\n        headers:{ Accept:'application/json', 'Content-Type':'application/json' },\n        body:JSON.stringify({\n          identifiers:state.personalIdentifiers,\n          page:state.page, pageSize:state.pageSize, q:state.q, status:state.status,\n          form:state.form || '', sort:state.sort, direction:state.direction, includeTotal:Boolean(includeTotal),\n        }),\n      },\n    };\n  }\n\n  function setBusy(value) {`,
      'personal request config',
    );
  }

  if (!source.includes(`${MARKER}: same-owner fetch`)) {
    source = replaceOnce(
      source,
      `      const response = await fetch(buildPageUrl({ includeTotal }), {\n        credentials:'same-origin', cache:'no-store', signal:pageController.signal,\n        headers:{ Accept:'application/json' },\n      });`,
      `      // ${MARKER}: same-owner fetch\n      const request = requestConfig(includeTotal);\n      const response = await fetch(request.url, { ...request.options, signal:pageController.signal });`,
      'desktop-lite fetch',
    );
  }

  if (!source.includes(`${MARKER}: personal owner API`)) {
    source = replaceOnce(
      source,
      `  window.MEDINDEX_DESKTOP_LITE = {\n    version:VERSION,\n    reload:() => loadPage({ includeTotal:true, scroll:false }),`, 
      `  // ${MARKER}: personal owner API\n  async function setPersonalView(mode = 'all', identifiers = []) {\n    if (state.disabled) return false;\n    const next = mode === 'favorites' || mode === 'notes' ? mode : 'all';\n    const cleanIdentifiers = [...new Set((Array.isArray(identifiers) ? identifiers : []).map(value => clean(value).slice(0, 320)).filter(Boolean))];\n    const changed = next !== state.personalMode\n      || cleanIdentifiers.length !== state.personalIdentifiers.length\n      || cleanIdentifiers.some((value, index) => value !== state.personalIdentifiers[index]);\n    state.personalMode = next;\n    state.personalIdentifiers = cleanIdentifiers;\n    state.page = 1;\n    state.total = null;\n    state.totalPages = null;\n    state.hasNext = false;\n    html.dataset.registryPersonalLiteView = next;\n    document.body.classList.toggle('medindex-personal-lite-active', next !== 'all');\n    if (!changed && state.ready) return true;\n    await loadPage({ includeTotal:true, scroll:false });\n    return true;\n  }\n\n  window.MEDINDEX_DESKTOP_LITE = {\n    version:VERSION,\n    reload:() => loadPage({ includeTotal:true, scroll:false }),\n    setPersonalView,`,
      'desktop-lite API exposure',
    );
  }

  // A personal view is no longer a request for the browser's full legacy
  // dataset. Ignore any stale event from an older personalization bundle rather
  // than surrendering ownership of the canonical Barnat table.
  if (!source.includes(`${MARKER}: ignore legacy personal handoff`)) {
    source = replaceOnce(
      source,
      `    window.addEventListener('medindex:registry-full-dataset-needed', event => {\n      if (state.disabled) return;\n      requestFullRegistry(clean(event?.detail?.reason) || 'full-dataset-requested');\n    });`,
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
      `  function personalFilteredCount() {\n    const value = Number(runtime()?.getFilteredCount?.());\n    return Number.isFinite(value) && value >= 0 ? value : null;\n  }`,
      `  // ${MARKER}: personal identifiers\n  function personalIdentifiersForView() {\n    if (activeView === VIEW_FAVORITES) return [...favorites];\n    if (activeView === VIEW_NOTES) return Object.keys(notes);\n    return [];\n  }\n  function desktopLitePersonalRuntime() {\n    const api = window.MEDINDEX_DESKTOP_LITE;\n    if (!api || window.MEDINDEX_DESKTOP_LITE_ACTIVE !== true || typeof api.setPersonalView !== 'function') return null;\n    return api;\n  }\n  function personalFilteredCount() {\n    const liteTotal = Number(desktopLitePersonalRuntime()?.getState?.()?.total);\n    if (activeView !== VIEW_ALL && Number.isFinite(liteTotal) && liteTotal >= 0) return liteTotal;\n    const value = Number(runtime()?.getFilteredCount?.());\n    return Number.isFinite(value) && value >= 0 ? value : null;\n  }`,
      'personal identifiers/count',
    );
  }

  if (!source.includes(`${MARKER}: canonical desktop-lite view`)) {
    const start = '  function applyRuntimeView() {';
    const end = '  function requestPersonalRuntime() {';
    const replacement = `  function applyRuntimeView() {\n    // ${MARKER}: canonical desktop-lite view\n    // On desktop, Favorites/Notes are a row filter of the exact Barnat owner.\n    // Never replace the shell/table with the historical full-registry runtime.\n    const lite = desktopLitePersonalRuntime();\n    if (lite) {\n      void lite.setPersonalView(activeView, personalIdentifiersForView()).then(() => {\n        document.body.classList.remove('medindex-personal-view-loading');\n        personalRuntimeRequested = false;\n        updateViewBanner();\n        updateEmptyState();\n        schedule(1);\n      }).catch(() => {\n        document.body.classList.remove('medindex-personal-view-loading');\n        personalRuntimeRequested = false;\n        updateViewBanner();\n      });\n      return true;\n    }\n\n    const api = runtime();\n    if (!api) return activeView === VIEW_ALL;\n    if (api.setPersonalView) api.setPersonalView(activeView);\n    else {\n      api.setFavoritesOnly?.(activeView === VIEW_FAVORITES);\n      api.setNotesOnly?.(activeView === VIEW_NOTES);\n    }\n    document.body.classList.remove('medindex-personal-view-loading');\n    personalRuntimeRequested = false;\n    updateViewBanner();\n    updateEmptyState();\n    return true;\n  }\n`;
    source = replaceBlock(source, start, end, replacement, 'applyRuntimeView');
  }

  if (!source.includes(`${MARKER}: prefer canonical owner`)) {
    source = replaceOnce(
      source,
      `  function requestPersonalRuntime() {\n    if (activeView === VIEW_ALL) {`,
      `  function requestPersonalRuntime() {\n    // ${MARKER}: prefer canonical owner\n    // The desktop-lite controller may become available one deferred-script tick\n    // after personalization. Use it as soon as it exists and do not invoke the\n    // full-registry loader for Favorites/Notes.\n    if (desktopLitePersonalRuntime()) {\n      personalRuntimeRequested = false;\n      clearPersonalRuntimeRecovery({ resetCount:true });\n      applyRuntimeView();\n      return;\n    }\n    if (activeView === VIEW_ALL) {`,
      'requestPersonalRuntime desktop owner',
    );
  }

  // Once the desktop-lite script announces readiness, replay the current hash
  // immediately; this closes the race where a user clicks Favorites during boot.
  if (!source.includes(`${MARKER}: desktop owner ready`)) {
    source = replaceOnce(
      source,
      `    window.addEventListener('medindex:registry-ready', () => {`,
      `    // ${MARKER}: desktop owner ready\n    window.addEventListener('medindex:desktop-lite-ready', () => {\n      if (activeView !== VIEW_ALL) applyRuntimeView();\n      else desktopLitePersonalRuntime()?.setPersonalView?.(VIEW_ALL, []);\n      schedule(1);\n    });\n\n    window.addEventListener('medindex:registry-ready', () => {`,
      'desktop-lite ready listener',
    );
  }

  // Removing a favorite or deleting a note while its personal view is open must
  // remove the row from that same table immediately.
  if (!source.includes(`${MARKER}: refresh favorite subset`)) {
    source = replaceOnce(
      source,
      `    window.dispatchEvent(new CustomEvent('medindex:favorites-changed', { detail:{ count:favorites.size, favorite:!active, key } }));`,
      `    window.dispatchEvent(new CustomEvent('medindex:favorites-changed', { detail:{ count:favorites.size, favorite:!active, key } }));\n    // ${MARKER}: refresh favorite subset\n    if (activeView === VIEW_FAVORITES && desktopLitePersonalRuntime()) applyRuntimeView();`,
      'favorite subset refresh',
    );
  }

  if (!source.includes(`${MARKER}: refresh notes subset`)) {
    source = replaceOnce(
      source,
      `    window.dispatchEvent(new CustomEvent('medindex:notes-changed', { detail:{ key, count:noteCount(), hasNote:Boolean(text.trim()), source:phoneLiteOwnsViewport() ? 'mobile-lite' : 'registry' } }));`,
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

  const required = [
    [api, `${MARKER}: personal registry endpoint`, 'server personal registry endpoint'],
    [api, `view === 'registry-personal'`, 'personal route'],
    [api, `registryHandler.getRegistryDataset()`, 'server-side personal membership filtering'],
    [api, `Cache-Control', 'private, no-store`, 'private personal response'],
    [lite, `${MARKER}: personal owner API`, 'desktop-lite personal owner API'],
    [lite, `setPersonalView,`, 'desktop-lite setPersonalView export'],
    [lite, `view=registry-personal`, 'desktop-lite personal endpoint'],
    [lite, `${MARKER}: ignore legacy personal handoff`, 'legacy personal handoff guard'],
    [personal, `${MARKER}: canonical desktop-lite view`, 'personalization canonical owner'],
    [personal, `desktopLitePersonalRuntime()`, 'desktop-lite preference'],
    [personal, `personalIdentifiersForView()`, 'personal identifiers'],
  ];
  for (const [source, needle, label] of required) {
    if (!source.includes(needle)) throw new Error(`${MARKER}: missing ${label}.`);
  }

  const canonicalBlock = personal.slice(
    personal.indexOf(`${MARKER}: canonical desktop-lite view`),
    personal.indexOf('function requestPersonalRuntime()', personal.indexOf(`${MARKER}: canonical desktop-lite view`)),
  );
  if (canonicalBlock.includes('MEDINDEX_LOAD_FULL_REGISTRY')) {
    throw new Error(`${MARKER}: canonical desktop personal view still calls the full registry loader.`);
  }
}

patchDrugSearchApi();
patchDesktopLite();
patchPersonalization();
verify();

console.log('Canonical personal registry owner applied: Favorites/Notes filter the same Barnat desktop-lite table; no desktop full-runtime handoff is used.');
