(() => {
  'use strict';

  const VERSION = 'dose-modal-accessibility-lazy-v1';
  const TRIGGER_SELECTOR = '.dose-calculator-open';
  const loaderScript = document.currentScript;
  const runtimeUrl = loaderScript?.dataset?.doseModalAccessibilityRuntime || 'registry-dose-modal-accessibility.js?v=20260809-1';
  const replaying = new WeakSet();
  let runtimePromise = null;
  let ready = Boolean(window.MedIndexDoseModalAccessibility);

  function absoluteUrl(value) {
    return new URL(value, document.baseURI).href;
  }

  function existingRuntimeScript() {
    const expected = absoluteUrl(runtimeUrl);
    return [...document.scripts].find(script => script !== loaderScript && script.src === expected) || null;
  }

  function loadRuntime() {
    if (ready && window.MedIndexDoseModalAccessibility) return Promise.resolve(window.MedIndexDoseModalAccessibility);
    if (runtimePromise) return runtimePromise;

    runtimePromise = new Promise((resolve, reject) => {
      const existing = existingRuntimeScript();
      const script = existing || document.createElement('script');
      if (!existing) {
        script.src = runtimeUrl;
        script.async = false;
        script.dataset.medindexLazyDoseModalAccessibility = VERSION;
      }

      const finish = () => {
        if (!window.MedIndexDoseModalAccessibility) {
          reject(new Error('Dose modal accessibility runtime loaded without its public API.'));
          return;
        }
        ready = true;
        document.documentElement.dataset.doseModalAccessibilityLazy = 'ready';
        resolve(window.MedIndexDoseModalAccessibility);
      };
      const fail = () => reject(new Error(`Nuk u ngarkua runtime i accessibility: ${runtimeUrl}`));

      if (window.MedIndexDoseModalAccessibility) {
        finish();
        return;
      }
      script.addEventListener('load', finish, { once:true });
      script.addEventListener('error', fail, { once:true });
      if (!existing) document.head.appendChild(script);
    }).catch(error => {
      runtimePromise = null;
      document.documentElement.dataset.doseModalAccessibilityLazy = 'error';
      throw error;
    });

    document.documentElement.dataset.doseModalAccessibilityLazy = 'loading';
    return runtimePromise;
  }

  function replay(trigger) {
    if (!(trigger instanceof HTMLElement) || !trigger.isConnected) return;
    replaying.add(trigger);
    try { trigger.click(); }
    finally { replaying.delete(trigger); }
  }

  function onClick(event) {
    const trigger = event.target?.closest?.(TRIGGER_SELECTOR);
    if (!trigger || replaying.has(trigger) || ready) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void loadRuntime()
      .then(() => replay(trigger))
      .catch(error => {
        console.error('Dose modal accessibility runtime failed to load:', error);
        window.dispatchEvent(new CustomEvent('medindex:dose-modal-accessibility-error', {
          detail:{ version:VERSION, message:String(error?.message || error) },
        }));
      });
  }

  document.addEventListener('click', onClick, true);
  document.documentElement.dataset.doseModalAccessibilityLazy = ready ? 'ready' : 'idle';

  window.MEDINDEX_DOSE_MODAL_ACCESSIBILITY_LOADER = Object.freeze({
    version:VERSION,
    ensure:loadRuntime,
    ready:() => ready,
  });
})();
