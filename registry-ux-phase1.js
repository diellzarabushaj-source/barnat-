(() => {
  'use strict';

  const VERSION = 'registry-ux-phase1-v1.1.0';
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';

  const scheduleIdle = callback => {
    if ('requestIdleCallback' in window) return window.requestIdleCallback(callback, { timeout:500 });
    return window.setTimeout(callback, 0);
  };

  function phoneRegistryOwnsViewport() {
    return window.matchMedia?.('(max-width: 767px)')?.matches === true;
  }

  function favoritesCount() {
    try {
      const controllerCount = window.MedIndexRegistryPersonalization?.favoriteCount?.();
      if (Number.isFinite(Number(controllerCount))) return Number(controllerCount);
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
    // Phone search geometry is owned by the mobile registry. Wrapping #search
    // here removes it from the direct-child selectors that keep the toolbar at
    // one compact search row + count row.
    if (phoneRegistryOwnsViewport()) return;
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

  function canonicalFavoritesButton() {
    if (phoneRegistryOwnsViewport()) return null;
    const canonical = document.querySelector('#registryPersonalViews [data-personal-view="favorites"]');
    if (canonical) return canonical;
    try { window.MedIndexRegistryPersonalization?.refresh?.(); } catch {}
    return document.querySelector('#registryPersonalViews [data-personal-view="favorites"]');
  }

  function retireLegacyQuickFavorites() {
    document.getElementById('registryQuickFavorites')?.remove();
  }

  function updateQuickFavorites() {
    retireLegacyQuickFavorites();
    const button = canonicalFavoritesButton();
    if (!button) return;
    const count = favoritesCount();
    const active = favoritesActive();
    const badge = button.querySelector('[data-toolbar-favorite-count]');
    if (badge) badge.textContent = String(count);
    button.classList.toggle('is-active', active);
    button.classList.toggle('active', active);
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
        event.stopImmediatePropagation();
        focusSearch();
        return;
      }

      if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
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
    document.documentElement.dataset.registryUxPhase1 = phoneRegistryOwnsViewport() ? 'phone-skipped' : VERSION;
    document.body?.classList.toggle('registry-ux-phase1-ready', !phoneRegistryOwnsViewport());
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