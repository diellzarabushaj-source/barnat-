(() => {
  'use strict';
  const detail = document.getElementById('emergencyDetail');
  if (!detail) return;

  detail.addEventListener('keydown', event => {
    const flash = event.target.closest?.('[data-ck-sl-flashcards]');
    if (!flash || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;

    if (event.key === '1') {
      const repeat = flash.querySelector('[data-flash-repeat]');
      if (!repeat) return;
      event.preventDefault();
      repeat.click();
      return;
    }

    if (event.key === '2') {
      const known = flash.querySelector('[data-flash-known]');
      if (!known) return;
      event.preventDefault();
      known.click();
      return;
    }

    if (event.key === 'ArrowLeft' && !event.target.closest?.('[data-flash-prev],[data-flash-next]')) {
      const previous = flash.querySelector('[data-flash-prev]:not([disabled])');
      if (!previous) return;
      event.preventDefault();
      previous.click();
      return;
    }

    if (event.key === 'ArrowRight' && !event.target.closest?.('[data-flash-prev],[data-flash-next]')) {
      const next = flash.querySelector('[data-flash-next]:not([disabled])');
      if (!next) return;
      event.preventDefault();
      next.click();
    }
  });
})();