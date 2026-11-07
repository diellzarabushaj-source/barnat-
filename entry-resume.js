(() => {
  'use strict';
  // A restored tab or an old Strict cookie may first reach the public page.
  // This same-origin check recovers the server-held login without web storage.
  let pending = false;
  let retry = 0;
  function destination() {
    const value = new URLSearchParams(location.search).get('return') || '/index.html';
    try {
      const target = new URL(value, location.origin);
      if (!value.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(value)
        || target.origin !== location.origin
        || /^\/(api|login|admin-login|landing|recovery|hyrje|session-resume)(\/|\.|$)/.test(target.pathname)) return '/index.html';
      return target.pathname + target.search + target.hash;
    } catch { return '/index.html'; }
  }

  async function resume() {
    // An open login dialog does not mean the remembered session is invalid.
    if (pending || !navigator.onLine) return;
    pending = true;
    clearTimeout(retry);
    try {
      // Bypass old service workers that can return an offline auth snapshot or
      // cancel server-side token renewal after 1.2 seconds on a slow link.
      const response = await fetch('/api/auth?entry=1', {
        credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
        signal:AbortSignal.timeout(45000),
      });
      const payload = await response.json();
      if (response.ok && payload.authenticated === true && payload.hardened === true
        && Number(payload.sessionVersion) === 3 && payload.offline !== true) {
        window.DRxRememberedAccounts?.remember(payload);
        const selected = window.DRxSelectedAccount || new URLSearchParams(location.search).get('email');
        if (selected && selected.toLowerCase() !== String(payload.user?.email || '').toLowerCase()) return;
        // The successful response has already committed the renewed HttpOnly
        // cookies. Avoid a second auth request before opening the workspace.
        location.replace(destination());
      } else if (response.status >= 500 || response.status === 429 || payload.offline === true) {
        retry = setTimeout(resume, 5000);
      }
    } catch {
      retry = setTimeout(resume, 5000);
    } finally {
      pending = false;
    }
  }
  window.addEventListener('pageshow', resume);
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void resume(); });
  void resume();
})();
