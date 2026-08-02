(() => {
  'use strict';

  const VERSION = 'icd-rx-roundtrip-v1';
  const DRAFT_KEY = 'medindex_rx_autodraft_v1';
  const RECENT_KEY = 'medindex_icd_recent_diagnoses_v1';
  const MAX_RECENT = 6;
  const RECENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
  const PRESCRIBABLE_LEVELS = new Set(['category', 'subcategory']);
  const ICD_CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;
  let contextObserver = null;
  let savedObserver = null;
  let detailObserver = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (value, max = 500) => String(value ?? '').slice(0, max).trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));

  function ensureStyles() {
    if (document.getElementById('miIcdPrescriptionRoundtripCss')) return;
    const link = document.createElement('link');
    link.id = 'miIcdPrescriptionRoundtripCss';
    link.rel = 'stylesheet';
    link.href = `/icd-prescription-roundtrip.css?v=${VERSION}`;
    document.head.appendChild(link);
  }

  function normalizeContext(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const code = safeText(value.code, 24).toUpperCase();
    const level = safeText(value.level, 24).toLowerCase();
    const titleSq = safeText(value.titleSq || value.albanianDraft, 500);
    const titleEn = safeText(value.titleEn || value.englishTitle, 500);
    const selectedAt = Number(value.selectedAt || value.linkedAt || Date.now());
    if (!ICD_CODE_PATTERN.test(code) || !PRESCRIBABLE_LEVELS.has(level)) return null;
    if (!titleSq && !titleEn) return null;
    if (!Number.isFinite(selectedAt) || selectedAt > Date.now() + 5 * 60 * 1000) return null;
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

  function readRecent() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      const seen = new Set();
      return raw.map(normalizeContext).filter(context => {
        if (!context || Date.now() - context.selectedAt > RECENT_MAX_AGE || seen.has(context.code)) return false;
        seen.add(context.code);
        return true;
      }).slice(0, MAX_RECENT);
    } catch {
      return [];
    }
  }

  function writeRecent(items) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT))); } catch {}
  }

  function rememberContext(value) {
    const context = normalizeContext(value);
    if (!context) return null;
    context.selectedAt = Date.now();
    const next = [context, ...readRecent().filter(item => item.code !== context.code)].slice(0, MAX_RECENT);
    writeRecent(next);
    return context;
  }

  function savePrescriptionDraft() {
    const composer = document.getElementById('rxComposer');
    const diagnosis = document.getElementById('rxDiagnosis');
    if (!composer || !diagnosis) return false;
    const payload = {
      version:1,
      savedAt:Date.now(),
      composer:String(composer.value || '').slice(0, 20000),
      diagnosis:String(diagnosis.value || '').slice(0, 1000),
    };
    try {
      if (!payload.composer && !payload.diagnosis) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function icdHref(code, { returnToPrescription = true } = {}) {
    const url = new URL('/icd.html', location.origin);
    url.searchParams.set('code', clean(code));
    if (returnToPrescription) url.searchParams.set('return', 'recetat');
    return `${url.pathname}${url.search}`;
  }

  function contextApi() {
    return window.MedIndexPrescriptionIcdContext || null;
  }

  function currentContext() {
    return normalizeContext(contextApi()?.current?.() || contextApi()?.pending?.());
  }

  function ensureRecentHost() {
    let host = document.getElementById('rxIcdRecent');
    if (host) return host;
    const anchor = document.getElementById('rxIcdContext') || document.getElementById('rxDiagnosis')?.closest('.rx-diagnosis');
    if (!anchor) return null;
    host = document.createElement('section');
    host.id = 'rxIcdRecent';
    host.className = 'rx-icd-recent';
    host.hidden = true;
    host.setAttribute('aria-labelledby', 'rxIcdRecentTitle');
    anchor.insertAdjacentElement('afterend', host);
    return host;
  }

  function renderRecent() {
    const host = ensureRecentHost();
    if (!host) return;
    const items = readRecent();
    host.hidden = !items.length;
    host.innerHTML = items.length ? `<header><div><strong id="rxIcdRecentTitle">Diagnozat ICD të fundit</strong><span>Përdori sërish ose hape kodin në hierarki.</span></div><button type="button" data-mi-icd-recent-clear>Pastro</button></header>
      <div class="rx-icd-recent-list">${items.map((item, index) => `<article class="rx-icd-recent-item">
        <button type="button" data-mi-icd-recent-apply="${index}" aria-label="Apliko ${esc(item.code)}">
          <span class="rx-icd-recent-code">${esc(item.code)}</span>
          <span><strong>${esc(item.titleSq || item.titleEn)}</strong><small>${item.level === 'subcategory' ? 'Nënkategori' : 'Kategori'}</small></span>
        </button>
        <a href="${esc(icdHref(item.code))}" data-mi-open-icd="${esc(item.code)}" aria-label="Hape ${esc(item.code)} në ICD">Hape</a>
      </article>`).join('')}</div>` : '';
  }

  function decorateActiveContext() {
    const host = document.getElementById('rxIcdContext');
    const actions = host?.querySelector('.rx-icd-actions');
    const context = currentContext();
    if (!host || host.hidden || !actions || !context) return;
    let link = actions.querySelector('.rx-icd-medindex-link');
    if (!link) {
      link = document.createElement('a');
      link.className = 'rx-icd-medindex-link';
      link.dataset.miOpenIcd = context.code;
      link.textContent = 'Hape në ICD';
      actions.prepend(link);
    }
    link.href = icdHref(context.code);
    link.dataset.miOpenIcd = context.code;
  }

  function readSavedPrescriptions() {
    try {
      const value = JSON.parse(localStorage.getItem('regjistriBarnave_protokollet_v1') || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function decorateSavedCards() {
    const list = document.getElementById('rxSavedList');
    if (!list) return;
    const byId = new Map(readSavedPrescriptions().map(item => [String(item?.id), item]));
    list.querySelectorAll('[data-open-saved]').forEach(openButton => {
      const card = openButton.closest('.rx-saved-card');
      const actions = card?.querySelector('.rx-saved-actions');
      const protocol = byId.get(String(openButton.dataset.openSaved));
      const context = normalizeContext(protocol?.diagnosisCoding);
      let link = actions?.querySelector('.rx-icd-saved-open');
      if (!context) {
        link?.remove();
        return;
      }
      if (!link) {
        link = document.createElement('a');
        link.className = 'rx-icd-saved-open';
        link.textContent = 'Hape ICD';
        actions?.insertBefore(link, actions.lastElementChild || null);
      }
      link.href = icdHref(context.code);
      link.dataset.miOpenIcd = context.code;
      link.setAttribute('aria-label', `Hape ${context.code} në ICD`);
    });
  }

  function installPrescriptionObservers() {
    const contextHost = document.getElementById('rxIcdContext');
    if (contextHost && !contextObserver) {
      contextObserver = new MutationObserver(() => {
        decorateActiveContext();
        renderRecent();
      });
      contextObserver.observe(contextHost, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden', 'class'] });
    }
    const savedList = document.getElementById('rxSavedList');
    if (savedList && !savedObserver) {
      savedObserver = new MutationObserver(() => requestAnimationFrame(decorateSavedCards));
      savedObserver.observe(savedList, { childList:true, subtree:true });
    }
  }

  function initPrescription() {
    ensureStyles();
    ensureRecentHost();
    installPrescriptionObservers();
    decorateActiveContext();
    decorateSavedCards();
    renderRecent();

    window.addEventListener('medindex:prescription-icd-context', event => {
      if (event.detail?.context) rememberContext(event.detail.context);
      decorateActiveContext();
      renderRecent();
    });

    window.addEventListener('medindex:prescription-context-ready', event => {
      if (event.detail?.context) rememberContext(event.detail.context);
      installPrescriptionObservers();
      decorateActiveContext();
      decorateSavedCards();
      renderRecent();
    });

    document.addEventListener('click', event => {
      const internalLink = event.target.closest('[data-mi-open-icd]');
      const apply = event.target.closest('[data-mi-icd-recent-apply]');
      const clear = event.target.closest('[data-mi-icd-recent-clear]');
      if (internalLink) savePrescriptionDraft();
      if (apply) {
        const context = readRecent()[Number(apply.dataset.miIcdRecentApply)];
        if (context && contextApi()?.apply?.(context)) {
          rememberContext(context);
          decorateActiveContext();
          renderRecent();
        }
      }
      if (clear) {
        writeRecent([]);
        renderRecent();
      }
    });

    document.documentElement.dataset.miIcdPrescriptionRoundtrip = VERSION;
    window.dispatchEvent(new CustomEvent('medindex:icd-prescription-roundtrip-ready', {
      detail:{ version:VERSION, page:'prescription', recent:readRecent().length },
    }));
  }

  function returningToPrescription() {
    return new URLSearchParams(location.search).get('return') === 'recetat';
  }

  function preserveReturnParameter() {
    if (!returningToPrescription()) return;
    const url = new URL(location.href);
    if (url.searchParams.get('return') === 'recetat') return;
    url.searchParams.set('return', 'recetat');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function prescriptionReturnHref() {
    return '/recetat.html?from=icd-return';
  }

  function ensureIcdReturnControl() {
    if (!returningToPrescription()) return;
    const toolbar = document.querySelector('.icd-tree-toolbar');
    const collapse = document.getElementById('icdCollapseAll');
    if (!toolbar || document.getElementById('icdReturnPrescription')) return;
    const link = document.createElement('a');
    link.id = 'icdReturnPrescription';
    link.className = 'icd-return-prescription';
    link.href = prescriptionReturnHref();
    link.textContent = 'Kthehu te receta';
    link.setAttribute('aria-label', 'Kthehu te drafti i recetës');
    collapse?.insertAdjacentElement('afterend', link);
  }

  function decorateDetailReturn() {
    if (!returningToPrescription()) return;
    const actions = document.querySelector('#detailOverlay .icd-detail-actions');
    if (!actions || actions.querySelector('.icd-detail-return-prescription')) return;
    const link = document.createElement('a');
    link.className = 'icd-detail-return-prescription';
    link.href = prescriptionReturnHref();
    link.textContent = 'Kthehu te receta';
    actions.prepend(link);
  }

  function installDetailObserver() {
    const overlay = document.getElementById('detailOverlay');
    if (!overlay || detailObserver) return;
    detailObserver = new MutationObserver(decorateDetailReturn);
    detailObserver.observe(overlay, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden'] });
    decorateDetailReturn();
  }

  function initIcd() {
    ensureStyles();
    if (returningToPrescription()) {
      ensureIcdReturnControl();
      installDetailObserver();
      window.addEventListener('medindex:icd-state', () => {
        const url = new URL(location.href);
        if (url.searchParams.get('return') !== 'recetat') {
          url.searchParams.set('return', 'recetat');
          history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
        }
      });
      window.addEventListener('medindex:icd-detail-ready', installDetailObserver, { once:true });
      window.addEventListener('popstate', () => setTimeout(() => {
        preserveReturnParameter();
        ensureIcdReturnControl();
      }, 0));
    }
    document.documentElement.dataset.miIcdPrescriptionRoundtrip = VERSION;
    window.dispatchEvent(new CustomEvent('medindex:icd-prescription-roundtrip-ready', {
      detail:{ version:VERSION, page:'icd', returning:returningToPrescription() },
    }));
  }

  function init() {
    if (document.getElementById('rxContent')) initPrescription();
    if (document.getElementById('icdContent')) initIcd();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
