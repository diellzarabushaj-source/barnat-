(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  const list = document.getElementById('emergencyList');
  if (!detail || !list) return;

  const FLASH_KEY = 'medindex_emergency_flashcards_v1:';
  const SCHEDULE_KEY = 'medindex_emergency_flashcards_v4schedule:';
  const MEMORY_KEY = 'medindex_emergency_memory_v21:';
  const MIX_KEY = 'medindex_emergency_memory_v21_mix';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function readJson(storage, key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function items() {
    return Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
  }

  function currentItem() {
    const activeId = list.querySelector('.ck-list-button.is-active[data-id]')?.dataset.id || '';
    return items().find(item => String(item?._id || '') === String(activeId)) || null;
  }

  function flashState(itemId) {
    return readJson(sessionStorage, `${FLASH_KEY}${itemId}`, {index:0, known:[], revealed:false});
  }

  function scheduleState(itemId) {
    return readJson(localStorage, `${SCHEDULE_KEY}${itemId}`, {});
  }

  function memoryState(itemId) {
    return readJson(localStorage, `${MEMORY_KEY}${itemId}`, {
      recallAttempts:0,
      ratedReviews:0,
      confidence:{},
      ratings:{},
      lastAt:0,
    });
  }

  function writeMemory(itemId, value) {
    writeJson(localStorage, `${MEMORY_KEY}${itemId}`, value);
  }

  function cardCount(flash) {
    const text = flash?.querySelector('.ck-sl-flash-head>strong')?.textContent || '';
    const match = text.match(/\d+\s*\/\s*(\d+)/);
    return Math.max(Number(match?.[1] || 0), 0);
  }

  function scheduleMetrics(itemId, count) {
    const schedule = scheduleState(itemId);
    const now = Date.now();
    let due = 0;
    let weak = 0;
    let future = Infinity;
    for (let index = 0; index < count; index += 1) {
      const entry = schedule[index];
      if (!entry || Number(entry.dueAt || 0) <= now) due += 1;
      if (entry?.rating === 'again' || entry?.rating === 'hard') weak += 1;
      const dueAt = Number(entry?.dueAt || 0);
      if (dueAt > now) future = Math.min(future, dueAt);
    }
    return {due, weak, nextDue:Number.isFinite(future) ? future : 0};
  }

  function nextDueLabel(value) {
    if (!value) return 'Sot';
    const diff = Math.max(value - Date.now(), 0);
    if (diff < 60 * 60 * 1000) return 'Brenda 1 ore';
    if (diff < 24 * 60 * 60 * 1000) return 'Brenda 24 orëve';
    const days = Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
    return `Pas ${days} ${days === 1 ? 'dite' : 'ditësh'}`;
  }

  function hasSource(item) {
    return Array.isArray(item?.sources) && item.sources.length > 0;
  }

  function governed(item) {
    return item?.reviewStatus === 'verified' && Boolean(item?.version) && hasSource(item);
  }

  function duePriority(item) {
    const schedule = scheduleState(item?._id || '');
    const entries = Object.values(schedule);
    if (!entries.length) return 3;
    const now = Date.now();
    if (entries.some(entry => entry?.rating === 'again' || entry?.rating === 'hard')) return 4;
    if (entries.some(entry => Number(entry?.dueAt || 0) <= now)) return 3;
    return 1;
  }

  function mixedCandidates(activeId) {
    const mix = readJson(localStorage, MIX_KEY, {});
    return items()
      .filter(item => governed(item) && String(item?._id || '') !== String(activeId || ''))
      .map(item => ({item, priority:duePriority(item), lastAt:Number(mix[item._id] || 0)}))
      .sort((a, b) => b.priority - a.priority || a.lastAt - b.lastAt || String(a.item?.title || '').localeCompare(String(b.item?.title || ''), 'sq'));
  }

  function openMixed(item) {
    if (!item?._id) return;
    const mix = readJson(localStorage, MIX_KEY, {});
    mix[item._id] = Date.now();
    writeJson(localStorage, MIX_KEY, mix);

    const search = document.getElementById('emergencySearch');
    if (search) {
      search.value = item.title || '';
      search.dispatchEvent(new Event('input', {bubbles:true}));
    }

    const open = () => {
      const button = list.querySelector(`.ck-list-button[data-id="${CSS.escape(String(item._id))}"]`);
      if (!button) return false;
      button.click();
      requestAnimationFrame(() => {
        detail.querySelector('[data-ck-mode="test"]')?.click();
        window.setTimeout(() => detail.querySelector('[data-flash-reveal]')?.focus({preventScroll:true}), 80);
      });
      return true;
    };
    if (!open()) window.setTimeout(open, 90);
  }

  function confidenceLabel(value) {
    return ({low:'S’e mbaj',mid:'Mendoj se e di',high:'Jam i sigurt'})[value] || 'Pa parashikim';
  }

  function ensurePanel(panel, flash, item) {
    if (!panel || !flash || !item?._id) return;
    const count = cardCount(flash);
    const schedule = scheduleMetrics(item._id, count);
    const memory = memoryState(item._id);
    const mixed = mixedCandidates(item._id);

    let box = panel.querySelector('.ck-v21-memory');
    if (!box) {
      box = document.createElement('section');
      box.className = 'ck-v21-memory';
      box.setAttribute('aria-label', 'Memory mode');
      const anchor = panel.querySelector('.ck-v5-session-bar') || flash;
      anchor.insertAdjacentElement('beforebegin', box);
    }

    box.innerHTML = `
      <div class="ck-v21-head">
        <div>
          <span>MEMORY MODE</span>
          <h3>Rikujtoje. Kontrolloje. Kthehu në kohën e duhur.</h3>
          <p>Rikujtim aktiv + përsëritje e shpërndarë + ndërthurje të protokolleve.</p>
        </div>
        <div class="ck-v21-score" aria-label="Rikujtime aktive"><strong>${memory.ratedReviews || 0}</strong><span>rikujtime</span></div>
      </div>
      <div class="ck-v21-loop" aria-label="Cikli i memories">
        <span><b>1</b> Rikujto pa e parë</span>
        <i aria-hidden="true">→</i>
        <span><b>2</b> Kontrollo feedback-un</span>
        <i aria-hidden="true">→</i>
        <span><b>3</b> Vlerëso vështirësinë</span>
        <i aria-hidden="true">→</i>
        <span><b>4</b> Rikthehu kur është due</span>
      </div>
      <div class="ck-v21-bottom">
        <div class="ck-v21-metrics">
          <span><strong>${schedule.due}</strong> për sot</span>
          <span><strong>${schedule.weak}</strong> të vështira</span>
          <span><strong>${esc(nextDueLabel(schedule.nextDue))}</strong> review tjetër</span>
        </div>
        <div class="ck-v21-actions">
          <button type="button" class="is-primary" data-ck-v21-recall>Rikujto tani</button>
          <button type="button" data-ck-v21-mix ${mixed.length ? '' : 'disabled'} title="${mixed.length ? 'Përzieje me një protokoll tjetër të verifikuar' : 'Aktivohet kur ka të paktën një protokoll tjetër të verifikuar'}">Përzieji protokollet</button>
        </div>
      </div>
      <p class="ck-v21-note">Metodat e përdorura mbështesin retencionin afatgjatë; ky progres nuk është matje e kompetencës klinike.</p>`;

    box.querySelector('[data-ck-v21-recall]')?.addEventListener('click', () => {
      panel.querySelector('[data-ck-v5-smart]')?.click();
      window.setTimeout(() => {
        const target = panel.querySelector('[data-ck-sl-flashcards]');
        target?.scrollIntoView({behavior:'smooth', block:'center'});
        target?.querySelector('[data-flash-reveal]')?.focus({preventScroll:true});
      }, 40);
    });
    box.querySelector('[data-ck-v21-mix]')?.addEventListener('click', () => openMixed(mixed[0]?.item));
  }

  function installRecallGate(flash, item) {
    if (!flash || !item?._id) return;
    const card = flash.querySelector('[data-flash-card]');
    const reveal = flash.querySelector('[data-flash-reveal]');
    if (!card || !reveal) return;

    const state = flashState(item._id);
    const index = Number(state.index || 0);
    const memory = memoryState(item._id);
    const selected = memory?.confidence?.[index] || '';

    if (!state.revealed) {
      let predict = card.querySelector('.ck-v21-predict');
      if (!predict) {
        predict = document.createElement('div');
        predict.className = 'ck-v21-predict';
        reveal.insertAdjacentElement('beforebegin', predict);
      }
      predict.innerHTML = `
        <span>PARA SE TA SHOHËSH</span>
        <strong>Thuaje përgjigjen me vete, pastaj zgjidh sa i sigurt je.</strong>
        <div role="group" aria-label="Sa i sigurt je për përgjigjen?">
          <button type="button" data-ck-v21-confidence="low" aria-pressed="${selected === 'low'}">S’e mbaj</button>
          <button type="button" data-ck-v21-confidence="mid" aria-pressed="${selected === 'mid'}">Mendoj se e di</button>
          <button type="button" data-ck-v21-confidence="high" aria-pressed="${selected === 'high'}">Jam i sigurt</button>
        </div>`;
      predict.querySelectorAll('[data-ck-v21-confidence]').forEach(button => {
        button.addEventListener('click', () => {
          const next = memoryState(item._id);
          next.confidence = {...(next.confidence || {}), [index]:button.dataset.ckV21Confidence};
          next.lastAt = Date.now();
          writeMemory(item._id, next);
          predict.querySelectorAll('[data-ck-v21-confidence]').forEach(candidate => {
            candidate.setAttribute('aria-pressed', candidate === button ? 'true' : 'false');
          });
        });
      });
    } else {
      card.querySelector('.ck-v21-predict')?.remove();
      let calibration = flash.querySelector('.ck-v21-calibration');
      if (!calibration) {
        calibration = document.createElement('div');
        calibration.className = 'ck-v21-calibration';
        const recall = flash.querySelector('.ck-sl-recall');
        recall?.insertAdjacentElement('beforebegin', calibration);
      }
      if (calibration) {
        calibration.innerHTML = `<span>Parashikimi yt: <strong>${esc(confidenceLabel(selected))}</strong></span><small>Tani vlerëso sa mirë e rikujtove realisht.</small>`;
      }
    }

    if (reveal.dataset.ckV21Bound !== '1') {
      reveal.dataset.ckV21Bound = '1';
      reveal.addEventListener('click', () => {
        const before = flashState(item._id);
        if (before.revealed) return;
        const next = memoryState(item._id);
        next.recallAttempts = Number(next.recallAttempts || 0) + 1;
        next.lastAt = Date.now();
        writeMemory(item._id, next);
      });
    }

    flash.querySelectorAll('[data-ck-rating]').forEach(button => {
      if (button.dataset.ckV21RatingBound === '1') return;
      button.dataset.ckV21RatingBound = '1';
      button.addEventListener('click', () => {
        const next = memoryState(item._id);
        next.ratedReviews = Number(next.ratedReviews || 0) + 1;
        next.ratings = {...(next.ratings || {}), [index]:button.dataset.ckRating || ''};
        next.lastAt = Date.now();
        writeMemory(item._id, next);
        window.setTimeout(scheduleEnhance, 30);
      });
    });
  }

  function enhance() {
    const panel = detail.querySelector('[data-ck-sl-panel="test"]');
    const flash = panel?.querySelector('[data-ck-sl-flashcards]');
    const item = currentItem();
    if (!panel || !flash || !item) return;
    ensurePanel(panel, flash, item);
    installRecallGate(flash, item);
  }

  let frame = 0;
  function scheduleEnhance() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(enhance);
  }

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('[data-ck-sl-panel="test"],[data-ck-sl-flashcards],[data-flash-card],[data-ck-rating]')
        || node.querySelector?.('[data-ck-sl-panel="test"],[data-ck-sl-flashcards],[data-flash-card],[data-ck-rating]')
      )
    ))) scheduleEnhance();
  });

  observer.observe(detail, {childList:true, subtree:true});
  scheduleEnhance();
  window.setTimeout(scheduleEnhance, 260);
})();
