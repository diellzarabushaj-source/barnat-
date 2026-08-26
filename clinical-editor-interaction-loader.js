(() => {
  'use strict';

  const VERSION = 'clinical-editor-interaction-lazy-v1';
  const PHONE_QUERY = '(max-width: 767px)';
  const sourceTag = document.currentScript;
  const runtimeSrc = sourceTag?.dataset?.clinicalEditorRuntime || 'clinical-editor.js?v=20260729-1';
  const phoneMedia = window.matchMedia?.(PHONE_QUERY) || null;
  let runtimePromise = null;
  let trigger = null;

  function runtimeReady() {
    return Boolean(window.MedIndexClinicalEditor?.openNext);
  }

  function phoneOwnsToolbar() {
    return Boolean(phoneMedia?.matches || window.MEDINDEX_MOBILE_LITE_ACTIVE);
  }

  function removeTrigger() {
    if (trigger?.isConnected) trigger.remove?.();
    trigger = null;
  }

  function ensureTrigger() {
    if (phoneOwnsToolbar()) {
      removeTrigger();
      return null;
    }
    if (trigger?.isConnected) return trigger;
    trigger = document.querySelector('[data-clinical-editor-lazy-trigger]');
    if (trigger?.isConnected) return trigger;

    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return null;

    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'clinical-editor-progress';
    trigger.dataset.clinicalEditorLazyTrigger = VERSION;
    trigger.textContent = 'Auditimi';
    trigger.title = 'Hap auditimin klinik';

    const reference = document.getElementById('countBadge');
    if (reference?.parentElement === toolbar) toolbar.insertBefore(trigger, reference);
    else toolbar.appendChild(trigger);

    if (trigger.dataset.clinicalEditorLazyBound !== VERSION) {
      trigger.dataset.clinicalEditorLazyBound = VERSION;
      trigger.addEventListener('click', onIntent);
    }
    return trigger;
  }

  function syncTriggerOwnership() {
    if (phoneOwnsToolbar()) {
      removeTrigger();
      return null;
    }
    return ensureTrigger();
  }

  function loadRuntime() {
    if (runtimeReady()) return Promise.resolve(window.MedIndexClinicalEditor);
    if (runtimePromise) return runtimePromise;

    document.documentElement.dataset.clinicalEditorRuntime = 'loading';
    runtimePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = runtimeSrc;
      script.async = false;
      script.dataset.medindexLazyClinicalEditor = VERSION;
      script.addEventListener('load', () => {
        if (!runtimeReady()) {
          reject(new Error('Clinical editor runtime u ngarkua pa API-n e pritshme.'));
          return;
        }
        document.documentElement.dataset.clinicalEditorRuntime = 'ready';
        resolve(window.MedIndexClinicalEditor);
      }, { once:true });
      script.addEventListener('error', () => {
        reject(new Error('Clinical editor runtime nuk u ngarkua.'));
      }, { once:true });
      document.head.appendChild(script);
    }).catch(error => {
      runtimePromise = null;
      document.documentElement.dataset.clinicalEditorRuntime = 'error';
      throw error;
    });

    return runtimePromise;
  }

  async function onIntent(event) {
    if (runtimeReady()) return;
    event?.preventDefault?.();
    const button = ensureTrigger();
    if (!button) return;
    const previousText = button.textContent || 'Auditimi';
    button.disabled = true;
    button.textContent = 'Duke hapur…';
    button.setAttribute('aria-busy', 'true');

    try {
      const editor = await loadRuntime();
      button.disabled = false;
      button.removeAttribute('aria-busy');
      await editor.openNext();
    } catch (error) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = previousText;
      button.title = String(error?.message || error);
      console.error('Clinical editor lazy runtime failed:', error);
    }
  }

  function start() {
    syncTriggerOwnership();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once:true });
  } else {
    start();
  }
  window.addEventListener('medindex:registry-ready', start);
  phoneMedia?.addEventListener?.('change', start);

  window.MEDINDEX_CLINICAL_EDITOR_LOADER = Object.freeze({
    version:VERSION,
    load:loadRuntime,
    ready:runtimeReady,
  });
})();