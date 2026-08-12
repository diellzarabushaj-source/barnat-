(() => {
  'use strict';

  const VERSION = 'registry-dosage-idle-loader-v6';
  const BUILD_ID = String(
    document.querySelector('meta[name="medindex-build-id"]')?.content
      || document.documentElement.dataset.medindexBuildId
      || '',
  ).trim();
  const SRC = `/registry-dosage-columns-v3.js?v=20260812-2${BUILD_ID ? `&build=${encodeURIComponent(BUILD_ID)}` : ''}`;
  let scheduled = false;
  let loaded = false;
  let fallbackTimer = 0;

  function load() {
    if (loaded || document.querySelector('script[data-registry-dosage-runtime]')) return;
    loaded = true;
    clearTimeout(fallbackTimer);
    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.dataset.registryDosageRuntime = VERSION;
    if (BUILD_ID) script.dataset.medindexBuildId = BUILD_ID;
    script.addEventListener('error', () => {
      loaded = false;
      console.warn('Shtresa e dozimit nuk u ngarkua; regjistri mbetet funksional.');
    }, { once:true });
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
    else setTimeout(run, 1200);
  }

  if (window.MEDINDEX_APP_VERSION && Array.isArray(window.MEDINDEX_REGISTRY_ROWS)) schedule();
  else window.addEventListener('medindex:registry-ready', schedule, { once:true });

  fallbackTimer = setTimeout(() => {
    if (Array.isArray(window.MEDINDEX_REGISTRY_ROWS)) schedule();
  }, 15000);

  window.MedIndexRegistryDosageLoader = { version:VERSION, buildId:BUILD_ID, schedule, loaded:() => loaded };
})();
