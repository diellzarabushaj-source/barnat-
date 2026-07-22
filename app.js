const hidePageLoader = () => {
  const loader = document.getElementById('pageLoader');
  if(!loader) return;

  loader.classList.add('is-hidden');
  window.setTimeout(() => loader.remove(), 350);
};

(async () => {
  const CACHE_KEY = 'barnat-registry-parts-v1';
  const CACHE_TIME_KEY = 'barnat-registry-cached-at-v1';
  const BACKGROUND_REFRESH_MS = 6 * 60 * 60 * 1000;

  const hasRegistryData = () =>
    Array.isArray(window.DRUG_DATA_PARTS) && window.DRUG_DATA_PARTS.length > 0;

  function saveBrowserCache() {
    if(!hasRegistryData()) return;

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(window.DRUG_DATA_PARTS));
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
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
      const registryResponse = await fetch('/api/registry?fallback=1&version=20260722-10', {
        cache: 'no-store',
      });

      if(!registryResponse.ok){
        throw new Error('Fallback-i i Google Drive dështoi (' + registryResponse.status + ')');
      }

      const registryCode = await registryResponse.text();
      window.DRUG_DATA_PARTS = [];
      window.REGISTRY_LOAD_ERROR = '';
      (0, eval)(registryCode);

      if(!hasRegistryData()){
        throw new Error(window.REGISTRY_LOAD_ERROR || 'Google Drive nuk ktheu të dhënat e barnave.');
      }

      window.REGISTRY_DATA_SOURCE = background
        ? 'google-drive-background-refresh'
        : 'google-drive-fallback';
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

  if(hasRegistryData()){
    window.REGISTRY_DATA_SOURCE = 'static-cdn';
    saveBrowserCache();
  } else if(!loadBrowserCache()) {
    console.warn('Databaza statike/cache mungon; po përdoret Google Drive si fallback.');
    await loadGoogleDriveFallback();
  }

  const files = [
    './app-parts/part-01.txt?v=20260722-10',
    './app-parts/part-02.txt?v=20260722-10',
    './app-parts/part-03.txt?v=20260722-10',
    './app-parts/part-04.txt?v=20260722-10',
    './app-parts/part-05.txt?v=20260722-10',
    './app-parts/part-06.txt?v=20260722-10',
    './app-parts/part-07.txt?v=20260722-10',
  ];

  const responses = await Promise.all(files.map(file => fetch(file, { cache: 'force-cache' })));
  responses.forEach((response, index) => {
    if(!response.ok) throw new Error('Nuk u ngarkua ' + files[index] + ' (' + response.status + ')');
  });

  const code = (await Promise.all(responses.map(response => response.text()))).join('');
  (0, eval)(code);

  const countBadge = document.getElementById('countBadge');
  if(countBadge) {
    countBadge.title = 'Burimi i të dhënave: ' + window.REGISTRY_DATA_SOURCE;
  }

  requestAnimationFrame(() => requestAnimationFrame(hidePageLoader));

  const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
  if(
    window.REGISTRY_DATA_SOURCE === 'browser-cache' &&
    Date.now() - cachedAt > BACKGROUND_REFRESH_MS
  ) {
    loadGoogleDriveFallback({ background: true });
  }
})().catch(error => {
  console.error(error);
  hidePageLoader();
  const count = document.getElementById('countBadge');
  if(count) count.textContent = 'Gabim në databazë';
  const body = document.getElementById('tbody');
  if(body) body.innerHTML = '<tr><td colspan="30" class="empty-state">Databaza e barnave nuk u ngarkua. Provo rifreskimin e faqes pas pak.</td></tr>';
});
