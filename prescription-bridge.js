(() => {
  'use strict';

  const DRAFT_KEY = 'medindex_rx_autodraft_v1';
  const DIAGNOSIS_KEY = 'medindex_rx_diagnosis_v1';
  const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  let reconciled = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function readDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!draft || draft.version !== 1) return null;
      if (!Number.isFinite(Number(draft.savedAt)) || Date.now() - Number(draft.savedAt) > DRAFT_MAX_AGE) return null;
      return draft;
    } catch {
      return null;
    }
  }

  function readPendingDiagnosis() {
    try {
      const value = sessionStorage.getItem(DIAGNOSIS_KEY) || '';
      if (value) sessionStorage.removeItem(DIAGNOSIS_KEY);
      return value;
    } catch {
      return '';
    }
  }

  function dispatchInput(node) {
    node?.dispatchEvent(new Event('input', { bubbles:true }));
  }

  function reconcilePrescriptionContext() {
    if (reconciled || !/\/recetat\.html$/.test(location.pathname)) return false;
    const composer = document.getElementById('rxComposer');
    const diagnosis = document.getElementById('rxDiagnosis');
    if (!composer || !diagnosis) return false;

    const draft = readDraft();
    const pendingDiagnosis = readPendingDiagnosis();
    let restored = false;

    if (!clean(composer.value) && clean(draft?.composer)) {
      composer.value = String(draft.composer);
      dispatchInput(composer);
      restored = true;
    }

    if (pendingDiagnosis) {
      diagnosis.value = pendingDiagnosis;
      dispatchInput(diagnosis);
      restored = true;
    } else if (!clean(diagnosis.value) && clean(draft?.diagnosis)) {
      diagnosis.value = String(draft.diagnosis);
      dispatchInput(diagnosis);
      restored = true;
    }

    if (restored) {
      const status = document.getElementById('rxStatus');
      if (status) status.textContent = pendingDiagnosis
        ? 'Drafti u ruajt dhe diagnoza e zgjedhur nga ICD u aplikua. Kontrolloje para ruajtjes.'
        : 'Drafti i fundit u rikthye automatikisht.';
    }
    reconciled = true;
    window.dispatchEvent(new CustomEvent('medindex:prescription-context-ready', {
      detail:{ restored, diagnosisTransferred:Boolean(pendingDiagnosis) },
    }));
    return restored;
  }

  window.addEventListener('medindex:clinical-workflow-ready', () => requestAnimationFrame(reconcilePrescriptionContext), { once:true });
  window.addEventListener('pageshow', () => requestAnimationFrame(reconcilePrescriptionContext), { once:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(reconcilePrescriptionContext, 120), { once:true });
  else setTimeout(reconcilePrescriptionContext, 120);
})();
