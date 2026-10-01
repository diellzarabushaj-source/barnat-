(() => {
  'use strict';
  const status = document.getElementById('resumeStatus');
  const retryButton = document.getElementById('resumeRetry');
  const progress = document.getElementById('resumeProgress');
  let pending = false;
  let retry = 0;
  let finished = false;

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

  document.getElementById('resumeLogin').href = `/login.html?reauth=1&return=${encodeURIComponent(destination())}`;

  async function resume() {
    if (pending || finished) return;
    clearTimeout(retry);
    if (!navigator.onLine) {
      status.textContent = 'Lidhja me internet mungon. Hyrja e ruajtur do të provohet sapo të rikthehet lidhja.';
      progress.hidden = true;
      return;
    }
    pending = true;
    retryButton.disabled = true;
    progress.hidden = false;
    status.textContent = 'Po rikthejmë hyrjen tënde të ruajtur…';
    const controller = new AbortController();
    // Allow the server's bounded refresh/profile checks to finish after token
    // rotation; show the slow-link state without cancelling them prematurely.
    const slow = setTimeout(() => {
      status.textContent = 'Lidhja po vonon. Po presim rikthimin e hyrjes tënde të ruajtur…';
    }, 5000);
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      // A query keeps old workers from aborting a renewal after their 1.2s
      // offline-cache deadline or returning an offline authentication snapshot.
      const response = await fetch('/api/auth?entry=1', {
        credentials:'same-origin', cache:'no-store', headers:{ Accept:'application/json' }, signal:controller.signal,
      });
      const payload = await response.json();
      if (response.ok && payload.authenticated === true && payload.hardened === true
        && Number(payload.sessionVersion) === 3 && payload.offline !== true) {
        finished = true;
        location.replace(destination());
      } else if (response.status >= 500 || response.status === 429) {
        throw new Error('Temporary renewal failure');
      } else {
        finished = true;
        status.textContent = 'Hyrja e ruajtur nuk është më e vlefshme. Hyr në llogari për të vazhduar.';
        progress.hidden = true;
        retryButton.hidden = true;
      }
    } catch {
      status.textContent = 'Lidhja po vonon. Hyrja jote e ruajtur mbetet në këtë pajisje; po provojmë përsëri.';
      progress.hidden = true;
      retry = setTimeout(resume, 5000);
    } finally {
      clearTimeout(timeout);
      clearTimeout(slow);
      pending = false;
      retryButton.disabled = false;
    }
  }
  retryButton.addEventListener('click', resume);
  window.addEventListener('online', resume);
  window.addEventListener('pageshow', resume);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void resume(); });
  void resume();
})();
