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
    source = replaceOnce(
      source,
      `      if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Payload-i lightweight nuk është valid.');\n      state.page = Number(payload.pagination?.page || state.page);`,
      `      if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Payload-i lightweight nuk është valid.');\n      state.rows = payload.rows.map(row => ({ ...row }));\n      state.page = Number(payload.pagination?.page || state.page);`,
      'mobile-lite page snapshot',
    );
  }

  if (!source.includes('function renderLocalRows(rows, label = \'\')')) {
    const anchor = `  window.MEDINDEX_MOBILE_LITE = {`;
    const helpers = `  function renderLocalRows(rows, label = '') {\n    if (state.disabled) return;\n    const localRows = Array.isArray(rows) ? rows.map(row => ({ ...row })) : [];\n    renderRows(localRows);\n    if (badge) badge.textContent = clean(label) || \`${'${localRows.length}'} barna lokale\`;\n    if (pagination) pagination.innerHTML = '';\n  }\n\n  function restoreCurrentPage() {\n    if (state.disabled) return;\n    renderRows(Array.isArray(state.rows) ? state.rows : []);\n    renderCount();\n    renderPagination();\n  }\n\n`;
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

function patchIndex() {
  let source = read('index.html');

  const cssAnchor = `<link rel="stylesheet" href="registry-mobile-phase4.css?v=20260812-1">`;
  const cssTag = `<link rel="stylesheet" href="registry-mobile-phase8.css?v=20260812-1">`;
  if (!source.includes(cssTag)) {
    if (!source.includes(cssAnchor)) throw new Error('Phase 8 personalization patch could not find Phase 4 CSS anchor.');
    source = source.replace(cssAnchor, `${cssAnchor}\n  ${cssTag}`);
  }

  const scriptAnchor = `<script src="registry-mobile-phase4.js?v=20260812-1"></script>`;
  const scriptTag = `<script src="registry-mobile-phase8.js?v=20260812-1"></script>`;
  if (!source.includes(scriptTag)) {
    if (!source.includes(scriptAnchor)) throw new Error('Phase 8 personalization patch could not find Phase 4 script anchor.');
    source = source.replace(scriptAnchor, `${scriptAnchor}\n  ${scriptTag}`);
  }

  if (source.indexOf('registry-mobile-phase8.js') > source.indexOf('registry-runtime-loader.js')) {
    throw new Error('Phase 8 must initialize before the full registry loader.');
  }
  write('index.html', source);
}

function verifyAddon() {
  const source = read('registry-mobile-phase8.js');
  const css = read('registry-mobile-phase8.css');
  if (!source.includes("const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1'")) throw new Error('Phase 8 must share the desktop favorites key.');
  if (!source.includes('`${pdid}|${name}|${strength}`')) throw new Error('Phase 8 must share the exact desktop drugKey format.');
  if (!source.includes("const RECENTS_KEY = 'regjistriBarnave_teFundit_v1'")) throw new Error('Phase 8 recents store is missing.');
  if (!source.includes('const MAX_RECENTS = 20')) throw new Error('Phase 8 recents must remain bounded.');
  if (/\bfetch\s*\(|\/api\//.test(source)) throw new Error('Phase 8 personalization addon must not add backend/network reads.');
  if (!css.includes('min-height:44px') || !css.includes('width:44px') || !css.includes('height:44px')) throw new Error('Phase 8 touch targets must remain at least 44px.');
}

patchMobileLite();
patchIndex();
verifyAddon();

console.log('Phase 8 mobile favorites + recent medicines are local-first, desktop-key compatible and restore without refetch.');
