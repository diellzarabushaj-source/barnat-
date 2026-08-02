(() => {
  'use strict';

  const DRAFT_KEY = 'medindex_rx_autodraft_v1';
  const DIAGNOSIS_CONTEXT_KEY = 'medindex_rx_diagnosis_context_v2';
  const LEGACY_DIAGNOSIS_KEY = 'medindex_rx_diagnosis_v1';
  const SELECTION_KEY = 'medindexPrescriptionSelection';
  const SAVED_KEY = 'regjistriBarnave_protokollet_v1';
  const BRIDGE_VERSION = 'icd-context-v2';
  const CONTEXT_VERSION = 2;
  const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const CONTEXT_MAX_AGE = 30 * 60 * 1000;
  const MAX_DRAFT_CHARS = 20000;
  const MAX_SELECTION_ITEMS = 50;
  const PRESCRIBABLE_LEVELS = new Set(['category', 'subcategory']);
  const ICD_CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let reconciled = false;
  let activeContext = null;
  let pendingContext = null;
  let savedObserver = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 500) => String(value ?? '').slice(0, max).trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function ensureStyles() {
    if (document.getElementById('miPrescriptionIcdContextCss')) return;
    const link = document.createElement('link');
    link.id = 'miPrescriptionIcdContextCss';
    link.rel = 'stylesheet';
    link.href = `/prescription-icd-context.css?v=${BRIDGE_VERSION}`;
    document.head.appendChild(link);
  }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(clean(value));
      return url.protocol === 'https:' && url.hostname === 'icd.who.int' ? url.href : '';
    } catch {
      return '';
    }
  }

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

  function normalizeDiagnosisContext(value, { allowHistorical = false } = {}) {
    let raw = value;
    if (typeof raw === 'string') {
      const text = safeText(raw, 5000);
      if (!text) return null;
      try { raw = JSON.parse(text); }
      catch { return { version:1, legacy:true, display:safeText(text, 1000) }; }
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (Number(raw.version) !== CONTEXT_VERSION) return null;
    const code = safeText(raw.code, 24).toUpperCase();
    const level = safeText(raw.level, 24).toLowerCase();
    const titleSq = safeText(raw.titleSq, 500);
    const titleEn = safeText(raw.titleEn, 500);
    const selectedAt = Number(raw.selectedAt);
    if (!ICD_CODE_PATTERN.test(code) || !PRESCRIBABLE_LEVELS.has(level)) return null;
    if (!titleSq && !titleEn) return null;
    if (!allowHistorical) {
      if (!Number.isFinite(selectedAt) || selectedAt > Date.now() + 5 * 60 * 1000 || Date.now() - selectedAt > CONTEXT_MAX_AGE) return null;
    }
    const display = `${code} — ${titleSq || titleEn}`.slice(0, 1000);
    return Object.freeze({
      version:CONTEXT_VERSION,
      system:'ICD-10-WHO 2019',
      source:'medindex-icd-browser',
      code,
      level,
      titleSq,
      titleEn,
      display,
      translationStatus:safeText(raw.translationStatus, 40),
      sourceUrl:safeHttpsUrl(raw.sourceUrl),
      childCount:Math.max(0, Math.min(9999, Number(raw.childCount || 0))),
      selectedAt:Number.isFinite(selectedAt) ? selectedAt : Date.now(),
    });
  }

  function readPendingDiagnosis() {
    try {
      const structured = sessionStorage.getItem(DIAGNOSIS_CONTEXT_KEY);
      const legacy = structured ? '' : sessionStorage.getItem(LEGACY_DIAGNOSIS_KEY);
      sessionStorage.removeItem(DIAGNOSIS_CONTEXT_KEY);
      sessionStorage.removeItem(LEGACY_DIAGNOSIS_KEY);
      return normalizeDiagnosisContext(structured || legacy);
    } catch {
      return null;
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

  function ensureContextHost() {
    let host = document.getElementById('rxIcdContext');
    if (host) return host;
    const diagnosis = document.getElementById('rxDiagnosis');
    const label = diagnosis?.closest('.rx-diagnosis') || diagnosis?.parentElement;
    if (!diagnosis || !label) return null;
    host = document.createElement('div');
    host.id = 'rxIcdContext';
    host.className = 'rx-icd-context';
    host.hidden = true;
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    label.insertAdjacentElement('afterend', host);
    return host;
  }

  function levelLabel(level) {
    return level === 'subcategory' ? 'Nënkategori' : level === 'category' ? 'Kategori' : level;
  }

  function renderContext(context, { pending = false } = {}) {
    const host = ensureContextHost();
    const diagnosisLabel = document.getElementById('rxDiagnosis')?.closest('.rx-diagnosis');
    if (!host || !context || context.legacy) {
      if (host) { host.hidden = true; host.innerHTML = ''; host.className = 'rx-icd-context'; }
      diagnosisLabel?.classList.remove('has-icd-context');
      return;
    }
    const specificity = context.childCount > 0 ? ` · ${context.childCount} nënkode direkte` : ' · pa nënkode direkte';
    const translation = context.translationStatus === 'standardized' ? 'term i standardizuar'
      : context.translationStatus === 'verified' ? 'term i verifikuar'
        : context.translationStatus === 'missing' ? 'pa përkthim shqip' : 'draft terminologjik';
    host.className = `rx-icd-context${pending ? ' is-pending' : ''}`;
    host.hidden = false;
    host.innerHTML = `<span class="rx-icd-code">${esc(context.code)}</span>
      <span class="rx-icd-copy"><strong>${esc(context.titleSq || context.titleEn)}</strong><small>${pending ? 'Kodi pret konfirmim; diagnoza ekzistuese nuk u mbishkrua.' : `${esc(levelLabel(context.level))} · ${esc(translation)}${esc(specificity)}`}</small></span>
      <span class="rx-icd-actions">
        ${context.sourceUrl ? `<a href="${esc(context.sourceUrl)}" target="_blank" rel="noopener noreferrer">WHO</a>` : ''}
        ${pending ? '<button class="is-primary" type="button" data-icd-context-apply>Apliko kodin</button>' : ''}
        <button type="button" data-icd-context-clear>${pending ? 'Mos e apliko' : 'Hiqe lidhjen'}</button>
      </span>`;
    diagnosisLabel?.classList.toggle('has-icd-context', !pending);
  }

  function emitContext(reason = '') {
    window.dispatchEvent(new CustomEvent('medindex:prescription-icd-context', {
      detail:{ context:activeContext, pending:pendingContext, reason },
    }));
  }

  function clearContext(reason = 'cleared') {
    activeContext = null;
    pendingContext = null;
    renderContext(null);
    emitContext(reason);
  }

  function applyContext(context, { force = false, announce = true } = {}) {
    const diagnosis = document.getElementById('rxDiagnosis');
    if (!diagnosis || !context) return false;
    if (context.legacy) {
      if (!clean(diagnosis.value) || force) {
        diagnosis.value = context.display;
        dispatchInput(diagnosis);
        return true;
      }
      return false;
    }
    const existing = clean(diagnosis.value);
    if (existing && existing !== context.display && !force) {
      pendingContext = context;
      activeContext = null;
      renderContext(context, { pending:true });
      emitContext('conflict');
      return false;
    }
    activeContext = context;
    pendingContext = null;
    diagnosis.value = context.display;
    renderContext(context);
    dispatchInput(diagnosis);
    if (announce) {
      const status = document.getElementById('rxStatus');
      if (status) status.textContent = 'Kodi ICD-10 u aplikua me metadata dhe burim. Kontrolloje para ruajtjes.';
    }
    emitContext('applied');
    return true;
  }

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeSaved(items) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(items)); } catch {}
  }

  function currentSavedCandidate(items) {
    const diagnosis = clean(document.getElementById('rxDiagnosis')?.value);
    const composer = String(document.getElementById('rxComposer')?.value || '');
    return items
      .filter(item => clean(item?.indication) === diagnosis && String(item?.sourceText || '') === composer)
      .sort((a, b) => Date.parse(b?.updatedAt || 0) - Date.parse(a?.updatedAt || 0))[0] || null;
  }

  function serializableContext(context) {
    if (!context || context.legacy) return null;
    return {
      version:CONTEXT_VERSION,
      system:context.system,
      source:context.source,
      code:context.code,
      level:context.level,
      titleSq:context.titleSq,
      titleEn:context.titleEn,
      display:context.display,
      translationStatus:context.translationStatus,
      sourceUrl:context.sourceUrl,
      childCount:context.childCount,
      selectedAt:context.selectedAt,
      linkedAt:Date.now(),
    };
  }

  function persistContextAfterSave() {
    const items = readSaved();
    const candidate = currentSavedCandidate(items);
    if (!candidate) return false;
    const diagnosis = clean(document.getElementById('rxDiagnosis')?.value);
    if (activeContext && diagnosis === activeContext.display) candidate.diagnosisCoding = serializableContext(activeContext);
    else delete candidate.diagnosisCoding;
    writeSaved(items);
    decorateSavedCards();
    return true;
  }

  function restoreSavedContext(id) {
    const protocol = readSaved().find(item => String(item?.id) === String(id));
    const context = normalizeDiagnosisContext(protocol?.diagnosisCoding, { allowHistorical:true });
    const diagnosis = clean(document.getElementById('rxDiagnosis')?.value);
    if (context && diagnosis === context.display) applyContext(context, { force:true, announce:false });
    else clearContext('saved-without-context');
  }

  function decorateSavedCards() {
    const list = document.getElementById('rxSavedList');
    if (!list) return;
    const byId = new Map(readSaved().map(item => [String(item?.id), item]));
    list.querySelectorAll('[data-open-saved]').forEach(button => {
      const card = button.closest('.rx-saved-card');
      const tags = card?.querySelector('.rx-saved-tags');
      const protocol = byId.get(String(button.dataset.openSaved));
      const context = normalizeDiagnosisContext(protocol?.diagnosisCoding, { allowHistorical:true });
      let badge = tags?.querySelector('.rx-icd-saved-badge');
      if (!context) { badge?.remove(); return; }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'rx-icd-saved-badge';
        tags?.appendChild(badge);
      }
      badge.textContent = context.code;
      badge.title = `${context.code} — ${context.titleSq || context.titleEn}`;
    });
  }

  function installSavedObserver() {
    const list = document.getElementById('rxSavedList');
    if (!list || savedObserver) return;
    savedObserver = new MutationObserver(() => requestAnimationFrame(decorateSavedCards));
    savedObserver.observe(list, { childList:true, subtree:true });
    decorateSavedCards();
  }

  function reconcilePrescriptionContext() {
    if (reconciled || !/\/recetat\.html$/.test(location.pathname)) return false;
    const composer = document.getElementById('rxComposer');
    const diagnosis = document.getElementById('rxDiagnosis');
    if (!composer || !diagnosis) return false;

    ensureStyles();
    ensureContextHost();
    installSavedObserver();
    const draft = readDraft();
    const pendingDiagnosis = readPendingDiagnosis();
    let restored = false;

    if (!clean(composer.value) && clean(draft?.composer)) {
      composer.value = draft.composer;
      dispatchInput(composer);
      restored = true;
    }

    if (!clean(diagnosis.value) && clean(draft?.diagnosis)) {
      diagnosis.value = draft.diagnosis;
      dispatchInput(diagnosis);
      restored = true;
    }

    if (pendingDiagnosis) {
      const applied = applyContext(pendingDiagnosis, { force:false, announce:false });
      restored ||= applied;
      const status = document.getElementById('rxStatus');
      if (status) status.textContent = applied
        ? 'Drafti u rikthye dhe kodi ICD-10 u aplikua. Kontrolloje para ruajtjes.'
        : 'Diagnoza ekzistuese u ruajt. Kodi ICD-10 pret konfirmimin tënd.';
    } else if (restored) {
      const status = document.getElementById('rxStatus');
      if (status) status.textContent = 'Drafti i fundit u rikthye automatikisht. Kontrolloje para ruajtjes.';
    }

    diagnosis.addEventListener('input', () => {
      if (activeContext && clean(diagnosis.value) !== activeContext.display) clearContext('manual-edit');
    });

    document.addEventListener('click', event => {
      const apply = event.target.closest('[data-icd-context-apply]');
      const clear = event.target.closest('[data-icd-context-clear]');
      const openSaved = event.target.closest('[data-open-saved]');
      if (apply && pendingContext) applyContext(pendingContext, { force:true });
      if (clear) clearContext('user-cleared');
      if (event.target.closest('#rxSave')) setTimeout(persistContextAfterSave, 0);
      if (openSaved) setTimeout(() => restoreSavedContext(openSaved.dataset.openSaved), 0);
      if (event.target.closest('#rxClear,#rxNew')) setTimeout(() => {
        if (!clean(diagnosis.value)) clearContext('new-prescription');
      }, 0);
    });

    reconciled = true;
    window.MedIndexPrescriptionIcdContext = Object.freeze({
      version:BRIDGE_VERSION,
      current:() => activeContext,
      pending:() => pendingContext,
      normalize:normalizeDiagnosisContext,
      apply:context => applyContext(normalizeDiagnosisContext(context, { allowHistorical:true }), { force:true }),
      clear:clearContext,
      persist:persistContextAfterSave,
    });
    document.documentElement.dataset.miPrescriptionIcd = BRIDGE_VERSION;
    window.dispatchEvent(new CustomEvent('medindex:prescription-context-ready', {
      detail:{ restored, diagnosisTransferred:Boolean(pendingDiagnosis), context:activeContext, pending:pendingContext },
    }));
    return restored;
  }

  function resetDuplicatedReview(event) {
    const button = event.target?.closest?.('[data-duplicate-saved]');
    if (!button) return;
    setTimeout(() => {
      const saved = readSaved();
      if (!saved.length) return;
      const newest = saved[0];
      if (!newest || !String(newest.name || '').endsWith('— kopje')) return;
      newest.generatedSignatureReviewed = false;
      newest.dosageReviewed = false;
      newest.clinicalReview = false;
      newest.reviewedAt = '';
      newest.updatedAt = new Date().toISOString();
      writeSaved(saved);
      decorateSavedCards();
    }, 0);
  }

  prepareTransferredSelection();
  document.addEventListener('click', resetDuplicatedReview, true);
  window.addEventListener('medindex:clinical-workflow-ready', () => requestAnimationFrame(reconcilePrescriptionContext), { once:true });
  window.addEventListener('pageshow', () => requestAnimationFrame(reconcilePrescriptionContext), { once:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(reconcilePrescriptionContext, 120), { once:true });
  else setTimeout(reconcilePrescriptionContext, 120);
})();
