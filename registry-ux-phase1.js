(() => {
  'use strict';

  const VERSION = 'registry-ux-phase1-v1.0.0';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';

  const scheduleIdle = callback => {
    if ('requestIdleCallback' in window) return window.requestIdleCallback(callback, { timeout:500 });
    return window.setTimeout(callback, 0);
  };

  function favoritesCount() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(value) ? value.length : 0;
    } catch {
      return 0;
    }
  }

  function favoritesActive() {
    try { return Boolean(window.MedIndexRegistryPersonalization?.isFavoritesMode?.()); }
    catch { return location.hash.toLowerCase() === '#favoritet'; }
  }

  function enhanceSearch() {
    const search = document.getElementById('search');
    if (!search || search.closest('.mi-registry-search-shell')) return;

    const shell = document.createElement('div');
    shell.className = 'mi-registry-search-shell';
    shell.dataset.registryUxSearch = 'true';
    search.before(shell);
    shell.appendChild(search);

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path>';
    shell.prepend(icon);

    const shortcut = document.createElement('kbd');
    shortcut.className = 'mi-registry-search-shortcut';
    shortcut.textContent = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
    shell.appendChild(shortcut);

    search.setAttribute('spellcheck', 'false');
    search.setAttribute('autocapitalize', 'none');
    search.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
  }

  function quickFavoritesButton() {
    let button = document.getElementById('registryQuickFavorites');
    if (button) return button;
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return null;

    button = document.createElement('button');
    button.id = 'registryQuickFavorites';
    button.type = 'button';
    button.className = 'registry-quick-favorites';
    button.dataset.registryQuickFavorites = 'true';
    button.setAttribute('aria-label', 'Shfaq Favoritet');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg><span class="registry-quick-favorites-label">Favoritet</span><span class="registry-quick-favorites-count" data-registry-quick-favorites-count>0</span>';

    const pageSize = document.getElementById('pageSize');
    if (pageSize) pageSize.insertAdjacentElement('beforebegin', button);
    else toolbar.appendChild(button);

    button.addEventListener('click', () => {
      const personalization = window.MedIndexRegistryPersonalization;
      if (favoritesActive()) personalization?.showAll?.();
      else personalization?.showFavorites?.();
      window.setTimeout(updateQuickFavorites, 0);
    });
    return button;
  }

  function updateQuickFavorites() {
    const button = quickFavoritesButton();
    if (!button) return;
    const count = favoritesCount();
    const active = favoritesActive();
    const badge = button.querySelector('[data-registry-quick-favorites-count]');
    if (badge) badge.textContent = String(count);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? 'Dil nga Favoritet dhe shfaq të gjitha barnat' : `Shfaq Favoritet · ${count}`);
    button.title = active ? 'Shfaq të gjitha barnat' : 'Shfaq vetëm Favoritet';
  }

  function focusSearch() {
    const search = document.getElementById('search');
    if (!search) return;
    search.focus({ preventScroll:true });
    search.select();
    search.closest('.mi-registry-search-shell')?.scrollIntoView?.({ block:'nearest', behavior:'auto' });
  }

  function clearSearch(search) {
    if (!search?.value) return false;
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles:true }));
    search.dispatchEvent(new Event('search', { bubbles:true }));
    return true;
  }

  function bindKeyboard() {
    document.addEventListener('keydown', event => {
      const target = event.target;
      const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === 'Escape' && target?.id === 'search') {
        if (clearSearch(target)) event.preventDefault();
        else target.blur();
      }
    }, true);
  }

  function markReady() {
    document.documentElement.dataset.registryUxPhase1 = VERSION;
    document.body?.classList.add('registry-ux-phase1-ready');
  }

  function refresh() {
    enhanceSearch();
    updateQuickFavorites();
    markReady();
  }

  function bind() {
    bindKeyboard();
    refresh();

    ['medindex:registry-rendered','medindex:registry-ready','medindex:library-ready','medindex:library-synced','medindex:favorites-changed']
      .forEach(name => window.addEventListener(name, updateQuickFavorites, { passive:true }));

    window.addEventListener('hashchange', updateQuickFavorites, { passive:true });
    window.addEventListener('storage', event => {
      if (event.key === FAVORITES_KEY) updateQuickFavorites();
    });

    scheduleIdle(() => {
      const search = document.getElementById('search');
      if (search && !search.getAttribute('title')) search.title = 'Kërko menjëherë · Ctrl/Cmd + K';
      document.getElementById('pageSize')?.setAttribute('title', 'Numri i barnave që renderohen për faqe');
      document.getElementById('statusFilter')?.setAttribute('title', 'Filtro sipas statusit');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();

  window.MedIndexRegistryUXPhase1 = Object.freeze({
    version:VERSION,
    focusSearch,
    refresh,
  });
})();
