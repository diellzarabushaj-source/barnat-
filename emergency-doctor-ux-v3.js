(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  const FLASH_KEY = 'medindex_emergency_flashcards_v1:';
  const META_KEY = 'medindex_emergency_flashcards_v3meta:';
  const FEEDBACK_KEY = 'medindex_emergency_flashcards_v3feedback:';

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  function flashCount(flash) {
    const text = flash?.querySelector('.ck-sl-flash-head>strong')?.textContent || '';
    const match = text.match(/\d+\s*\/\s*(\d+)/);
    return Math.max(Number(match?.[1] || 0), 0);
  }

  function readState(itemId, count) {
    const fallback = {index: 0, revealed: false, known: []};
    try {
      const stored = JSON.parse(sessionStorage.getItem(`${FLASH_KEY}${itemId}`) || 'null');
      if (!stored || !Number.isInteger(stored.index)) return fallback;
      return {
        index: Math.min(Math.max(stored.index, 0), Math.max(count - 1, 0)),
        revealed: Boolean(stored.revealed),
        known: Array.isArray(stored.known)
          ? [...new Set(stored.known.filter(value => Number.isInteger(value) && value >= 0 && value < count))]
          : [],
      };
    } catch {
      return fallback;
    }
  }

  function writeState(itemId, state) {
    try { sessionStorage.setItem(`${FLASH_KEY}${itemId}`, JSON.stringify(state)); } catch {}
  }

  function readMeta(itemId, count) {
    const fallback = {misses: {}, ratings: 0, round: 1};
    try {
      const stored = JSON.parse(sessionStorage.getItem(`${META_KEY}${itemId}`) || 'null');
      if (!stored || typeof stored !== 'object') return fallback;
      const misses = {};
      Object.entries(stored.misses || {}).forEach(([key, value]) => {
        const index = Number(key);
        const amount = Number(value);
        if (Number.isInteger(index) && index >= 0 && index < count && Number.isFinite(amount) && amount > 0) {
          misses[index] = Math.floor(amount);
        }
      });
      return {
        misses,
        ratings: Math.max(Number(stored.ratings || 0), 0),
        round: Math.max(Number(stored.round || 1), 1),
      };
    } catch {
      return fallback;
    }
  }

  function writeMeta(itemId, meta) {
    try { sessionStorage.setItem(`${META_KEY}${itemId}`, JSON.stringify(meta)); } catch {}
  }

  function setFeedback(itemId, text, tone = 'info') {
    try { sessionStorage.setItem(`${FEEDBACK_KEY}${itemId}`, JSON.stringify({text, tone})); } catch {}
  }

  function consumeFeedback(itemId) {
    try {
      const key = `${FEEDBACK_KEY}${itemId}`;
      const value = JSON.parse(sessionStorage.getItem(key) || 'null');
      sessionStorage.removeItem(key);
      return value && value.text ? value : null;
    } catch {
      return null;
    }
  }

  function refreshLearn() {
    requestAnimationFrame(() => detail.querySelector('[data-ck-mode="learn"]')?.click());
  }

  function nextPriority(current, count, known, misses) {
    if (!count) return 0;
    const candidates = [];
    for (let index = 0; index < count; index += 1) {
      if (!known.has(index)) candidates.push(index);
    }
    if (!candidates.length) return current;
    const pool = candidates.length > 1 ? candidates.filter(index => index !== current) : candidates;
    pool.sort((a, b) => {
      const missDelta = Number(misses[b] || 0) - Number(misses[a] || 0);
      if (missDelta) return missDelta;
      const distanceA = (a - current + count) % count || count;
      const distanceB = (b - current + count) % count || count;
      return distanceA - distanceB;
    });
    return pool[0] ?? candidates[0] ?? current;
  }

  function sectionCount(panel, label) {
    if (!panel) return 0;
    if (label === 'Hapat') return panel.querySelectorAll('.ck-sl-step,.ck-sl-lesson-step').length;
    if (label === 'Red flags') {
      const block = [...panel.querySelectorAll('.ck-sl-lesson-block')].find(node => /red flags|shenjat alarmuese/i.test(node.textContent || ''));
      return block?.querySelectorAll('li').length || 0;
    }
    if (label === 'Mos bëj') return panel.querySelectorAll('.ck-sl-dont li,.ck-sl-lesson-block.is-danger li').length;
    if (label === 'Flashcards') return flashCount(panel.querySelector('[data-ck-sl-flashcards]'));
    return 0;
  }

  function decorateJumpbar(nav) {
    if (!nav || nav.dataset.ckV3Ready === '1') return;
    nav.dataset.ckV3Ready = '1';
    const panel = nav.closest('[data-ck-sl-panel]');
    const mode = nav.dataset.ckDoctorNav;
    const lead = nav.querySelector(':scope > span');
    if (lead) lead.textContent = mode === 'summary' ? 'Vepro shpejt' : 'Rruga klinike';

    const buttons = [...nav.querySelectorAll('[data-ck-jump]')];
    buttons.forEach((button, index) => {
      const label = button.textContent.trim();
      button.dataset.ckRouteStep = String(index + 1);
      const count = sectionCount(panel, label);
      if (count > 0 && !button.querySelector('.ck-doctor-nav-count')) {
        const badge = document.createElement('span');
        badge.className = 'ck-doctor-nav-count';
        badge.textContent = String(count);
        badge.setAttribute('aria-hidden', 'true');
        button.appendChild(badge);
        button.setAttribute('aria-label', `${label}, ${count}`);
      }
    });

    nav.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const current = document.activeElement;
      const index = buttons.indexOf(current);
      if (index < 0) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = Math.min(buttons.length - 1, index + 1);
      if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      buttons[next]?.focus({preventScroll: true});
    });
  }

  function enhanceFlash(flash) {
    if (!flash || flash.dataset.ckV3Ready === '1') return;
    flash.dataset.ckV3Ready = '1';
    const itemId = flash.dataset.itemId || '';
    const count = flashCount(flash);
    if (!itemId || !count) return;

    const state = readState(itemId, count);
    const meta = readMeta(itemId, count);
    const hard = Object.entries(meta.misses)
      .filter(([, value]) => Number(value) > 0)
      .map(([index]) => Number(index));

    const tools = flash.querySelector('.ck-flash-session-tools');
    if (tools && !tools.querySelector('.ck-flash-v3-session')) {
      const session = document.createElement('div');
      session.className = 'ck-flash-v3-session';
      session.setAttribute('aria-label', 'Gjendja e sesionit të përsëritjes');
      session.innerHTML = `<span>Raundi <strong>${meta.round}</strong></span><span class="${hard.length ? 'has-hard' : ''}">Të vështira <strong>${hard.length}</strong></span>`;
      tools.appendChild(session);
    }

    const feedback = consumeFeedback(itemId);
    if (feedback) {
      const note = document.createElement('div');
      note.className = `ck-flash-feedback is-${feedback.tone || 'info'}`;
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
      note.textContent = feedback.text;
      (tools || flash.querySelector('.ck-sl-flash-progress'))?.insertAdjacentElement('afterend', note);
    }

    const card = flash.querySelector('.ck-sl-flashcard');
    if (card) {
      const misses = Number(meta.misses[state.index] || 0);
      card.dataset.ckDifficulty = misses > 1 ? 'hard' : misses === 1 ? 'review' : 'new';
      if (!card.querySelector('.ck-flash-v3-cardmeta')) {
        const metaRow = document.createElement('div');
        metaRow.className = 'ck-flash-v3-cardmeta';
        metaRow.innerHTML = `<span>Karta ${state.index + 1} / ${count}</span><span>${misses ? `${misses}× për përsëritje` : 'Pa gabime në këtë sesion'}</span>`;
        card.querySelector('h4')?.insertAdjacentElement('beforebegin', metaRow);
      }
    }

    const complete = flash.querySelector('.ck-flash-complete');
    if (complete && hard.length && !complete.querySelector('[data-ck-flash-hard-review]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.ckFlashHardReview = '1';
      button.className = 'ck-flash-hard-review';
      button.textContent = `Rishiko ${hard.length} ${hard.length === 1 ? 'kartë të vështirë' : 'karta të vështira'}`;
      complete.appendChild(button);
    }
  }

  function enhance() {
    detail.querySelectorAll('[data-ck-doctor-nav]').forEach(decorateJumpbar);
    enhanceFlash(detail.querySelector('[data-ck-sl-flashcards]'));
  }

  detail.addEventListener('click', event => {
    const flash = event.target.closest?.('[data-ck-sl-flashcards]');
    if (!flash) return;
    const itemId = flash.dataset.itemId || '';
    const count = flashCount(flash);
    if (!itemId || !count) return;

    if (event.target.closest('[data-ck-flash-reset]')) {
      try {
        sessionStorage.removeItem(`${META_KEY}${itemId}`);
        sessionStorage.removeItem(`${FEEDBACK_KEY}${itemId}`);
      } catch {}
      return;
    }

    const hardReview = event.target.closest('[data-ck-flash-hard-review]');
    if (hardReview) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const state = readState(itemId, count);
      const meta = readMeta(itemId, count);
      const hard = Object.keys(meta.misses).map(Number).filter(index => Number(meta.misses[index] || 0) > 0);
      if (!hard.length) return;
      const known = new Set(state.known);
      hard.forEach(index => known.delete(index));
      hard.sort((a, b) => Number(meta.misses[b] || 0) - Number(meta.misses[a] || 0));
      writeMeta(itemId, {...meta, round: meta.round + 1});
      writeState(itemId, {...state, known: [...known], index: hard[0], revealed: false});
      setFeedback(itemId, 'Po rishikon vetëm kartat që të kanë vështirësuar.', 'review');
      refreshLearn();
      return;
    }

    const repeat = event.target.closest('[data-flash-repeat]');
    const knew = event.target.closest('[data-flash-known]');
    if (!repeat && !knew) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const state = readState(itemId, count);
    const meta = readMeta(itemId, count);
    const known = new Set(state.known);

    if (repeat) {
      known.delete(state.index);
      meta.misses[state.index] = Number(meta.misses[state.index] || 0) + 1;
      meta.ratings += 1;
      const next = nextPriority(state.index, count, known, meta.misses);
      writeMeta(itemId, meta);
      writeState(itemId, {...state, known: [...known], index: next, revealed: false});
      setFeedback(itemId, 'U ruajt për përsëritje dhe do të dalë përsëri në këtë sesion.', 'review');
      refreshLearn();
      return;
    }

    known.add(state.index);
    meta.ratings += 1;
    const next = nextPriority(state.index, count, known, meta.misses);
    writeMeta(itemId, meta);
    writeState(itemId, {...state, known: [...known], index: next, revealed: false});
    setFeedback(itemId, known.size === count ? 'Seti u përfundua. Mund të rishikosh vetëm kartat e vështira.' : 'E shënuar si e ditur. Po vazhdojmë me kartën tjetër.', 'known');
    refreshLearn();
  }, true);

  detail.addEventListener('keydown', event => {
    const flash = event.target.closest?.('[data-ck-sl-flashcards]');
    if (!flash || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key.toLowerCase() === 'r' && flash.querySelector('[data-ck-flash-hard-review]')) {
      event.preventDefault();
      flash.querySelector('[data-ck-flash-hard-review]')?.click();
    }
  });

  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(enhance);
  };

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (
        node.matches?.('[data-ck-doctor-nav],[data-ck-sl-flashcards]')
        || node.querySelector?.('[data-ck-doctor-nav],[data-ck-sl-flashcards]')
      )
    ))) schedule();
  });
  observer.observe(detail, {childList: true, subtree: true});
  schedule();
  window.setTimeout(schedule, 160);
})();