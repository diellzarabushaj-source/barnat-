const hidePageLoader = () => {
  const loader = document.getElementById('pageLoader');
  if(!loader) return;
  loader.classList.add('is-hidden');
  window.setTimeout(() => loader.remove(), 180);
};

(async () => {
  const APP_VERSION = '20260724-5';
  const CACHE_KEY = 'barnat-registry-parts-v4';
  const CACHE_TIME_KEY = 'barnat-registry-cached-at-v4';
  const LEGACY_CACHE_KEYS = [
    'barnat-registry-parts-v2', 'barnat-registry-cached-at-v2',
    'barnat-registry-parts-v3', 'barnat-registry-cached-at-v3',
  ];
  const BACKGROUND_REFRESH_MS = 6 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 12000;

  performance.mark?.('medindex-app-start');
  const hasRegistryData = () => Array.isArray(window.DRUG_DATA_PARTS) && window.DRUG_DATA_PARTS.length > 0;

  async function timedFetch(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

  function removeLegacyCache() {
    try { LEGACY_CACHE_KEYS.forEach(key => localStorage.removeItem(key)); } catch {}
  }

  function saveBrowserCache() {
    if(!hasRegistryData()) return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(window.DRUG_DATA_PARTS));
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
      removeLegacyCache();
    } catch(error) {
      console.warn('Nuk u ruajt cache-i lokal i regjistrit:', error);
    }
  }

  function loadBrowserCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if(!Array.isArray(saved) || saved.length === 0) return false;
      window.DRUG_DATA_PARTS = saved;
      window.REGISTRY_DATA_SOURCE = 'browser-cache';
      return true;
    } catch(error) {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TIME_KEY);
      return false;
    }
  }

  async function loadGoogleDriveFallback({ background = false } = {}) {
    const previousParts = window.DRUG_DATA_PARTS;
    try {
      const registryResponse = await timedFetch(`/api/registry?version=${APP_VERSION}`, {
        cache:background ? 'no-cache' : 'no-store',
        credentials:'same-origin',
      });
      if(registryResponse.status === 401) throw new Error('Sesioni ka skaduar.');
      if(!registryResponse.ok) throw new Error('Fallback-i i Google Drive dështoi (' + registryResponse.status + ')');
      const registryCode = await registryResponse.text();
      window.DRUG_DATA_PARTS = [];
      window.REGISTRY_LOAD_ERROR = '';
      (0, eval)(registryCode);
      if(!hasRegistryData()) throw new Error(window.REGISTRY_LOAD_ERROR || 'Google Drive nuk ktheu të dhënat e barnave.');
      window.REGISTRY_DATA_SOURCE = background ? 'google-drive-background-refresh' : 'google-drive-fallback';
      saveBrowserCache();
      return true;
    } catch(error) {
      window.DRUG_DATA_PARTS = previousParts;
      if(background) {
        console.warn('Rifreskimi në prapavijë dështoi:', error);
        return false;
      }
      throw error;
    }
  }

  removeLegacyCache();
  if(hasRegistryData()){
    window.REGISTRY_DATA_SOURCE = 'edge-cache';
    saveBrowserCache();
  } else if(!loadBrowserCache()) {
    await loadGoogleDriveFallback();
  }

  const files = [
    './app-parts/part-01.txt',
    './app-parts/part-02.txt',
    './app-parts/part-03.txt',
    './app-parts/part-04.txt',
    './app-parts/core-tail.txt',
  ].map(file => `${file}?v=${APP_VERSION}`);
  const responses = await Promise.all(files.map(file => timedFetch(file, { cache:'force-cache', credentials:'same-origin' })));
  responses.forEach((response, index) => {
    if(!response.ok) throw new Error('Nuk u ngarkua ' + files[index] + ' (' + response.status + ')');
  });

  const codeParts = await Promise.all(responses.map(response => response.text()));
  (0, eval)(`${codeParts.join('')}\n//# sourceURL=medindex-registry-${APP_VERSION}.js`);

  const countBadge = document.getElementById('countBadge');
  if(countBadge) countBadge.title = 'Burimi i të dhënave: ' + window.REGISTRY_DATA_SOURCE;
  window.MEDINDEX_APP_VERSION = APP_VERSION;
  performance.mark?.('medindex-app-ready');
  performance.measure?.('medindex-app-load', 'medindex-app-start', 'medindex-app-ready');
  requestAnimationFrame(() => requestAnimationFrame(hidePageLoader));

  const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
  if(window.REGISTRY_DATA_SOURCE === 'browser-cache' && Date.now() - cachedAt > BACKGROUND_REFRESH_MS) {
    const refresh = () => loadGoogleDriveFallback({ background:true });
    if('requestIdleCallback' in window) requestIdleCallback(refresh, { timeout:3000 });
    else setTimeout(refresh, 900);
  }
})().catch(error => {
  console.error(error);
  hidePageLoader();
  const count = document.getElementById('countBadge');
  if(count) count.textContent = error?.name === 'AbortError' ? 'Ngarkimi zgjati tepër' : 'Gabim në databazë';
  const body = document.getElementById('tbody');
  if(body) body.innerHTML = '<tr><td colspan="30" class="empty-state">Databaza e barnave nuk u ngarkua. Kontrollo lidhjen dhe provo rifreskimin.</td></tr>';
});
