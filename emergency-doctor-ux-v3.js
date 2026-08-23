(() => {
  'use strict';

  const STORAGE_KEY = 'medindex_emergency_flashcards_v3:';
  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  const normalize = value => String(value || '')
    .trim()
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const medicationPattern = /(adrenalin|epinefr|nalokson|glukoz|aspirin|nitroglic|salbutamol|ipratrop|midazolam|diazepam|lorazepam|atropin|amiodaron|adenozin|magnesium|furosemid|hidrokortizon|dexametazon)/i;

  function currentItem() {
    const items = Array.isArray(window.__medIndexEmergencyItems) ? window.__medIndexEmergencyItems : [];
    const activeId = document.querySelector('#emergencyList .ck-list-button.is-active[data-id]')?.dataset.id;
    if (activeId) {
      const byId = items.find(item => String(item?._id || '') === String(activeId));
      if (byId) return byId;
    }
    const title = detail.querySelector('.ck-detail-head h2')?.textContent?.trim();
    return title ? items.find(item => item?.title === title) || null : null;
  }

  function medicationStep(item) {
    const steps = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    return steps.find(step => medicationPattern.test(`${step?.title || ''} ${step?.action || ''}`)) || null;
  }

  function firstActionStep(item) {
    const steps = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    return medicationStep(item)
      || steps.find(step => normalize(step?.priority) === 'immediate')
      || steps[0]
      || null;
  }

  // Keep the canonical card order/count from Summary/Learn so existing physician flows,
  // QA and learned muscle-memory stay stable. V3 adds mastery and hard-card state on top.
  function buildDeck(item) {
    const cards = [];
    const primary = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    const secondary = Array.isArray(item?.secondaryCareSteps) ? item.secondaryCareSteps : [];
    const redFlags = Array.isArray(item?.redFlags) ? item.redFlags.filter(Boolean) : [];
    const doNotDo = Array.isArray(item?.doNotDo) ? item.doNotDo.filter(Boolean) : [];
    const medication = medicationStep(item);
    const firstAction = firstActionStep(item);

    if (firstAction) cards.push({
      id: 'first-action',
      q: medication && firstAction === medication
        ? `Cili është trajtimi i parë te “${item.title}”?`
        : `Cili është veprimi i parë te “${item.title}”?`,
      a: firstAction.action || firstAction.title || '',
      tag: medication && firstAction === medication ? 'TRAJTIMI I PARË' : 'VEPRIMI I PARË',
      level: 'must',
    });

    primary.forEach((step, index) => {
      if (!step || step === firstAction) return;
      cards.push({
        id: `primary-${index + 1}`,
        q: `Çfarë bëhet te hapi ${index + 1}: ${step.title || 'veprimi klinik'}?`,
        a: step.action || '',
        tag: `HAPI ${index + 1}`,
        level: index < 3 ? 'must' : 'core',
      });
      if (step.why && cards.length < 9) cards.push({
        id: `why-${index + 1}`,
        q: `Pse ka rëndësi “${step.title || `hapi ${index + 1}`}”?`,
        a: step.why,
        tag: 'ARSYETIMI',
        level: 'reasoning',
      });
    });

    if (redFlags.length) cards.push({
      id: 'red-flags',
      q: 'Cilat janë shenjat alarmuese kryesore?',
      a: redFlags.slice(0, 5).join(' • '),
      tag: 'RED FLAGS',
      level: 'safety',
    });

    secondary.slice(0, 3).forEach((step, index) => cards.push({
      id: `secondary-${index + 1}`,
      q: `Si menaxhohet më tej: ${step?.title || 'kujdesi sekondar'}?`,
      a: [step?.action, step?.note].filter(Boolean).join(' '),
      tag: 'THELLIMI',
      level: 'reasoning',
    }));

    if (doNotDo.length) cards.push({
      id: 'do-not-do',
      q: 'Cilat gabime duhet të shmangen?',
      a: doNotDo.slice(0, 4).join(' • '),
      tag: 'MOS BËJ',
      level: 'safety',
    });

    if (item?.referral?.handover) cards.push({
      id: 'handover',
      q: 'Çfarë duhet të përmbajë handover-i?',
      a: item.referral.handover,
      tag: 'HANDOVER',
      level: 'core',
    });

    return cards.filter(card => card.a).slice(0, 12);
  }

  function readState(itemId, deck) {
    const fallback = {currentId: deck[0]?.id || '', revealed: false, mastered: [], misses: {}};
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}${itemId}`);
      const stored = raw ? JSON.parse(raw) : null;
      if (!stored) return fallback;
      const ids = new Set(deck.map(card => card.id));
      const mastered = Array.isArray(stored.mastered)
        ? [...new Set(stored.mastered.filter(id => ids.has(id)))]
        : [];
      const misses = {};
      if (stored.misses && typeof stored.misses === 'object') {
        Object.entries(stored.misses).forEach(([id, value]) => {
          const count = Number(value);
          if (ids.has(id) && Number.isFinite(count) && count > 0) misses[id] = Math.min(count, 99);
        });
      }
      const currentId = ids.has(stored.currentId)
        ? stored.currentId
        : (deck.find(card => !mastered.includes(card.id))?.id || deck[0]?.id || '');
      return {currentId, revealed: Boolean(stored.revealed), mastered, misses};
    } catch {
      return fallback;
    }
  }

  function saveState(itemId, state) {
    try { localStorage.setItem(`${STORAGE_KEY}${itemId}`, JSON.stringify(state)); } catch {}
  }

  function levelLabel(level) {
    if (level === 'must') return 'Duhet ditur';
    if (level === 'safety') return 'Siguri';
    if (level === 'reasoning') return 'Arsyetim';
    return 'Thelbësore';
  }

  function nextUnmastered(deck, state, currentId) {
    const mastered = new Set(state.mastered);
    const currentIndex = Math.max(deck.findIndex(card => card.id === currentId), 0);
    const unresolved = deck.filter(card => !mastered.has(card.id) && card.id !== currentId);
    if (!unresolved.length) return deck.find(card => !mastered.has(card.id))?.id || currentId || deck[0]?.id || '';

    // Prefer the normal clinical sequence unless a card has previously been missed.
    // Hard cards are surfaced earlier without making the deck feel random.
    return [...unresolved].sort((a, b) => {
      const missDiff = Number(state.misses[b.id] || 0) - Number(state.misses[a.id] || 0);
      if (missDiff) return missDiff;
      const ai = deck.indexOf(a);
      const bi = deck.indexOf(b);
      const aDistance = ai > currentIndex ? ai - currentIndex : deck.length + ai - currentIndex;
      const bDistance = bi > currentIndex ? bi - currentIndex : deck.length + bi - currentIndex;
      return aDistance - bDistance;
    })[0].id;
  }

  function answerId(itemId, cardId) {
    const safeItem = String(itemId || 'item').replace(/[^a-zA-Z0-9_-]/g, '-');
    const safeCard = String(cardId || 'card').replace(/[^a-zA-Z0-9_-]/g, '-');
    return `ck-flash-v3-answer-${safeItem}-${safeCard}`;
  }

  function renderFlashcards(existing, item, focusSelector = '') {
    const deck = buildDeck(item);
    if (!existing || !deck.length) return;

    const state = readState(item._id, deck);
    const mastered = new Set(state.mastered);
    const hardIds = deck.filter(card => Number(state.misses[card.id] || 0) > 0).map(card => card.id);
    const remaining = deck.filter(card => !mastered.has(card.id));
    const done = remaining.length === 0;
    const current = deck.find(card => card.id === state.currentId) || remaining[0] || deck[0];
    const currentIndex = Math.max(deck.findIndex(card => card.id === current.id), 0);
    const currentNumber = currentIndex + 1;
    const masteryPercent = deck.length ? Math.round((mastered.size / deck.length) * 100) : 0;
    const currentAnswerId = answerId(item._id, current.id);

    const flash = document.createElement('section');
    flash.className = 'ck-sl-flashcards ck-flash-v3';
    flash.dataset.ckSlFlashcards = '';
    flash.dataset.itemId = item._id;
    flash.dataset.ckDoctorEnhanced = '1';
    flash.dataset.ckFlashV3 = '1';
    flash.setAttribute('aria-label', `Përsëritje aktive për ${item.title}`);

    flash.innerHTML = `
      <div class="ck-sl-flash-head ck-flash-v3-head">
        <div>
          <span>PËRSËRITJE AKTIVE</span>
          <h3>Mbaje mend pa e parë përgjigjen</h3>
          <p>Fokus te veprimi i parë, siguria dhe vendimet që duhen rikujtuar shpejt.</p>
        </div>
        <strong aria-label="Karta ${currentNumber} nga ${deck.length}">${currentNumber} / ${deck.length}</strong>
      </div>

      <div class="ck-sl-flash-progress ck-flash-v3-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${masteryPercent}" aria-label="${mastered.size} nga ${deck.length} karta të ditura"><span style="width:${masteryPercent}%"></span></div>

      <div class="ck-flash-v3-meta">
        <span><strong>${mastered.size}</strong> të ditura</span>
        <span><strong>${remaining.length}</strong> për përsëritje</span>
        <span class="${hardIds.length ? 'is-hard' : ''}"><strong>${hardIds.length}</strong> të vështira</span>
        ${hardIds.length ? '<button type="button" data-ck-v3-review-hard>Rishiko të vështirat</button>' : ''}
        <button type="button" data-ck-v3-reset>Rifillo</button>
      </div>

      ${done ? `
        <div class="ck-flash-v3-complete" role="status">
          <div class="ck-flash-v3-check" aria-hidden="true">✓</div>
          <div><strong>Seti u përfundua</strong><p>I ke rikujtuar të gjitha ${deck.length} pikat kryesore. ${hardIds.length ? 'Kalo edhe një herë vetëm kartat që të kanë nxjerrë problem.' : 'Mund ta rifillosh setin për një raund të ri.'}</p></div>
          <div class="ck-flash-v3-complete-actions">
            ${hardIds.length ? '<button type="button" data-ck-v3-review-hard>Vetëm të vështirat</button>' : ''}
            <button type="button" data-ck-v3-reset>Rifillo setin</button>
          </div>
        </div>` : `
        <article class="ck-sl-flashcard ck-flash-v3-card ${state.revealed ? 'is-revealed' : ''}" tabindex="0" data-flash-card aria-label="Flashcard ${currentNumber} nga ${deck.length}">
          <div class="ck-flash-v3-card-top">
            <span class="ck-flash-v3-tag">${esc(current.tag)}</span>
            <span class="ck-flash-v3-level is-${esc(current.level)}">${esc(levelLabel(current.level))}</span>
          </div>
          <h4>${esc(current.q)}</h4>
          <p class="ck-flash-v3-prompt">Thuaje përgjigjen me vete. Pastaj krahasoje me protokollin.</p>
          <div class="ck-sl-flash-answer ck-flash-v3-answer" id="${esc(currentAnswerId)}" role="region" aria-live="polite" ${state.revealed ? '' : 'hidden'}>
            <small>PËRGJIGJJA</small>
            <p>${esc(current.a)}</p>
          </div>
          <button class="ck-flash-v3-reveal" type="button" data-flash-reveal aria-expanded="${state.revealed ? 'true' : 'false'}" aria-controls="${esc(currentAnswerId)}" aria-keyshortcuts="Space">${state.revealed ? 'Fshih përgjigjen' : 'Shfaq përgjigjen'} <span>Space</span></button>
        </article>

        <div class="ck-sl-flash-controls ck-flash-v3-nav" aria-label="Navigimi i flashcards">
          <button type="button" data-flash-prev ${currentIndex === 0 ? 'disabled' : ''} aria-label="Flashcard paraprak">← Para</button>
          ${state.revealed ? `<div class="ck-sl-recall ck-flash-v3-rating" aria-label="Vlerëso rikujtimin">
            <button type="button" data-flash-repeat><span>1</span>Nuk e dija — përsërite</button>
            <button type="button" data-flash-known class="is-known"><span>2</span>${mastered.has(current.id) ? 'E dija ✓' : 'E dija'}</button>
          </div>` : '<span class="ck-flash-v3-nav-status" aria-hidden="true"></span>'}
          <button type="button" data-flash-next ${currentIndex === deck.length - 1 ? 'disabled' : ''} aria-label="Flashcard tjetër">Tjetra →</button>
        </div>`}
    `;

    existing.replaceWith(flash);
    if (focusSelector) requestAnimationFrame(() => flash.querySelector(focusSelector)?.focus({preventScroll: true}));

    const commit = (next, nextFocus = '[data-flash-reveal]') => {
      saveState(item._id, next);
      requestAnimationFrame(() => renderFlashcards(flash, item, nextFocus));
    };

    flash.addEventListener('click', event => {
      const reset = event.target.closest('[data-ck-v3-reset]');
      if (reset) {
        event.preventDefault();
        try { localStorage.removeItem(`${STORAGE_KEY}${item._id}`); } catch {}
        requestAnimationFrame(() => renderFlashcards(flash, item, '[data-flash-reveal]'));
        return;
      }

      const hard = event.target.closest('[data-ck-v3-review-hard]');
      if (hard) {
        event.preventDefault();
        const hardSet = new Set(hardIds);
        const masteredNext = state.mastered.filter(id => !hardSet.has(id));
        commit({...state, mastered: masteredNext, currentId: hardIds[0] || deck[0]?.id || '', revealed: false});
        return;
      }

      const reveal = event.target.closest('[data-flash-reveal]');
      if (reveal) {
        event.preventDefault();
        commit({...state, currentId: current.id, revealed: !state.revealed});
        return;
      }

      const repeat = event.target.closest('[data-flash-repeat]');
      if (repeat) {
        event.preventDefault();
        const masteredNext = state.mastered.filter(id => id !== current.id);
        const missesNext = {...state.misses, [current.id]: Number(state.misses[current.id] || 0) + 1};
        const nextState = {...state, mastered: masteredNext, misses: missesNext};
        const nextId = nextUnmastered(deck, nextState, current.id);
        commit({...nextState, currentId: nextId, revealed: false});
        return;
      }

      const known = event.target.closest('[data-flash-known]');
      if (known) {
        event.preventDefault();
        const masteredNext = [...new Set([...state.mastered, current.id])];
        const nextState = {...state, mastered: masteredNext};
        const nextId = nextUnmastered(deck, nextState, current.id);
        commit({...nextState, currentId: nextId, revealed: false});
        return;
      }

      const prev = event.target.closest('[data-flash-prev]');
      const next = event.target.closest('[data-flash-next]');
      if (prev || next) {
        event.preventDefault();
        const targetIndex = prev
          ? Math.max(0, currentIndex - 1)
          : Math.min(deck.length - 1, currentIndex + 1);
        const target = deck[targetIndex];
        commit({...state, currentId: target.id, revealed: false});
      }
    });

    flash.addEventListener('keydown', event => {
      if (event.target.closest('button,a,input,textarea,select,[contenteditable="true"]')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        event.stopPropagation();
        flash.querySelector('[data-flash-reveal]')?.click();
      } else if (event.key === '1' && state.revealed) {
        event.preventDefault();
        event.stopPropagation();
        flash.querySelector('[data-flash-repeat]')?.click();
      } else if (event.key === '2' && state.revealed) {
        event.preventDefault();
        event.stopPropagation();
        flash.querySelector('[data-flash-known]')?.click();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        flash.querySelector('[data-flash-prev]:not(:disabled)')?.click();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        flash.querySelector('[data-flash-next]:not(:disabled)')?.click();
      }
    });
  }

  function improveJumpbars() {
    detail.querySelectorAll('.ck-doctor-jumpbar').forEach(nav => {
      nav.dataset.ckV3 = '1';
      const flashButton = [...nav.querySelectorAll('[data-ck-jump]')].find(button => /flashcards/i.test(button.textContent || ''));
      if (flashButton) flashButton.classList.add('is-flashcards');
    });
  }

  function addLearnProgress(panel) {
    if (!panel || panel.querySelector('[data-ck-v3-learning-path]')) return;
    const nav = panel.querySelector('[data-ck-doctor-nav="learn"]');
    if (!nav) return;
    const steps = [...nav.querySelectorAll('[data-ck-jump]')]
      .map(button => button.textContent.trim())
      .filter(Boolean);
    if (steps.length < 3) return;

    const path = document.createElement('div');
    path.className = 'ck-learning-path-v3';
    path.dataset.ckV3LearningPath = '1';
    path.setAttribute('aria-label', 'Rruga e mësimit');
    path.innerHTML = `<span>Rruga e shpejtë</span><div>${steps.map((label, index) => `<span><b>${index + 1}</b>${esc(label)}</span>`).join('<i aria-hidden="true">→</i>')}</div>`;
    nav.insertAdjacentElement('afterend', path);
  }

  function enhance() {
    const learn = detail.querySelector('[data-ck-sl-panel="learn"]');
    if (!learn) return;
    improveJumpbars();
    addLearnProgress(learn);
    const item = currentItem();
    const existing = learn.querySelector('[data-ck-sl-flashcards]:not([data-ck-flash-v3])');
    if (item && existing) renderFlashcards(existing, item);
  }

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(enhance);
  };

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('[data-ck-sl-panel],[data-ck-sl-flashcards],.ck-doctor-jumpbar')
        || node.querySelector?.('[data-ck-sl-panel],[data-ck-sl-flashcards],.ck-doctor-jumpbar')
      )
    ))) schedule();
  });

  observer.observe(detail, {childList: true, subtree: true});
  schedule();
  window.setTimeout(schedule, 160);
})();
