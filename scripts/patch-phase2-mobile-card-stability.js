'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const cssFile = path.join(ROOT, 'registry-mobile-phase8.css');
const shellCssFile = path.join(ROOT, 'registry-mobile-phase3.css');
const jsFile = path.join(ROOT, 'registry-mobile-lite.js');
let css = fs.readFileSync(cssFile, 'utf8').replace(/\r\n?/g, '\n');
let shellCss = fs.readFileSync(shellCssFile, 'utf8').replace(/\r\n?/g, '\n');
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

const shellClearanceMarker = '/* MedIndex revised Phase 4: fixed-nav end-of-list clearance */';
if (!shellCss.includes(shellClearanceMarker)) {
  shellCss += `\n\n${shellClearanceMarker}\n@media (max-width:767px){\n  html[data-registry-mobile-lite][data-registry-mobile-phase3]{\n    --mi-registry-bottom-nav-clearance:calc(80px + env(safe-area-inset-bottom));\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase3] .mi-main{\n    scroll-padding-bottom:var(--mi-registry-bottom-nav-clearance)!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase3] #pagination{\n    margin-bottom:var(--mi-registry-bottom-nav-clearance)!important;\n  }\n  html[data-registry-mobile-lite][data-registry-mobile-phase3][data-mi-keyboard-open=\"true\"] #pagination{\n    margin-bottom:calc(18px + env(safe-area-inset-bottom))!important;\n  }\n}\n`;
}

if (!css.includes('min-height:108px!important')) throw new Error('Phase 2 stable card reserve is missing.');
if (!css.includes('#tbody .mobile-lite-card:has(.mi-mobile-favorite-toggle) .mobile-lite-open{')) {
  throw new Error('Phase 2 content action-rail contract is missing.');
}
if (!css.includes('#tbody .mobile-lite-card:has(.mi-mobile-favorite-toggle) .mobile-lite-more{')) {
  throw new Error('Phase 2 detail action slot contract is missing.');
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
if (!shellCss.includes('--mi-registry-bottom-nav-clearance:calc(80px + env(safe-area-inset-bottom))')) {
  throw new Error('Phase 4 fixed-nav end-of-list clearance is missing.');
}

fs.writeFileSync(cssFile, css, 'utf8');
fs.writeFileSync(shellCssFile, shellCss, 'utf8');
fs.writeFileSync(jsFile, js, 'utf8');
console.log('Phase 2/3/4 mobile stability passed: true vertical card flow, canonical detail scroll restoration and fixed-nav end-of-list clearance.');