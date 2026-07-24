(() => {
  'use strict';

  const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function visibleDialog() {
    return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .find(dialog => !dialog.closest('[hidden]') && dialog.getClientRects().length);
  }

  document.addEventListener('keydown', event => {
    const dialog = visibleDialog();
    if (!dialog) return;
    if (event.key === 'Escape') {
      const close = dialog.querySelector('[data-close-dialog],.med-panel-close,[data-close-signature],[data-close-more]');
      if (close) {
        event.preventDefault();
        close.click();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll(focusableSelector)].filter(item => item.getClientRects().length);
    if (!items.length) {
      event.preventDefault();
      dialog.setAttribute('tabindex', '-1');
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
