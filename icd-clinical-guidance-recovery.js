(function bootstrapIcdClinicalGuidanceRecovery(root) {
  'use strict';

  if (!root?.document) return;
  const VERSION = 'icd-clinical-guidance-recovery-v1';
  const CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let observer = null;
  let clickBound = false;

  function activeCode() {
    const code = String(root.document.getElementById('icdCodingWorkspaceCode')?.textContent || '').trim().toUpperCase();
    return CODE_PATTERN.test(code) ? code : '';
  }

  function rerenderActiveCode() {
    const code = activeCode();
    if (!code) return;
    root.dispatchEvent(new root.CustomEvent('medindex:icd-state', { detail:{ code } }));
  }

  function ensureRetryControl() {
    const document = root.document;
    const state = document.getElementById('icdClinicalGuidanceState');
    const empty = document.getElementById('icdClinicalGuidanceEmpty');
    if (!state || !empty) return;

    let button = empty.querySelector('[data-mi-icd-clinical-retry-visible]');
    const failed = state.dataset.tone === 'error';
    if (!failed) {
      button?.remove();
      return;
    }

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'icd-tree-action';
      button.dataset.miIcdClinicalRetry = '';
      button.dataset.miIcdClinicalRetryVisible = '';
      button.textContent = 'Riprovo listën klinike';
      button.style.marginTop = '12px';
      const content = empty.querySelector('div') || empty;
      content.appendChild(button);
    }
  }

  function bindRetryRerender() {
    if (clickBound) return;
    clickBound = true;
    root.document.addEventListener('click', event => {
      if (!event.target.closest('[data-mi-icd-clinical-retry-visible]')) return;
      root.setTimeout(rerenderActiveCode, 0);
    }, { capture:true });
  }

  function init() {
    const state = root.document.getElementById('icdClinicalGuidanceState');
    if (!state) return false;
    ensureRetryControl();
    bindRetryRerender();
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
