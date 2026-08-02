(function bootstrapIcdClinicalGuidanceRecovery(root) {
  'use strict';

  if (!root?.document) return;
  const VERSION = 'icd-clinical-guidance-recovery-v6';
  let observer = null;
  let retryTimer = 0;

  function stateNode() {
    return root.document.getElementById('icdClinicalGuidanceState');
  }

  function setButtonReady(button) {
    if (!button?.isConnected) return;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = 'Riprovo listën klinike';
  }

  function activeCode() {
    const value = String(root.document.getElementById('icdCodingWorkspaceCode')?.textContent || '').trim().toUpperCase();
    return root.MedIndexIcdClinicalGuidance?.normalizeCode?.(value) || (/^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/.test(value) ? value : '');
  }

  function retry(button) {
    const code = activeCode();
    if (!code) {
      setButtonReady(button);
      return;
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Duke u rilidhur…';
    root.document.documentElement.dataset.miIcdClinicalRecoveryAttempt = code;
    root.clearTimeout(retryTimer);

    root.setTimeout(() => {
      root.dispatchEvent(new root.CustomEvent('medindex:icd-state', {
        detail:{ code, source:'clinical-recovery', force:true },
      }));

      root.setTimeout(() => {
        if (stateNode()?.dataset.tone !== 'error') return;
        const internalRetry = root.document.querySelector('[data-mi-icd-clinical-retry]');
        internalRetry?.click();
      }, 250);
    }, 0);

    retryTimer = root.setTimeout(() => {
      if (stateNode()?.dataset.tone === 'error') setButtonReady(button);
    }, 8000);
  }

  function bindButton(button) {
    if (!button || button.dataset.miIcdClinicalRetryBound === 'true') return;
    button.dataset.miIcdClinicalRetryBound = 'true';
    button.addEventListener('click', event => {
      event.preventDefault();
      retry(button);
    }, { capture:true });
  }

  function ensureRetryControl() {
    const state = stateNode();
    const empty = root.document.getElementById('icdClinicalGuidanceEmpty');
    if (!state || !empty) return;

    let button = empty.querySelector('[data-mi-icd-clinical-retry-visible]');
    const failed = state.dataset.tone === 'error';
    if (!failed) {
      button?.remove();
      return;
    }

    if (!button) {
      button = root.document.createElement('button');
      button.type = 'button';
      button.className = 'icd-tree-action';
      button.dataset.miIcdClinicalRetryVisible = '';
      button.textContent = 'Riprovo listën klinike';
      button.style.marginTop = '12px';
      const content = empty.querySelector('div') || empty;
      content.appendChild(button);
    }
    bindButton(button);
  }

  function init() {
    const state = stateNode();
    if (!state) return false;
    ensureRetryControl();
    observer?.disconnect();
    observer = new MutationObserver(ensureRetryControl);
    observer.observe(state, {
      attributes:true,
      attributeFilter:['data-tone'],
      childList:true,
      characterData:true,
      subtree:true,
    });
    root.document.documentElement.dataset.miIcdClinicalGuidanceRecovery = VERSION;
    return true;
  }

  const start = () => {
    if (init()) return;
    let attempts = 0;
    const timer = root.setInterval(() => {
      attempts += 1;
      if (init() || attempts >= 40) root.clearInterval(timer);
    }, 100);
  };

  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null);
