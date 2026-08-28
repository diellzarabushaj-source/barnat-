(() => {
  'use strict';

  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  const FLASH_KEY = 'medindex_emergency_flashcards_v1:';
  const META_KEY = 'medindex_emergency_flashcards_v3meta:';
  const SCHEDULE_KEY = 'medindex_emergency_flashcards_v4schedule:';
  const DAY = 24 * 60 * 60 * 1000;

  function flashCount(flash) {
    const text = flash?.querySelector('.ck-sl-flash-head>strong')?.textContent || '';
    const match = text.match(/\d+\s*\/\s*(\d+)/);
    return Math.max(Number(match?.[1] || 0), 0);
  }

  function readJson(storage, key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function readState(itemId, count) {
    const value = readJson(sessionStorage, `${FLASH_KEY}${itemId}`, {index:0, revealed:false, known:[]});
    return {
      index:Number.isInteger(value.index) ? Math.min(Math.max(value.index, 0), Math.max(count - 1, 0)) : 0,
      revealed:Boolean(value.revealed),
      known:Array.isArray(value.known)
        ? [...new Set(value.known.filter(index => Number.isInteger(index) && index >= 0 && index < count))]
        : [],
    };
  }

  function readMeta(itemId) {
    return readJson(sessionStorage, `${META_KEY}${itemId}`, {misses:{}});
  }

  function readSchedule(itemId) {
    return readJson(localStorage, `${SCHEDULE_KEY}${itemId}`, {});
  }

  function writeState(itemId, state) {
    try { sessionStorage.setItem(`${FLASH_KEY}${itemId}`, JSON.stringify(state)); } catch {}
  }

  function writeSchedule(itemId, schedule) {
    try { localStorage.setItem(`${SCHEDULE_KEY}${itemId}`, JSON.stringify(schedule)); } catch {}
  }

  function scheduleRating(itemId, index, rating) {
    const schedule = readSchedule(itemId);
    const previous = schedule[index] || {};
    const oldDays = Math.max(Number(previous.intervalDays || 0), 0);
    const nextDays = rating === 'again' ? 0
      : rating === 'hard' ? Math.max(1, Math.round(oldDays * 1.2) || 1)
      : rating === 'good' ? Math.max(3, Math.round(oldDays * 2.2) || 3)
      : Math.max(7, Math.round(oldDays * 3.2) || 7);
    const dueAt = rating === 'again'
      ? Date.now() + (10 * 60 * 1000)
      : Date.now() + (nextDays * DAY);
    schedule[index] = {rating, intervalDays:nextDays, dueAt, reviewedAt:Date.now()};
    writeSchedule(itemId, schedule);
    return schedule;
  }

  function nextPriority(current, count, known, misses, schedule) {
    if (!count) return 0;
    const now = Date.now();
    const candidates = [];
    for (let index = 0; index < count; index += 1) {
      if (known.has(index)) continue;
      const dueAt = Number(schedule?.[index]?.dueAt || 0);
      candidates.push({
        index,
        due:!dueAt || dueAt <= now,
        misses:Number(misses?.[index] || 0),
      });
    }
    if (!candidates.length) return current;
    const pool = candidates.length > 1 ? candidates.filter(entry => entry.index !== current) : candidates;
    pool.sort((a, b) =>
      Number(b.due) - Number(a.due)
      || b.misses - a.misses
      || (((a.index - current + count) % count) || count) - (((b.index - current + count) % count) || count)
    );
    return pool[0]?.index ?? candidates[0]?.index ?? current;
  }

  function rerender() {
    requestAnimationFrame(() => {
      detail.querySelector('[data-ck-sl-panel="test"] [data-flash-reveal]')?.focus({preventScroll:true});
    });
  }

  function ratingFromControl(control) {
    const explicit = String(control?.dataset?.ckRating || '');
    if (['again','hard','good','easy'].includes(explicit)) return explicit;
    if (control?.matches?.('[data-flash-repeat]')) return 'again';
    if (control?.matches?.('[data-flash-known]')) return 'good';
    return '';
  }

  detail.addEventListener('click', event => {
    const control = event.target.closest?.('[data-ck-rating],[data-flash-repeat],[data-flash-known]');
    if (!control) return;
    const flash = control.closest('[data-ck-sl-flashcards]');
    const itemId = flash?.dataset.itemId || '';
    const count = flashCount(flash);
    const rating = ratingFromControl(control);
    if (!flash || !itemId || !count || !rating) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const state = readState(itemId, count);
    const current = state.index;
    const known = new Set(state.known);
    if (rating === 'again' || rating === 'hard') known.delete(current);
    else known.add(current);

    const schedule = scheduleRating(itemId, current, rating);
    const meta = readMeta(itemId);
    const next = nextPriority(current, count, known, meta?.misses || {}, schedule);
    writeState(itemId, {
      ...state,
      index:next,
      known:[...known].sort((a,b) => a - b),
      revealed:false,
    });

    flash.dispatchEvent(new CustomEvent('medindex:flashcard-rated', {
      bubbles:true,
      detail:{itemId,index:current,rating,next},
    }));
    rerender();
  }, true);

  window.MedIndexEmergencyReviewV17 = Object.freeze({
    version:'17.0',
    ratings:Object.freeze(['again','hard','good','easy']),
  });
})();
