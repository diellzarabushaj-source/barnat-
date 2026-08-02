(() => {
  'use strict';

  let lastFocused = null;
  let uiFrame = 0;
  const bannerTimers = new Map();

  function loadFinalWorkspaceAssets() {
    if (!document.querySelector('link[data-medindex-workspace-final]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'clinical-workspace-final.css?v=20260801-1';
      link.dataset.medindexWorkspaceFinal = '1';
      document.head.appendChild(link);
    }
    if (!document.getElementById('medindexWorkspaceResponsiveSafety')) {
      const style = document.createElement('style');
      style.id = 'medindexWorkspaceResponsiveSafety';
      style.textContent = '@media(max-width:760px){html.medindex-workspace-final #dataTable{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important}}';
      document.head.appendChild(style);
    }
    if (!document.querySelector('script[data-medindex-workspace-final]')) {
      const script = document.createElement('script');
      script.src = 'clinical-workspace-final.js?v=20260801-1';
      script.async = false;
      script.dataset.medindexWorkspaceFinal = '1';
      document.head.appendChild(script);
    }
  }

  function loadIcdProblemListAssets() {
    const pageName = String(document.documentElement.dataset.miPage || '').trim().toLowerCase();
    const pathname = String(window.location.pathname || '').toLowerCase();
    const prescriptionPage = pageName === 'recetat'
      || /\/recetat(?:\.html)?$/.test(pathname)
      || Boolean(document.getElementById('rxComposer') || document.getElementById('rxDiagnosis'));
    const icdPage = pageName === 'icd'
      || /\/icd(?:\.html)?$/.test(pathname)
      || Boolean(document.getElementById('icdContent'));
    if (!prescriptionPage && !icdPage) return;
    if (prescriptionPage && !document.getElementById('rxContent')) {
      const marker = document.createElement('span');
      marker.id = 'rxContent';
      marker.hidden = true;
      marker.setAttribute('aria-hidden', 'true');
      document.body.appendChild(marker);
    }
    if (!document.querySelector('link[data-mi-icd-problem-list]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'icd-problem-list.css?v=icd-problem-list-v1';
      link.dataset.miIcdProblemList = '1';
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-mi-icd-problem-list]')) {
      const script = document.createElement('script');
      script.src = 'icd-problem-list.js?v=icd-problem-list-v1';
      script.async = false;
      script.dataset.miIcdProblemList = '1';
      document.head.appendChild(script);
    }
  }

  function banner(className, message, persistent = false) {
    let node = document.querySelector(`.${className}`);
    if (!node) {
      node = document.createElement('div');
      node.className = className;
      node.setAttribute('role', className === 'app-error-banner' ? 'alert' : 'status');
      node.setAttribute('aria-live', className === 'app-error-banner' ? 'assertive' : 'polite');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(bannerTimers.get(className));
    bannerTimers.delete(className);
    if (!persistent) {
      const timer = window.setTimeout(() => {
        node.hidden = true;
        bannerTimers.delete(className);
      }, 5500);
      bannerTimers.set(className, timer);
    }
    return node;
  }

  function updateConnectivity() {
    const existing = document.querySelector('.offline-banner');
    if (navigator.onLine) {
      if (existing && !existing.hidden) {
        existing.textContent = 'Lidhja u rikthye.';
        clearTimeout(bannerTimers.get('offline-banner'));
        const timer = setTimeout(() => {
          existing.hidden = true;
          bannerTimers.delete('offline-banner');
        }, 1800);
        bannerTimers.set('offline-banner', timer);
      }
      document.documentElement.classList.remove('is-offline');
    } else {
      document.documentElement.classList.add('is-offline');
      banner('offline-banner', 'Nuk ka internet. Të dhënat e ruajtura lokalisht vazhdojnë të punojnë.', true);
    }
  }

  function isIgnorableProblem(value) {
    const name = String(value?.name || value?.reason?.name || '');
    const message = String(value?.message || value?.reason?.message || value || '');
    return name === 'AbortError' || /ResizeObserver loop|Sesioni nuk është aktiv|Kërkohet autentikim/i.test(message);
  }

  function reportRuntimeProblem(event) {
    if (isIgnorableProblem(event)) return;
    banner('app-error-banner', 'Ndodhi një gabim i papritur. Të dhënat e ruajtura nuk janë fshirë; provo veprimin përsëri.');
  }

  function visibleDialog() {
    const selectors = [
      '.atc-info-overlay.open [role="dialog"]',
      '.med-panel-overlay:not([hidden]) [role="dialog"]',
      '#miOverlay:not([hidden]) [role="dialog"]',
      '#rxDosageChooser:not([hidden]) [role="dialog"]',
      '[data-modal-overlay]:not([hidden]) [role="dialog"]',
      '#mwProtocolDialog[open]',
    ];
    return selectors.map(selector => document.querySelector(selector)).find(Boolean) || null;
  }

  function focusable(dialog) {
    return [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(node => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.offsetParent !== null);
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const dialog = visibleDialog();
    if (!dialog) return;
    const items = focusable(dialog);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (!dialog.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeTransientUi(event) {
    if (event.key !== 'Escape' || visibleDialog()) return;
    document.querySelectorAll('.col-panel.open,.form-panel.open').forEach(node => node.classList.remove('open'));
    document.querySelectorAll('.rx-popover:not([hidden]),.drug-action-card:not([hidden])').forEach(node => { node.hidden = true; });
    document.querySelectorAll('[aria-expanded="true"]').forEach(node => node.setAttribute('aria-expanded', 'false'));
  }

  function overlayIsOpen(overlay) {
    if (!overlay) return false;
    if (overlay.classList.contains('atc-info-overlay')) return overlay.classList.contains('open') && overlay.getAttribute('aria-hidden') !== 'true';
    if (overlay.matches?.('#mwProtocolDialog')) return overlay.hasAttribute('open');
    return !overlay.hidden && !overlay.hasAttribute('hidden') && overlay.getAttribute('aria-hidden') !== 'true';
  }

  function syncControlledDisclosures() {
    document.querySelectorAll('[aria-controls]').forEach(trigger => {
      const target = document.getElementById(trigger.getAttribute('aria-controls'));
      if (!target) return;
      let expanded;
      if (target.classList.contains('form-panel') || target.classList.contains('col-panel')) expanded = target.classList.contains('open');
      else expanded = !target.hidden && !target.hasAttribute('hidden') && target.getAttribute('aria-hidden') !== 'true';
      const value = String(expanded);
      if (trigger.getAttribute('aria-expanded') !== value) trigger.setAttribute('aria-expanded', value);
    });
  }

  function reconcileRecentSecondaryButtons() {
    const primaryCode = String(window.MedIndexPrescriptionIcdContext?.current?.()?.code || '').trim().toUpperCase();
    document.querySelectorAll('#rxIcdRecent .rx-icd-recent-item').forEach(article => {
      const code = String(article.querySelector('.rx-icd-recent-code')?.textContent || '').trim().toUpperCase();
      if (!code) return;
      let button = article.querySelector('[data-mi-recent-secondary]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'rx-icd-recent-secondary';
        article.appendChild(button);
      }
      button.dataset.miRecentSecondary = code;
      button.textContent = 'Shoqëruese';
      button.setAttribute('aria-label', `Shto ${code} si diagnozë shoqëruese`);
      const isPrimary = Boolean(primaryCode && code === primaryCode);
      button.hidden = isPrimary;
      button.disabled = isPrimary;
    });
  }

  function reconcileUi() {
    uiFrame = 0;
    syncControlledDisclosures();
    reconcileRecentSecondaryButtons();
    const dialog = visibleDialog();
    if (dialog && !dialog.dataset.stabilityFocus) {
      lastFocused = document.activeElement;
      dialog.dataset.stabilityFocus = '1';
      requestAnimationFrame(() => focusable(dialog)[0]?.focus());
    }
    document.querySelectorAll('[data-stability-focus="1"]').forEach(node => {
      const overlay = node.closest('.atc-info-overlay,.med-panel-overlay,#miOverlay,#rxDosageChooser,[data-modal-overlay],#mwProtocolDialog');
      if (overlayIsOpen(overlay)) return;
      delete node.dataset.stabilityFocus;
      if (lastFocused?.isConnected) lastFocused.focus({ preventScroll:true });
      lastFocused = null;
    });
  }

  function scheduleReconcile() {
    if (!uiFrame) uiFrame = requestAnimationFrame(reconcileUi);
  }

  function installPerformanceHints(root = document) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll('input[type="search"]:not([data-stability-ready])').forEach(input => {
      input.dataset.stabilityReady = '1';
      input.setAttribute('enterkeyhint', 'search');
      input.setAttribute('autocapitalize', 'none');
      input.setAttribute('spellcheck', 'false');
    });
    root.querySelectorAll('button:not([type])').forEach(button => { button.type = 'button'; });
    root.querySelectorAll('img:not([loading])').forEach(image => {
      if (!image.closest('.mi-brand,.clinical-hero,.med-hero')) image.loading = 'lazy';
      if (!image.decoding) image.decoding = 'async';
    });
  }

  function watchUi() {
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          installPerformanceHints(node);
          if (node.matches?.('input[type="search"],button:not([type]),img:not([loading])')) installPerformanceHints(node.parentElement || node);
        }
      }));
      scheduleReconcile();
    });
    observer.observe(document.body, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['class', 'hidden', 'aria-hidden'],
    });
    reconcileUi();
  }

  function clearPrivateClientCaches() {
    try {
      ['barnat-registry-parts-v4', 'barnat-registry-cached-at-v4', 'medindexPrescriptionSelection'].forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
    } catch {}
  }

  function clearPrescriptionRegistryCacheOnLogout(event) {
    if (event.target?.closest?.('.auth-logout')) clearPrivateClientCaches();
  }

  function init() {
    loadFinalWorkspaceAssets();
    loadIcdProblemListAssets();
    updateConnectivity();
    installPerformanceHints();
    watchUi();
    window.addEventListener('online', updateConnectivity, { passive:true });
    window.addEventListener('offline', updateConnectivity, { passive:true });
    window.addEventListener('error', event => {
      if (event?.target && event.target !== window) return;
      reportRuntimeProblem(event.error || event);
    });
    window.addEventListener('unhandledrejection', event => reportRuntimeProblem(event.reason || event));
    document.addEventListener('keydown', trapFocus, true);
    document.addEventListener('keydown', closeTransientUi, true);
    document.addEventListener('click', clearPrescriptionRegistryCacheOnLogout, true);
    window.MEDINDEX_RUNTIME = { version:'2026-08-02.1', online:() => navigator.onLine, clearPrivateClientCaches };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
