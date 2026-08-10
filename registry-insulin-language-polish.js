(() => {
  'use strict';

  const ROOT_SELECTOR = [
    '.novorapid-simple-modal',
    '.novomix-simple-modal',
    '.other-insulin-simple-modal',
    '.insulin-smart-modal'
  ].join(',');

  const EXACT = new Map([
    ['Fillim T1D', 'Fillim · Diabet tip 1 (T1D)'],
    ['Fillim T2D', 'Fillim · Diabet tip 2 (T2D)'],
    ['Titrim T2D', 'Rregullim doze · Diabet tip 2 (T2D)'],
    ['T1D — referencë TDD', 'Diabet tip 1 (T1D) · referencë TDD'],
    ['T1D / pompë bazale', 'Diabet tip 1 (T1D) / pompë bazale'],
    ['T1D · fillim', 'Diabet tip 1 (T1D) · fillim'],
    ['T2D · fillim', 'Diabet tip 2 (T2D) · fillim'],
    ['T1D · dozë bazale fillestare', 'Diabet tip 1 (T1D) · dozë bazale fillestare'],
    ['T2D · insulin-naive', 'Diabet tip 2 (T2D) · pa insulinë më parë'],
    ['Po e filloj te T2D', 'Po e filloj · Diabet tip 2 (T2D)'],
    ['T1D · REFERENCË, JO DOZË NOVOMIX', 'Diabet tip 1 (T1D) · referencë, jo dozë NovoMix'],
    ['T2D · FILLIMI SIPAS SmPC', 'Diabet tip 2 (T2D) · fillimi sipas SmPC']
  ]);

  function expandText(input) {
    let text = String(input ?? '');
    if (!text) return text;

    if (EXACT.has(text.trim())) {
      const leading = text.match(/^\s*/)?.[0] || '';
      const trailing = text.match(/\s*$/)?.[0] || '';
      return `${leading}${EXACT.get(text.trim())}${trailing}`;
    }

    text = text
      .replace(/adult T2D/g, 'të rriturit me Diabet tip 2 (T2D)')
      .replace(/T2D insulin-naive/g, 'Diabet tip 2 (T2D) pa insulinë më parë')
      .replace(/insulin-naive/g, 'pa insulinë më parë');

    // Expand only raw abbreviations. Once expanded, the abbreviation is inside
    // parentheses and will not be touched again, keeping this observer idempotent.
    text = text
      .replace(/(^|[^\(])\bT1D\b/g, '$1Diabet tip 1 (T1D)')
      .replace(/(^|[^\(])\bT2D\b/g, '$1Diabet tip 2 (T2D)');

    return text;
  }

  function polishTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || !parent.closest(ROOT_SELECTOR)) return;
    if (parent.matches('script,style')) return;

    const next = expandText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function polishRoot(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    const element = root.matches?.(ROOT_SELECTOR) ? root : root.closest?.(ROOT_SELECTOR);
    if (!element) return;

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) polishTextNode(node);

    element.querySelectorAll('option').forEach(option => {
      const next = expandText(option.textContent);
      if (next !== option.textContent) option.textContent = next;
    });
  }

  function polishAll() {
    document.querySelectorAll(ROOT_SELECTOR).forEach(polishRoot);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        polishTextNode(mutation.target);
        continue;
      }
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) polishTextNode(node);
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches?.(ROOT_SELECTOR)) polishRoot(node);
          node.querySelectorAll?.(ROOT_SELECTOR).forEach(polishRoot);
          const owner = node.closest?.(ROOT_SELECTOR);
          if (owner) polishRoot(owner);
        }
      });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      polishAll();
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    }, { once: true });
  } else {
    polishAll();
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  window.MEDINDEX_INSULIN_LANGUAGE_POLISH = Object.freeze({
    version: '20260810-1',
    polish: polishAll,
    expandText
  });
})();
