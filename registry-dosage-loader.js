(() => {
  'use strict';

  const VERSION = 'registry-dosage-idle-loader-v5';
  const SRC = '/registry-dosage-columns-v3.js?v=20260812-2';
  const VISIBILITY_STORAGE_KEY = 'medindex-registry-dosage-columns-v2';
  const BUILD_ID = String(
    document.querySelector('meta[name="medindex-build-id"]')?.content
      || document.documentElement.dataset.medindexBuildId
      || '',
  ).trim();
  const BUILD_QUERY = BUILD_ID ? `&build=${encodeURIComponent(BUILD_ID)}` : '';
  let scheduled = false;
  let loaded = false;
  let fallbackTimer = 0;

  function ensureDefaultDoseVisibility() {
    try {
      const raw = localStorage.getItem(VISIBILITY_STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify({ adult:true, pediatric:true }));
        return;
      }
      const stored = JSON.parse(raw);
      if (!stored || typeof stored !== 'object') throw new Error('invalid dosage column preference');
      const next = { ...stored };
      let changed = false;
      if (typeof next.adult !== 'boolean') {
        next.adult = true;
        changed = true;
      }
      if (typeof next.pediatric !== 'boolean') {
        next.pediatric = true;
        changed = true;
      }
      if (changed) localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      try {
        localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify({ adult:true, pediatric:true }));
      } catch {}
    }
  }

  function load() {
    if (loaded || document.querySelector('script[data-registry-dosage-runtime]')) return;
    loaded = true;
    clearTimeout(fallbackTimer);
    ensureDefaultDoseVisibility();
    const script = document.createElement('script');
    script.src = SRC + BUILD_QUERY;
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
