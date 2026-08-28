(() => {
  'use strict';

  const VERSION = 'registry-dose-interaction-loader-v1';
  const INSULIN_TRIGGER = '[data-insulin-smart-open]';
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
