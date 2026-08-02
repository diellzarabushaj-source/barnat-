(function bootstrapIcdClinicalGuidanceRecovery(root) {
  'use strict';

  if (!root?.document) return;
  const VERSION = 'icd-clinical-guidance-recovery-v3';
  let observer = null;
  let clickBound = false;

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
      button.dataset.miIcdClinicalRetryVisible = '';
      button.textContent = 'Riprovo listën klinike';
      button.style.marginTop = '12px';
      const content = empty.querySelector('div') || empty;
      content.appendChild(button);
    }
  }

  function bindControlledReload() {
    if (clickBound) return;
    clickBound = true;
    root.document.addEventListener('click', event => {
      const button = event.target.closest('[data-mi-icd-clinical-retry-visible]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Duke u rilidhur…';
      root.location.reload();
    }, { capture:true });
  }

  function init() {
    const state = root.document.getElementById('icdClinicalGuidanceState');
    if (!state) return false;
    ensureRetryControl();
    bindControlledReload();
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
