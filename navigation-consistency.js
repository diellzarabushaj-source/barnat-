(() => {
  'use strict';

  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NAV_SELECTOR = '#appMenu,.med-nav,.atc-nav';
  const ITEM_SELECTOR = '.app-menu-link,.med-nav-link,.atc-nav-link,.auth-logout,.medindex-more-button';
  const ACTIVE_SELECTOR = '.app-menu-link.active,.med-nav-link.active,.atc-nav-link.active,[aria-current="page"]';
  const PATH_TARGETS = new Map([
    ['/', 'home'],
    ['/index.html', 'home'],
    ['/klasifikimi.html', 'classification'],
    ['/icd.html', 'icd'],
    ['/analizat.html', 'labs'],
    ['/dozologjia.html', 'dosage'],
    ['/protokollet.html', 'clinical-protocols'],
    ['/recetat.html', 'prescriptions'],
  ]);
  const ICONS = {
    dosage:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="M64 52h128v152H64zM96 84h64M96 124h64M96 164h36" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'clinical-protocols':'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="M56 36h144v184H56zM88 80h80M88 120h80M88 160h56" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    favorites:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><path d="m128 24 31 63 69 10-50 49 12 69-62-33-62 33 12-69-50-49 69-10 31-63Z" stroke="currentColor" stroke-width="16" stroke-linejoin="round"/></svg>',
    search:'<svg fill="none" viewBox="0 0 256 256" aria-hidden="true"><circle cx="116" cy="116" r="76" stroke="currentColor" stroke-width="16"/><path d="m171 171 53 53" stroke="currentColor" stroke-width="16" stroke-linecap="round"/></svg>',
    more:'<svg fill="currentColor" viewBox="0 0 256 256" aria-hidden="true"><circle cx="52" cy="128" r="16"/><circle cx="128" cy="128" r="16"/><circle cx="204" cy="128" r="16"/></svg>',
  };

  const navObservers = new Map();
  let bodyObserver = null;
  let scheduled = false;
  let hashAttempts = 0;
  let centerFrame = 0;
  let moreReturnFocus = null;

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

  function itemId(item) {
    return item?.dataset?.nav || item?.dataset?.medicalNav || item?.dataset?.medindexNav || '';
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
      const itemTarget = itemId(item);
      const active = override
        ? itemTarget === override
        : hasHashTarget
          ? itemTarget === hashTarget
          : itemTarget === pageTarget;
      item.classList.toggle('active', active);
      if (item.matches('a[href]')) {
        if (active && ['home', 'classification', 'icd', 'labs', 'dosage', 'clinical-protocols', 'prescriptions'].includes(itemTarget)) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      }
    });
  }

  function normalizePrescription(nav) {
    const candidates = [...nav.querySelectorAll('a,button')];
    const prescription = candidates.find(item => itemId(item) === 'prescriptions')
      || candidates.find(item => itemId(item) === 'protocols' && /Recetat/i.test(titleOf(item)))
      || candidates.find(item => /^Recetat$/i.test(titleOf(item)));
    if (!prescription) return null;
    delete prescription.dataset.nav;
    prescription.dataset.medicalNav = 'prescriptions';
    if (prescription.matches('a')) prescription.href = '/recetat.html';
    const label = prescription.querySelector('.app-menu-title,.med-nav-title,.atc-nav-title');
    if (label) label.textContent = 'Recetat';
    return prescription;
  }

  function ensureClinicalSections(nav) {
    const classes = classesFor(nav);
    const prescription = normalizePrescription(nav);
    const before = prescription || nav.querySelector('.auth-logout') || nav.querySelector(`.${classes.theme}`) || null;
    if (!nav.querySelector('[data-medical-nav="dosage"],[data-medindex-nav="dosage"]')) {
      nav.insertBefore(makeStaticLink(nav, 'dosage', 'Dozologjia', '/dozologjia.html'), before);
    }
    if (!nav.querySelector('[data-medical-nav="clinical-protocols"],[data-medindex-nav="clinical-protocols"]')) {
      nav.insertBefore(makeStaticLink(nav, 'clinical-protocols', 'Protokollet', '/protokollet.html'), prescription || before);
    }
  }

  function normalizeAppMenu(menu) {
    ensureClinicalSections(menu);
    const classes = classesFor(menu);
    const before = menu.querySelector('.auth-logout') || menu.querySelector(`.${classes.theme}`) || null;
    if (!menu.querySelector('[data-medindex-nav="favorites"]')) menu.insertBefore(makeStaticLink(menu, 'favorites', 'Favoritet', '/index.html#favoritet'), before);
    if (!menu.querySelector('[data-medindex-nav="search"]')) menu.insertBefore(makeStaticLink(menu, 'search', 'Kërko', '/index.html#kerko'), before);
    menu.querySelectorAll(ITEM_SELECTOR).forEach(normalizeItem);
    ensureMoreButton(menu);
    markActive(menu);
  }

  function normalizeStaticNav(nav) {
    const classes = classesFor(nav);
    const pathMap = [
      [/Barnat/i, '/index.html', 'home'],
      [/Klasifikimi/i, '/klasifikimi.html', 'classification'],
      [/^ICD$/i, '/icd.html', 'icd'],
      [/Analizat/i, '/analizat.html', 'labs'],
      [/Dozologjia/i, '/dozologjia.html', 'dosage'],
      [/^Protokollet$/i, '/protokollet.html', 'clinical-protocols'],
      [/^Recetat$/i, '/recetat.html', 'prescriptions'],
    ];
    nav.querySelectorAll('a').forEach(link => {
      const label = titleOf(link);
      const match = pathMap.find(([pattern]) => pattern.test(label));
      if (match) {
        link.href = match[1];
        link.dataset.medicalNav = match[2];
        const title = link.querySelector(`.${classes.title}`);
      }
      normalizeItem(link);
    });
    ensureClinicalSections(nav);
    const before = nav.querySelector('.auth-logout') || nav.querySelector(`.${classes.theme}`) || null;
    if (!nav.querySelector('[data-medindex-nav="favorites"]')) nav.insertBefore(makeStaticLink(nav, 'favorites', 'Favoritet', '/index.html#favoritet'), before);
    if (!nav.querySelector('[data-medindex-nav="search"]')) nav.insertBefore(makeStaticLink(nav, 'search', 'Kërko', '/index.html#kerko'), before);
    nav.querySelectorAll('.auth-logout').forEach(normalizeItem);
    ensureMoreButton(nav);
    markActive(nav);
  }

  function ensureMoreButton(nav) {
    if (nav.querySelector('.medindex-more-button')) return;
    const classes = classesFor(nav);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${classes.link} medindex-more-button`;
    button.dataset.medindexNav = 'more';
    button.setAttribute('aria-label', 'Më shumë');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `<span class="${classes.icon}">${ICONS.more}</span><span class="${classes.title}">Më shumë</span>`;
    nav.appendChild(button);
  }

  function moreSheet() {
    let overlay = document.getElementById('medindexMoreOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'medindexMoreOverlay';
    overlay.className = 'medindex-more-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<section class="medindex-more-sheet" role="dialog" aria-modal="true" aria-labelledby="medindexMoreTitle"><header><h2 id="medindexMoreTitle">Më shumë</h2><button type="button" data-close-more aria-label="Mbyll">×</button></header><div class="medindex-more-items"></div></section>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeMore() {
    const overlay = document.getElementById('medindexMoreOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.querySelectorAll('.medindex-more-button').forEach(button => button.setAttribute('aria-expanded', 'false'));
    moreReturnFocus?.focus?.({ preventScroll:true });
    moreReturnFocus = null;
  }

  function openMore(nav, trigger) {
    const overlay = moreSheet();
    const holder = overlay.querySelector('.medindex-more-items');
    const secondary = ['classification', 'labs', 'favorites', 'search'];
    holder.innerHTML = secondary.map(id => {
      const original = [...nav.querySelectorAll(ITEM_SELECTOR)].find(item => itemId(item) === id);
      if (!original) return '';
      return `<a href="${original.getAttribute('href') || '#'}" data-more-target="${id}">${titleOf(original)}</a>`;
    }).join('') + '<button type="button" data-more-action="logout">Dil</button><button type="button" data-more-action="theme">Tema</button>';
    moreReturnFocus = trigger;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    trigger.setAttribute('aria-expanded', 'true');
    holder.querySelector('a,button')?.focus({ preventScroll:true });
  }

  function handleMoreClick(event) {
    const trigger = event.target.closest('.medindex-more-button');
    if (trigger) {
      openMore(trigger.closest(NAV_SELECTOR), trigger);
      return;
    }
    const overlay = event.target.closest('#medindexMoreOverlay');
    if (!overlay) return;
    if (event.target === overlay || event.target.closest('[data-close-more]')) return closeMore();
    const action = event.target.closest('[data-more-action]')?.dataset.moreAction;
    if (!action) return;
    const nav = moreReturnFocus?.closest(NAV_SELECTOR);
    if (action === 'logout') nav?.querySelector('.auth-logout')?.click();
    if (action === 'theme') nav?.querySelector('.med-theme button,.atc-theme button,.theme-control button')?.click();
    closeMore();
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
    const id = itemId(item);
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
    document.addEventListener('click', handleMoreClick);
    document.addEventListener('keydown', keyboardNavigation);
    document.addEventListener('keydown', event => {
      const overlay = document.getElementById('medindexMoreOverlay');
      if (!overlay || overlay.hidden) return;
      if (event.key === 'Escape') return closeMore();
      if (event.key !== 'Tab') return;
      const items = [...overlay.querySelectorAll('a[href],button:not([disabled])')];
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
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
