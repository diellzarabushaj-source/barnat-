(() => {
  'use strict';

  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NAV_SELECTOR = '#appMenu,.med-nav,.atc-nav';
  const ITEM_SELECTOR = '.app-menu-link,.med-nav-link,.atc-nav-link,.auth-logout';
  const PATH_TARGETS = new Map([
    ['/', 'home'],
    ['/index.html', 'home'],
    ['/klasifikimi.html', 'classification'],
    ['/icd.html', 'icd'],
    ['/analizat.html', 'labs'],
    ['/recetat.html', 'protocols'],
  ]);
  const ICONS = {
    favorites:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="m128 24 31 63 69 10-50 49 12 69-62-33-62 33 12-69-50-49 69-10 31-63Z" stroke="currentColor" stroke-width="16" stroke-linejoin="round"/></svg>',
    search:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><circle cx="116" cy="116" r="76" stroke="currentColor" stroke-width="16"/><path d="m171 171 53 53" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg>',
  };

  let scheduled = false;
  let hashAttempts = 0;

  function ensureStylesheetLast() {
    let link = document.querySelector('link[data-medindex-navigation-css]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'navigation-shell.css?v=20260724-1';
      link.dataset.medindexNavigationCss = '1';
    }
    document.head.appendChild(link);
  }

  function favoriteCount() {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(saved) ? saved.length : 0;
    } catch {
      return 0;
    }
  }

  function updateFavoriteCounts() {
    const count = String(favoriteCount());
    document.querySelectorAll('.medindex-nav-count,#favoriteNavCount').forEach(node => {
      if (node.textContent !== count) node.textContent = count;
    });
  }

  function navPrefix(nav) {
    if (nav.classList.contains('atc-nav')) return 'atc';
    if (nav.classList.contains('med-nav')) return 'med';
    return 'app-menu';
  }

  function makeStaticLink(nav, id, title, href) {
    const prefix = navPrefix(nav);
    const link = document.createElement('a');
    link.className = `${prefix}-link medindex-common-nav`;
    link.href = href;
    link.dataset.medindexNav = id;
    link.setAttribute('aria-label', title);
    link.innerHTML = `<span class="${prefix}-icon">${ICONS[id]}</span><span class="${prefix}-title">${title}</span>`;
    if (id === 'favorites') {
      const count = document.createElement('span');
      count.className = 'medindex-nav-count';
      count.textContent = String(favoriteCount());
      count.setAttribute('aria-hidden', 'true');
      link.appendChild(count);
    }
    return link;
  }

  function titleOf(item) {
    return item.querySelector('.app-menu-title,.med-nav-title,.atc-nav-title')?.textContent?.trim() || item.textContent?.trim() || '';
  }

  function normalizeItem(item) {
    const title = titleOf(item);
    if (title && !item.getAttribute('aria-label')) item.setAttribute('aria-label', title);
    if (item.matches('button') && !item.type) item.type = 'button';
  }

  function currentTarget() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    return PATH_TARGETS.get(path) || '';
  }

  function markActive(nav) {
    const target = currentTarget();
    const hashTarget = location.pathname.endsWith('index.html') || location.pathname === '/'
      ? location.hash.toLocaleLowerCase('sq')
      : '';

    nav.querySelectorAll(ITEM_SELECTOR).forEach(item => {
      if (item.classList.contains('auth-logout')) return;
      const itemId = item.dataset.nav || item.dataset.medicalNav || item.dataset.medindexNav || '';
      const isHashActive = hashTarget === '#favoritet' && itemId === 'favorites'
        || hashTarget === '#kerko' && itemId === 'search';
      const isPageActive = !isHashActive && itemId === target;
      const active = isHashActive || isPageActive;
      item.classList.toggle('active', active);
      if (item.matches('a[href]')) {
        if (active && ['home', 'classification', 'icd', 'labs', 'protocols'].includes(itemId)) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      }
    });
  }

  function normalizeAppMenu(menu) {
    const protocol = menu.querySelector('[data-nav="protocols"]');
    if (protocol) {
      const label = protocol.querySelector('.app-menu-title');
      if (label) label.textContent = 'Recetat';
      if (protocol.matches('a')) protocol.href = '/recetat.html';
    }
    menu.querySelectorAll(ITEM_SELECTOR).forEach(normalizeItem);
    markActive(menu);
  }

  function normalizeStaticNav(nav) {
    const prefix = navPrefix(nav);
    const before = nav.querySelector('.auth-logout') || nav.querySelector(`.${prefix}-theme`) || null;
    if (!nav.querySelector('[data-medindex-nav="favorites"]')) {
      nav.insertBefore(makeStaticLink(nav, 'favorites', 'Favoritet', '/index.html#favoritet'), before);
    }
    if (!nav.querySelector('[data-medindex-nav="search"]')) {
      nav.insertBefore(makeStaticLink(nav, 'search', 'Kërko', '/index.html#kerko'), before);
    }

    const pathMap = [
      [/Barnat/i, '/index.html', 'home'],
      [/Klasifikimi/i, '/klasifikimi.html', 'classification'],
      [/^ICD$/i, '/icd.html', 'icd'],
      [/Analizat/i, '/analizat.html', 'labs'],
      [/Recetat|Protokollet/i, '/recetat.html', 'protocols'],
    ];
    nav.querySelectorAll('a').forEach(link => {
      const label = titleOf(link);
      const match = pathMap.find(([pattern]) => pattern.test(label));
      if (match) {
        link.href = match[1];
        link.dataset.medicalNav = match[2];
        const title = link.querySelector(`.${prefix}-title`);
        if (match[2] === 'protocols' && title) title.textContent = 'Recetat';
      }
      normalizeItem(link);
    });
    nav.querySelectorAll('.auth-logout').forEach(normalizeItem);
    markActive(nav);
  }

  function normalizeNavigation() {
    ensureStylesheetLast();
    document.querySelectorAll(NAV_SELECTOR).forEach(nav => {
      if (nav.id === 'appMenu') normalizeAppMenu(nav);
      else normalizeStaticNav(nav);
      nav.dataset.medindexNavigationReady = '1';
    });
    updateFavoriteCounts();
    centerActiveItem();
  }

  function scheduleNormalize() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      normalizeNavigation();
    });
  }

  function centerActiveItem() {
    if (!matchMedia('(max-width: 780px)').matches) return;
    document.querySelectorAll(NAV_SELECTOR).forEach(nav => {
      const active = nav.querySelector(`${ITEM_SELECTOR}.active,[aria-current="page"]`);
      if (!active) return;
      const target = Math.max(0, active.offsetLeft - ((nav.clientWidth - active.offsetWidth) / 2));
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      nav.scrollTo({ left:target, behavior:reduced ? 'auto' : 'smooth' });
    });
  }

  function activateHashTarget() {
    const hash = location.hash.toLocaleLowerCase('sq');
    const target = hash === '#favoritet' ? 'favorites' : hash === '#kerko' ? 'search' : '';
    if (!target || !['/', '/index.html'].includes(location.pathname)) return;
    const button = document.querySelector(`#appMenu [data-nav="${target}"]`);
    if (button) {
      button.click();
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      markActive(document.getElementById('appMenu'));
      centerActiveItem();
      return;
    }
    if (hashAttempts++ < 80) setTimeout(activateHashTarget, 50);
  }

  function keyboardNavigation(event) {
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const nav = event.target.closest(NAV_SELECTOR);
    if (!nav) return;
    const items = [...nav.querySelectorAll(ITEM_SELECTOR)].filter(item => !item.hidden && !item.disabled && item.offsetParent !== null);
    if (!items.length) return;
    const current = Math.max(0, items.indexOf(document.activeElement));
    let next = current;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (['ArrowDown', 'ArrowRight'].includes(event.key)) next = (current + 1) % items.length;
    else next = (current - 1 + items.length) % items.length;
    event.preventDefault();
    items[next]?.focus();
  }

  function init() {
    normalizeNavigation();
    activateHashTarget();
    document.addEventListener('keydown', keyboardNavigation);
    window.addEventListener('storage', event => {
      if (event.key === FAVORITES_KEY) updateFavoriteCounts();
    });
    window.addEventListener('focus', updateFavoriteCounts, { passive:true });
    window.addEventListener('resize', centerActiveItem, { passive:true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) updateFavoriteCounts();
    });

    const observer = new MutationObserver(scheduleNormalize);
    observer.observe(document.body, { childList:true, subtree:true });
    window.setTimeout(() => observer.disconnect(), 12000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
