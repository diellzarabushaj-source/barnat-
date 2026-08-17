'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'registry-personal-ux-phase8-v1';
const ASSET_VERSION = '20260817-1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Phase 8 personal UX patch could not find ${label}.`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Phase 8 personal UX patch found ambiguous ${label}.`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchController() {
  let source = read('registry-user-personalization.js');
  if (source.includes(`const PHASE8_UX_VERSION = '${MARKER}';`)) return;

  source = replaceOnce(
    source,
    `  const PHONE_OWNER_QUERY = '(max-width: 767px)';`,
    `  const PHONE_OWNER_QUERY = '(max-width: 767px)';\n  const PHASE8_UX_VERSION = '${MARKER}';`,
    'personal UX version marker',
  );

  source = replaceOnce(
    source,
    `  let personalRuntimeRequested = false;`,
    `  let personalRuntimeRequested = false;\n  let libraryReady = false;\n  let librarySyncState = 'loading';\n  let libraryRetryAt = 0;`,
    'personal library UI state',
  );

  source = replaceOnce(
    source,
    `  function hasNoteRow(row) { return hasNoteKey(noteKey(row)); }\n  function hasNoteForData(data) { return hasNoteKey(noteKeyForData(data)); }\n  function noteCount() { return Object.values(notes).filter(entry => String(entry?.text || '').trim()).length; }`,
    `  function hasNoteRow(row) { return hasNoteKey(noteKey(row)); }\n  function hasNoteForData(data) { return hasNoteKey(noteKeyForData(data)); }\n  function noteCount() { return Object.values(notes).filter(entry => String(entry?.text || '').trim()).length; }\n  function personalTotal() { return activeView === VIEW_FAVORITES ? favorites.size : activeView === VIEW_NOTES ? noteCount() : 0; }\n  function personalFilteredCount() {\n    const value = Number(runtime()?.getFilteredCount?.());\n    return Number.isFinite(value) && value >= 0 ? value : null;\n  }\n  function settleLibrary(detail = {}) {\n    libraryReady = true;\n    libraryRetryAt = Number(detail?.retryAt || 0) || 0;\n    if (detail?.pending) librarySyncState = 'pending';\n    else if (librarySyncState === 'loading') librarySyncState = 'idle';\n    schedule(1);\n  }`,
    'personal count and library-state helpers',
  );

  source = replaceOnce(
    source,
    `  async function syncMutation(kind, key) {\n    const token = syncToken(kind, key);\n    pendingSync.add(token);\n    schedule(1);\n    try {\n      const sync = window.MedIndexUserLibrary?.syncNow;\n      if (typeof sync !== 'function') return false;\n      const synced = await sync();\n      if (synced) pendingSync.delete(token);\n      return Boolean(synced);\n    } catch { return false; }\n    finally { schedule(1); }\n  }`,
    `  async function syncMutation(kind, key) {\n    const token = syncToken(kind, key);\n    pendingSync.add(token);\n    librarySyncState = 'saving';\n    libraryRetryAt = 0;\n    schedule(1);\n    try {\n      const sync = window.MedIndexUserLibrary?.syncNow;\n      if (typeof sync !== 'function') { librarySyncState = 'pending'; return false; }\n      const synced = await sync();\n      if (synced) {\n        pendingSync.delete(token);\n        librarySyncState = 'synced';\n      } else {\n        librarySyncState = 'pending';\n      }\n      return Boolean(synced);\n    } catch {\n      librarySyncState = 'pending';\n      return false;\n    } finally { schedule(1); }\n  }`,
    'personal mutation sync state',
  );

  source = replaceOnce(
    source,
    `    document.querySelectorAll('#favoriteNavCount,[data-mi-fav-count],[data-favorite-count],[data-toolbar-favorite-count]').forEach(node => {`,
    `    document.querySelectorAll('#favoriteNavCount,[data-mi-fav-count],[data-favorite-count],[data-toolbar-favorite-count],[data-mi-phase8-favorite-count]').forEach(node => {`,
    'favorite count surfaces',
  );
  source = replaceOnce(
    source,
    `    document.querySelectorAll('#notesNavCount,[data-note-count],[data-toolbar-note-count]').forEach(node => {`,
    `    document.querySelectorAll('#notesNavCount,[data-note-count],[data-toolbar-note-count],[data-mi-phase8-note-count]').forEach(node => {`,
    'note count surfaces',
  );

  source = replaceOnce(
    source,
    `      banner.innerHTML = '<span><b data-personal-banner-title></b><small data-personal-banner-copy></small></span><button type="button" data-personal-view="all">Të gjitha barnat</button>';`,
    `      banner.innerHTML = '<span><b data-personal-banner-title></b><small data-personal-banner-copy></small><em data-personal-banner-sync role="status" aria-live="polite"></em></span><button type="button" data-personal-view="all">Të gjitha barnat</button>';`,
    'personal banner sync surface',
  );

  source = replaceOnce(
    source,
    `  function updateViewBanner() {\n    const banner = ensureViewBanner();\n    if (!banner) return;\n    const title = banner.querySelector('[data-personal-banner-title]');\n    const copy = banner.querySelector('[data-personal-banner-copy]');\n    const loading = document.body.classList.contains('medindex-personal-view-loading');\n    if (activeView === VIEW_FAVORITES) {\n      title.textContent = '★ Favoritet';\n      copy.textContent = loading ? 'Duke përgatitur Favoritet…' : \`${favorites.size} \${favorites.size === 1 ? 'bar i ruajtur' : 'barna të ruajtura'} · vetëm të tuat\`;\n    } else {\n      const total = noteCount();\n      title.textContent = '✎ Shënimet';\n      copy.textContent = loading ? 'Duke përgatitur Shënimet…' : total ? \`${total} \${total === 1 ? 'bar me shënim' : 'barna me shënime'} · vetëm të tuat\` : 'Nuk ke ende shënime.';\n    }\n  }`,
    `  function updateViewBanner() {\n    const banner = ensureViewBanner();\n    if (!banner) return;\n    const title = banner.querySelector('[data-personal-banner-title]');\n    const copy = banner.querySelector('[data-personal-banner-copy]');\n    const sync = banner.querySelector('[data-personal-banner-sync]');\n    const runtimeLoading = document.body.classList.contains('medindex-personal-view-loading');\n    const loading = runtimeLoading || !libraryReady;\n    const total = personalTotal();\n    const filtered = loading ? null : personalFilteredCount();\n    const one = activeView === VIEW_FAVORITES ? 'bar i ruajtur' : 'bar me shënim';\n    const many = activeView === VIEW_FAVORITES ? 'barna të ruajtura' : 'barna me shënime';\n    title.textContent = activeView === VIEW_FAVORITES ? '★ Favoritet' : '✎ Shënimet';\n    if (loading) {\n      copy.textContent = activeView === VIEW_FAVORITES ? 'Duke përgatitur Favoritet…' : 'Duke përgatitur Shënimet…';\n    } else if (total > 0 && filtered === 0) {\n      copy.textContent = \`Ke \${total} \${total === 1 ? one : many}, por asnjë nuk përputhet me kërkimin/filtrat aktualë.\`;\n    } else if (total > 0 && filtered !== null && filtered < total) {\n      copy.textContent = \`\${filtered} nga \${total} \${total === 1 ? one : many} shfaqen me filtrat aktualë.\`;\n    } else if (total > 0) {\n      copy.textContent = \`\${total} \${total === 1 ? one : many} · vetëm të tuat\`;\n    } else {\n      copy.textContent = activeView === VIEW_FAVORITES ? 'Nuk ke ende barna të ruajtura.' : 'Nuk ke ende shënime.';\n    }\n\n    const saving = favoriteInFlight.size > 0 || noteInFlight.size > 0 || librarySyncState === 'saving';\n    let syncText = '';\n    let syncState = 'idle';\n    if (!libraryReady) { syncText = 'Po lexohet biblioteka…'; syncState = 'loading'; }\n    else if (saving) { syncText = 'Duke ruajtur…'; syncState = 'saving'; }\n    else if (pendingSync.size || librarySyncState === 'pending') {\n      syncText = navigator.onLine ? 'Ruajtur lokalisht · sinkronizimi në pritje' : 'Ruajtur lokalisht · offline';\n      syncState = 'pending';\n    } else if (librarySyncState === 'synced') { syncText = '✓ Sinkronizuar'; syncState = 'synced'; }\n    if (sync) {\n      sync.textContent = syncText;\n      sync.dataset.state = syncState;\n      sync.hidden = !syncText;\n      sync.title = libraryRetryAt > Date.now() ? 'Sinkronizimi do të riprovohet automatikisht.' : '';\n    }\n    banner.setAttribute('aria-busy', String(loading || saving));\n  }`,
    'personal banner state machine',
  );

  source = replaceOnce(
    source,
    `  function updateEmptyState() {\n    document.getElementById('registryPersonalEmpty')?.remove();\n    if (phoneLiteOwnsViewport() || activeView === VIEW_ALL || document.body.classList.contains('medindex-personal-view-loading')) return;\n    const total = activeView === VIEW_FAVORITES ? favorites.size : noteCount();\n    if (total) return;\n    const empty = document.createElement('div');\n    empty.id = 'registryPersonalEmpty';\n    empty.className = 'registry-personal-empty';\n    empty.innerHTML = activeView === VIEW_FAVORITES\n      ? '<strong>Ende nuk ke barna të ruajtura.</strong><span>Kliko yllin pranë një bari për ta shtuar në Favoritet.</span><button type="button" data-personal-view="all">Të gjitha barnat</button>'\n      : '<strong>Nuk ke ende shënime.</strong><span>Kliko ikonën e lapsit pranë një bari për të shtuar një shënim personal.</span><button type="button" data-personal-view="all">Të gjitha barnat</button>';\n    document.getElementById('registryContent')?.insertAdjacentElement('beforebegin', empty);\n  }`,
    `  function updateEmptyState() {\n    document.getElementById('registryPersonalEmpty')?.remove();\n    document.body.classList.remove('medindex-personal-empty-visible', 'medindex-personal-filtered-empty');\n    if (phoneLiteOwnsViewport() || activeView === VIEW_ALL || !libraryReady || document.body.classList.contains('medindex-personal-view-loading')) return;\n    const total = personalTotal();\n    const filtered = personalFilteredCount();\n    if (total > 0 && filtered !== 0) return;\n    const empty = document.createElement('div');\n    empty.id = 'registryPersonalEmpty';\n    empty.className = 'registry-personal-empty';\n    if (total > 0 && filtered === 0) {\n      empty.classList.add('is-filtered-empty');\n      document.body.classList.add('medindex-personal-filtered-empty');\n      const noun = activeView === VIEW_FAVORITES ? (total === 1 ? 'favorit' : 'favorite') : (total === 1 ? 'shënim' : 'shënime');\n      empty.innerHTML = \`<strong>Asnjë rezultat me filtrat aktualë.</strong><span>Ke \${total} \${noun} të ruajtur. Ndrysho kërkimin ose filtrat për t’i shfaqur.</span><button type="button" data-personal-view="all">Shiko të gjitha barnat</button>\`;\n    } else {\n      empty.innerHTML = activeView === VIEW_FAVORITES\n        ? '<strong>Ende nuk ke barna të ruajtura.</strong><span>Kliko yllin pranë një bari për ta shtuar në Favoritet.</span><button type="button" data-personal-view="all">Të gjitha barnat</button>'\n        : '<strong>Nuk ke ende shënime.</strong><span>Kliko ikonën e lapsit pranë një bari për të shtuar një shënim personal.</span><button type="button" data-personal-view="all">Të gjitha barnat</button>';\n    }\n    document.body.classList.add('medindex-personal-empty-visible');\n    document.getElementById('registryContent')?.insertAdjacentElement('beforebegin', empty);\n  }`,
    'true-empty versus filtered-empty state',
  );

  source = replaceOnce(
    source,
    `  function applyRuntimeView() {\n    const api = runtime();\n    if (!api) return false;\n    document.body.classList.remove('medindex-personal-view-loading');\n    if (api.setPersonalView) api.setPersonalView(activeView);\n    else {\n      api.setFavoritesOnly?.(activeView === VIEW_FAVORITES);\n      api.setNotesOnly?.(activeView === VIEW_NOTES);\n    }\n    personalRuntimeRequested = false;\n    updateViewBanner();\n    updateEmptyState();\n    return true;\n  }`,
    `  function applyRuntimeView() {\n    const api = runtime();\n    if (!api) return false;\n    if (api.setPersonalView) api.setPersonalView(activeView);\n    else {\n      api.setFavoritesOnly?.(activeView === VIEW_FAVORITES);\n      api.setNotesOnly?.(activeView === VIEW_NOTES);\n    }\n    document.body.classList.remove('medindex-personal-view-loading');\n    personalRuntimeRequested = false;\n    updateViewBanner();\n    updateEmptyState();\n    return true;\n  }`,
    'no-flash runtime handoff',
  );

  source = replaceOnce(
    source,
    `  function setView(view) {\n    activeView = [VIEW_ALL, VIEW_FAVORITES, VIEW_NOTES].includes(view) ? view : VIEW_ALL;\n    try {\n      const suffix = activeView === VIEW_FAVORITES ? '#favoritet' : activeView === VIEW_NOTES ? '#shenimet' : '';\n      history.replaceState(null, '', \`${location.pathname}\${location.search}\${suffix}\`);\n    } catch {}\n    document.getElementById('registryPersonalEmpty')?.remove();\n    updateViewNav();\n    updateViewBanner();\n    if (!applyRuntimeView()) {\n      if (activeView === VIEW_ALL) document.body.classList.remove('medindex-personal-view-loading');\n      else requestPersonalRuntime();\n    }\n    updateEmptyState();\n    schedule(2);\n  }`,
    `  function setView(view) {\n    activeView = [VIEW_ALL, VIEW_FAVORITES, VIEW_NOTES].includes(view) ? view : VIEW_ALL;\n    try {\n      const suffix = activeView === VIEW_FAVORITES ? '#favoritet' : activeView === VIEW_NOTES ? '#shenimet' : '';\n      history.replaceState(null, '', \`${location.pathname}\${location.search}\${suffix}\`);\n    } catch {}\n    document.getElementById('registryPersonalEmpty')?.remove();\n    document.body.classList.remove('medindex-personal-empty-visible', 'medindex-personal-filtered-empty');\n    if (activeView !== VIEW_ALL && !runtime()) document.body.classList.add('medindex-personal-view-loading');\n    else if (activeView === VIEW_ALL) document.body.classList.remove('medindex-personal-view-loading');\n    updateViewNav();\n    updateViewBanner();\n    if (!applyRuntimeView() && activeView !== VIEW_ALL) requestPersonalRuntime();\n    updateEmptyState();\n    schedule(2);\n  }`,
    'atomic personal-view transition',
  );

  source = replaceOnce(
    source,
    `      document.getElementById('registryPersonalEmpty')?.remove();\n      document.documentElement.dataset.registryPersonalization = 'mobile-lite-bridge';`,
    `      document.getElementById('registryPersonalEmpty')?.remove();\n      document.body.classList.remove('medindex-personal-empty-visible', 'medindex-personal-filtered-empty');\n      document.documentElement.dataset.registryPersonalization = 'mobile-lite-bridge';`,
    'mobile bridge empty-state cleanup',
  );

  source = replaceOnce(
    source,
    `    window.addEventListener('medindex:library-ready', () => schedule(1));\n    window.addEventListener('medindex:library-synced', () => {\n      pendingSync.clear();\n      schedule(1);\n    });\n    window.addEventListener('medindex:library-pending', () => schedule(1));`,
    `    window.addEventListener('medindex:library-ready', event => settleLibrary(event.detail || {}));\n    window.addEventListener('medindex:library-synced', event => {\n      libraryReady = true;\n      librarySyncState = 'synced';\n      libraryRetryAt = 0;\n      if (!favoriteInFlight.size && !noteInFlight.size) pendingSync.clear();\n      schedule(1);\n    });\n    window.addEventListener('medindex:library-pending', event => {\n      libraryReady = true;\n      librarySyncState = 'pending';\n      libraryRetryAt = Number(event.detail?.retryAt || 0) || 0;\n      schedule(1);\n    });`,
    'library sync status events',
  );

  source = replaceOnce(
    source,
    `    window.addEventListener('hashchange', () => setView(viewFromLocation()));\n\n    schedule(1);`,
    `    window.addEventListener('hashchange', () => setView(viewFromLocation()));\n\n    const libraryPromise = window.MEDINDEX_LIBRARY_READY;\n    if (libraryPromise && typeof libraryPromise.then === 'function') {\n      libraryPromise.then(detail => settleLibrary(detail || {}), () => settleLibrary({ pending:true }));\n    } else {\n      window.setTimeout(() => { if (!libraryReady) settleLibrary({ local:true }); }, 900);\n    }\n\n    schedule(1);`,
    'library readiness settlement',
  );

  source = replaceOnce(
    source,
    `    pendingSyncCount:() => pendingSync.size,\n    editNoteForData,`,
    `    pendingSyncCount:() => pendingSync.size,\n    libraryReady:() => libraryReady,\n    syncState:() => librarySyncState,\n    phase8UxVersion:PHASE8_UX_VERSION,\n    editNoteForData,`,
    'personal UX observability API',
  );

  write('registry-user-personalization.js', source);
}

function patchCss() {
  let css = read('registry-user-personalization.css');
  if (css.includes(`/* ${MARKER} */`)) return;
  css += `\n\n/* ${MARKER} */\n.registry-personal-view-banner>span{flex-wrap:wrap}\n.registry-personal-view-banner [data-personal-banner-sync]{\n  display:inline-flex;\n  align-items:center;\n  min-height:20px;\n  padding:2px 7px;\n  border-radius:999px;\n  background:#eef6f5;\n  color:#52706d;\n  font-style:normal;\n  font-size:.62rem;\n  font-weight:850;\n  white-space:nowrap;\n}\n.registry-personal-view-banner [data-personal-banner-sync][hidden]{display:none!important}\n.registry-personal-view-banner [data-personal-banner-sync][data-state="saving"],\n.registry-personal-view-banner [data-personal-banner-sync][data-state="loading"]{background:#eff6ff;color:#1d4ed8}\n.registry-personal-view-banner [data-personal-banner-sync][data-state="pending"]{background:#fff7ed;color:#b45309}\n.registry-personal-view-banner [data-personal-banner-sync][data-state="synced"]{background:#ecfdf5;color:#047857}\n.registry-personal-empty.is-filtered-empty{border-style:solid;background:#f8fafc}\nbody.medindex-personal-empty-visible #dataTable,\nbody.medindex-personal-empty-visible #pagination{display:none!important}\nbody.medindex-personal-view-loading #registryContent{position:relative;min-height:150px}\nbody.medindex-personal-view-loading #registryContent #tbody{visibility:hidden!important}\nbody.medindex-personal-view-loading #registryContent::after{\n  content:"Duke përgatitur pamjen personale…";\n  position:absolute;\n  inset:18px 12px auto;\n  min-height:92px;\n  display:grid;\n  place-items:center;\n  border:1px dashed #cbd5e1;\n  border-radius:12px;\n  background:linear-gradient(100deg,#f8fafc 20%,#eef5f5 50%,#f8fafc 80%);\n  background-size:220% 100%;\n  color:#64748b;\n  font-size:.76rem;\n  font-weight:800;\n  animation:miPersonalLoading 1.35s linear infinite;\n}\n@keyframes miPersonalLoading{to{background-position:-220% 0}}\nhtml[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync]{background:#1d2b2d;color:#b7c8c8}\nhtml[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync][data-state="saving"],\nhtml[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync][data-state="loading"]{background:#172554;color:#bfdbfe}\nhtml[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync][data-state="pending"]{background:#3b2a16;color:#fdba74}\nhtml[data-theme="dark"] .registry-personal-view-banner [data-personal-banner-sync][data-state="synced"]{background:#12342a;color:#86efac}\nhtml[data-theme="dark"] .registry-personal-empty.is-filtered-empty{background:#131d20}\nhtml[data-theme="dark"] body.medindex-personal-view-loading #registryContent::after{background:linear-gradient(100deg,#121b1d 20%,#1b2a2d 50%,#121b1d 80%);background-size:220% 100%;border-color:#344749;color:#aebfc1}\n@media(max-width:767px){\n  .registry-personal-view-banner [data-personal-banner-sync]{white-space:normal}\n}\n@media(prefers-reduced-motion:reduce){\n  body.medindex-personal-view-loading #registryContent::after{animation:none}\n}\n`;
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
  if (!ui.includes(`const PHASE8_UX_VERSION = '${MARKER}';`)) throw new Error('Phase 8 personal UX controller marker missing.');
  if (!ui.includes("let librarySyncState = 'loading';") || !ui.includes('function settleLibrary(detail = {})')) throw new Error('Phase 8 library readiness state machine missing.');
  if (!ui.includes('personalFilteredCount()') || !ui.includes('medindex-personal-filtered-empty')) throw new Error('Phase 8 filtered-empty distinction missing.');
  if (!ui.includes("librarySyncState = 'saving'") || !ui.includes("librarySyncState = 'pending'") || !ui.includes("librarySyncState = 'synced'")) throw new Error('Phase 8 saving/pending/synced states missing.');
  if (!ui.includes('[data-mi-phase8-favorite-count]') || !ui.includes('[data-mi-phase8-note-count]')) throw new Error('Phase 8 count surfaces are not unified.');
  if (!ui.includes("if (api.setPersonalView) api.setPersonalView(activeView);") || ui.indexOf("document.body.classList.remove('medindex-personal-view-loading');", ui.indexOf('function applyRuntimeView')) < ui.indexOf("if (api.setPersonalView) api.setPersonalView(activeView);", ui.indexOf('function applyRuntimeView'))) throw new Error('Phase 8 runtime handoff can still expose stale rows.');
  if (!css.includes(`/* ${MARKER} */`) || !css.includes('medindex-personal-view-loading #registryContent #tbody') || !css.includes('[data-personal-banner-sync][data-state="pending"]')) throw new Error('Phase 8 visual state contract missing.');
  if (!html.includes(`registry-user-personalization.css?v=`) || !html.includes(`&ux=${ASSET_VERSION}`)) throw new Error('Phase 8 personalization assets are not cache-busted.');
  console.log('Phase 8 personal UX polish passed: no stale-row flash, true/filtered empty states, unified counts and saving/pending/synced feedback are active.');
}

patchController();
patchCss();
patchIndex();
audit();
