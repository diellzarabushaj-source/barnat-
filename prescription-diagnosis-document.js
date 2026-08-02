(function bootstrapPrescriptionDiagnosisDocument(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;

  root.MedIndexPrescriptionDocument = api;
  const start = () => api.init(root);
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null, function createPrescriptionDiagnosisDocument() {
  'use strict';

  const VERSION = 'prescription-diagnosis-document-v1';
  const SECONDARY_DRAFT_KEY = 'medindex_rx_problem_list_draft_v1';
  const MAX_SECONDARY = 5;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const VALID_LEVELS = new Set(['category', 'subcategory']);
  const CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let rootRef = null;
  let previewObserver = null;
  let printButtonObserver = null;
  let initialized = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 1000) => String(value ?? '').slice(0, max).trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function normalizeContext(value, { allowManual = false, now = Date.now() } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = safeText(value.code, 24).toUpperCase();
    const level = safeText(value.level, 24).toLowerCase();
    const titleSq = safeText(value.titleSq || value.albanianDraft || value.title, 500);
    const titleEn = safeText(value.titleEn || value.englishTitle, 500);
    const selectedAt = Number(value.selectedAt || value.linkedAt || now);

    if (!code && allowManual && titleSq) {
      return { code:'', level:'text', titleSq, titleEn:'', display:titleSq, selectedAt:now, manual:true };
    }
    if (!CODE_PATTERN.test(code) || !VALID_LEVELS.has(level)) return null;
    if (!titleSq && !titleEn) return null;
    if (!Number.isFinite(selectedAt) || selectedAt <= 0 || selectedAt > now + 5 * 60 * 1000) return null;
    return {
      code,
      level,
      titleSq,
      titleEn,
      display:`${code} — ${titleSq || titleEn}`.slice(0, 1000),
      selectedAt,
      manual:false,
    };
  }

  function normalizeItems(values, { primaryCode = '', now = Date.now() } = {}) {
    const seen = new Set();
    const primary = safeText(primaryCode, 24).toUpperCase();
    const result = [];
    for (const raw of Array.isArray(values) ? values : []) {
      const item = normalizeContext(raw, { now });
      if (!item || item.code === primary || seen.has(item.code)) continue;
      seen.add(item.code);
      result.push(item);
      if (result.length >= MAX_SECONDARY) break;
    }
    return result;
  }

  function parseSecondaryDraft(raw, { primaryCode = '', now = Date.now(), maxAge = MAX_AGE_MS } = {}) {
    let payload = raw;
    if (typeof raw === 'string') {
      try { payload = JSON.parse(raw); }
      catch { return []; }
    }
    if (!payload || Number(payload.version) !== 1) return [];
    const savedAt = Number(payload.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || savedAt > now + 5 * 60 * 1000 || now - savedAt > maxAge) return [];
    return normalizeItems(payload.items, { primaryCode, now });
  }

  function buildModel({ primary = null, secondary = [], diagnosisText = '', now = Date.now() } = {}) {
    const structuredPrimary = normalizeContext(primary, { now });
    const manualPrimary = structuredPrimary ? null : normalizeContext({ title:diagnosisText }, { allowManual:true, now });
    const activePrimary = structuredPrimary || manualPrimary;
    return {
      version:1,
      primary:activePrimary,
      secondary:normalizeItems(secondary, { primaryCode:activePrimary?.code || '', now }),
    };
  }

  function diagnosisText(model) {
    const normalized = model && typeof model === 'object' ? model : { primary:null, secondary:[] };
    const lines = [];
    if (normalized.primary) {
      lines.push('Diagnoza kryesore:');
      lines.push(normalized.primary.display || normalized.primary.titleSq || normalized.primary.titleEn);
    }
    if (Array.isArray(normalized.secondary) && normalized.secondary.length) {
      if (lines.length) lines.push('');
      lines.push('Diagnozat shoqëruese:');
      normalized.secondary.forEach(item => lines.push(`- ${item.display || `${item.code} — ${item.titleSq || item.titleEn}`}`));
    }
    return lines.join('\n').trim();
  }

  function composeText(prescriptionText, model) {
    const prescription = String(prescriptionText || '').trim();
    const diagnoses = diagnosisText(model);
    return [diagnoses, prescription].filter(Boolean).join('\n\n').trim();
  }

  function currentPrimary(root) {
    const contextApi = root?.MedIndexPrescriptionIcdContext;
    return normalizeContext(contextApi?.current?.() || contextApi?.pending?.());
  }

  function currentSecondary(root, primaryCode = '') {
    const live = root?.MedIndexIcdProblemList?.current?.();
    if (Array.isArray(live)) return normalizeItems(live, { primaryCode });
    try {
      return parseSecondaryDraft(root.localStorage.getItem(SECONDARY_DRAFT_KEY), { primaryCode });
    } catch {
      return [];
    }
  }

  function currentModel(root = rootRef) {
    if (!root?.document) return buildModel();
    const primary = currentPrimary(root);
    const diagnosisInput = clean(root.document.getElementById('rxDiagnosis')?.value);
    const secondary = currentSecondary(root, primary?.code || '');
    return buildModel({ primary, secondary, diagnosisText:diagnosisInput });
  }

  function renderMarkup(model) {
    if (!model?.primary && !model?.secondary?.length) return '';
    const primary = model.primary ? `<div class="rx-document-diagnosis-primary">
      <span>Diagnoza kryesore</span>
      <strong>${esc(model.primary.display || model.primary.titleSq || model.primary.titleEn)}</strong>
    </div>` : '';
    const secondary = model.secondary?.length ? `<div class="rx-document-diagnosis-secondary">
      <span>Diagnozat shoqëruese</span>
      <ul>${model.secondary.map(item => `<li><strong>${esc(item.code)}</strong><span>${esc(item.titleSq || item.titleEn)}</span></li>`).join('')}</ul>
    </div>` : '';
    return `<section class="rx-document-diagnoses" aria-label="Diagnozat e recetës">${primary}${secondary}</section>`;
  }

  function decoratePreview() {
    const preview = rootRef?.document?.getElementById('rxPreview');
    const paper = preview?.querySelector('.rx-paper');
    const canonical = paper?.querySelector('.rx-canonical-preview');
    let host = rootRef?.document?.getElementById('rxDiagnosisDocument');
    if (!paper || !canonical) {
      host?.remove();
      return false;
    }
    const markup = renderMarkup(currentModel());
    if (!markup) {
      host?.remove();
      return false;
    }
    if (!host) {
      host = rootRef.document.createElement('div');
      host.id = 'rxDiagnosisDocument';
      host.className = 'rx-diagnosis-document-host';
      paper.insertBefore(host, canonical);
    }
    if (host.innerHTML !== markup) host.innerHTML = markup;
    return true;
  }

  function showToast(message) {
    const toast = rootRef?.document?.getElementById('rxToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    rootRef.setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function setStatus(message) {
    const status = rootRef?.document?.getElementById('rxStatus');
    if (status) status.textContent = message;
  }

  function canonicalText() {
    return String(rootRef?.document?.querySelector('#rxPreview .rx-canonical-preview')?.textContent || '').trim();
  }

  function currentText(prescriptionText = canonicalText()) {
    return composeText(prescriptionText, currentModel());
  }

  function fallbackCopy(value) {
    const area = rootRef.document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    rootRef.document.body.appendChild(area);
    area.select();
    rootRef.document.execCommand('copy');
    area.remove();
  }

  async function copyDocument(event) {
    const button = event.target.closest('#rxCopy');
    if (!button || button.disabled) return;
    const value = currentText();
    if (!value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try { await rootRef.navigator.clipboard.writeText(value); }
    catch { fallbackCopy(value); }
    showToast('Receta me diagnozat u kopjua.');
  }

  function safeFilePart(value) {
    return clean(value).toLocaleLowerCase('sq')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  }

  function exportFileName(model = currentModel(), now = new Date()) {
    const primary = model?.primary;
    const suffix = safeFilePart(primary?.code || primary?.titleSq || 'pa-diagnoze') || 'pa-diagnoze';
    const date = now.toISOString().slice(0, 10);
    return `recete-${date}-${suffix}.txt`;
  }

  function exportDocument(event) {
    const button = event.target.closest('#rxExport');
    if (!button || button.disabled) return;
    const value = currentText();
    if (!value) return;
    event.preventDefault();
    const blob = new Blob([`\uFEFF${value}\n`], { type:'text/plain;charset=utf-8' });
    const url = rootRef.URL.createObjectURL(blob);
    const link = rootRef.document.createElement('a');
    link.href = url;
    link.download = exportFileName();
    link.hidden = true;
    rootRef.document.body.appendChild(link);
    link.click();
    link.remove();
    rootRef.setTimeout(() => rootRef.URL.revokeObjectURL(url), 0);
    showToast('Receta me diagnozat u eksportua.');
    setStatus('Dokumenti TXT përmban vetëm diagnozat dhe përmbajtjen klinike të recetës.');
  }

  function ensureExportButton() {
    const actions = rootRef?.document?.querySelector('.rx-preview-actions');
    const print = rootRef?.document?.getElementById('rxPrint');
    if (!actions || !print) return null;
    let button = rootRef.document.getElementById('rxExport');
    if (!button) {
      button = rootRef.document.createElement('button');
      button.id = 'rxExport';
      button.type = 'button';
      button.className = 'rx-secondary';
      button.textContent = 'Eksporto TXT';
      button.disabled = print.disabled;
      actions.insertBefore(button, print);
    }
    return button;
  }

  function syncExportState() {
    const print = rootRef?.document?.getElementById('rxPrint');
    const exportButton = ensureExportButton();
    if (print && exportButton) exportButton.disabled = print.disabled;
  }

  function installObservers() {
    const preview = rootRef.document.getElementById('rxPreview');
    if (preview && !previewObserver) {
      previewObserver = new rootRef.MutationObserver(() => rootRef.requestAnimationFrame(decoratePreview));
      previewObserver.observe(preview, { childList:true, subtree:true });
    }
    const print = rootRef.document.getElementById('rxPrint');
    if (print && !printButtonObserver) {
      printButtonObserver = new rootRef.MutationObserver(syncExportState);
      printButtonObserver.observe(print, { attributes:true, attributeFilter:['disabled'] });
    }
  }

  function refresh() {
    decoratePreview();
    syncExportState();
    rootRef?.dispatchEvent(new rootRef.CustomEvent('medindex:prescription-document-updated', {
      detail:{ version:VERSION, model:currentModel() },
    }));
  }

  function init(root) {
    if (initialized || !root?.document) return false;
    const page = clean(root.document.documentElement.dataset.miPage).toLowerCase();
    const path = clean(root.location?.pathname).toLowerCase();
    if (page !== 'recetat' && !path.endsWith('/recetat.html') && !root.document.getElementById('rxPreview')) return false;
    initialized = true;
    rootRef = root;
    ensureExportButton();
    installObservers();
    refresh();

    root.document.addEventListener('click', event => {
      if (event.target.closest('#rxCopy')) void copyDocument(event);
      if (event.target.closest('#rxExport')) exportDocument(event);
    }, true);
    root.document.getElementById('rxDiagnosis')?.addEventListener('input', () => root.requestAnimationFrame(refresh));
    ['medindex:prescription-icd-context', 'medindex:prescription-context-ready', 'medindex:icd-problem-list'].forEach(name => {
      root.addEventListener(name, () => root.requestAnimationFrame(refresh));
    });

    root.document.documentElement.dataset.miPrescriptionDiagnosisDocument = VERSION;
    root.dispatchEvent(new root.CustomEvent('medindex:prescription-diagnosis-document-ready', {
      detail:{ version:VERSION, model:currentModel() },
    }));
    return true;
  }

  return Object.freeze({
    VERSION,
    SECONDARY_DRAFT_KEY,
    MAX_SECONDARY,
    MAX_AGE_MS,
    normalizeContext,
    normalizeItems,
    parseSecondaryDraft,
    buildModel,
    diagnosisText,
    composeText,
    renderMarkup,
    exportFileName,
    currentModel,
    currentText,
    refresh,
    init,
  });
});
