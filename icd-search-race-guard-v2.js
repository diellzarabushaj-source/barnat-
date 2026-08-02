(() => {
  'use strict';

  const VERSION = 'icd-race-guard-v4';
  let observer = null;
  let observedSuggestions = null;

  function elements() {
    return {
      search:document.getElementById('icdSearch'),
      suggestions:document.getElementById('icdSuggestions'),
    };
  }

  function syncActiveDescendant() {
    const { search, suggestions } = elements();
    if (!search || !suggestions) return;
    const selected = suggestions.querySelector('[role="option"][aria-selected="true"]');
    if (selected?.id) search.setAttribute('aria-activedescendant', selected.id);
    else search.removeAttribute('aria-activedescendant');
  }

  function syncExpandedState() {
    const { search, suggestions } = elements();
    if (!search || !suggestions) return;
    const hasVisibleContent = !suggestions.hidden
      && Boolean(suggestions.querySelector('[role="option"], .icd-suggestion-empty'));
    search.setAttribute('aria-expanded', String(hasVisibleContent));
    if (!hasVisibleContent) search.removeAttribute('aria-activedescendant');
  }

  function scheduleSync() {
    queueMicrotask(() => {
      ensureObserver();
      syncExpandedState();
      syncActiveDescendant();
    });
  }

  function ensureObserver() {
    const { suggestions } = elements();
    if (!suggestions || (observer && observedSuggestions === suggestions)) return;
    observer?.disconnect();
    observer = new MutationObserver(scheduleSync);
    observer.observe(suggestions, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['hidden', 'aria-selected', 'aria-busy'],
    });
    observedSuggestions = suggestions;
  }

  function bind() {
    ensureObserver();
    document.addEventListener('keydown', event => {
      if (event.target?.id !== 'icdSearch') return;
      if (['ArrowDown', 'ArrowUp', 'Escape', 'Enter'].includes(event.key)) scheduleSync();
    }, true);
    document.addEventListener('input', event => {
      if (event.target?.id === 'icdSearch') scheduleSync();
    }, true);
    window.addEventListener('pageshow', scheduleSync, { passive:true });
  }

  function init() {
    bind();
    scheduleSync();
    document.documentElement.dataset.miIcdRaceGuard = VERSION;
    window.dispatchEvent(new CustomEvent('medindex:icd-race-guard-ready', {
      detail:{ version:VERSION, mode:'passive-aria-observer' },
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
