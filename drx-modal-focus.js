/* Shared modal keyboard ownership, including nested dialogs. */
(() => {
  'use strict';
  const stack = [];
  function open(root, { initialFocus, returnFocus = document.activeElement, fallbackFocus, except = [], onEscape } = {}) {
    const previous = stack.find(item => item.root === root);
    if (previous) return previous.release;
    const saved = [], overflow = document.body.style.overflow;
    let branch = root;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || except.includes(sibling) || ['SCRIPT','STYLE','LINK'].includes(sibling.tagName)) continue;
        saved.push([sibling, sibling.inert]);
        sibling.inert = true;
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    root.inert = false;
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
    const focusable = () => [...root.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && !node.closest('[inert]') && node.getClientRects().length);
    const entry = { root, release:null };
    const top = () => stack.at(-1) === entry;
    function keydown(event) {
      if (!top()) return;
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault(); event.stopImmediatePropagation(); onEscape(); return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1), active = document.activeElement;
      if (!items.length) { event.preventDefault(); root.focus(); return; }
      if (!root.contains(active) || active === root || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }
    function focusin(event) {
      if (top() && !root.contains(event.target)) (focusable()[0] || root).focus({preventScroll:true});
    }
    entry.release = () => {
      const index = stack.indexOf(entry);
      if (index < 0) return;
      stack.splice(index,1);
      document.removeEventListener('keydown',keydown,true);
      document.removeEventListener('focusin',focusin,true);
      for (const [node, inert] of saved) node.inert = inert;
      root.inert = true;
      document.body.style.overflow = overflow;
      const target = [returnFocus, returnFocus?.closest('details')?.querySelector('summary'), fallbackFocus]
        .find(node => node?.isConnected && (node.tabIndex >= 0 || node.hasAttribute('tabindex'))
          && !node.closest('[inert]') && node.getClientRects().length);
      target?.focus({preventScroll:true});
    };
    stack.push(entry);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown',keydown,true);
    document.addEventListener('focusin',focusin,true);
    (initialFocus || focusable()[0] || root).focus({preventScroll:true});
    return entry.release;
  }
  window.DRxModalFocus = Object.freeze({open});
})();
