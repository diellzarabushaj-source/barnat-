(() => {
  'use strict';

  const SOURCE = 'registry-verification-ui.js?v=20260801-1';
  let scheduled = false;
  let loaded = false;

  function load() {
    if (loaded || document.querySelector('script[data-registry-verification-ui-runtime]')) return;
    loaded = true;
    const script = document.createElement('script');
    script.src = SOURCE;
    script.defer = true;
    script.dataset.registryVerificationUiRuntime = 'true';
    document.head.appendChild(script);
  }

  function schedule() {
    if (scheduled || loaded) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      load();
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout:5000 });
    else setTimeout(run, 2500);
  }

  if (Array.isArray(window.MEDINDEX_REGISTRY_ROWS) && window.MEDINDEX_REGISTRY_ROWS.length) schedule();
  else window.addEventListener('medindex:registry-ready', schedule, { once:true });
})();
