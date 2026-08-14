(() => {
  'use strict';

  const VERSION = 'registry-dose-interaction-loader-v1';
  const INSULIN_TRIGGER = '[data-insulin-smart-open]';
  const INSULIN_STYLE_URLS = Object.freeze([
    'registry-novorapid-simple-calculator.css?v=20260810-deep-audit-1&build=registry-r20260812-1',
    'registry-novomix30-simple-calculator.css?v=20260810-deep-audit-1&build=registry-r20260812-1',
    'registry-other-insulins-simple-calculator.css?v=20260810-deep-audit-1&build=registry-r20260812-1',
  ]);
  const INSULIN_SCRIPT_URLS = Object.freeze([
    'registry-novorapid-simple-calculator.js?v=20260810-deep-audit-1&build=registry-r20260812-1',
    'registry-novomix30-simple-calculator.js?v=20260810-deep-audit-1&build=registry-r20260812-1',
    'registry-other-insulins-simple-calculator.js?v=20260810-deep-audit-1&build=registry-r20260812-1',
    'registry-insulin-final-safety.js?v=20260810-final-guard-1&build=registry-r20260812-1',
  ]);

  let insulinRuntimePromise = null;
  let insulinRuntimeReady = false;
  const replaying = new WeakSet();

  function absoluteAssetUrl(value) {
    return new URL(value, document.baseURI).href;
  }

  function findLoadedStyle(href) {
    const expected = absoluteAssetUrl(href);
    return [...document.querySelectorAll('link[rel="stylesheet"][href]')]
      .find(link => link.href === expected) || null;
  }

  function loadStyle(href) {
    const existing = findLoadedStyle(href);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.medindexLazyDoseAsset = 'insulin-style';
      link.addEventListener('load', () => resolve(link), { once:true });
      link.addEventListener('error', () => reject(new Error(`Nuk u ngarkua stili: ${href}`)), { once:true });
      document.head.appendChild(link);
    });
  }

  function findLoadedScript(src) {
    const expected = absoluteAssetUrl(src);
    return [...document.scripts].find(script => script.src === expected) || null;
  }

  function loadScript(src) {
    const existing = findLoadedScript(src);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.medindexLazyDoseAsset = 'insulin-script';
      script.addEventListener('load', () => resolve(script), { once:true });
      script.addEventListener('error', () => reject(new Error(`Nuk u ngarkua runtime: ${src}`)), { once:true });
      document.head.appendChild(script);
    });
  }

  async function loadInsulinRuntimeAssets() {
    await Promise.all(INSULIN_STYLE_URLS.map(loadStyle));
    for (const src of INSULIN_SCRIPT_URLS) await loadScript(src);
  }

  function ensureInsulinRuntime() {
    if (insulinRuntimeReady) return Promise.resolve();
    if (insulinRuntimePromise) return insulinRuntimePromise;

    document.documentElement.dataset.insulinLazyRuntime = 'loading';
    insulinRuntimePromise = loadInsulinRuntimeAssets()
      .then(() => {
        insulinRuntimeReady = true;
        document.documentElement.dataset.insulinLazyRuntime = 'ready';
        window.dispatchEvent(new CustomEvent('medindex:insulin-runtime-ready', {
          detail:{ version:VERSION, source:'interaction' },
        }));
      })
      .catch(error => {
        insulinRuntimePromise = null;
        document.documentElement.dataset.insulinLazyRuntime = 'error';
        throw error;
      });
    return insulinRuntimePromise;
  }

  function replayClick(trigger) {
    if (!(trigger instanceof HTMLElement) || !trigger.isConnected) return;
    replaying.add(trigger);
    try { trigger.click(); }
    finally { replaying.delete(trigger); }
  }

  function onDocumentClick(event) {
    const trigger = event.target?.closest?.(INSULIN_TRIGGER);
    if (!trigger || replaying.has(trigger) || insulinRuntimeReady) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void ensureInsulinRuntime()
      .then(() => replayClick(trigger))
      .catch(error => {
        console.error('Smart Insulin runtime failed to load:', error);
        window.dispatchEvent(new CustomEvent('medindex:insulin-runtime-error', {
          detail:{ message:String(error?.message || error), version:VERSION },
        }));
      });
  }

  document.addEventListener('click', onDocumentClick, true);

  window.MEDINDEX_DOSE_INTERACTION_LOADER = Object.freeze({
    version:VERSION,
    ensureInsulinRuntime,
    insulinReady:() => insulinRuntimeReady,
  });
})();
