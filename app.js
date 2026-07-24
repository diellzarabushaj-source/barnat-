const hidePageLoader = () => {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;
  loader.classList.add('is-hidden');
  window.setTimeout(() => loader.remove(), 180);
};

(async () => {
  const APP_VERSION = '20260724-prescription-notation-v1';
  const DB_NAME = 'medindex-registry-v1';
  const DB_STORE = 'datasets';
  const DB_KEY = 'registry-parts-prescription-v1';
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

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB nuk mbështetet.'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) database.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB nuk u hap.'));
      request.onblocked = () => reject(new Error('IndexedDB është bllokuar.'));
    });
  }

  async function databaseGet(key) {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  async function databasePut(key, value) {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const request = database.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  function removeLegacyCache() {
    try { LEGACY_CACHE_KEYS.forEach(key => localStorage.removeItem(key)); } catch {}
  }

  async function saveBrowserCache() {
    if (!hasRegistryData()) return false;
    const record = {
      version:APP_VERSION,
      savedAt:Date.now(),
      parts:window.DRUG_DATA_PARTS,
      quality:window.REGISTRY_QUALITY_META || null,
    };
    try {
      await databasePut(DB_KEY, record);
      localStorage.setItem(CACHE_TIME_KEY, String(record.savedAt));
      removeLegacyCache();
      window.dispatchEvent(new CustomEvent('medindex:registry-cache-ready', { detail:{ savedAt:record.savedAt } }));
      return true;
    } catch (error) {
      console.warn('IndexedDB nuk e ruajti regjistrin; po provohet fallback-i:', error);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(window.DRUG_DATA_PARTS));
        localStorage.setItem(CACHE_TIME_KEY, String(record.savedAt));
        return true;
      } catch (fallbackError) {
        console.warn('Nuk u ruajt cache-i lokal i regjistrit:', fallbackError);
        return false;
      }
    }
  }

  async function loadBrowserCache() {
    try {
      const record = await databaseGet(DB_KEY);
      if (record?.version === APP_VERSION && Array.isArray(record.parts) && record.parts.length) {
        window.DRUG_DATA_PARTS = record.parts;
        if (record.quality) window.REGISTRY_QUALITY_META = record.quality;
        window.REGISTRY_DATA_SOURCE = 'indexeddb-offline-cache';
        localStorage.setItem(CACHE_TIME_KEY, String(record.savedAt || Date.now()));
        return true;
      }
    } catch (error) {
      console.warn('IndexedDB nuk u lexua:', error);
    }

    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!Array.isArray(saved) || saved.length === 0) return false;
      window.DRUG_DATA_PARTS = saved;
      window.REGISTRY_DATA_SOURCE = 'localstorage-migration-cache';
      await saveBrowserCache();
      return true;
    } catch {
      try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIME_KEY);
      } catch {}
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
      if (registryResponse.status === 401) throw new Error('Sesioni ka skaduar.');
      if (!registryResponse.ok) throw new Error('Regjistri nuk u ngarkua (' + registryResponse.status + ')');
      const registryCode = await registryResponse.text();
      window.DRUG_DATA_PARTS = [];
      window.REGISTRY_LOAD_ERROR = '';
      (0, eval)(registryCode);
      if (!hasRegistryData()) throw new Error(window.REGISTRY_LOAD_ERROR || 'Burimi nuk ktheu të dhënat e barnave.');
      const offlineHeader = registryResponse.headers.get('X-MedIndex-Offline') === '1';
      window.REGISTRY_DATA_SOURCE = offlineHeader
        ? 'service-worker-offline-cache'
        : background ? 'online-background-refresh' : 'online-registry';
      await saveBrowserCache();
      return true;
    } catch (error) {
      window.DRUG_DATA_PARTS = previousParts;
      if (background) {
        console.warn('Rifreskimi në prapavijë dështoi:', error);
        return false;
      }
      throw error;
    }
  }

  if (hasRegistryData()) {
    window.REGISTRY_DATA_SOURCE = 'embedded-cache';
    void saveBrowserCache();
  } else if (!(await loadBrowserCache())) {
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
    if (!response.ok) throw new Error('Nuk u ngarkua ' + files[index] + ' (' + response.status + ')');
  });

  const codeParts = await Promise.all(responses.map(response => response.text()));
  (0, eval)(`${codeParts.join('')}\n//# sourceURL=medindex-registry-${APP_VERSION}.js`);

  const countBadge = document.getElementById('countBadge');
  if (countBadge) countBadge.title = 'Burimi i të dhënave: ' + window.REGISTRY_DATA_SOURCE;
  window.MEDINDEX_APP_VERSION = APP_VERSION;
  performance.mark?.('medindex-app-ready');
  performance.measure?.('medindex-app-load', 'medindex-app-start', 'medindex-app-ready');
  requestAnimationFrame(() => requestAnimationFrame(hidePageLoader));

  const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
  const localSource = /cache|indexeddb/i.test(window.REGISTRY_DATA_SOURCE || '');
  if (navigator.onLine && localSource && Date.now() - cachedAt > BACKGROUND_REFRESH_MS) {
    const refresh = () => loadGoogleDriveFallback({ background:true });
    if ('requestIdleCallback' in window) requestIdleCallback(refresh, { timeout:3000 });
    else setTimeout(refresh, 900);
  }
})().catch(error => {
  console.error(error);
  hidePageLoader();
  const count = document.getElementById('countBadge');
  if (count) count.textContent = error?.name === 'AbortError' ? 'Ngarkimi zgjati tepër' : 'Gabim në databazë';
  const body = document.getElementById('tbody');
  if (body) body.innerHTML = `<tr><td colspan="30" class="empty-state">${navigator.onLine ? 'Databaza e barnave nuk u ngarkua. Provo rifreskimin.' : 'Nuk ka ende kopje lokale. Lidhu një herë me internet që MedIndex ta ruajë databazën.'}</td></tr>`;
});
