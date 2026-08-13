'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-mobile-lite.js');

let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

const before = `    if (session?.trigger?.isConnected) session.trigger.setAttribute('aria-expanded', 'false');
    if (session?.scrollOwner) {
      restoreDetailScrollOwner(session.scrollOwner, session.scrollOwnerStyle);
      setOwnerScrollTop(session.scrollOwner, session.scrollTop);
      requestAnimationFrame(() => setOwnerScrollTop(session.scrollOwner, session.scrollTop));
    }
    if (options.restoreFocus !== false && session?.trigger?.isConnected) {
      requestAnimationFrame(() => session.trigger.focus({ preventScroll:true }));
    }`;

const after = `    if (session?.trigger?.isConnected) session.trigger.setAttribute('aria-expanded', 'false');
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

if (!source.includes(after)) {
  if (!source.includes(before)) {
    throw new Error('Phase 3 detail stability patch could not find the scroll/focus restore block.');
  }
  source = source.replace(before, after);
}

if (!source.includes("session.trigger.focus({ preventScroll:true });\n        if (session.scrollOwner) setOwnerScrollTop(session.scrollOwner, session.scrollTop);")) {
  throw new Error('Phase 3 detail stability patch did not enforce focus-before-final-scroll restoration.');
}

fs.writeFileSync(FILE, source, 'utf8');
console.log('Phase 3 mobile detail restores focus first, then reasserts the exact registry scroll position across two animation frames.');