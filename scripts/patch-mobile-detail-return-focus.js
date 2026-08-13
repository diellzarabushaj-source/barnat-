'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'registry-mobile-lite.js');
let source = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

const before = `    if (session?.trigger?.isConnected) session.trigger.setAttribute('aria-expanded', 'false');
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

const after = `    const triggerClass = session?.trigger?.classList?.contains('mobile-lite-more') ? 'mobile-lite-more' : 'mobile-lite-open';
    const resolveReturnTrigger = () => {
      if (session?.trigger?.isConnected) return session.trigger;
      if (!session?.id) return null;
      return document.querySelector(\`.\${triggerClass}[data-mobile-lite-detail="\${CSS.escape(String(session.id))}"]\`);
    };
    const returnTrigger = resolveReturnTrigger();
    if (returnTrigger?.isConnected) returnTrigger.setAttribute('aria-expanded', 'false');
    if (session?.scrollOwner) {
      restoreDetailScrollOwner(session.scrollOwner, session.scrollOwnerStyle);
      setOwnerScrollTop(session.scrollOwner, session.scrollTop);
    }
    if (options.restoreFocus !== false && returnTrigger?.isConnected) {
      requestAnimationFrame(() => {
        const currentTrigger = resolveReturnTrigger();
        currentTrigger?.focus({ preventScroll:true });
        if (session.scrollOwner) setOwnerScrollTop(session.scrollOwner, session.scrollTop);
        requestAnimationFrame(() => {
          if (session.scrollOwner) setOwnerScrollTop(session.scrollOwner, session.scrollTop);
        });
      });
    } else if (session?.scrollOwner) {
      requestAnimationFrame(() => setOwnerScrollTop(session.scrollOwner, session.scrollTop));
    }`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Could not find canonical mobile detail focus restoration block.');
  source = source.replace(before, after);
}

if (!source.includes('const currentTrigger = resolveReturnTrigger();')) {
  throw new Error('Rerender-safe mobile detail return focus was not materialized.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('Mobile detail return focus is rerender-safe.');
