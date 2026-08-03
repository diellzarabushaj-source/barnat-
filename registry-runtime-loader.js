(() => {
  'use strict';

  const VERSION = 'registry-runtime-loader-v7-unverified-visible';
  const RUNTIME_SRC = '/app-performance.js?v=20260803-unverified-1';
  const AUTH_WAIT_LIMIT_MS = 8000;

  let loaded = false;
  let scheduled = false;
  let authObserver = null;
  let authTimer = 0;

  document.documentElement.dataset.registryRuntimeLoader = VERSION;

  function authReady() {
    return document.documentElement.classList.contains('auth-ready');
  }

  function loadRuntime() {
    if (loaded || document.querySelector('script[data-medindex-app-performance]')) return;
    loaded = true;
    authObserver?.disconnect();
    window.clearTimeout(authTimer);

    const script = document.createElement('script');
    script.src = RUNTIME_SRC;
    script.async = true;
    script.dataset.medindexAppPerformance = VERSION;
    script.addEventListener('error', () => {
      loaded = false;
      document.documentElement.dataset.registryRuntimeLoaderError = 'load';
      console.error('Runtime-i i regjistrit nuk u ngarkua.');
    }, { once:true });
    document.head.appendChild(script);
  }

  function scheduleRuntime() {
    if (scheduled || loaded) return;
    scheduled = true;
    authObserver?.disconnect();
    window.clearTimeout(authTimer);

    requestAnimationFrame(() => {
      scheduled = false;
      loadRuntime();
    });
  }

  function waitForAuthenticatedShell() {
    if (authReady()) {
      scheduleRuntime();
      return;
    }

    authObserver = new MutationObserver(() => {
      if (authReady()) scheduleRuntime();
    });
    authObserver.observe(document.documentElement, {
      attributes:true,
      attributeFilter:['class'],
    });

    authTimer = window.setTimeout(() => {
      if (authReady()) scheduleRuntime();
      else document.documentElement.dataset.registryRuntimeLoaderError = 'auth-timeout';
    }, AUTH_WAIT_LIMIT_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForAuthenticatedShell, { once:true });
  } else {
    waitForAuthenticatedShell();
  }
})();
