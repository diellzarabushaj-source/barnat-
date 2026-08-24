(() => {
  'use strict';

  let reviewMode = false;
  try { reviewMode = new URL(window.location.href).searchParams.get('review') === '1'; } catch {}
  if (!reviewMode) return;

  const VERSION = '20260824-1';
  const CSS = [
    `emergency-verification-queue-v14.css?v=${VERSION}`,
    `emergency-consistency-v15.css?v=${VERSION}`,
    `emergency-evidence-v16.css?v=${VERSION}`,
  ];
  const JS = [
    `emergency-verification-queue-core-v14.js?v=${VERSION}`,
    `emergency-consistency-core-v15.js?v=${VERSION}`,
    `emergency-evidence-core-v16.js?v=${VERSION}`,
    `emergency-verification-queue-v14.js?v=${VERSION}`,
    `emergency-consistency-v15.js?v=${VERSION}`,
    `emergency-evidence-v16.js?v=${VERSION}`,
  ];

  function loadCss(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.ckReviewAsset = '1';
    const canonical = document.querySelector('link[data-tailadmin-professional-css]');
    if (canonical?.parentNode) canonical.parentNode.insertBefore(link, canonical);
    else document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.ckReviewAsset = '1';
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Reviewer asset failed: ${src}`));
      document.body.appendChild(script);
    });
  }

  async function start(authState) {
    if (authState?.authenticated !== true || authState?.offline === true || authState?.authUser?.adminConsole !== true) return;
    CSS.forEach(loadCss);
    for (const src of JS) await loadScript(src);
    window.dispatchEvent(new CustomEvent('medindex:emergency-review-assets-ready'));
  }

  Promise.resolve(window.MEDINDEX_AUTH_READY).then(start).catch(() => {});
})();
