'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const cssFile = path.join(ROOT, 'registry-mobile-phase8.css');
const jsFile = path.join(ROOT, 'registry-mobile-lite.js');
let css = fs.readFileSync(cssFile, 'utf8').replace(/\r\n?/g, '\n');
let js = fs.readFileSync(jsFile, 'utf8').replace(/\r\n?/g, '\n');

const oldCard = `  html[data-registry-mobile-lite] #tbody .mobile-lite-card{\n    position:relative;\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:none!important;\n    box-sizing:border-box!important;\n  }`;

const stableCard = `  html[data-registry-mobile-lite] #tbody .mobile-lite-card{\n    position:relative;\n    display:block!important;\n    width:100%!important;\n    min-width:0!important;\n    max-width:none!important;\n    min-height:108px!important;\n    box-sizing:border-box!important;\n  }`;

if (!css.includes(stableCard)) {
  if (!css.includes(oldCard)) throw new Error('Phase 2 stable-card patch could not find the Phase 8 card block.');
  css = css.replace(oldCard, stableCard);
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

if (!css.includes('min-height:108px!important')) throw new Error('Phase 2 stable card reserve is missing.');
if (!css.includes('#tbody .mobile-lite-card:has(.mi-mobile-favorite-toggle) .mobile-lite-open{')) {
  throw new Error('Phase 2 content action-rail contract is missing.');
}
if (!css.includes('#tbody .mobile-lite-card:has(.mi-mobile-favorite-toggle) .mobile-lite-more{')) {
  throw new Error('Phase 2 detail action slot contract is missing.');
}
if (!js.includes("session.trigger.focus({ preventScroll:true });\n        if (session.scrollOwner) setOwnerScrollTop(session.scrollOwner, session.scrollTop);")) {
  throw new Error('Phase 3 focus-before-final-scroll restoration is missing.');
}

fs.writeFileSync(cssFile, css, 'utf8');
fs.writeFileSync(jsFile, js, 'utf8');
console.log('Phase 2/3 mobile card and detail stability passed: 108px action reserve plus focus-safe exact scroll restoration.');