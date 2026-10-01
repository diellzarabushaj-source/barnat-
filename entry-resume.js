(() => {
  'use strict';
  // A restored tab or an old Strict cookie may first reach the public page.
  // This same-origin check recovers the server-held login without web storage.
  let pending = false;
  let retry = 0;
  async function resume() {
    if (pending || !navigator.onLine) return;
    pending = true;
    clearTimeout(retry);
    try {
      const response = await fetch('/api/auth', {
        credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' },
        signal:AbortSignal.timeout(12000),
      });
      const payload = await response.json();
      if (response.ok && payload.authenticated === true && payload.hardened === true
        && Number(payload.sessionVersion) === 3) {
        const destination = new URLSearchParams(location.search).get('return') || '/index.html';
        // The server validates the destination, including encoded open redirects.
        location.replace(`/api/auth?resume=1&return=${encodeURIComponent(destination)}`);
      } else if (response.status >= 500) {
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
