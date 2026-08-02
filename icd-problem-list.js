(function bootstrapIcdProblemList(root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root) return;

  root.MedIndexIcdProblemList = api;
  const start = () => api.init(root);
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})(typeof window !== 'undefined' ? window : null, function createIcdProblemList() {
  'use strict';

  const VERSION = 'icd-problem-list-v1';
  const HANDOFF_KEY = 'medindex_rx_secondary_diagnosis_context_v1';
  const DRAFT_KEY = 'medindex_rx_problem_list_draft_v1';
  const SAVED_KEY = 'regjistriBarnave_protokollet_v1';
  const RECENT_KEY = 'medindex_icd_recent_diagnoses_v1';
  const MAX_ITEMS = 5;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const VALID_LEVELS = new Set(['category', 'subcategory']);
  const CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let rootRef = null;
  let items = [];
  let detailObserver = null;
  let recentObserver = null;
  let savedObserver = null;
  let initialized = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 500) => String(value ?? '').slice(0, max).trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function normalizeContext(value, now = Date.now()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = safeText(value.code, 24).toUpperCase();
    const level = safeText(value.level, 24).toLowerCase();
    const titleSq = safeText(value.titleSq || value.albanianDraft, 500);
    const titleEn = safeText(value.titleEn || value.englishTitle, 500);
    const selectedAt = Number(value.selectedAt || value.linkedAt || now);
    if (!CODE_PATTERN.test(code) || !VALID_LEVELS.has(level)) return null;
    if (!titleSq && !titleEn) return null;
    if (!Number.isFinite(selectedAt) || selectedAt <= 0 || selectedAt > now + 5 * 60 * 1000) return null;
    return {
      version:2,
      system:'ICD-10-WHO 2019',
      source:'medindex-icd-browser',
      code,
      level,
      titleSq,
      titleEn,
      display:`${code} — ${titleSq || titleEn}`.slice(0, 1000),
      translationStatus:safeText(value.translationStatus, 40),
      childCount:Math.max(0, Math.min(9999, Number(value.childCount || 0))),
      selectedAt,
    };
  }

  function normalizeItems(values, { primaryCode = '', now = Date.now() } = {}) {
    const source = Array.isArray(values) ? values : [];
    const seen = new Set();
    const primary = safeText(primaryCode, 24).toUpperCase();
    const normalized = [];
    for (const raw of source) {
      const item = normalizeContext(raw, now);
      if (!item || item.code === primary || seen.has(item.code)) continue;
      seen.add(item.code);
      normalized.push(item);
      if (normalized.length >= MAX_ITEMS) break;
    }
    return normalized;
  }

  function addItem(values, value, options = {}) {
    const item = normalizeContext(value, options.now || Date.now());
    if (!item) return normalizeItems(values, options);
    return normalizeItems([item, ...(Array.isArray(values) ? values : [])], options);
  }

  function removeItem(values, code, options = {}) {
    const target = safeText(code, 24).toUpperCase();
    return normalizeItems((Array.isArray(values) ? values : []).filter(item => safeText(item?.code, 24).toUpperCase() !== target), options);
  }

  function serialize(values, now = Date.now()) {
    return JSON.stringify({
      version:1,
      savedAt:now,
      items:normalizeItems(values, { now }),
    });
  }

  function parse(raw, { primaryCode = '', now = Date.now(), maxAge = MAX_AGE_MS } = {}) {
    let payload = raw;
    if (typeof raw === 'string') {
      try { payload = JSON.parse(raw); }
      catch { return []; }
    }
    if (!payload || Number(payload.version) !== 1) return [];
    const savedAt = Number(payload.savedAt);
    if (!Number.isFinite(savedAt) || savedAt > now + 5 * 60 * 1000 || now - savedAt > maxAge) return [];
    return normalizeItems(payload.items, { primaryCode, now });
  }

  function primaryContext() {
    return normalizeContext(rootRef?.MedIndexPrescriptionIcdContext?.current?.());
  }

  function primaryCode() {
    return primaryContext()?.code || '';
  }

  function readDraft() {
    try {
      return parse(rootRef.localStorage.getItem(DRAFT_KEY), { primaryCode:primaryCode() });
    } catch {
      return [];
    }
  }

  function writeDraft() {
    try {
      if (items.length) rootRef.localStorage.setItem(DRAFT_KEY, serialize(items));
      else rootRef.localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  function readHandoff() {
    try {
      const raw = rootRef.sessionStorage.getItem(HANDOFF_KEY);
      rootRef.sessionStorage.removeItem(HANDOFF_KEY);
      return normalizeContext(raw ? JSON.parse(raw) : null);
    } catch {
      try { rootRef.sessionStorage.removeItem(HANDOFF_KEY); } catch {}
      return null;
    }
  }

  function saveHandoff(context) {
    try {
      rootRef.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(normalizeContext(context)));
      return true;
    } catch {
      return false;
    }
  }

  function readSaved() {
    try {
      const value = JSON.parse(rootRef.localStorage.getItem(SAVED_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeSaved(values) {
    try { rootRef.localStorage.setItem(SAVED_KEY, JSON.stringify(values)); } catch {}
  }

  function currentSavedCandidate(values) {
    const diagnosis = clean(rootRef.document.getElementById('rxDiagnosis')?.value);
    const composer = String(rootRef.document.getElementById('rxComposer')?.value || '');
    return values
      .filter(item => clean(item?.indication) === diagnosis && String(item?.sourceText || '') === composer)
      .sort((left, right) => Date.parse(right?.updatedAt || 0) - Date.parse(left?.updatedAt || 0))[0] || null;
  }

  function serializableList(values = items) {
    return {
      version:1,
      updatedAt:Date.now(),
      items:normalizeItems(values, { primaryCode:primaryCode() }),
    };
  }

  function persistSaved() {
    const saved = readSaved();
    const candidate = currentSavedCandidate(saved);
    if (!candidate) return false;
    const normalized = normalizeItems(items, { primaryCode:primaryCode() });
    if (normalized.length) candidate.secondaryDiagnosisCoding = serializableList(normalized);
    else delete candidate.secondaryDiagnosisCoding;
    writeSaved(saved);
    decorateSavedCards();
    return true;
  }

  function restoreSaved(id) {
    const protocol = readSaved().find(item => String(item?.id) === String(id));
    const payload = protocol?.secondaryDiagnosisCoding;
    items = payload && Number(payload.version) === 1
      ? normalizeItems(payload.items, { primaryCode:primaryCode() })
      : [];
    writeDraft();
    render();
  }

  function levelLabel(level) {
    return level === 'subcategory' ? 'Nënkategori' : 'Kategori';
  }

  function icdHref(code) {
    const url = new URL('/icd.html', rootRef.location.origin);
    url.searchParams.set('code', code);
    url.searchParams.set('return', 'recetat');
    return `${url.pathname}${url.search}`;
  }

  function ensureHost() {
    let host = rootRef.document.getElementById('rxIcdProblemList');
    if (host) return host;
    const anchor = rootRef.document.getElementById('rxIcdContext')
      || rootRef.document.getElementById('rxDiagnosis')?.closest('.rx-diagnosis');
    if (!anchor) return null;
    host = rootRef.document.createElement('section');
    host.id = 'rxIcdProblemList';
    host.className = 'rx-icd-problem-list';
    host.hidden = true;
    host.setAttribute('aria-labelledby', 'rxIcdProblemListTitle');
    anchor.insertAdjacentElement('afterend', host);
    return host;
  }

  function announce(message) {
    const status = rootRef.document.getElementById('rxStatus');
    if (status) status.textContent = message;
  }

  function emit(reason) {
    rootRef.dispatchEvent(new rootRef.CustomEvent('medindex:icd-problem-list', {
      detail:{ version:VERSION, reason, items:[...items], count:items.length },
    }));
  }

  function setItems(next, reason = 'updated') {
    items = normalizeItems(next, { primaryCode:primaryCode() });
    writeDraft();
    render();
    emit(reason);
    return items;
  }

  function render() {
    const host = ensureHost();
    if (!host) return;
    items = normalizeItems(items, { primaryCode:primaryCode() });
    host.hidden = !items.length;
    host.innerHTML = items.length ? `<header class="rx-icd-problem-head">
      <div><strong id="rxIcdProblemListTitle">Diagnozat shoqëruese</strong><span>Maksimum ${MAX_ITEMS}; aplikohen vetëm me zgjedhjen e mjekut.</span></div>
      <button type="button" data-mi-problem-clear>Pastro</button>
    </header>
    <div class="rx-icd-problem-items" role="list">${items.map(item => `<article class="rx-icd-problem-item" role="listitem" data-problem-code="${esc(item.code)}">
      <span class="rx-icd-problem-code">${esc(item.code)}</span>
      <span class="rx-icd-problem-copy"><strong>${esc(item.titleSq || item.titleEn)}</strong><small>${esc(levelLabel(item.level))} · diagnozë shoqëruese</small></span>
      <span class="rx-icd-problem-actions">
        <button type="button" data-mi-problem-promote="${esc(item.code)}">Bëje kryesore</button>
        <a href="${esc(icdHref(item.code))}" data-mi-open-icd="${esc(item.code)}">Hape</a>
        <button type="button" data-mi-problem-remove="${esc(item.code)}" aria-label="Hiqe ${esc(item.code)}">Hiqe</button>
      </span>
    </article>`).join('')}</div>` : '';
  }

  function addSecondary(context, reason = 'added') {
    const normalized = normalizeContext(context);
    if (!normalized) return false;
    if (normalized.code === primaryCode()) {
      announce(`${normalized.code} është tashmë diagnoza kryesore.`);
      return false;
    }
    const existed = items.some(item => item.code === normalized.code);
    const before = items.length;
    setItems(addItem(items, normalized, { primaryCode:primaryCode() }), reason);
    if (existed) announce(`${normalized.code} ishte tashmë në diagnozat shoqëruese.`);
    else if (before >= MAX_ITEMS && items.length === MAX_ITEMS) announce(`U ruajtën maksimum ${MAX_ITEMS} diagnoza shoqëruese; kodi më i vjetër u largua.`);
    else announce(`${normalized.code} u shtua si diagnozë shoqëruese.`);
    return true;
  }

  function promote(code) {
    const context = items.find(item => item.code === code);
    const api = rootRef.MedIndexPrescriptionIcdContext;
    if (!context || typeof api?.apply !== 'function') return false;
    const oldPrimary = primaryContext();
    if (!api.apply(context)) return false;
    let next = removeItem(items, context.code);
    if (oldPrimary && oldPrimary.code !== context.code) next = addItem(next, oldPrimary, { primaryCode:context.code });
    setItems(next, 'promoted');
    announce(`${context.code} u bë diagnoza kryesore.`);
    return true;
  }

  function readRecent() {
    try {
      const raw = JSON.parse(rootRef.localStorage.getItem(RECENT_KEY) || '[]');
      const now = Date.now();
      return normalizeItems(
        (Array.isArray(raw) ? raw : []).filter(item => now - Number(item?.selectedAt || item?.linkedAt || 0) <= 180 * 24 * 60 * 60 * 1000),
        { primaryCode:primaryCode(), now },
      );
    } catch {
      return [];
    }
  }

  function decorateRecent() {
    const host = rootRef.document.getElementById('rxIcdRecent');
    if (!host) return;
    const recent = readRecent();
    host.querySelectorAll('[data-mi-icd-recent-apply]').forEach(button => {
      const index = Number(button.dataset.miIcdRecentApply);
      const item = recent[index];
      const article = button.closest('.rx-icd-recent-item');
      if (!item || !article || article.querySelector('[data-mi-recent-secondary]')) return;
      const add = rootRef.document.createElement('button');
      add.type = 'button';
      add.className = 'rx-icd-recent-secondary';
      add.dataset.miRecentSecondary = item.code;
      add.textContent = 'Shoqëruese';
      add.setAttribute('aria-label', `Shto ${item.code} si diagnozë shoqëruese`);
      article.appendChild(add);
    });
  }

  function decorateSavedCards() {
    const list = rootRef.document.getElementById('rxSavedList');
    if (!list) return;
    const byId = new Map(readSaved().map(item => [String(item?.id), item]));
    list.querySelectorAll('[data-open-saved]').forEach(button => {
      const card = button.closest('.rx-saved-card');
      const tags = card?.querySelector('.rx-saved-tags');
      const protocol = byId.get(String(button.dataset.openSaved));
      const count = normalizeItems(protocol?.secondaryDiagnosisCoding?.items).length;
      let badge = tags?.querySelector('.rx-icd-problem-saved-badge');
      if (!count) {
        badge?.remove();
        return;
      }
      if (!badge && tags) {
        badge = rootRef.document.createElement('span');
        badge.className = 'rx-icd-problem-saved-badge';
        tags.appendChild(badge);
      }
      if (badge) {
        badge.textContent = `+${count} ICD`;
        badge.title = `${count} diagnoza shoqëruese ICD-10`;
      }
    });
  }

  function bindPrescription() {
    rootRef.addEventListener('medindex:prescription-icd-context', () => setItems(items, 'primary-changed'));
    rootRef.addEventListener('medindex:prescription-context-ready', () => {
      setItems(items, 'primary-ready');
      decorateRecent();
      decorateSavedCards();
    });

    rootRef.document.addEventListener('click', event => {
      const remove = event.target.closest('[data-mi-problem-remove]');
      const promoteButton = event.target.closest('[data-mi-problem-promote]');
      const clear = event.target.closest('[data-mi-problem-clear]');
      const recent = event.target.closest('[data-mi-recent-secondary]');
      const openSaved = event.target.closest('[data-open-saved]');
      if (remove) {
        setItems(removeItem(items, remove.dataset.miProblemRemove), 'removed');
        announce(`${remove.dataset.miProblemRemove} u hoq nga diagnozat shoqëruese.`);
      }
      if (promoteButton) promote(promoteButton.dataset.miProblemPromote);
      if (clear) {
        setItems([], 'cleared');
        announce('Diagnozat shoqëruese u pastruan.');
      }
      if (recent) {
        const context = readRecent().find(item => item.code === recent.dataset.miRecentSecondary);
        if (context) addSecondary(context, 'recent-added');
      }
      if (event.target.closest('#rxSave')) rootRef.setTimeout(persistSaved, 0);
      if (openSaved) rootRef.setTimeout(() => restoreSaved(openSaved.dataset.openSaved), 0);
      if (event.target.closest('#rxClear,#rxNew')) rootRef.setTimeout(() => setItems([], 'new-prescription'), 0);
    });

    const recentHost = rootRef.document.getElementById('rxIcdRecent');
    if (recentHost && !recentObserver) {
      recentObserver = new rootRef.MutationObserver(() => rootRef.requestAnimationFrame(decorateRecent));
      recentObserver.observe(recentHost, { childList:true, subtree:true });
    }
    const savedList = rootRef.document.getElementById('rxSavedList');
    if (savedList && !savedObserver) {
      savedObserver = new rootRef.MutationObserver(() => rootRef.requestAnimationFrame(decorateSavedCards));
      savedObserver.observe(savedList, { childList:true, subtree:true });
    }
  }

  async function resolveContext(code) {
    const response = await rootRef.fetch(`/api/icd?view=resolve&code=${encodeURIComponent(code)}`, {
      credentials:'same-origin',
      cache:'no-store',
      headers:{ Accept:'application/json' },
    });
    if (!response.ok) throw new Error(`ICD API ${response.status}`);
    const payload = await response.json();
    return normalizeContext(payload?.data?.node);
  }

  function activeDetailCode() {
    const match = clean(rootRef.document.getElementById('detailKicker')?.textContent).match(/·\s*([A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?)$/);
    return match?.[1] || '';
  }

  function decorateDetail() {
    const actions = rootRef.document.querySelector('#detailOverlay .icd-detail-actions');
    const primaryButton = rootRef.document.getElementById('icdUseDiagnosis');
    if (!actions || !primaryButton) return;
    let button = rootRef.document.getElementById('icdAddSecondaryDiagnosis');
    const usable = !primaryButton.hidden && Boolean(activeDetailCode());
    if (!button) {
      button = rootRef.document.createElement('button');
      button.id = 'icdAddSecondaryDiagnosis';
      button.type = 'button';
      button.className = 'icd-add-secondary-diagnosis';
      button.textContent = 'Shto si shoqëruese';
      actions.insertBefore(button, primaryButton);
      button.addEventListener('click', async () => {
        const code = activeDetailCode();
        if (!code) return;
        button.disabled = true;
        try {
          const context = await resolveContext(code);
          if (!context || !saveHandoff(context)) throw new Error('Kodi nuk u përgatit.');
          const status = rootRef.document.getElementById('detailActionStatus');
          if (status) status.textContent = `${context.code} u përgatit si diagnozë shoqëruese.`;
          rootRef.location.assign('/recetat.html?from=icd-secondary');
        } catch (error) {
          const status = rootRef.document.getElementById('detailActionStatus');
          if (status) status.textContent = error?.message || 'Kodi nuk u shtua.';
          button.disabled = false;
        }
      });
    }
    button.hidden = !usable;
  }

  function bindIcd() {
    const overlay = rootRef.document.getElementById('detailOverlay');
    if (overlay && !detailObserver) {
      detailObserver = new rootRef.MutationObserver(decorateDetail);
      detailObserver.observe(overlay, {
        attributes:true,
        attributeFilter:['hidden', 'aria-hidden'],
        childList:true,
        subtree:true,
      });
    }
    rootRef.addEventListener('medindex:icd-detail-ready', decorateDetail);
    decorateDetail();
  }

  function initPrescription() {
    items = readDraft();
    const handoff = readHandoff();
    if (handoff) items = addItem(items, handoff, { primaryCode:primaryCode() });
    bindPrescription();
    render();
    decorateRecent();
    decorateSavedCards();
    writeDraft();
    if (handoff) announce(`${handoff.code} u shtua si diagnozë shoqëruese.`);
  }

  function init(root) {
    if (initialized || !root?.document) return false;
    rootRef = root;
    const prescription = root.document.getElementById('rxContent');
    const icd = root.document.getElementById('icdContent');
    if (!prescription && !icd) return false;
    initialized = true;
    if (prescription) initPrescription();
    if (icd) bindIcd();
    root.document.documentElement.dataset.miIcdProblemList = VERSION;
    root.dispatchEvent(new root.CustomEvent('medindex:icd-problem-list-ready', {
      detail:{ version:VERSION, page:prescription ? 'prescription' : 'icd', maxItems:MAX_ITEMS },
    }));
    return true;
  }

  return Object.freeze({
    VERSION,
    HANDOFF_KEY,
    DRAFT_KEY,
    MAX_ITEMS,
    MAX_AGE_MS,
    normalizeContext,
    normalizeItems,
    addItem,
    removeItem,
    serialize,
    parse,
    init,
  });
});
