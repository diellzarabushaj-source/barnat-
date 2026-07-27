(() => {
  'use strict';

  const SCRIPT_ID = 'medindexAnalizatRuntime';
  const STATIC_GZIP = window.MEDINDEX_LAB_SHEET_GZIP;
  const TIMEOUT_MS = 3200;

  function loadRuntime(source) {
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = '/analizat.js?v=20260727-neon-first';
    script.defer = true;
    script.dataset.medindexLabSource = source;
    document.head.appendChild(script);
  }

  async function fetchNeon() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch('/api/icd?scope=labs', {
        credentials:'same-origin',
        cache:'no-store',
        headers:{ Accept:'application/json' },
        signal:controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.gzipBase64 || Number(payload?.data?.counts?.total || 0) < 110) {
        throw new Error(payload?.error || `Lab API ${response.status}`);
      }
      window.MEDINDEX_LAB_SHEET_GZIP = payload.gzipBase64;
      window.MEDINDEX_LAB_DATA_SOURCE = response.headers.get('X-MedIndex-Data-Source') || 'neon';
      loadRuntime('neon');
    } catch (error) {
      window.MEDINDEX_LAB_SHEET_GZIP = STATIC_GZIP;
      window.MEDINDEX_LAB_DATA_SOURCE = 'local-static-fallback';
      console.warn('Lab Neon fallback:', error.message);
      loadRuntime('local-static-fallback');
    } finally {
      clearTimeout(timer);
    }
  }

  fetchNeon();
})();
