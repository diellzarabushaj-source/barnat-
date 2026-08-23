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

  function buildDeck(item) {
    const deck = [];
    const primary = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    const secondary = Array.isArray(item?.secondaryCareSteps) ? item.secondaryCareSteps : [];
    const redFlags = Array.isArray(item?.redFlags) ? item.redFlags.filter(Boolean) : [];
    const doNotDo = Array.isArray(item?.doNotDo) ? item.doNotDo.filter(Boolean) : [];
    const firstAction = firstActionStep(item);
    const medication = medicationStep(item);

    if (firstAction) {
      deck.push({
        id: 'first-action',
        tag: medication && firstAction === medication ? 'TRAJTIMI I PARË' : 'VEPRIMI I PARË',
        level: 'must',
        q: medication && firstAction === medication
          ? `Pa parë protokollin: cili është trajtimi i parë te “${item.title}”?`
          : `Pa parë protokollin: cili është veprimi i parë te “${item.title}”?`,
        a: firstAction.action || firstAction.title || '',
      });
    }

    primary.forEach((step, index) => {
      if (!step || step === firstAction) return;
      deck.push({
        id: `primary-${index + 1}`,
        tag: `HAPI ${index + 1}`,
        level: index < 3 ? 'must' : 'core',
        q: `Çfarë duhet të bësh te “${step.title || `Hapi ${index + 1}`}”?`,
        a: step.action || '',
      });
      if (step.why && deck.length < 8) {
        deck.push({
          id: `why-${index + 1}`,
          tag: 'ARSYETIMI',
          level: 'reasoning',
          q: `Pse ka rëndësi “${step.title || `Hapi ${index + 1}`}”?`,
          a: step.why,
        });
      }
    });

    if (redFlags.length) {
      deck.push({
        id: 'red-flags',
        tag: 'RED FLAGS',
        level: 'safety',
        q: 'Cilat shenja alarmuese duhet t’i njohësh menjëherë?',
        a: redFlags.slice(0, 5).join(' • '),
      });
    }

    if (doNotDo.length) {
      deck.push({
        id: 'do-not-do',
        tag: 'MOS BËJ',
        level: 'safety',
        q: 'Cilat janë gabimet kryesore që duhet t’i shmangësh?',
        a: doNotDo.slice(0, 4).join(' • '),
      });
    }

    const referral = item?.referral || {};
    if (referral.when || referral.destination || referral.handover) {
      deck.push({
        id: 'transfer',
        tag: 'TRANSFERIMI',
        level: 'core',
        q: 'Kur dhe ku duhet të transferohet/referohet pacienti, dhe çfarë duhet të përmbajë handover-i?',
        a: [referral.when, referral.destination, referral.handover].filter(Boolean).join(' • '),
      });
    }

    secondary.slice(0, 2).forEach((step, index) => {
      if (!step?.action && !step?.note) return;
      deck.push({
        id: `secondary-${index + 1}`,
        tag: 'THELLIMI',
        level: 'reasoning',
        q: `Si vazhdon menaxhimi te “${step.title || `kujdesi sekondar ${index + 1}`}”?`,
        a: [step.action, step.note].filter(Boolean).join(' '),
      });
    });

    return deck.filter(card => card.a).slice(0, 10);
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
          if (ids.has(id) && Number.isFinite(Number(value)) && Number(value) > 0) misses[id] = Math.min(Number(value), 99);
        });
      }
      const currentId = ids.has(stored.currentId) ? stored.currentId : (deck.find(card => !mastered.includes(card.id))?.id || deck[0]?.id || '');
      return {currentId, revealed: Boolean(stored.revealed), mastered, misses};
    } catch {
      return fallback;
    }
  }

  function saveState(itemId, state) {
    try { localStorage.setItem(`${STORAGE_KEY}${itemId}`, JSON.stringify(state)); } catch {}
  }

  function nextUnmastered(deck, state, currentId) {
    const mastered = new Set(state.mastered);
    const candidates = deck.filter(card => !mastered.has(card.id) && card.id !== currentId);
    if (!candidates.length) return deck.find(card => !mastered.has(card.id))?.id || currentId || deck[0]?.id || '';
    return [...candidates].sort((a, b) => {
      const missDiff = Number(state.misses[b.id] || 0) - Number(state.misses[a.id] || 0);
      if (missDiff) return missDiff;
      return deck.indexOf(a) - deck.indexOf(b);
    })[0].id;
  }

  function masteryLabel(count, total) {
    if (!total) return '0%';
    return `${Math.round((count / total) * 100)}%`;
  }

  function levelLabel(level) {
    if (level === 'must') return 'Duhet ditur';
    if (level === 'safety') return 'Siguri';
    if (level === 'reasoning') return 'Arsyetim';
    return 'Thelbësore';
  }

  function renderFlashcards(existing, item) {
    const deck = buildDeck(item);
    if (!existing || !deck.length) return;

    const state = readState(item._id, deck);
    const mastered = new Set(state.mastered);
    const hardIds = deck.filter(card => Number(state.misses[card.id] || 0) > 0).map(card => card.id);
    const remaining = deck.filter(card => !mastered.has(card.id));
    const done = remaining.length === 0;
    const current = deck.find(card => card.id === state.currentId) || remaining[0] || deck[0];
    const currentNumber = Math.max(deck.findIndex(card => card.id === current.id) + 1, 1);
    const progress = deck.length ? Math.round((mastered.size / deck.length) * 100) : 0;

    const flash = document.createElement('section');
    flash.className = 'ck-sl-flashcards ck-flash-v3';
    flash.dataset.ckSlFlashcards = '';
    flash.dataset.itemId = item._id;
    flash.dataset.ckDoctorEnhanced = '1';
    flash.dataset.ckFlashV3 = '1';
    flash.setAttribute('aria-label', `Përsëritje aktive për ${item.title}`);

    flash.innerHTML = `
      <div class="ck-flash-v3-head">
        <div>
          <span>PËRSËRITJE AKTIVE</span>
          <h3>Mbaje mend pa e parë përgjigjen</h3>
          <p>Fokus te veprimi i parë, siguria dhe vendimet që duhen rikujtuar shpejt.</p>
        </div>
        <div class="ck-flash-v3-score" aria-label="${mastered.size} nga ${deck.length} karta të ditura">
          <strong>${mastered.size}/${deck.length}</strong>
          <span>${masteryLabel(mastered.size, deck.length)}</span>
        </div>
      </div>

      <div class="ck-flash-v3-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" aria-label="Progresi i kartave të mësuara"><span style="width:${progress}%"></span></div>

      <div class="ck-flash-v3-meta">
        <span><strong>${remaining.length}</strong> për përsëritje</span>
        <span class="${hardIds.length ? 'is-hard' : ''}"><strong>${hardIds.length}</strong> të vështira</span>
        ${hardIds.length ? '<button type="button" data-ck-v3-review-hard>Rishiko të vështirat</button>' : ''}
        <button type="button" data-ck-v3-reset>Rifillo</button>
      </div>

      ${done ? `
        <div class="ck-flash-v3-complete" role="status">
          <div class="ck-flash-v3-check" aria-hidden="true">✓</div>
          <div><strong>Seti u përfundua</strong><p>I ke rikujtuar të gjitha ${deck.length} pikat kryesore. ${hardIds.length ? 'Mund t’i kalosh edhe një herë vetëm kartat e vështira.' : 'Mund ta rifillosh setin për një raund të ri.'}</p></div>
          <div class="ck-flash-v3-complete-actions">
            ${hardIds.length ? '<button type="button" data-ck-v3-review-hard>Vetëm të vështirat</button>' : ''}
            <button type="button" data-ck-v3-reset>Rifillo setin</button>
          </div>
        </div>` : `
        <article class="ck-flash-v3-card ${state.revealed ? 'is-revealed' : ''}" tabindex="0" data-flash-card aria-label="Flashcard ${currentNumber} nga ${deck.length}">
          <div class="ck-flash-v3-card-top">
            <span class="ck-flash-v3-tag">${esc(current.tag)}</span>
            <span class="ck-flash-v3-level is-${esc(current.level)}">${esc(levelLabel(current.level))}</span>
          </div>
          <h4>${esc(current.q)}</h4>
          <p class="ck-flash-v3-prompt">Thuaje përgjigjen me vete. Pastaj krahasoje me protokollin.</p>
          <div class="ck-flash-v3-answer" role="region" aria-live="polite" ${state.revealed ? '' : 'hidden'}>
            <span>PËRGJIGJJA</span>
            <p>${esc(current.a)}</p>
          </div>
          ${state.revealed ? `
            <div class="ck-flash-v3-rating" aria-label="Vlerëso rikujtimin">
              <button type="button" data-flash-repeat><span>1</span>Nuk e dija — përsërite</button>
              <button type="button" data-flash-known><span>2</span>E dija</button>
            </div>` : `
            <button class="ck-flash-v3-reveal" type="button" data-flash-reveal aria-keyshortcuts="Space">Shfaq përgjigjen <span>Space</span></button>`}
        </article>

        <div class="ck-flash-v3-nav" aria-label="Navigimi i flashcards">
          <button type="button" data-flash-prev aria-label="Flashcard paraprak">← Para</button>
          <span>Karta ${currentNumber} nga ${deck.length}</span>
          <button type="button" data-flash-next aria-label="Flashcard tjetër">Tjetra →</button>
        </div>`}
    `;

    existing.replaceWith(flash);

    const commit = next => {
      saveState(item._id, next);
      requestAnimationFrame(() => renderFlashcards(flash, item));
    };

    flash.addEventListener('click', event => {
      const reset = event.target.closest('[data-ck-v3-reset]');
      if (reset) {
        event.preventDefault();
        try { localStorage.removeItem(`${STORAGE_KEY}${item._id}`); } catch {}
        requestAnimationFrame(() => renderFlashcards(flash, item));
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
        commit({...state, currentId: current.id, revealed: true});
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
        const index = deck.findIndex(card => card.id === current.id);
        const delta = prev ? -1 : 1;
        const target = deck[(index + delta + deck.length) % deck.length];
        commit({...state, currentId: target.id, revealed: false});
      }
    });

    flash.addEventListener('keydown', event => {
      if (event.target.closest('button,a,input,textarea,select,[contenteditable="true"]')) return;
      if (event.code === 'Space' && !state.revealed) {
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
        flash.querySelector('[data-flash-prev]')?.click();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        flash.querySelector('[data-flash-next]')?.click();
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
    const steps = [...nav.querySelectorAll('[data-ck-jump]')].map(button => button.textContent.trim()).filter(Boolean);
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
