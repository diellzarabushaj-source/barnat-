'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

const JS_MARKER = "window[INSTANCE] = { version:'registry-search-suggest-v3' };";
const CSS_MARKER = 'Registry Search Premium v3';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Premium registry search could not find ${label}.`);
  return source.replace(before, after);
}

function patchSuggestRuntime() {
  const file = 'registry-search-suggest.js';
  let source = read(file);

  source = replaceOnce(
    source,
    "window[INSTANCE] = { version:'registry-search-suggest-v2' };",
    JS_MARKER,
    'search runtime version',
  );

  source = replaceOnce(
    source,
    "  const DEBOUNCE_MS = 36;\n  const REMOTE_CACHE_LIMIT = 64;",
    "  const DEBOUNCE_MS = 32;\n  const PROSE_MIN_CHARS = 3;\n  const IDLE_WARM_TIMEOUT = 1400;\n  const REMOTE_CACHE_LIMIT = 64;",
    'search timing constants',
  );

  source = replaceOnce(
    source,
    "  const state = {\n    terms:null, prose:null, open:false, active:-1, items:[], query:'',\n    remoteCache:new Map(), requestSeq:0, controller:null,\n  };\n  let elements = null;\n  let timer = 0;",
    "  const state = {\n    terms:null, termsSource:null, prose:null, proseSource:null, open:false, active:-1, items:[], query:'',\n    remoteCache:new Map(), requestSeq:0, controller:null,\n  };\n  let elements = null;\n  let timer = 0;\n  let warmHandle = 0;\n\n  function scheduleIndexWarmup() {\n    if (warmHandle) return;\n    const run = () => {\n      warmHandle = 0;\n      if (!rows().length) return;\n      buildTerms();\n      if (rows().length >= 300) buildProse();\n    };\n    if (typeof requestIdleCallback === 'function') {\n      warmHandle = requestIdleCallback(run, { timeout:IDLE_WARM_TIMEOUT });\n    } else {\n      warmHandle = setTimeout(run, 240);\n    }\n  }",
    'search state and idle warmup',
  );

  source = replaceOnce(
    source,
    "  function buildTerms() {\n    if (state.terms) return state.terms;\n    const collect = field => {\n      const seen = new Map();\n      rows().forEach(row => {",
    "  function buildTerms() {\n    const sourceRows = rows();\n    if (state.terms && state.termsSource === sourceRows) return state.terms;\n    state.termsSource = sourceRows;\n    state.terms = null;\n    state.prose = null;\n    state.proseSource = null;\n    const collect = field => {\n      const seen = new Map();\n      sourceRows.forEach(row => {",
    'identity index source tracking',
  );

  source = replaceOnce(
    source,
    "  function buildProse() {\n    if (state.prose) return state.prose;\n    state.prose = rows().map(row => ({",
    "  function buildProse() {\n    const sourceRows = rows();\n    if (state.prose && state.proseSource === sourceRows) return state.prose;\n    state.proseSource = sourceRows;\n    state.prose = sourceRows.map(row => ({",
    'prose index source tracking',
  );

  source = replaceOnce(
    source,
    "    const seen = new Set();\n    for (const item of buildProse()) {\n      if (out.filter(entry => entry.group === 'use').length >= PER_GROUP) break;\n      if (!item.folded.includes(needle) || seen.has(item.name)) continue;\n      if (normalize(item.name).includes(needle)) continue;\n      seen.add(item.name);\n      out.push({\n        group:'use', term:item.name, primary:item.name,\n        snippet:snippet(item.source, item.folded, needle),\n      });\n    }\n    return out;",
    "    if (needle.length >= PROSE_MIN_CHARS) {\n      const seen = new Set();\n      for (const item of buildProse()) {\n        if (out.filter(entry => entry.group === 'use').length >= PER_GROUP) break;\n        if (!item.folded.includes(needle) || seen.has(item.name)) continue;\n        if (normalize(item.name).includes(needle)) continue;\n        seen.add(item.name);\n        out.push({\n          group:'use', term:item.name, primary:item.name,\n          snippet:snippet(item.source, item.folded, needle),\n        });\n      }\n    }\n    return out;",
    'deferred indication matching',
  );

  source = replaceOnce(
    source,
    "class=\"rss-item\" data-rss-index=\"${index}\"",
    "class=\"rss-item rss-item-${item.group}${item.fuzzy ? ' is-fuzzy' : ''}\" data-rss-group=\"${item.group}\" data-rss-index=\"${index}\"",
    'semantic suggestion row classes',
  );

  source = replaceOnce(
    source,
    "    panel.innerHTML = '<ul class=\"rss-list\" role=\"listbox\" aria-label=\"Sugjerime kërkimi\"></ul>';",
    "    panel.innerHTML = '<div class=\"rss-topline\" role=\"presentation\"><span>Rezultate të shpejta</span><span class=\"rss-speed\">Regjistri MedIndex</span></div><ul class=\"rss-list\" role=\"listbox\" aria-label=\"Sugjerime kërkimi\"></ul><div class=\"rss-footer\" aria-hidden=\"true\"><span><kbd>↑</kbd><kbd>↓</kbd> navigo</span><span><kbd>Enter</kbd> hap</span><span><kbd>Esc</kbd> mbyll</span></div>';",
    'premium suggestion panel chrome',
  );

  source = replaceOnce(
    source,
    "    input.setAttribute('aria-controls', 'registrySearchSuggest');",
    "    input.setAttribute('aria-controls', 'registrySearchSuggest');\n    input.setAttribute('aria-keyshortcuts', 'Control+K Meta+K /');\n    input.setAttribute('spellcheck', 'false');\n    input.setAttribute('autocapitalize', 'none');\n    input.setAttribute('enterkeyhint', 'search');\n    scheduleIndexWarmup();\n    ['medindex:registry-ready', 'medindex:registry-page-ready', 'medindex:registry-rendered']\n      .forEach(name => window.addEventListener(name, scheduleIndexWarmup));",
    'search input accessibility and warmup hooks',
  );

  const oldInputHandler = `    input.addEventListener('input', () => {\n      state.query = input.value;\n      clearTimeout(timer);\n      abortRemote();\n      const queuedSeq = state.requestSeq;\n      timer = setTimeout(() => {\n        const query = state.query;\n        if (normalize(query).length < MIN_CHARS) return close();\n\n        const localItems = suggest(query);\n        if (localItems.length) render(localItems, query);\n        else close();\n\n        const controller = typeof AbortController === 'function' ? new AbortController() : null;\n        const signal = controller?.signal || { aborted:false };\n        state.controller = controller;\n        const seq = queuedSeq;\n        void enrichFromRemote(query, localItems, seq, signal);\n      }, DEBOUNCE_MS);\n    });`;

  const newInputHandler = `    input.addEventListener('input', () => {\n      state.query = input.value;\n      clearTimeout(timer);\n      abortRemote();\n\n      const query = state.query;\n      if (normalize(query).length < MIN_CHARS) return close();\n\n      // Local identity suggestions paint synchronously. Network enrichment is\n      // intentionally delayed and abortable, so a slow request never blocks typing.\n      const localItems = suggest(query);\n      if (localItems.length) render(localItems, query);\n      else close();\n\n      const queuedSeq = state.requestSeq;\n      timer = setTimeout(() => {\n        if (normalize(state.query) !== normalize(query)) return;\n        const controller = typeof AbortController === 'function' ? new AbortController() : null;\n        const signal = controller?.signal || { aborted:false };\n        state.controller = controller;\n        void enrichFromRemote(query, localItems, queuedSeq, signal);\n      }, DEBOUNCE_MS);\n    });`;

  source = replaceOnce(source, oldInputHandler, newInputHandler, 'immediate local suggestion path');

  write(file, source);
}

function patchIndex() {
  const file = 'index.html';
  let source = read(file);
  source = source
    .replace(/registry-search-suggest\.css\?v=[^\"&]+/g, 'registry-search-suggest.css?v=search-premium-v3')
    .replace(/registry-search-suggest\.js\?v=[^\"&]+/g, 'registry-search-suggest.js?v=search-premium-v3');

  source = source.replace(
    'placeholder="Kërko emrin, substancën, klasën, përdorimin, ATC..." autocomplete="off" enterkeyhint="search"',
    'placeholder="Kërko bar, substancë, ATC ose indikacion…" autocomplete="off" spellcheck="false" autocapitalize="none" enterkeyhint="search"',
  );

  if (!source.includes('registry-search-suggest.js?v=search-premium-v3')) {
    throw new Error('Premium search JavaScript cache-bust is missing.');
  }
  write(file, source);
}

function patchPremiumStyles() {
  const file = 'registry-table-tools.css';
  let source = read(file);
  if (source.includes(CSS_MARKER)) return;

  source += `\n\n/* ${CSS_MARKER}\n   Search is the primary command surface: high-contrast focus, calm chrome and\n   a fast suggestion overlay without increasing toolbar height. */\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #search {\n  min-height:46px!important;\n  height:46px!important;\n  padding-inline:16px 44px!important;\n  border:1px solid #cfdde4!important;\n  border-radius:14px!important;\n  background:#fff!important;\n  color:#102a2d!important;\n  caret-color:#147d77!important;\n  font-family:Inter,var(--mi-font-sans,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif)!important;\n  font-size:14px!important;\n  font-weight:500!important;\n  letter-spacing:-.006em!important;\n  box-shadow:0 1px 2px rgba(15,23,42,.025),inset 0 1px 0 rgba(255,255,255,.72)!important;\n  outline:none!important;\n  transition:border-color .14s ease,box-shadow .14s ease,background-color .14s ease!important;\n}\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #search::placeholder {color:#8b9ba4!important;font-weight:450!important}\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #search:hover {border-color:#afc8cd!important}\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #search:focus,\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #search[aria-expanded="true"] {\n  border-color:#168c86!important;\n  background:#fff!important;\n  box-shadow:0 0 0 4px rgba(22,140,134,.105),0 8px 24px rgba(15,98,102,.055)!important;\n}\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #search::-webkit-search-cancel-button {cursor:pointer}\n\nhtml[data-mi-page="barnat"] body .rss-panel {\n  overflow:hidden!important;\n  border:1px solid #d3e1e3!important;\n  border-radius:18px!important;\n  background:rgba(255,255,255,.985)!important;\n  box-shadow:0 24px 70px rgba(15,23,42,.17),0 4px 16px rgba(15,98,102,.06)!important;\n  font-family:Inter,var(--mi-font-sans,ui-sans-serif,system-ui,sans-serif)!important;\n  transform-origin:top center;\n}\nhtml[data-mi-page="barnat"] body .rss-panel:not([hidden]) {animation:rss-premium-in .13s ease-out}\nhtml[data-mi-page="barnat"] body .rss-topline {\n  display:flex;align-items:center;justify-content:space-between;gap:12px;\n  min-height:38px;padding:0 13px;border-bottom:1px solid #e8eeee;background:#fbfdfd;\n  color:#476164;font-size:11px;font-weight:700;letter-spacing:.015em;\n}\nhtml[data-mi-page="barnat"] body .rss-speed {\n  display:inline-flex;align-items:center;gap:6px;color:#718689;font-size:10.5px;font-weight:600;\n}\nhtml[data-mi-page="barnat"] body .rss-speed::before {\n  content:"";width:6px;height:6px;border-radius:999px;background:#25a89f;box-shadow:0 0 0 3px rgba(37,168,159,.11);\n}\nhtml[data-mi-page="barnat"] body .rss-list {\n  max-height:min(52vh,440px);overflow:auto;padding:6px;margin:0;scrollbar-width:thin;scrollbar-color:#c7d7d8 transparent;\n}\nhtml[data-mi-page="barnat"] body .rss-head {\n  position:relative;padding:9px 8px 5px;color:#809194;font-size:9.5px;font-weight:800;letter-spacing:.105em;\n}\nhtml[data-mi-page="barnat"] body .rss-item {\n  position:relative;display:grid!important;grid-template-columns:minmax(0,1fr) 18px;gap:2px 10px;\n  margin:1px 0;padding:9px 11px!important;border:1px solid transparent;border-radius:11px;\n  background:transparent;transition:background-color .1s ease,border-color .1s ease,transform .1s ease;\n}\nhtml[data-mi-page="barnat"] body .rss-item::after {\n  content:"›";grid-column:2;grid-row:1 / span 3;align-self:center;justify-self:center;color:#9aabad;font-size:19px;font-weight:400;\n}\nhtml[data-mi-page="barnat"] body .rss-item:hover,\nhtml[data-mi-page="barnat"] body .rss-item[aria-selected="true"] {\n  border-color:#d2e9e6!important;background:#f0f9f7!important;box-shadow:none!important;\n}\nhtml[data-mi-page="barnat"] body .rss-item[aria-selected="true"] {border-color:#b9ded9!important;transform:translateY(-1px)}\nhtml[data-mi-page="barnat"] body .rss-item[aria-selected="true"]::after {color:#147d77}\nhtml[data-mi-page="barnat"] body .rss-primary,\nhtml[data-mi-page="barnat"] body .rss-secondary,\nhtml[data-mi-page="barnat"] body .rss-snippet {grid-column:1;min-width:0}\nhtml[data-mi-page="barnat"] body .rss-primary {color:#143235!important;font-size:13.5px!important;font-weight:680!important;letter-spacing:-.01em}\nhtml[data-mi-page="barnat"] body .rss-secondary {color:#657b7e!important;font-size:11.5px!important;line-height:1.35}\nhtml[data-mi-page="barnat"] body .rss-snippet {\n  display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;color:#718487!important;font-size:11.25px!important;line-height:1.4!important;\n}\nhtml[data-mi-page="barnat"] body .rss-primary mark,\nhtml[data-mi-page="barnat"] body .rss-snippet mark {\n  padding:0 2px!important;border-radius:3px!important;background:#dff5f1!important;color:#0f6863!important;font-weight:750!important;\n}\nhtml[data-mi-page="barnat"] body .rss-item.is-fuzzy .rss-secondary::before {content:"Sugjerim · ";color:#9a6a21;font-weight:700}\nhtml[data-mi-page="barnat"] body .rss-footer {\n  display:flex;align-items:center;justify-content:flex-end;gap:14px;min-height:34px;padding:0 12px;\n  border-top:1px solid #e8eeee;background:#fbfdfd;color:#7a8b8e;font-size:10px;font-weight:600;\n}\nhtml[data-mi-page="barnat"] body .rss-footer span {display:inline-flex;align-items:center;gap:4px}\nhtml[data-mi-page="barnat"] body .rss-footer kbd {\n  display:inline-grid;min-width:20px;height:20px;place-items:center;padding:0 5px;border:1px solid #d5e0e1;border-bottom-color:#c3d1d2;\n  border-radius:6px;background:#fff;color:#53676a;font:600 9px/1 Inter,ui-sans-serif,system-ui,sans-serif;box-shadow:0 1px 0 rgba(15,23,42,.04);\n}\n\n@keyframes rss-premium-in {from{opacity:0;transform:translateY(-4px) scale(.995)}to{opacity:1;transform:none}}\n\nhtml[data-theme="dark"].medindex-tailadmin[data-mi-page="barnat"] body #search,\nhtml.dark.medindex-tailadmin[data-mi-page="barnat"] body #search {\n  border-color:#34494b!important;background:#111d1f!important;color:#edf5f4!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.02)!important;\n}\nhtml[data-theme="dark"].medindex-tailadmin[data-mi-page="barnat"] body #search:focus,\nhtml.dark.medindex-tailadmin[data-mi-page="barnat"] body #search:focus {\n  border-color:#3eb4aa!important;box-shadow:0 0 0 4px rgba(62,180,170,.12)!important;\n}\nhtml[data-theme="dark"][data-mi-page="barnat"] body .rss-panel,\nhtml.dark[data-mi-page="barnat"] body .rss-panel {border-color:#314649!important;background:#111d1f!important;box-shadow:0 26px 70px rgba(0,0,0,.38)!important}\nhtml[data-theme="dark"][data-mi-page="barnat"] body :is(.rss-topline,.rss-footer),\nhtml.dark[data-mi-page="barnat"] body :is(.rss-topline,.rss-footer) {border-color:#2a3d3f!important;background:#152325!important;color:#9fb1b3!important}\nhtml[data-theme="dark"][data-mi-page="barnat"] body .rss-item:hover,\nhtml[data-theme="dark"][data-mi-page="barnat"] body .rss-item[aria-selected="true"],\nhtml.dark[data-mi-page="barnat"] body .rss-item:hover,\nhtml.dark[data-mi-page="barnat"] body .rss-item[aria-selected="true"] {border-color:#285852!important;background:#17312e!important}\nhtml[data-theme="dark"][data-mi-page="barnat"] body .rss-primary,html.dark[data-mi-page="barnat"] body .rss-primary {color:#edf5f4!important}\nhtml[data-theme="dark"][data-mi-page="barnat"] body .rss-secondary,\nhtml[data-theme="dark"][data-mi-page="barnat"] body .rss-snippet,\nhtml.dark[data-mi-page="barnat"] body .rss-secondary,\nhtml.dark[data-mi-page="barnat"] body .rss-snippet {color:#a8babb!important}\n\n@media(max-width:640px){\n  html.medindex-tailadmin[data-mi-page="barnat"] body #search {min-height:44px!important;height:44px!important;border-radius:12px!important;font-size:16px!important}\n  html[data-mi-page="barnat"] body .rss-panel {border-radius:16px!important}\n  html[data-mi-page="barnat"] body .rss-list {max-height:43dvh;padding:5px}\n  html[data-mi-page="barnat"] body .rss-item {padding:11px!important;border-radius:10px}\n  html[data-mi-page="barnat"] body .rss-footer {justify-content:center;gap:9px}\n  html[data-mi-page="barnat"] body .rss-footer span:nth-child(2) {display:none}\n}\n\n@media(prefers-reduced-motion:reduce){html[data-mi-page="barnat"] body .rss-panel:not([hidden]){animation:none!important}html[data-mi-page="barnat"] body .rss-item{transition:none!important}}\n`;

  write(file, source);
}

function verify() {
  const runtime = read('registry-search-suggest.js');
  const css = read('registry-table-tools.css');
  const html = read('index.html');

  if (!runtime.includes(JS_MARKER)) throw new Error('Premium search runtime version is missing.');
  if (!runtime.includes('PROSE_MIN_CHARS = 3')) throw new Error('Short-query prose guard is missing.');
  if (!runtime.includes("typeof requestIdleCallback === 'function'")) throw new Error('Idle search index warmup is missing.');
  if (!runtime.includes('state.termsSource === sourceRows')) throw new Error('Search identity index can go stale across dataset swaps.');
  if (!runtime.includes('state.proseSource === sourceRows')) throw new Error('Search prose index can go stale across dataset swaps.');
  if (!runtime.includes('Local identity suggestions paint synchronously')) throw new Error('Local autocomplete is still blocked behind debounce.');
  if (!runtime.includes('rss-topline') || !runtime.includes('rss-footer')) throw new Error('Premium suggestion panel chrome is missing.');
  if (!runtime.includes("aria-keyshortcuts', 'Control+K Meta+K /")) throw new Error('Search keyboard discoverability is missing.');
  if (!css.includes(CSS_MARKER)) throw new Error('Premium search visual layer is missing.');
  if (!css.includes('#search[aria-expanded="true"]')) throw new Error('Search open-state styling is missing.');
  if (!css.includes('.rss-item[aria-selected="true"]')) throw new Error('Keyboard-selected suggestion state is missing.');
  if (!html.includes('registry-search-suggest.js?v=search-premium-v3')) throw new Error('Premium search asset cache-bust is missing.');
  if (/gemini|openai|anthropic/i.test(runtime)) throw new Error('Registry search hot path must stay deterministic and AI-free.');
}

patchSuggestRuntime();
patchIndex();
patchPremiumStyles();
verify();
console.log('Registry search premium v3 passed: immediate local suggestions, idle-warmed indexes, stale-safe dataset swaps, sophisticated keyboard UI and AI-free hot path.');
