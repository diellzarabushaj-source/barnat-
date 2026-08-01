(() => {
  'use strict';

  const VERSION = 'registry-runtime-loader-v5';
  const RUNTIME_SRC = '/app-performance.js?v=20260801-1';
  const FIRST_INTERACTION_FALLBACK_MS = 5000;
  const POST_INTERACTION_GRACE_MS = 800;
  const AUTH_WAIT_LIMIT_MS = 5000;
  const INTERACTION_EVENTS = ['click', 'keyup', 'touchend'];
  let scheduled = false;
  let loaded = false;
  let gateInstalled = false;
  let authObserver = null;
  let authTimer = 0;
  let fallbackTimer = 0;
  let resolveUiReady = null;

  if (!window.MEDINDEX_REGISTRY_UI_READY || typeof window.MEDINDEX_REGISTRY_UI_READY.then !== 'function') {
    window.MEDINDEX_REGISTRY_UI_READY = new Promise(resolve => {
      resolveUiReady = resolve;
    });
  }
  document.documentElement.dataset.registryRuntimeLoader = VERSION;

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
      resolveUiReady?.({ ready:false, reason:'runtime-load-error' });
      console.error('Runtime-i i regjistrit nuk u ngarkua.');
    }, { once:true });
    document.head.appendChild(script);
  }

  function removeInteractionGate() {
    if (!gateInstalled) return;
    gateInstalled = false;
    INTERACTION_EVENTS.forEach(name => {
      document.removeEventListener(name, handleCompletedInteraction, true);
    });
  }

  function scheduleRuntime(delay = 0) {
    if (scheduled) return;
    scheduled = true;
    authObserver?.disconnect();
    window.clearTimeout(authTimer);
    window.clearTimeout(fallbackTimer);
    removeInteractionGate();
    window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(loadRuntime));
    }, Math.max(0, delay));
  }

  function handleCompletedInteraction() {
    scheduleRuntime(POST_INTERACTION_GRACE_MS);
  }

  function installInteractionGate() {
    if (gateInstalled || scheduled) return;
    gateInstalled = true;
    INTERACTION_EVENTS.forEach(name => {
      document.addEventListener(name, handleCompletedInteraction, {
        capture:true,
        passive:true,
        once:false,
      });
    });
    fallbackTimer = window.setTimeout(() => {
      scheduleRuntime(0);
    }, FIRST_INTERACTION_FALLBACK_MS);
  }

  function waitForAuthenticatedShell() {
    if (authReady()) return installInteractionGate();
    authObserver = new MutationObserver(() => {
      if (authReady()) {
        authObserver?.disconnect();
        installInteractionGate();
      }
    });
    authObserver.observe(document.documentElement, {
      attributes:true,
      attributeFilter:['class'],
    });
    authTimer = window.setTimeout(() => {
      authObserver?.disconnect();
      if (authReady()) installInteractionGate();
    }, AUTH_WAIT_LIMIT_MS);
  }

  window.addEventListener('medindex:registry-ready', () => {
    resolveUiReady?.({ ready:true });
  }, { once:true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForAuthenticatedShell, { once:true });
  } else {
    waitForAuthenticatedShell();
  }
})();
