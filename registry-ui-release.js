(() => {
  'use strict';

  const RELEASE = 'registry-ui-20260801-7';
  const STORAGE_KEY = 'medindex.registry.ui.release';
  const SESSION_KEY = 'medindex.registry.ui.cache-cleared';

  function storedRelease() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; }
    catch { return ''; }
  }

  function rememberRelease() {
    try { localStorage.setItem(STORAGE_KEY, RELEASE); } catch {}
  }

  function sessionWasCleared() {
    try { return sessionStorage.getItem(SESSION_KEY) === RELEASE; }
    catch { return false; }
  }

  function rememberSessionClear() {
    try { sessionStorage.setItem(SESSION_KEY, RELEASE); } catch {}
  }

  async function clearLegacyPresentationCaches() {
    if (storedRelease() === RELEASE || sessionWasCleared()) {
      document.documentElement.dataset.registryUiRelease = RELEASE;
      return;
    }

    rememberSessionClear();
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names
          .filter(name => name.startsWith('medindex-static-') || name.startsWith('medindex-pages-'))
          .map(name => caches.delete(name)));
      }
      const registration = await navigator.serviceWorker?.getRegistration?.('/');
      await registration?.update?.().catch(() => null);
    } finally {
      rememberRelease();
      document.documentElement.dataset.registryUiRelease = RELEASE;
      window.dispatchEvent(new CustomEvent('medindex:registry-ui-release-ready', { detail:{ release:RELEASE } }));
    }
  }

  function scheduleCleanup() {
    const run = () => void clearLegacyPresentationCaches();
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout:4500 });
    else setTimeout(run, 2500);
  }

  function start() {
    if (document.readyState === 'complete') scheduleCleanup();
    else window.addEventListener('load', scheduleCleanup, { once:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();