(() => {
  'use strict';

  const status = document.getElementById('recoveryStatus');
  const errorBox = document.getElementById('recoveryError');
  const setStatus = value => { if (status) status.textContent = value; };

  async function unregisterWorkers() {
    if (!('serviceWorker' in navigator)) return 0;
    const registrations = await navigator.serviceWorker.getRegistrations();
    const localRegistrations = registrations.filter(registration => {
      try { return new URL(registration.scope).origin === location.origin; }
      catch { return false; }
    });
    const results = await Promise.allSettled(localRegistrations.map(registration => registration.unregister()));
    return results.filter(result => result.status === 'fulfilled' && result.value).length;
  }

  async function clearMedIndexCaches() {
    if (!('caches' in window)) return 0;
    const names = await caches.keys();
    const medIndexNames = names.filter(name => name.startsWith('medindex-'));
    await Promise.allSettled(medIndexNames.map(name => caches.delete(name)));
    return medIndexNames.length;
  }

  function clearStaleAuthState() {
    const localKeys = ['medindex_offline_lease_v1', 'medindex_offline_lease_v2'];
    const sessionKeys = ['medindex_return_after_login'];
    try { localKeys.forEach(key => localStorage.removeItem(key)); } catch {}
    try { sessionKeys.forEach(key => sessionStorage.removeItem(key)); } catch {}
  }

  async function recover() {
    try {
      setStatus('Po çregjistrohet Service Worker-i i vjetër…');
      await unregisterWorkers();
      setStatus('Po pastrohen cache-et e vjetra të MedIndex…');
      await clearMedIndexCaches();
      clearStaleAuthState();
      setStatus('Rikuperimi përfundoi. Po hapet hyrja…');
      const target = new URL('/login.html', location.origin);
      target.searchParams.set('recovered', String(Date.now()));
      window.setTimeout(() => location.replace(target.pathname + target.search), 250);
    } catch (error) {
      console.error('MedIndex recovery failed:', error);
      if (errorBox) errorBox.textContent = 'Rikuperimi automatik dështoi. Mbylle këtë tab dhe hape përsëri MedIndex.';
      setStatus('Rikuperimi nuk u përfundua.');
    }
  }

  recover();
})();
