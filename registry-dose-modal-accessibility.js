(() => {
  'use strict';

  const VERSION = 'dose-modal-accessibility-v3';
  const MODAL_ID = 'doseCalculatorModal';
  const TRIGGER_SELECTOR = '.dose-calculator-open';
  const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'select:not([disabled])',
    'input:not([disabled])',
    'a[href]',
    'summary',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  let lastTrigger = null;
  let modal = null;
  let observer = null;
  let focusRestores = 0;
  let trappedTabs = 0;
  let nativePopulationBlocks = 0;
  let lastPopulationBlock = '';

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function currentModal() {
    const node = document.getElementById(MODAL_ID);
    return node instanceof HTMLElement ? node : null;
  }

  function focusables() {
    const root = currentModal();
    if (!root || root.hidden) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(node => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.closest('[hidden]')) return false;
      return node.getClientRects().length > 0;
    });
  }

  function observeNativePopulationBlock(root) {
    if (!root || root.hidden) return;
    const text = clean(root.querySelector('[data-dose-result-text]')?.textContent);
    if (!/^Ky preparat nuk përdoret te (?:fëmijët|të rriturit) sipas burimit zyrtar\./i.test(text)) {
      lastPopulationBlock = '';
      return;
    }
    if (text === lastPopulationBlock) return;
    lastPopulationBlock = text;
    nativePopulationBlocks += 1;
  }

  function restoreTriggerFocus() {
    const target = lastTrigger;
    lastTrigger = null;
    if (!(target instanceof HTMLElement) || !target.isConnected) return;
    requestAnimationFrame(() => {
      target.focus({ preventScroll:true });
      focusRestores += 1;
    });
  }

  function onDocumentClick(event) {
    const trigger = event.target.closest?.(TRIGGER_SELECTOR);
    if (trigger instanceof HTMLButtonElement) lastTrigger = trigger;
  }

  function onKeyDown(event) {
    const root = currentModal();
    if (!root || root.hidden || event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      trappedTabs += 1;
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      trappedTabs += 1;
    }
  }

  function watchModal() {
    const next = currentModal();
    if (!next || next === modal) return;
    observer?.disconnect();
    modal = next;
    let wasHidden = modal.hidden;
    observer = new MutationObserver(() => {
      const hidden = modal.hidden;
      if (!wasHidden && hidden) restoreTriggerFocus();
      if (!hidden) observeNativePopulationBlock(modal);
      if (wasHidden && !hidden) lastPopulationBlock = '';
      wasHidden = hidden;
    });
    observer.observe(modal, {
      attributes:true,
      attributeFilter:['hidden'],
      childList:true,
      subtree:true,
      characterData:true,
    });
  }

  function start() {
    watchModal();
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    const bodyObserver = new MutationObserver(watchModal);
    bodyObserver.observe(document.body, { childList:true });
    document.documentElement.dataset.doseModalAccessibility = VERSION;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.MedIndexDoseModalAccessibility = Object.freeze({
    version:VERSION,
    restoreTriggerFocus,
    metrics:() => Object.freeze({ focusRestores, trappedTabs, nativePopulationBlocks }),
  });
})();
