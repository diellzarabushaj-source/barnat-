'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 8 personalization patch could not find ${label}.`);
  return source.replace(before, after);
}

function patchMobileLite() {
  let source = read('registry-mobile-lite.js');

  if (!source.includes('rows:[], // phase8-current-page')) {
    source = replaceOnce(
      source,
      `    disabled:false,\n  };`,
      `    disabled:false,\n    rows:[], // phase8-current-page\n  };`,
      'mobile-lite state tail',
    );
  }

  if (!source.includes('state.rows = payload.rows.map(row => ({ ...row }));')) {
    const payloadGuards = [
      `      if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Përgjigjja e regjistrit është e pavlefshme.');`,
      `      if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Payload-i lightweight nuk është valid.');`,
    ];
    const guard = payloadGuards.find(candidate => source.includes(candidate));
    if (!guard) throw new Error('Phase 8 personalization patch could not find mobile-lite page payload guard.');
    source = source.replace(guard, `${guard}\n      state.rows = payload.rows.map(row => ({ ...row }));`);
  }

  if (!source.includes("function renderLocalRows(rows, label = '')")) {
    const anchor = `  window.MEDINDEX_MOBILE_LITE = {`;
    const helpers = `  function renderLocalRows(rows, label = '') {\n    if (state.disabled) return;\n    const localRows = Array.isArray(rows) ? rows.map(row => ({ ...row })) : [];\n    renderRows(localRows);\n    const badge = document.getElementById('countBadge');\n    const pagination = document.getElementById('pagination');\n    if (badge) badge.textContent = clean(label) || \`${'${localRows.length}'} barna lokale\`;\n    if (pagination) pagination.innerHTML = '';\n  }\n\n  function restoreCurrentPage() {\n    if (state.disabled) return;\n    renderRows(Array.isArray(state.rows) ? state.rows : []);\n    renderCount();\n    renderPagination();\n  }\n\n`;
    if (!source.includes(anchor)) throw new Error('Phase 8 personalization patch could not find mobile-lite API anchor.');
    source = source.replace(anchor, helpers + anchor);
  }

  const apiOld = `    setFilters,\n    getFilters,\n    handoff:requestFullRegistry,\n    getState:() => ({ ...state }),`;
  const apiNew = `    setFilters,\n    getFilters,\n    getRows:() => state.rows.map(row => ({ ...row })),\n    renderLocalRows,\n    restoreCurrentPage,\n    handoff:requestFullRegistry,\n    getState:() => ({ ...state, rows:state.rows.map(row => ({ ...row })) }),`;
  if (!source.includes(apiNew)) {
    if (!source.includes(apiOld)) throw new Error('Phase 8 personalization patch could not find Phase 5 mobile-lite API exports.');
    source = source.replace(apiOld, apiNew);
  }

  if (!source.includes('getRows:() => state.rows.map')) throw new Error('Phase 8 current-row API is missing.');
  if (!source.includes('restoreCurrentPage')) throw new Error('Phase 8 no-refetch restore API is missing.');
  write('registry-mobile-lite.js', source);
}

function patchUserLibraryEventSync() {
  let source = read('user-library-client.js');
  const marker = `  const EVENT_SYNC_VERSION = 'user-library-event-sync-v1';`;

  if (!source.includes(marker)) {
    source = replaceOnce(
      source,
      `  const POLL_MS = 1200;\n  const SYNC_DELAY_MS = 700;`,
      `${marker}\n  const LEGACY_PRESCRIPTION_POLL_MS = 5000;\n  const EVENT_SYNC_DELAY_MS = 40;\n  const SYNC_DELAY_MS = 700;`,
      'user-library polling constants',
    );

    source = replaceOnce(
      source,
      `  let pollTimer = 0;`,
      `  let legacyPrescriptionPollTimer = 0;`,
      'user-library polling timer',
    );

    const oldPoll = `  function poll() {\n    const current = readState();\n    if (!lastState) {\n      lastState = current;\n      return;\n    }\n    if (stableState(lastState) === stableState(current)) return;\n    recordLocalChanges(lastState, current);\n    lastState = current;\n    scheduleSync();\n  }`;
    const eventDrivenCapture = `  function captureLocalChanges({ schedule = true, delay = SYNC_DELAY_MS } = {}) {\n    const current = readState();\n    if (!lastState) {\n      lastState = current;\n      return false;\n    }\n    if (stableState(lastState) === stableState(current)) return false;\n    recordLocalChanges(lastState, current);\n    lastState = current;\n    if (schedule) scheduleSync(delay);\n    return true;\n  }\n\n  function stablePrescriptions(state) {\n    return JSON.stringify([...(state?.prescriptions || [])]\n      .sort((a, b) => protocolId(a).localeCompare(protocolId(b))));\n  }\n\n  function pollLegacyPrescriptions() {\n    const current = readState();\n    if (!lastState) {\n      lastState = current;\n      return;\n    }\n    if (stablePrescriptions(lastState) === stablePrescriptions(current)) return;\n    captureLocalChanges();\n  }\n\n  function onPersonalLibraryMutation() {\n    const changed = captureLocalChanges({ schedule:false });\n    if (changed) scheduleSync(EVENT_SYNC_DELAY_MS);\n  }`;
    source = replaceOnce(source, oldPoll, eventDrivenCapture, 'user-library polling loop');

    source = replaceOnce(
      source,
      `      poll();\n      await Promise.race([flush(), new Promise(resolve => setTimeout(resolve, 1500))]);`,
      `      captureLocalChanges({ schedule:false });\n      await Promise.race([flush(), new Promise(resolve => setTimeout(resolve, 1500))]);`,
      'logout pre-flush capture',
    );

    source = replaceOnce(
      source,
      `    syncNow:() => { poll(); return flush(); },`,
      `    syncNow:() => { captureLocalChanges({ schedule:false }); return flush(); },`,
      'immediate library synchronization API',
    );

    source = replaceOnce(
      source,
      `  window.addEventListener('pagehide', () => {\n    poll();\n    if (dirty) void flush({ keepalive:true });\n  });`,
      `  window.addEventListener('pagehide', () => {\n    captureLocalChanges({ schedule:false });\n    if (dirty) void flush({ keepalive:true });\n  });`,
      'pagehide library capture',
    );

    source = replaceOnce(
      source,
      `    if (document.visibilityState === 'hidden') {\n      poll();\n      if (dirty) void flush({ keepalive:true });\n    }`,
      `    if (document.visibilityState === 'hidden') {\n      captureLocalChanges({ schedule:false });\n      if (dirty) void flush({ keepalive:true });\n    }`,
      'visibility library capture',
    );

    source = replaceOnce(
      source,
      `  pollTimer = window.setInterval(poll, POLL_MS);\n  void initialize();`,
      `  ['medindex:favorites-changed', 'medindex:notes-changed', 'medindex:personal-note-saved']\n    .forEach(name => window.addEventListener(name, onPersonalLibraryMutation));\n\n  window.addEventListener('storage', event => {\n    if (![PRESCRIPTIONS_KEY, FAVORITES_KEY, NOTES_KEY].includes(event.key)) return;\n    onPersonalLibraryMutation();\n  });\n\n  legacyPrescriptionPollTimer = window.setInterval(pollLegacyPrescriptions, LEGACY_PRESCRIPTION_POLL_MS);\n  void initialize();`,
      'event-driven library listeners',
    );
  }

  if (!source.includes(marker)) throw new Error('Phase 6 event-sync marker is missing.');
  if (!source.includes("window.addEventListener(name, onPersonalLibraryMutation)")) throw new Error('Phase 6 personal mutation listeners are missing.');
  if (!source.includes("window.addEventListener('storage', event =>")) throw new Error('Phase 6 cross-tab storage listener is missing.');
  const phase6SyncNow = source.includes('syncNow:() => { captureLocalChanges({ schedule:false }); return flush(); }');
  const revisionSafeSyncNow = source.includes("LONG_SESSION_VERSION = 'registry-personal-long-session-v1'")
    && source.includes('const targetRevision = localRevision;')
    && source.includes('return flushThroughRevision(targetRevision);');
  if (!phase6SyncNow && !revisionSafeSyncNow) throw new Error('Phase 6 syncNow must capture state and wait for its backend flush revision.');
  if (!source.includes('pollLegacyPrescriptions')) throw new Error('Phase 6 legacy prescription fallback is missing.');
  if (source.includes('const POLL_MS = 1200') || source.includes('window.setInterval(poll, POLL_MS)')) {
    throw new Error('Phase 6 must not poll Favorites/Notes every 1.2 seconds.');
  }

  write('user-library-client.js', source);
}

function patchIndex() {
  let source = read('index.html');

  const cssTag = `<link rel="stylesheet" href="registry-mobile-phase8.css?v=20260816-2" data-registry-mobile-phase8-css>`;
  if (!source.includes('registry-mobile-phase8.css')) {
    const cssMatch = source.match(/<link rel="stylesheet" href="registry-mobile-phase4\.css\?v=[^"]+"[^>]*>/);
    if (!cssMatch) throw new Error('Phase 8 personalization patch could not find current Phase 4 CSS anchor.');
    source = source.replace(cssMatch[0], `${cssMatch[0]}\n${cssTag}`);
  } else {
    source = source.replace(/registry-mobile-phase8\.css\?v=[^&"]+/g, 'registry-mobile-phase8.css?v=20260816-2');
  }

  const scriptTag = `<script src="registry-mobile-phase8.js?v=20260816-2" defer></script>`;
  if (!source.includes('registry-mobile-phase8.js')) {
    const scriptMatch = source.match(/<script src="registry-mobile-phase4\.js\?v=[^"]+"[^>]*><\/script>/);
    if (!scriptMatch) throw new Error('Phase 8 personalization patch could not find current Phase 4 script anchor.');
    source = source.replace(scriptMatch[0], `${scriptMatch[0]}\n${scriptTag}`);
  } else {
    source = source.replace(/registry-mobile-phase8\.js\?v=[^&"]+/g, 'registry-mobile-phase8.js?v=20260816-2');
  }

  /* v3.3 keeps the canonical controller alive as a non-visual mobile bridge;
     Phase 8 v2 adds the single mobile note pencil and correct full-view handoff. */
  source = source.replace(/registry-user-personalization\.css\?v=[^&"]+/g, 'registry-user-personalization.css?v=20260816-7');
  source = source.replace(/registry-user-personalization\.js\?v=[^&"]+/g, 'registry-user-personalization.js?v=20260816-7');
  source = source.replace(/registry-ux-phase1\.js\?v=[^&"]+/g, 'registry-ux-phase1.js?v=20260816-2');
  source = source.replace(/user-library-client\.js\?v=[^&"]+/g, 'user-library-client.js?v=20260819-logout-safety-1');
  source = source.replace(/(user-library-client\.js\?v=[^&"]+)&ls=[^&"]+/g, '$1&ls=20260817-1');

  if (source.indexOf('registry-mobile-phase8.js') > source.indexOf('registry-runtime-loader.js')) {
    throw new Error('Phase 8 must initialize before the full registry loader.');
  }
  if (!source.includes('registry-mobile-phase8.css?v=20260816-2')) throw new Error('Mobile Notes CSS version was not published.');
  if (!source.includes('registry-mobile-phase8.js?v=20260816-2')) throw new Error('Mobile Notes JS version was not published.');
  if (!source.includes('registry-user-personalization.css?v=20260816-7')) throw new Error('Mobile-bridge personalization CSS version was not published.');
  if (!source.includes('registry-user-personalization.js?v=20260816-7')) throw new Error('Mobile-bridge personalization JS version was not published.');
  if (!source.includes('registry-ux-phase1.js?v=20260816-2')) throw new Error('Canonical toolbar UX version was not published.');
  if (!source.includes('user-library-client.js?v=20260819-logout-safety-1&ls=20260817-1')) throw new Error('Protected event-driven user-library asset version was not published.');
  write('index.html', source);
}

function patchMobileActionRegion() {
  let css = read('registry-mobile-phase8.css');
  const marker = '/* MedIndex revised Phase 2: explicit mobile card action region */';
  if (css.includes(marker)) return;

  css += `\n\n${marker}\n@media (max-width:767px){\n  html.medindex-tailadmin[data-mi-page="barnat"][data-registry-mobile-lite][data-registry-mobile-phase8] body #dataTable[data-registry-unified-table] #tbody>.mobile-lite-row .mobile-lite-card:has(.mobile-lite-actions){\n    display:grid!important;\n    grid-template-columns:minmax(0,1fr) auto!important;\n    align-items:center!important;\n    gap:8px!important;\n    min-height:108px!important;\n    padding:10px 10px 10px 13px!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-card:has(.mobile-lite-actions) .mobile-lite-open{\n    display:flex!important;\n    min-width:0!important;\n    min-height:58px!important;\n    width:100%!important;\n    padding:0!important;\n    pointer-events:none!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-actions{\n    display:grid!important;\n    grid-template-columns:44px 44px 78px!important;\n    align-items:center!important;\n    gap:6px!important;\n    min-width:178px!important;\n    margin:0!important;\n    padding:0!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-actions .mi-mobile-favorite-toggle,\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-actions .mi-mobile-note-toggle{\n    position:static!important;\n    inset:auto!important;\n    width:44px!important;\n    height:44px!important;\n    margin:0!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-actions .mi-mobile-favorite-toggle{order:1}\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-actions .mi-mobile-note-toggle{order:2}\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-actions .mobile-lite-more{\n    order:3;\n    position:static!important;\n    inset:auto!important;\n    width:78px!important;\n    min-width:78px!important;\n    min-height:44px!important;\n    margin:0!important;\n    padding:0 10px!important;\n  }\n}\n`;

  write('registry-mobile-phase8.css', css);
}

function verifyAddon() {
  const source = read('registry-mobile-phase8.js');
  const css = read('registry-mobile-phase8.css');
  const shared = read('registry-user-personalization.js');
  const library = read('user-library-client.js');

  if (!source.includes("const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1'")) throw new Error('Phase 8 must share the desktop favorites key.');
  if (!source.includes("const NOTES_KEY = 'regjistriBarnave_shenime_v1'")) throw new Error('Phase 4 mobile Notes must share the canonical notes key.');
  if (!source.includes('`${pdid}|${name}|${strength}`')) throw new Error('Phase 8 must share the exact desktop drugKey format.');
  if (!source.includes("const RECENTS_KEY = 'regjistriBarnave_teFundit_v1'")) throw new Error('Phase 8 recents store is missing.');
  if (!source.includes('const MAX_RECENTS = 20')) throw new Error('Phase 8 recents must remain bounded.');
  if (!source.includes('data-mi-mobile-note')) throw new Error('Phase 4 mobile note pencil is missing.');
  if (!source.includes('MedIndexRegistryPersonalization?.editNoteForData')) throw new Error('Mobile note pencil must reuse the canonical note editor bridge.');
  if (!source.includes('personal-view-${next}')) throw new Error('Mobile Favorites/Notes must explicitly hand off to the full pre-pagination view.');
  if (!shared.includes('function phoneLiteOwnsViewport()') || !shared.includes('editNoteForData')) {
    throw new Error('Canonical personalization mobile bridge is incomplete.');
  }
  if (/\bfetch\s*\(|\/api\//.test(source)) throw new Error('Phase 8 personalization addon must not add direct backend/network reads.');
  if (!css.includes('min-height:44px') || !css.includes('width:44px') || !css.includes('height:44px')) throw new Error('Phase 8 touch targets must remain at least 44px.');
  if (!css.includes('.mi-mobile-note-toggle')) throw new Error('Phase 4 mobile note action styling is missing.');
  if (!css.includes('.mobile-lite-card:has(.mobile-lite-actions){')) throw new Error('Phase 4 mobile action region is missing.');
  if (!css.includes('grid-template-columns:44px 44px 78px!important')) throw new Error('Phase 4 favorite/note/detail action slots are incomplete.');
  if (!css.includes('body #registryViewToolbar.registry-view-toolbar-unified')) throw new Error('Phase 0 mobile-lite boundary must suppress the shared registry view toolbar on phones.');
  if (!css.includes('body #registryFilterPanel.registry-filter-panel-unified')) throw new Error('Phase 0 mobile-lite boundary must own compact search/count toolbar geometry.');
  if (!css.includes('.mobile-lite-row>td:not(:has(.mobile-lite-card))')) throw new Error('Phase 0 mobile-lite boundary must suppress shared synthetic table cells.');
  if (!css.includes('.mobile-lite-row>td:has(.mobile-lite-card)')) throw new Error('Phase 0 mobile-lite boundary must preserve exactly the canonical card cell.');
  if (!library.includes("EVENT_SYNC_VERSION = 'user-library-event-sync-v1'")) throw new Error('Phase 6 event-driven library sync is missing.');
  if (!library.includes("'medindex:favorites-changed', 'medindex:notes-changed'")) throw new Error('Phase 6 Favorites/Notes mutation listeners are missing.');
  if (!library.includes("window.addEventListener('storage', event =>")) throw new Error('Phase 6 cross-tab synchronization listener is missing.');
  if (library.includes('const POLL_MS = 1200') || library.includes('window.setInterval(poll, POLL_MS)')) throw new Error('Phase 6 legacy 1.2s personal-state polling must not return.');
}

patchMobileLite();
patchUserLibraryEventSync();
patchIndex();
patchMobileActionRegion();
verifyAddon();

console.log('Phase 6 Favorites/Notes event sync + Phase 4 mobile bridge, canonical note pencil, bounded recents and touch ownership published.');