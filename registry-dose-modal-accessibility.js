(() => {
  'use strict';

  const VERSION = 'dose-modal-accessibility-v1';
  const MODAL_ID = 'doseCalculatorModal';
  const TRIGGER_SELECTOR = '.dose-calculator-open';
  const CELL_SELECTOR = '[data-registry-dose-calculator-column="dose-calculator"]';
  const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  let lastTrigger = null;
  let modalObserver = null;
  let attachmentObserver = null;
  let focusRestores = 0;
  let trappedTabs = 0;
  let translatedBlocks = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const modalRoot = () => document.getElementById(MODAL_ID);
  const modalOpen = root => Boolean(root && !root.hidden);

  function groupForTrigger(trigger) {
    const cell = trigger?.closest(CELL_SELECTOR);
    if (!cell) return '';
    if (cell.querySelector('.dose-calculator-group-adult_only')) return 'adult_only';
    if (cell.querySelector('.dose-calculator-group-pediatric_only')) return 'pediatric_only';
    if (cell.querySelector('.dose-calculator-group-pediatric_and_adult')) return 'pediatric_and_adult';
    return '';
  }

  function visibleFocusable(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(node => {
      if (!(node instanceof HTMLElement) || node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return node.getClientRects().length > 0;
    });
  }

  function restoreTriggerFocus() {
    if (!(lastTrigger instanceof HTMLElement) || !lastTrigger.isConnected) {
      lastTrigger = null;
      return;
    }
    lastTrigger.setAttribute('aria-expanded', 'false');
    lastTrigger.focus({ preventScroll:true });
    focusRestores += 1;
    lastTrigger = null;
  }

  function translateClinicalBlock(root) {
    if (!root || !lastTrigger) return;
    const output = root.querySelector('[data-dose-result-text]');
    if (!output) return;
    const text = clean(output.textContent);
    const group = groupForTrigger(lastTrigger);
    let replacement = '';

    if (group === 'adult_only' && text.includes('Grupmosha “I rritur” nuk përputhet me moshën e shkruar.')) {
      replacement = 'Ky preparat nuk përdoret te fëmijët sipas burimit zyrtar. Doza nuk mund të kalkulohet.';
    }
    if (group === 'pediatric_only' && text.includes('Grupmosha “Fëmijë” nuk përputhet me moshën e shkruar.')) {
      replacement = 'Ky preparat nuk përdoret te të rriturit sipas burimit zyrtar. Doza nuk mund të kalkulohet.';
    }
    if (!replacement || replacement === text) return;
    output.textContent = replacement;
    translatedBlocks += 1;
  }

  function onKeydown(event) {
    const root = modalRoot();
    if (!modalOpen(root)) return;

    if (event.key === 'Escape') {
      setTimeout(restoreTriggerFocus, 0);
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = visibleFocusable(root);
    if (!focusable.length) {
      event.preventDefault();
      root.querySelector('[role="dialog"]')?.focus?.();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const outside = !root.contains(active);

    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
      trappedTabs += 1;
      return;
    }
    if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
      trappedTabs += 1;
    }
  }

  function onDocumentClick(event) {
    const trigger = event.target.closest?.(TRIGGER_SELECTOR);
    if (!trigger) return;
    lastTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
  }

  function attachModal() {
    const root = modalRoot();
    if (!root || root.dataset.doseModalAccessibility === VERSION) return false;
    root.dataset.doseModalAccessibility = VERSION;
    root.querySelector('[role="dialog"]')?.setAttribute('tabindex', '-1');

    modalObserver = new MutationObserver(mutations => {
      const hiddenChanged = mutations.some(mutation => mutation.type === 'attributes' && mutation.attributeName === 'hidden');
      if (hiddenChanged) {
        if (root.hidden) requestAnimationFrame(restoreTriggerFocus);
        else if (lastTrigger) lastTrigger.setAttribute('aria-expanded', 'true');
      }
      if (!root.hidden) translateClinicalBlock(root);
    });
    modalObserver.observe(root, { attributes:true, attributeFilter:['hidden'], childList:true, subtree:true, characterData:true });
    document.documentElement.dataset.doseModalAccessibility = VERSION;
    return true;
  }

  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('keydown', onKeydown, true);

  if (!attachModal()) {
    attachmentObserver = new MutationObserver(() => {
      if (!attachModal()) return;
      attachmentObserver.disconnect();
      attachmentObserver = null;
    });
    attachmentObserver.observe(document.documentElement, { childList:true, subtree:true });
  }

  window.MedIndexDoseModalAccessibility = Object.freeze({
    version:VERSION,
    metrics:() => Object.freeze({ focusRestores, trappedTabs, translatedBlocks }),
  });
})();
