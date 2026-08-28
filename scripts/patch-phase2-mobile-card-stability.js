'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const cssFile = path.join(ROOT, 'registry-table-tools.css');
const phase8JsFile = path.join(ROOT, 'registry-mobile-phase8.js');
const jsFile = path.join(ROOT, 'registry-mobile-lite.js');
let css = fs.readFileSync(cssFile, 'utf8').replace(/\r\n?/g, '\n');
let phase8Js = fs.readFileSync(phase8JsFile, 'utf8').replace(/\r\n?/g, '\n');
let js = fs.readFileSync(jsFile, 'utf8').replace(/\r\n?/g, '\n');

const oldCard = `  html[data-registry-mobile-lite] #tbody .mobile-lite-card{\n    position:relative;\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:none!important;\n    box-sizing:border-box!important;\n  }`;

const stableCard = `  html[data-registry-mobile-lite] #tbody .mobile-lite-card{\n    position:relative;\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:none!important;\n    min-height:108px!important;\n    box-sizing:border-box!important;\n  }`;

if (!css.includes(stableCard)) {
  if (!css.includes(oldCard)) throw new Error('Phase 2 stable-card patch could not find the Phase 8 card block.');
  css = css.replace(oldCard, stableCard);
}

const rowFlowMarker = '/* MedIndex revised Phase 4: mobile card list owns vertical flow */';
if (!css.includes(rowFlowMarker)) {
  css += `\n\n${rowFlowMarker}\n@media (max-width:767px){\n  html.medindex-tailadmin[data-mi-page=\"barnat\"][data-registry-mobile-lite] body #dataTable[data-registry-unified-table]{\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:100%!important;\n    height:auto!important;\n    table-layout:auto!important;\n  }\n  html.medindex-tailadmin[data-mi-page=\"barnat\"][data-registry-mobile-lite] body #dataTable[data-registry-unified-table] #tbody{\n    display:flex!important;\n    flex-direction:column!important;\n    align-items:stretch!important;\n    gap:8px!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:100%!important;\n    height:auto!important;\n    min-height:0!important;\n    max-height:none!important;\n    padding:4px 0 8px!important;\n    overflow:visible!important;\n  }\n  html.medindex-tailadmin[data-mi-page=\"barnat\"][data-registry-mobile-lite] body #dataTable[data-registry-unified-table] #tbody>.mobile-lite-row{\n    display:block!important;\n    position:relative!important;\n    inset:auto!important;\n    float:none!important;\n    flex:0 0 auto!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:100%!important;\n    height:auto!important;\n    min-height:0!important;\n    max-height:none!important;\n    margin:0!important;\n    padding:0!important;\n    overflow:visible!important;\n    contain:none!important;\n    transform:none!important;\n  }\n  html.medindex-tailadmin[data-mi-page=\"barnat\"][data-registry-mobile-lite] body #dataTable[data-registry-unified-table] #tbody>.mobile-lite-row>td:has(.mobile-lite-card){\n    display:block!important;\n    position:static!important;\n    inset:auto!important;\n    float:none!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:100%!important;\n    height:auto!important;\n    min-height:0!important;\n    max-height:none!important;\n    margin:0!important;\n    padding:0!important;\n    overflow:visible!important;\n    contain:none!important;\n    transform:none!important;\n    box-sizing:border-box!important;\n  }\n  html.medindex-tailadmin[data-mi-page=\"barnat\"][data-registry-mobile-lite] body #dataTable[data-registry-unified-table] #tbody>.mobile-lite-row .mobile-lite-card{\n    position:relative!important;\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:100%!important;\n    height:auto!important;\n    min-height:108px!important;\n    margin:0!important;\n    box-sizing:border-box!important;\n  }\n}\n`;
}

const oldScrollOwner = `  function resolveDetailScrollOwner() {
    const main = document.querySelector('.mi-main');
    if (main) {
      const style = getComputedStyle(main);
      if (/(auto|scroll|overlay)/.test(style.overflowY) || main.scrollHeight > main.clientHeight) return main;
    }
    return document.scrollingElement || document.documentElement;
  }`;

const stableScrollOwner = `  function resolveDetailScrollOwner() {
    const main = document.querySelector('.mi-main');
    if (main) return main;
    return document.scrollingElement || document.documentElement;
  }`;

if (!js.includes(stableScrollOwner)) {
  if (!js.includes(oldScrollOwner)) throw new Error('Phase 3 could not find the mobile detail scroll-owner resolver.');
  js = js.replace(oldScrollOwner, stableScrollOwner);
}

const oldRestore = `    if (session?.trigger?.isConnected) session.trigger.setAttribute('aria-expanded', 'false');
    if (session?.scrollOwner) {
      restoreDetailScrollOwner(session.scrollOwner, session.scrollOwnerStyle);
      setOwnerScrollTop(session.scrollOwner, session.scrollTop);
      requestAnimationFrame(() => setOwnerScrollTop(session.scrollOwner, session.scrollTop));
    }
    if (options.restoreFocus !== false && session?.trigger?.isConnected) {
      requestAnimationFrame(() => session.trigger.focus({ preventScroll:true }));
    }`;

const stableRestore = `    if (session?.trigger?.isConnected) session.trigger.setAttribute('aria-expanded', 'false');
    if (session?.scrollOwner) {
      restoreDetailScrollOwner(session.scrollOwner, session.scrollOwnerStyle);
      setOwnerScrollTop(session.scrollOwner, session.scrollTop);
    }
    if (options.restoreFocus !== false && session?.trigger?.isConnected) {
      requestAnimationFrame(() => {
        session.trigger.focus({ preventScroll:true });
        if (session.scrollOwner) setOwnerScrollTop(session.scrollOwner, session.scrollTop);
        requestAnimationFrame(() => {
          if (session.scrollOwner) setOwnerScrollTop(session.scrollOwner, session.scrollTop);
        });
      });
    } else if (session?.scrollOwner) {
      requestAnimationFrame(() => setOwnerScrollTop(session.scrollOwner, session.scrollTop));
    }`;

if (!js.includes(stableRestore)) {
  if (!js.includes(oldRestore)) throw new Error('Phase 3 detail stability patch could not find the scroll/focus restore block.');
  js = js.replace(oldRestore, stableRestore);
}

const perControlDetailListeners = `    tbody.querySelectorAll('[data-mobile-lite-detail]').forEach(control => {
      control.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void openDetail(control.dataset.mobileLiteDetail, control);
      });
    });`;

if (js.includes(perControlDetailListeners)) {
  js = js.replace(perControlDetailListeners, '');
}

if (!js.includes('function onMobileLiteDetailClick(event)')) {
  const renderRowsAnchor = `  function renderRows(rows) {`;
  if (!js.includes(renderRowsAnchor)) throw new Error('Phase 2 mobile detail delegation could not find renderRows.');
  js = js.replace(
    renderRowsAnchor,
    `  function onMobileLiteDetailClick(event) {\n    const control = event.target.closest?.('[data-mobile-lite-detail]');\n    const tbody = document.getElementById('tbody');\n    if (!control || !tbody?.contains(control)) return;\n    event.preventDefault();\n    event.stopPropagation();\n    void openDetail(control.dataset.mobileLiteDetail, control);\n  }\n\n${renderRowsAnchor}`,
  );
}

if (!js.includes("document.getElementById('tbody')?.addEventListener('click', onMobileLiteDetailClick);")) {
  const controlsAnchor = `  function configureMobileControls() {\n    const pageSize = document.getElementById('pageSize');`;
  if (!js.includes(controlsAnchor)) throw new Error('Phase 2 mobile detail delegation could not find control setup.');
  js = js.replace(
    controlsAnchor,
    `  function configureMobileControls() {\n    document.getElementById('tbody')?.addEventListener('click', onMobileLiteDetailClick);\n    const pageSize = document.getElementById('pageSize');`,
  );
}

const decoratorAnchor = `      const row = rowForCard(card);\n      if (!row) return;\n      let button = card.querySelector('[data-mi-mobile-favorite]');`;
const explicitDecoratorAnchor = `      const row = rowForCard(card);\n      if (!row) return;\n      let summary = card.querySelector('.mobile-lite-open');\n      if (summary?.tagName === 'BUTTON') {`;
if (!phase8Js.includes(explicitDecoratorAnchor)) {
  if (!phase8Js.includes(decoratorAnchor)) throw new Error('Phase 2 could not find the Phase 8 card decorator anchor.');
  phase8Js = phase8Js.replace(
    decoratorAnchor,
    `      const row = rowForCard(card);\n      if (!row) return;\n\n      // Card v2 has one explicit detail action only. Mobile-lite delegates the\n      // detail click at tbody, so moving Më shumë preserves behavior without\n      // creating or retaining a second per-card detail listener.\n      let summary = card.querySelector('.mobile-lite-open');\n      if (summary?.tagName === 'BUTTON') {\n        const passiveSummary = document.createElement('div');\n        passiveSummary.className = summary.className;\n        passiveSummary.innerHTML = summary.innerHTML;\n        passiveSummary.setAttribute('aria-label', clean(row.tradeName) || 'Përmbledhja e barit');\n        summary.replaceWith(passiveSummary);\n        summary = passiveSummary;\n      }\n\n      let actions = card.querySelector('.mobile-lite-actions');\n      if (!actions) {\n        actions = document.createElement('div');\n        actions.className = 'mobile-lite-actions';\n        actions.dataset.mobileLiteActions = 'true';\n        const more = card.querySelector('.mobile-lite-more');\n        if (more) actions.appendChild(more);\n        card.appendChild(actions);\n      }\n\n      let button = actions.querySelector('[data-mi-mobile-favorite]');`,
  );

  const oldAppend = `        card.appendChild(button);`;
  const newAppend = `        actions.insertBefore(button, actions.firstChild);`;
  if (!phase8Js.includes(oldAppend)) throw new Error('Phase 2 could not find the Phase 8 favorite append point.');
  phase8Js = phase8Js.replace(oldAppend, newAppend);

  const activeAnchor = `      const active = isFavorite(row, favorites);`;
  if (!phase8Js.includes(activeAnchor)) throw new Error('Phase 2 could not find the Phase 8 favorite state anchor.');
  phase8Js = phase8Js.replace(
    activeAnchor,
    `      if (button.parentElement !== actions) actions.insertBefore(button, actions.firstChild);\n      const active = isFavorite(row, favorites);`,
  );
}

const legacyActionComment = `  /* Favorite and detail action get separate 44px touch slots. The content\n     reserves the rail width, so neither control can overlap text or the other\n     action even on narrow iPhones. */`;
const darkThemeAnchor = `  [data-theme=\"dark\"] .mi-registry-personalization-bar button,`;
const explicitActionMarker = '/* MedIndex revised Phase 2: explicit mobile card action region */';
if (!css.includes(explicitActionMarker)) {
  const legacyStart = css.indexOf(legacyActionComment);
  const legacyEnd = css.indexOf(darkThemeAnchor, legacyStart);
  if (legacyStart < 0 || legacyEnd < 0) throw new Error('Phase 2 could not isolate the legacy absolute card action rail.');
  css = css.slice(0, legacyStart) + css.slice(legacyEnd);
  css += `\n\n${explicitActionMarker}\n@media (max-width:767px){\n  html.medindex-tailadmin[data-mi-page=\"barnat\"][data-registry-mobile-lite][data-registry-mobile-phase8] body #dataTable[data-registry-unified-table] #tbody>.mobile-lite-row .mobile-lite-card:has(.mobile-lite-actions){\n    display:grid!important;\n    grid-template-columns:minmax(0,1fr) auto!important;\n    align-items:center!important;\n    gap:8px!important;\n    min-height:108px!important;\n    padding:10px 10px 10px 13px!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-card:has(.mobile-lite-actions) .mobile-lite-open{\n    display:flex!important;\n    min-width:0!important;\n    min-height:58px!important;\n    width:100%!important;\n    padding:0!important;\n    pointer-events:none!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-actions{\n    display:grid!important;\n    grid-template-columns:44px 78px!important;\n    align-items:center!important;\n    gap:6px!important;\n    min-width:128px!important;\n    margin:0!important;\n    padding:0!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-actions .mi-mobile-favorite-toggle{\n    position:static!important;\n    inset:auto!important;\n    width:44px!important;\n    height:44px!important;\n    margin:0!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase8] #tbody .mobile-lite-actions .mobile-lite-more{\n    position:static!important;\n    inset:auto!important;\n    width:78px!important;\n    min-width:78px!important;\n    min-height:44px!important;\n    margin:0!important;\n    padding:0 10px!important;\n  }\n}\n`;
}

const narrowPhoneCardMarker = '/* MedIndex revised Phase 2: compact narrow-phone card spacing */';
if (!css.includes(narrowPhoneCardMarker)) {
  css += `\n\n${narrowPhoneCardMarker}\n@media (max-width:340px){\n  html.medindex-tailadmin[data-mi-page=\"barnat\"][data-registry-mobile-lite][data-registry-mobile-phase8] body #dataTable[data-registry-unified-table] #tbody>.mobile-lite-row .mobile-lite-card:has(.mobile-lite-actions){\n    padding-top:4px!important;\n    padding-bottom:4px!important;\n  }\n}\n`;
}

const shellClearanceMarker = '/* MedIndex revised Phase 4: fixed-nav end-of-list clearance */';
if (!css.includes(shellClearanceMarker)) {
  css += `\n\n${shellClearanceMarker}\n@media (max-width:767px){\n  html[data-registry-mobile-lite][data-registry-mobile-phase3]{\n    --mi-registry-bottom-nav-clearance:calc(80px + env(safe-area-inset-bottom));\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase3] .mi-main{\n    scroll-padding-bottom:var(--mi-registry-bottom-nav-clearance)!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase3] #pagination{\n    margin-bottom:var(--mi-registry-bottom-nav-clearance)!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase3][data-mi-keyboard-open=\"true\"] #pagination{\n    margin-bottom:calc(18px + env(safe-area-inset-bottom))!important;\n  }\n}\n`;
}

if (!css.includes('min-height:108px!important')) throw new Error('Phase 2 stable card reserve is missing.');
if (!css.includes('.mobile-lite-card:has(.mobile-lite-actions){')) {
  throw new Error('Phase 2 explicit card action-region contract is missing.');
}
if (!css.includes('.mobile-lite-actions .mobile-lite-more{')) {
  throw new Error('Phase 2 detail action slot contract is missing.');
}
if (!css.includes(narrowPhoneCardMarker) || !css.includes('padding-top:4px!important;') || !css.includes('padding-bottom:4px!important;')) {
  throw new Error('Phase 2 narrow-phone compact spacing contract is missing.');
}
if (!phase8Js.includes("passiveSummary.className = summary.className;")) {
  throw new Error('Phase 2 single-detail-trigger contract is missing.');
}
if (!phase8Js.includes("actions.className = 'mobile-lite-actions';")) {
  throw new Error('Phase 2 explicit action-region DOM contract is missing.');
}
if (!js.includes('function onMobileLiteDetailClick(event)')) {
  throw new Error('Phase 2 delegated mobile detail handler is missing.');
}
if (!js.includes("document.getElementById('tbody')?.addEventListener('click', onMobileLiteDetailClick);")) {
  throw new Error('Phase 2 delegated mobile detail listener is not bound.');
}
if (js.includes("tbody.querySelectorAll('[data-mobile-lite-detail]').forEach")) {
  throw new Error('Phase 2 per-control mobile detail listeners must not return.');
}
if (!css.includes('#dataTable[data-registry-unified-table] #tbody{\n    display:flex!important;')) {
  throw new Error('Phase 4 mobile list flex-flow ownership is missing.');
}
if (!css.includes('#tbody>.mobile-lite-row{\n    display:block!important;')) {
  throw new Error('Phase 4 mobile row containment contract is missing.');
}
if (!js.includes("if (main) return main;\n    return document.scrollingElement || document.documentElement;")) {
  throw new Error('Phase 3 canonical mobile scroll-owner contract is missing.');
}
if (!js.includes("session.trigger.focus({ preventScroll:true });\n        if (session.scrollOwner) setOwnerScrollTop(session.scrollOwner, session.scrollTop);")) {
  throw new Error('Phase 3 focus-before-final-scroll restoration is missing.');
}
if (!css.includes('--mi-registry-bottom-nav-clearance:calc(80px + env(safe-area-inset-bottom))')) {
  throw new Error('Phase 4 fixed-nav end-of-list clearance is missing.');
}

fs.writeFileSync(cssFile, css, 'utf8');
fs.writeFileSync(phase8JsFile, phase8Js, 'utf8');
fs.writeFileSync(jsFile, js, 'utf8');
console.log('Phase 2/3/4 mobile stability passed: delegated detail interaction, compact narrow-phone spacing, explicit collision-free card actions, one detail trigger, true vertical card flow, canonical detail scroll restoration and fixed-nav clearance.');