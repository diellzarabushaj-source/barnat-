(() => {
  'use strict';

  const page = document.querySelector('[data-mi-page="urgjencat"] .clinical-knowledge-page');
  const search = document.getElementById('emergencySearch');
  const list = document.getElementById('emergencyList');
  const detail = document.getElementById('emergencyDetail');
  if (!page || !search || !list || !detail) return;

  const SCHEDULE_KEY = 'medindex_emergency_flashcards_v4schedule:';
  const CRITICAL_LEVELS = new Set(['critical', 'very-urgent']);
  const SESSION_KEY = 'medindex_emergency_critical_review_v6';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  const safeJson = (storage, key, fallback) => {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  };

  function allItems() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function criticalItems() {
    return allItems().filter(item =>
      CRITICAL_LEVELS.has(String(item?.triageLevel || ''))
      && String(item?.reviewStatus || '') === 'verified'
    );
  }

  function scheduleFor(itemId) {
    return safeJson(localStorage, `${SCHEDULE_KEY}${itemId}`, {});
  }

  function reviewState(item) {
    const schedule = scheduleFor(item?._id || '');
    const entries = Object.values(schedule).filter(entry => entry && typeof entry === 'object');
    const now = Date.now();
    const reviewed = entries.length > 0;
    const due = !reviewed || entries.some(entry => !Number(entry?.dueAt || 0) || Number(entry.dueAt) <= now);
    const weak = entries.some(entry => ['again', 'hard'].includes(String(entry?.rating || '')));
    const stable = reviewed && !due && !weak && entries.some(entry => ['good', 'easy'].includes(String(entry?.rating || '')));
    return {reviewed, due, weak, stable, entries};
  }

  function chapterName(item) {
    return String(item?.chapterTitle || item?.category || 'Të tjera').split('/')[0].trim() || 'Të tjera';
  }

  function itemScore(item) {
    const state = reviewState(item);
    let score = item?.triageLevel === 'critical' ? 1000 : 700;
    if (!state.reviewed) score += 360;
    if (state.due) score += 300;
    if (state.weak) score += 260;
    if (state.stable) score -= 180;
    return score;
  }

  function orderedCriticalItems() {
    return criticalItems().slice().sort((a, b) =>
      itemScore(b) - itemScore(a)
      || String(a?.title || '').localeCompare(String(b?.title || ''), 'sq')
    );
  }

  function summary() {
    const items = criticalItems();
    let due = 0;
    let unseen = 0;
    let weak = 0;
    let reviewed = 0;
    items.forEach(item => {
      const state = reviewState(item);
      if (state.due) due += 1;
      if (!state.reviewed) unseen += 1;
      if (state.weak) weak += 1;
      if (state.reviewed) reviewed += 1;
    });
    return {total:items.length, due, unseen, weak, reviewed};
  }

  function chapterProgressMarkup(items) {
    const chapters = new Map();
    items.forEach(item => {
      const name = chapterName(item);
      if (!chapters.has(name)) chapters.set(name, {name, total:0, reviewed:0, due:0});
      const row = chapters.get(name);
      const state = reviewState(item);
      row.total += 1;
      if (state.reviewed) row.reviewed += 1;
      if (state.due) row.due += 1;
    });
    return [...chapters.values()]
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'sq'))
      .map(row => {
        const progress = row.total ? Math.round((row.reviewed / row.total) * 100) : 0;
        return `<div class="ck-v6-chapter-row">
          <div><strong>${esc(row.name)}</strong><span>${row.reviewed}/${row.total} të përsëritura · ${row.due} për review</span></div>
          <div class="ck-v6-progress" role="progressbar" aria-label="Përparimi për ${esc(row.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
        </div>`;
      }).join('');
  }

  function statusLabel(item) {
    const state = reviewState(item);
    if (!state.reviewed) return 'E paprekur';
    if (state.weak) return 'E vështirë';
    if (state.due) return 'Për sot';
    return 'E përsëritur';
  }

  function queueMarkup(items) {
    return items.slice(0, 7).map((item, index) => `
      <button type="button" class="ck-v6-queue-item" data-ck-v6-open="${esc(item._id)}">
        <span class="ck-v6-queue-index">${index + 1}</span>
        <span class="ck-v6-queue-copy"><strong>${esc(item.title || 'Urgjencë')}</strong><small>${esc(chapterName(item))}</small></span>
        <span class="ck-v6-queue-state">${esc(statusLabel(item))}</span>
      </button>`).join('');
  }

  function panelMarkup() {
    const items = orderedCriticalItems();
    const stats = summary();
    if (!stats.total) return '';
    return `<section class="ck-v6-readiness" id="emergencyReadiness" aria-label="Review kritik para ndërrimit">
      <div class="ck-v6-readiness-main">
        <div class="ck-v6-readiness-copy">
          <span>PARA NDËRRIMIT</span>
          <strong>Review kritik</strong>
          <p>Vetëm protokollet kritike të verifikuara.</p>
        </div>
        <div class="ck-v6-readiness-metrics" aria-label="Përparimi i review kritik">
          <span><b>${stats.total}</b> kritike</span>
          <span><b>${stats.due}</b> për sot</span>
          <span><b>${stats.unseen}</b> të paprekura</span>
        </div>
        <div class="ck-v6-readiness-actions">
          <button type="button" class="is-primary" data-ck-v6-start>Fillo review</button>
          <button type="button" data-ck-v6-toggle aria-expanded="false">Progresi</button>
        </div>
      </div>
      <div class="ck-v6-readiness-detail" data-ck-v6-detail hidden>
        <div class="ck-v6-review-column">
          <div class="ck-v6-section-head"><strong>Rradha e sugjeruar</strong><span>${stats.weak ? `${stats.weak} të vështira` : 'Prioritet sipas triazhit dhe review-t'}</span></div>
          <div class="ck-v6-queue">${queueMarkup(items)}</div>
        </div>
        <div class="ck-v6-progress-column">
          <div class="ck-v6-section-head"><strong>Sipas kapitullit</strong><span>Përparimi i përsëritjes</span></div>
          <div class="ck-v6-chapters">${chapterProgressMarkup(items)}</div>
          <small class="ck-v6-local-note">Progresi ruhet në këtë browser. Nuk është vlerësim i kompetencës klinike.</small>
        </div>
      </div>
    </section>`;
  }

  function ensurePanel() {
    const searchPanel = page.querySelector('.ck-rapid-search-panel');
    if (!searchPanel || page.querySelector('#emergencyReadiness')) return;
    const markup = panelMarkup();
    if (!markup) return;
    searchPanel.insertAdjacentHTML('afterend', markup);
    bindPanel();
  }

  function refreshPanel() {
    const current = page.querySelector('#emergencyReadiness');
    const wasOpen = current?.querySelector('[data-ck-v6-toggle]')?.getAttribute('aria-expanded') === 'true';
    current?.remove();
    ensurePanel();
    if (wasOpen) {
      const toggle = page.querySelector('[data-ck-v6-toggle]');
      const body = page.querySelector('[data-ck-v6-detail]');
      if (toggle && body) {
        toggle.setAttribute('aria-expanded', 'true');
        body.hidden = false;
      }
    }
  }

  function clearNavigationFilters() {
    if (search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', {bubbles:true}));
    }
    const reset = document.getElementById('emergencyChapterReset');
    if (reset && (document.getElementById('emergencyChapterSelect')?.value || document.getElementById('emergencySubchapterSelect')?.value)) reset.click();
    const triageAll = document.querySelector('.ck-triage-filter [data-ck-triage="all"]');
    if (triageAll && triageAll.getAttribute('aria-pressed') !== 'true') triageAll.click();
  }

  function openProtocol(itemId, {smart = true} = {}) {
    if (!itemId) return;
    clearNavigationFilters();
    const open = () => {
      const button = list.querySelector(`.ck-list-button[data-id="${CSS.escape(itemId)}"]`);
      if (!button) return false;
      button.click();
      try { sessionStorage.setItem(SESSION_KEY, itemId); } catch {}
      window.setTimeout(() => {
        const test = detail.querySelector('[data-ck-mode="test"]');
        test?.click();
        if (smart) window.setTimeout(() => detail.querySelector('[data-ck-v5-smart]')?.click(), 80);
      }, 80);
      return true;
    };
    if (!open()) window.setTimeout(open, 80);
  }

  function nextCritical(currentId) {
    const items = orderedCriticalItems();
    if (!items.length) return null;
    const index = items.findIndex(item => String(item?._id || '') === String(currentId || ''));
    return items[index >= 0 ? (index + 1) % items.length : 0] || null;
  }

  function installNextCriticalButton() {
    const toolbar = detail.querySelector('.ck-v5-session-bar');
    if (!toolbar || toolbar.querySelector('[data-ck-v6-next]')) return;
    const currentId = document.querySelector('#emergencyList .ck-list-button.is-active[data-id]')?.dataset.id || '';
    const next = nextCritical(currentId);
    if (!next) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.ckV6Next = '1';
    button.textContent = 'Tjetra kritike';
    button.title = next.title || '';
    button.addEventListener('click', () => openProtocol(next._id));
    toolbar.appendChild(button);
  }

  function bindPanel() {
    const panel = page.querySelector('#emergencyReadiness');
    if (!panel || panel.dataset.ckV6Bound === '1') return;
    panel.dataset.ckV6Bound = '1';
    panel.querySelector('[data-ck-v6-toggle]')?.addEventListener('click', event => {
      const button = event.currentTarget;
      const body = panel.querySelector('[data-ck-v6-detail]');
      if (!body) return;
      const opening = body.hidden;
      body.hidden = !opening;
      button.setAttribute('aria-expanded', opening ? 'true' : 'false');
      button.textContent = opening ? 'Mbyll progresin' : 'Progresi';
    });
    panel.querySelector('[data-ck-v6-start]')?.addEventListener('click', () => {
      const next = orderedCriticalItems()[0];
      if (next) openProtocol(next._id);
    });
    panel.querySelectorAll('[data-ck-v6-open]').forEach(button => {
      button.addEventListener('click', () => openProtocol(button.dataset.ckV6Open || ''));
    });
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('[data-ck-rating]')) return;
    window.setTimeout(refreshPanel, 60);
  }, {capture:true});

  window.addEventListener('storage', event => {
    if (String(event.key || '').startsWith(SCHEDULE_KEY)) refreshPanel();
  });

  let frame = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      ensurePanel();
      installNextCriticalButton();
    });
  });
  observer.observe(detail, {childList:true, subtree:true});

  ensurePanel();
  installNextCriticalButton();
  window.setTimeout(ensurePanel, 220);
})();