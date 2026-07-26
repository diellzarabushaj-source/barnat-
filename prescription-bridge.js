(() => {
  'use strict';

  const DRAFT_KEY = 'medindex_rx_autodraft_v1';
  const DIAGNOSIS_KEY = 'medindex_rx_diagnosis_v1';
  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const SAVED_KEY = 'regjistriBarnave_protokollet_v1';
  const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const MAX_DRAFT_CHARS = 20000;
  const MAX_SELECTION_ITEMS = 50;
  let reconciled = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 500) => String(value ?? '').slice(0, max).trim();

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  function readDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!draft || draft.version !== 1) return null;
      const savedAt = Number(draft.savedAt);
      const composer = String(draft.composer ?? '');
      const diagnosis = String(draft.diagnosis ?? '');
      if (!Number.isFinite(savedAt) || savedAt > Date.now() + 5 * 60 * 1000 || Date.now() - savedAt > DRAFT_MAX_AGE) {
        clearDraft();
        return null;
      }
      if (composer.length > MAX_DRAFT_CHARS || diagnosis.length > 1000) {
        clearDraft();
        return null;
      }
      return { ...draft, composer, diagnosis };
    } catch {
      clearDraft();
      return null;
    }
  }

  function readPendingDiagnosis() {
    try {
      const value = safeText(sessionStorage.getItem(DIAGNOSIS_KEY), 1000);
      if (value) sessionStorage.removeItem(DIAGNOSIS_KEY);
      return value;
    } catch {
      return '';
    }
  }

  function normalizeTransferredDrug(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const substance = safeText(item.substance || item['Substanca aktive'], 240);
    if (!substance) return null;
    const tradeName = safeText(item.tradeName || item['Emri tregtar'], 240);
    const strength = safeText(item.strength || item['Fortësia'], 120);
    const form = safeText(item.form || item['Forma farmaceutike'], 120);
    const key = safeText(item.key, 500) || [substance, tradeName, strength, form].join('|');
    return {
      ...item,
      key,
      substance,
      tradeName,
      strength,
      form,
      dosageStatus:item.regimenId ? safeText(item.dosageStatus, 40) || 'requires-review' : 'requires-review',
      verificationStatus:safeText(item.verificationStatus, 80) || 'transferred-for-clinical-review',
      transferredAt:new Date().toISOString(),
    };
  }

  function prepareTransferredSelection() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || '[]');
      if (!Array.isArray(raw)) {
        sessionStorage.removeItem(SELECTION_KEY);
        return;
      }
      const seen = new Set();
      const normalized = raw.slice(0, MAX_SELECTION_ITEMS).map(normalizeTransferredDrug).filter(item => {
        if (!item || seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      });
      if (normalized.length) sessionStorage.setItem(SELECTION_KEY, JSON.stringify(normalized));
      else sessionStorage.removeItem(SELECTION_KEY);
    } catch {
      try { sessionStorage.removeItem(SELECTION_KEY); } catch {}
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
      composer.value = draft.composer;
      dispatchInput(composer);
      restored = true;
    }

    if (pendingDiagnosis) {
      diagnosis.value = pendingDiagnosis;
      dispatchInput(diagnosis);
      restored = true;
    } else if (!clean(diagnosis.value) && clean(draft?.diagnosis)) {
      diagnosis.value = draft.diagnosis;
      dispatchInput(diagnosis);
      restored = true;
    }

    if (restored) {
      const status = document.getElementById('rxStatus');
      if (status) status.textContent = pendingDiagnosis
        ? 'Drafti u rikthye dhe diagnoza e zgjedhur nga ICD u aplikua. Kontrolloje para ruajtjes.'
        : 'Drafti i fundit u rikthye automatikisht. Kontrolloje para ruajtjes.';
    }
    reconciled = true;
    window.dispatchEvent(new CustomEvent('medindex:prescription-context-ready', {
      detail:{ restored, diagnosisTransferred:Boolean(pendingDiagnosis) },
    }));
    return restored;
  }

  function resetDuplicatedReview(event) {
    const button = event.target?.closest?.('[data-duplicate-saved]');
    if (!button) return;
    setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
        if (!Array.isArray(saved) || !saved.length) return;
        const newest = saved[0];
        if (!newest || !String(newest.name || '').endsWith('— kopje')) return;
        newest.generatedSignatureReviewed = false;
        newest.dosageReviewed = false;
        newest.clinicalReview = false;
        newest.reviewedAt = '';
        newest.updatedAt = new Date().toISOString();
        localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
      } catch {}
    }, 0);
  }

  prepareTransferredSelection();
  document.addEventListener('click', resetDuplicatedReview, true);
  window.addEventListener('medindex:clinical-workflow-ready', () => requestAnimationFrame(reconcilePrescriptionContext), { once:true });
  window.addEventListener('pageshow', () => requestAnimationFrame(reconcilePrescriptionContext), { once:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(reconcilePrescriptionContext, 120), { once:true });
  else setTimeout(reconcilePrescriptionContext, 120);
})();