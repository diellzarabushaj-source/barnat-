'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'registry-personal-ux-phase8-v1';
const ASSET_VERSION = '20260817-1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Phase 8 UX could not find ${label} start.`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Phase 8 UX could not find ${label} end.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchController() {
  let source = read('registry-user-personalization.js');
  if (source.includes("const PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1';")) return;

  source = source.replace(
    "  const PHONE_OWNER_QUERY = '(max-width: 767px)';",
    "  const PHONE_OWNER_QUERY = '(max-width: 767px)';\n  const PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1';",
  );
  source = source.replace(
    '  let personalRuntimeRequested = false;',
    "  let personalRuntimeRequested = false;\n  let libraryReady = false;\n  let librarySyncState = 'loading';\n  let libraryRetryAt = 0;",
  );

  const noteCountAnchor = "  function noteCount() { return Object.values(notes).filter(entry => String(entry?.text || '').trim()).length; }";
  if (!source.includes(noteCountAnchor)) throw new Error('Phase 8 UX note-count anchor missing.');
  source = source.replace(noteCountAnchor, [
    noteCountAnchor,
    "  function personalTotal() { return activeView === VIEW_FAVORITES ? favorites.size : activeView === VIEW_NOTES ? noteCount() : 0; }",
    '  function personalFilteredCount() {',
    '    const value = Number(runtime()?.getFilteredCount?.());',
    '    return Number.isFinite(value) && value >= 0 ? value : null;',
    '  }',
    '  function settleLibrary(detail = {}) {',
    '    libraryReady = true;',
    '    libraryRetryAt = Number(detail?.retryAt || 0) || 0;',
    "    if (detail?.pending) librarySyncState = 'pending';",
    "    else if (librarySyncState === 'loading') librarySyncState = 'idle';",
    '    schedule(1);',
    '  }',
  ].join('\n'));

  const syncReplacement = [
    '  async function syncMutation(kind, key) {',
    '    const token = syncToken(kind, key);',
    '    pendingSync.add(token);',
    "    librarySyncState = 'saving';",
    '    libraryRetryAt = 0;',
    '    schedule(1);',
    '    try {',
    '      const sync = window.MedIndexUserLibrary?.syncNow;',
    "      if (typeof sync !== 'function') { librarySyncState = 'pending'; return false; }",
    '      const synced = await sync();',
    '      if (synced) {',
    '        pendingSync.delete(token);',
    "        librarySyncState = 'synced';",
    '      } else {',
    "        librarySyncState = 'pending';",
    '      }',
    '      return Boolean(synced);',
    '    } catch {',
    "      librarySyncState = 'pending';",
    '      return false;',
    '    } finally { schedule(1); }',
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  async function syncMutation(kind, key) {', '  async function persistActiveNote', syncReplacement, 'syncMutation');

  source = source.replace(
    "#favoriteNavCount,[data-mi-fav-count],[data-favorite-count],[data-toolbar-favorite-count]",
    "#favoriteNavCount,[data-mi-fav-count],[data-favorite-count],[data-toolbar-favorite-count],[data-mi-phase8-favorite-count]",
  );
  source = source.replace(
    "#notesNavCount,[data-note-count],[data-toolbar-note-count]",
    "#notesNavCount,[data-note-count],[data-toolbar-note-count],[data-mi-phase8-note-count]",
  );
  source = source.replace(
    "<span><b data-personal-banner-title></b><small data-personal-banner-copy></small></span><button type=\"button\" data-personal-view=\"all\">Të gjitha barnat</button>",
    "<span><b data-personal-banner-title></b><small data-personal-banner-copy></small><em data-personal-banner-sync role=\"status\" aria-live=\"polite\"></em></span><button type=\"button\" data-personal-view=\"all\">Të gjitha barnat</button>",
  );

  const bannerReplacement = [
    '  function updateViewBanner() {',
    '    const banner = ensureViewBanner();',
    '    if (!banner) return;',
    "    const title = banner.querySelector('[data-personal-banner-title]');",
    "    const copy = banner.querySelector('[data-personal-banner-copy]');",
    "    const sync = banner.querySelector('[data-personal-banner-sync]');",
    "    const runtimeLoading = document.body.classList.contains('medindex-personal-view-loading');",
    '    const loading = runtimeLoading || !libraryReady;',
    '    const total = personalTotal();',
    '    const filtered = loading ? null : personalFilteredCount();',
    "    const one = activeView === VIEW_FAVORITES ? 'bar i ruajtur' : 'bar me shënim';",
    "    const many = activeView === VIEW_FAVORITES ? 'barna të ruajtura' : 'barna me shënime';",
    "    title.textContent = activeView === VIEW_FAVORITES ? '★ Favoritet' : '✎ Shënimet';",
    '    if (loading) {',
    "      copy.textContent = activeView === VIEW_FAVORITES ? 'Duke përgatitur Favoritet…' : 'Duke përgatitur Shënimet…';",
    '    } else if (total > 0 && filtered === 0) {',
    "      copy.textContent = `Ke ${total} ${total === 1 ? one : many}, por asnjë nuk përputhet me kërkimin/filtrat aktualë.`;",
    '    } else if (total > 0 && filtered !== null && filtered < total) {',
    "      copy.textContent = `${filtered} nga ${total} ${total === 1 ? one : many} shfaqen me filtrat aktualë.`;",
    '    } else if (total > 0) {',
    "      copy.textContent = `${total} ${total === 1 ? one : many} · vetëm të tuat`;",
    '    } else {',
    "      copy.textContent = activeView === VIEW_FAVORITES ? 'Nuk ke ende barna të ruajtura.' : 'Nuk ke ende shënime.';",
    '    }',
    '',
    "    const saving = favoriteInFlight.size > 0 || noteInFlight.size > 0 || librarySyncState === 'saving';",
    "    let syncText = '';",
    "    let syncState = 'idle';",
    "    if (!libraryReady) { syncText = 'Po lexohet biblioteka…'; syncState = 'loading'; }",
    "    else if (saving) { syncText = 'Duke ruajtur…'; syncState = 'saving'; }",
    "    else if (pendingSync.size || librarySyncState === 'pending') {",
    "      syncText = navigator.onLine ? 'Ruajtur lokalisht · sinkronizimi në pritje' : 'Ruajtur lokalisht · offline';",
    "      syncState = 'pending';",
    "    } else if (librarySyncState === 'synced') { syncText = '✓ Sinkronizuar'; syncState = 'synced'; }",
    '    if (sync) {',
    '      sync.textContent = syncText;',
    '      sync.dataset.state = syncState;',
    '      sync.hidden = !syncText;',
    "      sync.title = libraryRetryAt > Date.now() ? 'Sinkronizimi do të riprovohet automatikisht.' : '';",
    '    }',
    "    banner.setAttribute('aria-busy', String(loading || saving));",
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  function updateViewBanner() {', '  function updateEmptyState() {', bannerReplacement, 'updateViewBanner');

  const emptyReplacement = [
    '  function updateEmptyState() {',
    "    document.getElementById('registryPersonalEmpty')?.remove();",
    "    document.body.classList.remove('medindex-personal-empty-visible', 'medindex-personal-filtered-empty');",
    "    if (phoneLiteOwnsViewport() || activeView === VIEW_ALL || !libraryReady || document.body.classList.contains('medindex-personal-view-loading')) return;",
    '    const total = personalTotal();',
    '    const filtered = personalFilteredCount();',
    '    if (total > 0 && filtered !== 0) return;',
    "    const empty = document.createElement('div');",
    "    empty.id = 'registryPersonalEmpty';",
    "    empty.className = 'registry-personal-empty';",
    '    if (total > 0 && filtered === 0) {',
    "      empty.classList.add('is-filtered-empty');",
    "      document.body.classList.add('medindex-personal-filtered-empty');",
    "      const noun = activeView === VIEW_FAVORITES ? (total === 1 ? 'favorit' : 'favorite') : (total === 1 ? 'shënim' : 'shënime');",
    "      empty.innerHTML = `<strong>Asnjë rezultat me filtrat aktualë.</strong><span>Ke ${total} ${noun} të ruajtur. Ndrysho kërkimin ose filtrat për t’i shfaqur.</span><button type=\"button\" data-personal-view=\"all\">Shiko të gjitha barnat</button>`;",
    '    } else {',
    '      empty.innerHTML = activeView === VIEW_FAVORITES',
    "        ? '<strong>Ende nuk ke barna të ruajtura.</strong><span>Kliko yllin pranë një bari për ta shtuar në Favoritet.</span><button type=\"button\" data-personal-view=\"all\">Të gjitha barnat</button>'",
    "        : '<strong>Nuk ke ende shënime.</strong><span>Kliko ikonën e lapsit pranë një bari për të shtuar një shënim personal.</span><button type=\"button\" data-personal-view=\"all\">Të gjitha barnat</button>';",
    '    }',
    "    document.body.classList.add('medindex-personal-empty-visible');",
    "    document.getElementById('registryContent')?.insertAdjacentElement('beforebegin', empty);",
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  function updateEmptyState() {', '  function applyRuntimeView() {', emptyReplacement, 'updateEmptyState');

  const applyReplacement = [
    '  function applyRuntimeView() {',
    '    const api = runtime();',
    '    if (!api) return false;',
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
  source = replaceSection(source, '  function applyRuntimeView() {', '  function requestPersonalRuntime() {', applyReplacement, 'applyRuntimeView');

  const setViewReplacement = [
    '  function setView(view) {',
    '    activeView = [VIEW_ALL, VIEW_FAVORITES, VIEW_NOTES].includes(view) ? view : VIEW_ALL;',
    '    try {',
    "      const suffix = activeView === VIEW_FAVORITES ? '#favoritet' : activeView === VIEW_NOTES ? '#shenimet' : '';",
    "      history.replaceState(null, '', `${location.pathname}${location.search}${suffix}`);",
    '    } catch {}',
    "    document.getElementById('registryPersonalEmpty')?.remove();",
    "    document.body.classList.remove('medindex-personal-empty-visible', 'medindex-personal-filtered-empty');",
    "    if (activeView !== VIEW_ALL && !runtime()) document.body.classList.add('medindex-personal-view-loading');",
    "    else if (activeView === VIEW_ALL) document.body.classList.remove('medindex-personal-view-loading');",
    '    updateViewNav();',
    '    updateViewBanner();',
    '    if (!applyRuntimeView() && activeView !== VIEW_ALL) requestPersonalRuntime();',
    '    updateEmptyState();',
    '    schedule(2);',
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  function setView(view) {', '  function refresh() {', setViewReplacement, 'setView');

  source = source.replace(
    "      document.getElementById('registryPersonalEmpty')?.remove();\n      document.documentElement.dataset.registryPersonalization = 'mobile-lite-bridge';",
    "      document.getElementById('registryPersonalEmpty')?.remove();\n      document.body.classList.remove('medindex-personal-empty-visible', 'medindex-personal-filtered-empty');\n      document.documentElement.dataset.registryPersonalization = 'mobile-lite-bridge';",
  );

  const oldEvents = [
    "    window.addEventListener('medindex:library-ready', () => schedule(1));",
    "    window.addEventListener('medindex:library-synced', () => {",
    '      pendingSync.clear();',
    '      schedule(1);',
    '    });',
    "    window.addEventListener('medindex:library-pending', () => schedule(1));",
  ].join('\n');
  const newEvents = [
    "    window.addEventListener('medindex:library-ready', event => settleLibrary(event.detail || {}));",
    "    window.addEventListener('medindex:library-synced', () => {",
    '      libraryReady = true;',
    "      librarySyncState = 'synced';",
    '      libraryRetryAt = 0;',
    '      if (!favoriteInFlight.size && !noteInFlight.size) pendingSync.clear();',
    '      schedule(1);',
    '    });',
    "    window.addEventListener('medindex:library-pending', event => {",
    '      libraryReady = true;',
    "      librarySyncState = 'pending';",
    '      libraryRetryAt = Number(event.detail?.retryAt || 0) || 0;',
    '      schedule(1);',
    '    });',
  ].join('\n');
  if (!source.includes(oldEvents)) throw new Error('Phase 8 UX library event anchor missing.');
  source = source.replace(oldEvents, newEvents);

  const hashAnchor = "    window.addEventListener('hashchange', () => setView(viewFromLocation()));\n\n    schedule(1);";
  if (!source.includes(hashAnchor)) throw new Error('Phase 8 UX hash/readiness anchor missing.');
  source = source.replace(hashAnchor, [
    "    window.addEventListener('hashchange', () => setView(viewFromLocation()));",
    '',
    '    const libraryPromise = window.MEDINDEX_LIBRARY_READY;',
    "    if (libraryPromise && typeof libraryPromise.then === 'function') {",
    '      libraryPromise.then(detail => settleLibrary(detail || {}), () => settleLibrary({ pending:true }));',
    '    } else {',
    '      window.setTimeout(() => { if (!libraryReady) settleLibrary({ local:true }); }, 900);',
    '    }',
    '',
    '    schedule(1);',
  ].join('\n'));

  source = source.replace(
    '    pendingSyncCount:() => pendingSync.size,\n    editNoteForData,',
    '    pendingSyncCount:() => pendingSync.size,\n    libraryReady:() => libraryReady,\n    syncState:() => librarySyncState,\n    phase8UxVersion:PHASE8_UX_VERSION,\n    editNoteForData,',
  );

  write('registry-user-personalization.js', source);
}

function patchCss() {
  let css = read('registry-user-personalization.css');
  if (css.includes('/* registry-personal-ux-phase8-v1 */')) return;
  css += `\n\n/* registry-personal-ux-phase8-v1 */\n.registry-personal-view-banner>span{flex-wrap:wrap}\n.registry-personal-view-banner [data-personal-banner-sync]{display:inline-flex;align-items:center;min-height:20px;padding:2px 7px;border-radius:999px;background:#eef6f5;color:#52706d;font-style:normal;font-size:.62rem;font-weight:850;white-space:nowrap}\n.registry-personal-view-banner [data-personal-banner-sync][hidden]{display:none!important}\n.registry-personal-view-banner [data-personal-banner-sync][data-state="saving"],.registry-personal-view-banner [data-personal-banner-sync][data-state="loading"]{background:#eff6ff;color:#1d4ed8}\n.registry-personal-view-banner [data-personal-banner-sync][data-state="pending"]{background:#fff7ed;color:#b45309}\n.registry-personal-view-banner [data-personal-banner-sync][data-state="synced"]{background:#ecfdf5;color:#047857}\n.registry-personal-empty.is-filtered-empty{border-style:solid;background:#f8fafc}\nbody.medindex-personal-empty-visible #dataTable,body.medindex-personal-empty-visible #pagination{display:none!important}\nbody.medindex-personal-view-loading #registryContent{position:relative;min-height:150px}\nbody.medindex-personal-view-loading #registryContent #tbody{visibility:hidden!important}\nbody.medindex-personal-view-loading #registryContent::after{content:"Duke përgatitur pamjen personale…";position:absolute;inset:18px 12px auto;min-height:92px;display:grid;place-items:center;border:1px dashed #cbd5e1;border-radius:12px;background:linear-gradient(100deg,#f8fafc 20%,#eef5f5 50%,#f8fafc 80%);background-size:220% 100%;color:#64748b;font-size:.76rem;font-weight:800;animation:miPersonalLoading 1.35s linear infinite}\n@keyframes miPersonalLoading{to{background-position:-220% 0}}\nhtml[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync]{background:#1d2b2d;color:#b7c8c8}\nhtml[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync][data-state="saving"],html[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync][data-state="loading"]{background:#172554;color:#bfdbfe}\nhtml[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync][data-state="pending"]{background:#3b2a16;color:#fdba74}\nhtml[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync][data-state="synced"]{background:#12342a;color:#86efac}\nhtml[data-theme="dark"] .registry-personal-empty.is-filtered-empty{background:#131d20}\nhtml[data-theme="dark"] body.medindex-personal-view-loading #registryContent::after{background:linear-gradient(100deg,#121b1d 20%,#1b2a2d 50%,#121b1d 80%);background-size:220% 100%;border-color:#344749;color:#aebfc1}\n@media(max-width:767px){.registry-personal-view-banner [data-personal-banner-sync]{white-space:normal}}\n@media(prefers-reduced-motion:reduce){body.medindex-personal-view-loading #registryContent::after{animation:none}}\n`;
  write('registry-user-personalization.css', css);
}

function patchIndex() {
  let source = read('index.html');
  source = source.replace(/(registry-user-personalization\.css\?v=[^&"]+)(?:&ux=[^"]+)?/g, `$1&ux=${ASSET_VERSION}`);
  source = source.replace(/(registry-user-personalization\.js\?v=[^&"]+)(?:&ux=[^"]+)?/g, `$1&ux=${ASSET_VERSION}`);
  write('index.html', source);
}

function audit() {
  const ui = read('registry-user-personalization.js');
  const css = read('registry-user-personalization.css');
  const html = read('index.html');
  if (!ui.includes("const PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1';")) throw new Error('Phase 8 UX marker missing.');
  if (!ui.includes("let librarySyncState = 'loading';") || !ui.includes('function settleLibrary(detail = {})')) throw new Error('Phase 8 library readiness state machine missing.');
  if (!ui.includes('personalFilteredCount()') || !ui.includes('medindex-personal-filtered-empty')) throw new Error('Phase 8 filtered-empty state missing.');
  if (!ui.includes("librarySyncState = 'saving'") || !ui.includes("librarySyncState = 'pending'") || !ui.includes("librarySyncState = 'synced'")) throw new Error('Phase 8 sync feedback states missing.');
  if (!ui.includes('[data-mi-phase8-favorite-count]') || !ui.includes('[data-mi-phase8-note-count]')) throw new Error('Phase 8 count surfaces are not unified.');
  const applyStart = ui.indexOf('function applyRuntimeView()');
  const setIndex = ui.indexOf('if (api.setPersonalView) api.setPersonalView(activeView);', applyStart);
  const clearIndex = ui.indexOf("document.body.classList.remove('medindex-personal-view-loading');", applyStart);
  if (!(setIndex >= 0 && clearIndex > setIndex)) throw new Error('Phase 8 can still expose stale rows during runtime handoff.');
  if (!css.includes('/* registry-personal-ux-phase8-v1 */') || !css.includes('medindex-personal-view-loading #registryContent #tbody') || !css.includes('[data-personal-banner-sync][data-state="pending"]')) throw new Error('Phase 8 visual state contract missing.');
  if (!html.includes(`&ux=${ASSET_VERSION}`)) throw new Error('Phase 8 assets are not cache-busted.');
  console.log('Phase 8 personal UX polish passed: no stale-row flash, true/filtered empty states, unified counts and saving/pending/synced feedback are active.');
}

patchController();
patchCss();
patchIndex();
audit();
