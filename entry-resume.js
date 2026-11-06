(() => {
  'use strict';
  // A restored tab or an old Strict cookie may first reach the public page.
  // This same-origin check recovers the server-held login without web storage.
  let pending = false;
  let retry = 0;
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
        const destination = new URLSearchParams(location.search).get('return') || '/index.html';
        // The server validates the destination, including encoded open redirects.
        location.replace(`/api/auth?resume=1&return=${encodeURIComponent(destination)}`);
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
