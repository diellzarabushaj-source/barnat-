(() => {
  'use strict';

  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NAV_SELECTOR = '#appMenu,.med-nav,.atc-nav';
  const ITEM_SELECTOR = '.app-menu-link,.med-nav-link,.atc-nav-link,.auth-logout';
  const ACTIVE_SELECTOR = '.app-menu-link.active,.med-nav-link.active,.atc-nav-link.active,[aria-current="page"]';
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

  const navObservers = new Map();
  let bodyObserver = null;
  let scheduled = false;
  let hashAttempts = 0;
  let centerFrame = 0;

  function ensureStylesheetLast() {
    let link = document.querySelector('link[data-medindex-navigation-css]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'navigation-shell.css?v=20260724-3';
      link.dataset.medindexNavigationCss = '1';
    }
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
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

  function classesFor(nav) {
    if (nav.classList.contains('atc-nav')) return { link:'atc-nav-link', icon:'atc-nav-icon', title:'atc-nav-title', theme:'atc-theme' };
    if (nav.classList.contains('med-nav')) return { link:'med-nav-link', icon:'med-nav-icon', title:'med-nav-title', theme:'med-theme' };
    return { link:'app-menu-link', icon:'app-menu-icon', title:'app-menu-title', theme:'theme-control' };
  }

  function makeStaticLink(nav, id, title, href) {
    const classes = classesFor(nav);
    const link = document.createElement('a');
    link.className = `${classes.link} medindex-common-nav`;
    link.href = href;
    link.dataset.medindexNav = id;
    link.setAttribute('aria-label', title);
    link.innerHTML = `<span class="${classes.icon}">${ICONS[id]}</span><span class="${classes.title}">${title}</span>`;
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

  function normalizedPath() {
    const path = location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return path.endsWith('/index') ? `${path}.html` : path;
  }

  function currentTarget() {
    return PATH_TARGETS.get(normalizedPath()) || '';
  }

  function currentHashTarget() {
    if (!['/', '/index.html'].includes(normalizedPath())) return '';
    const hash = location.hash.toLocaleLowerCase('sq');
    if (hash === '#favoritet') return 'favorites';
    if (hash === '#kerko') return 'search';
    return '';
  }

  function markActive(nav) {
    if (!nav) return;
    const pageTarget = currentTarget();
    const override = nav.id === 'appMenu' ? nav.dataset.medindexActiveOverride || '' : '';
    const hashTarget = currentHashTarget();
    const hasHashTarget = Boolean(hashTarget);

    nav.querySelectorAll(ITEM_SELECTOR).forEach(item => {
      if (item.classList.contains('auth-logout')) return;
      const itemId = item.dataset.nav || item.dataset.medicalNav || item.dataset.medindexNav || '';
      const active = override
        ? itemId === override
        : hasHashTarget
          ? itemId === hashTarget
          : itemId === pageTarget;
      item.classList.toggle('active', active);
      if (item.matches('a[href]')) {
        if (active && ['home', 'classification', 'icd', 'labs', 'protocols'].includes(itemId)) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      }
    });
  }

  function normalizeAppMenu(menu) {
    const protocol = menu.querySelector('[data-nav="protocols"],[data-medical-nav="protocols"]');
    if (protocol) {
      const label = protocol.querySelector('.app-menu-title');
      if (label) label.textContent = 'Recetat';
      if (protocol.matches('a')) protocol.href = '/recetat.html';
    }
    menu.querySelectorAll(ITEM_SELECTOR).forEach(normalizeItem);
    markActive(menu);
  }

  function normalizeStaticNav(nav) {
    const classes = classesFor(nav);
    const before = nav.querySelector('.auth-logout') || nav.querySelector(`.${classes.theme}`) || null;
    if (!nav.querySelector('[data-medindex-nav="favorites"]')) nav.insertBefore(makeStaticLink(nav, 'favorites', 'Favoritet', '/index.html#favoritet'), before);
    if (!nav.querySelector('[data-medindex-nav="search"]')) nav.insertBefore(makeStaticLink(nav, 'search', 'Kërko', '/index.html#kerko'), before);

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
        const title = link.querySelector(`.${classes.title}`);
        if (match[2] === 'protocols' && title) title.textContent = 'Recetat';
      }
      normalizeItem(link);
    });
    nav.querySelectorAll('.auth-logout').forEach(normalizeItem);
    markActive(nav);
  }

  function observeNavigation(nav) {
    if (navObservers.has(nav)) return;
    const observer = new MutationObserver(scheduleNormalize);
    observer.observe(nav, { childList:true, subtree:true });
    navObservers.set(nav, observer);
  }

  function observeKnownNavigations() {
    document.querySelectorAll(NAV_SELECTOR).forEach(observeNavigation);
  }

  function normalizeNavigation() {
    ensureStylesheetLast();
    document.querySelectorAll(NAV_SELECTOR).forEach(nav => {
      if (nav.id === 'appMenu') normalizeAppMenu(nav);
      else normalizeStaticNav(nav);
      nav.dataset.medindexNavigationReady = '1';
      observeNavigation(nav);
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

  function watchForDynamicMenu() {
    if (document.getElementById('appMenu') || bodyObserver) return;
    bodyObserver = new MutationObserver(() => {
      const menu = document.getElementById('appMenu');
      if (!menu) return;
      bodyObserver.disconnect();
      bodyObserver = null;
      scheduleNormalize();
    });
    bodyObserver.observe(document.body, { childList:true });
    setTimeout(() => {
      bodyObserver?.disconnect();
      bodyObserver = null;
    }, 12000);
  }

  function centerActiveItem() {
    if (!matchMedia('(max-width: 780px)').matches) return;
    cancelAnimationFrame(centerFrame);
    centerFrame = requestAnimationFrame(() => {
      document.querySelectorAll(NAV_SELECTOR).forEach(nav => {
        const active = nav.querySelector(ACTIVE_SELECTOR);
        if (!active) return;
        const target = Math.max(0, active.offsetLeft - ((nav.clientWidth - active.offsetWidth) / 2));
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        nav.scrollTo({ left:target, behavior:reduced ? 'auto' : 'smooth' });
      });
    });
  }

  function activateHashTarget() {
    const target = currentHashTarget();
    if (!target) return;
    const menu = document.getElementById('appMenu');
    const button = menu?.querySelector(`[data-nav="${target}"],[data-medical-nav="${target}"]`);
    if (button) {
      menu.dataset.medindexActiveOverride = target;
      button.click();
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      requestAnimationFrame(() => {
        markActive(menu);
        centerActiveItem();
      });
      return;
    }
    if (hashAttempts++ < 80) setTimeout(activateHashTarget, 50);
  }

  function trackAppMenuState(event) {
    const item = event.target.closest?.('#appMenu .app-menu-link');
    if (!item) return;
    const menu = item.closest('#appMenu');
    const id = item.dataset.nav || item.dataset.medicalNav || '';
    if (['favorites', 'search'].includes(id)) menu.dataset.medindexActiveOverride = id;
    else delete menu.dataset.medindexActiveOverride;
    requestAnimationFrame(() => {
      markActive(menu);
      centerActiveItem();
    });
  }

  function keyboardNavigation(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const nav = event.target.closest(NAV_SELECTOR);
    if (!nav) return;
    const items = [...nav.querySelectorAll(ITEM_SELECTOR)].filter(item => !item.hidden && !item.disabled && item.offsetParent !== null);
    if (!items.length) return;
    const focusedIndex = items.indexOf(document.activeElement);
    const current = focusedIndex >= 0 ? focusedIndex : 0;
    let next = current;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (['ArrowDown', 'ArrowRight'].includes(event.key)) next = (current + 1) % items.length;
    else next = (current - 1 + items.length) % items.length;
    event.preventDefault();
    items[next]?.focus({ preventScroll:true });
    items[next]?.scrollIntoView({ block:'nearest', inline:'nearest' });
  }

  function syncLocationState() {
    hashAttempts = 0;
    document.querySelectorAll('#appMenu').forEach(menu => delete menu.dataset.medindexActiveOverride);
    scheduleNormalize();
    activateHashTarget();
  }

  function init() {
    normalizeNavigation();
    observeKnownNavigations();
    watchForDynamicMenu();
    activateHashTarget();
    document.addEventListener('click', trackAppMenuState);
    document.addEventListener('keydown', keyboardNavigation);
    window.addEventListener('storage', event => {
      if (event.key === FAVORITES_KEY) updateFavoriteCounts();
    });
    window.addEventListener('focus', updateFavoriteCounts, { passive:true });
    window.addEventListener('resize', centerActiveItem, { passive:true });
    window.addEventListener('orientationchange', centerActiveItem, { passive:true });
    window.addEventListener('pageshow', syncLocationState, { passive:true });
    window.addEventListener('popstate', syncLocationState, { passive:true });
    window.addEventListener('hashchange', syncLocationState, { passive:true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        updateFavoriteCounts();
        scheduleNormalize();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
