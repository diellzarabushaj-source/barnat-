(() => {
  'use strict';

  const VERSION = 'registry-runtime-loader-v1';
  const RUNTIME_SRC = '/app-performance.js?v=20260801-1';
  const INTERACTION_GRACE_MS = 220;
  const AUTH_WAIT_LIMIT_MS = 5000;
  let scheduled = false;
  let loaded = false;
  let authObserver = null;
  let authTimer = 0;

  function authReady() {
    return document.documentElement.classList.contains('auth-ready');
  }

  function loadRuntime() {
    if (loaded || document.querySelector('script[data-medindex-app-performance]')) return;
    loaded = true;
    const script = document.createElement('script');
    script.src = RUNTIME_SRC;
    script.async = true;
    script.dataset.medindexAppPerformance = VERSION;
    script.addEventListener('error', () => {
      document.documentElement.dataset.registryRuntimeLoaderError = 'load';
      console.error('Runtime-i i regjistrit nuk u ngarkua.');
    }, { once:true });
    document.head.appendChild(script);
  }

  function beginGracePeriod() {
    if (scheduled) return;
    scheduled = true;
    authObserver?.disconnect();
    window.clearTimeout(authTimer);
    window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(loadRuntime));
    }, INTERACTION_GRACE_MS);
  }

  function waitForAuthenticatedShell() {
    if (authReady()) return beginGracePeriod();
    authObserver = new MutationObserver(() => {
      if (authReady()) beginGracePeriod();
    });
    authObserver.observe(document.documentElement, {
      attributes:true,
      attributeFilter:['class'],
    });
    authTimer = window.setTimeout(() => {
      authObserver?.disconnect();
      if (authReady()) beginGracePeriod();
    }, AUTH_WAIT_LIMIT_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForAuthenticatedShell, { once:true });
  } else {
    waitForAuthenticatedShell();
  }
})();
