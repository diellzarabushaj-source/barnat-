(() => {
  'use strict';

  const VERSION = 'registry-mobile-phase3-v1';
  const MOBILE_QUERY = '(max-width: 767px)';
  const media = window.matchMedia?.(MOBILE_QUERY);
  if (!media?.matches) return;

  const root = document.documentElement;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const ICONS = Object.freeze({
    drugs:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4.5a4 4 0 0 1 5.7 0l5.3 5.3a4 4 0 0 1-5.7 5.7L8.5 10.2a4 4 0 0 1 0-5.7Z"/><path d="m7 12 5-5"/></svg>',
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
    categories:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    prescription:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    menu:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    filter:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  });

  let sheet = null;
  let lastFocus = null;
  let installed = false;
  let bodyClassObserver = null;

  function mobileLiteActive() {
    return window.MEDINDEX_MOBILE_LITE_ACTIVE === true && root.dataset.registryMobileLiteState !== 'handoff';
  }

  function modalSurfaceOpen() {
    const body = document.body;
    if (!body) return false;
    return [
      'mi-sidebar-open',
      'mi-mobile-search-open',
      'mi-registry-filter-open',
      'mobile-lite-detail-open',
    ].some(className => body.classList.contains(className));
  }

  function bottomNavBlocked() {
    return modalSurfaceOpen() || root.dataset.miKeyboardOpen === 'true';
  }

  function syncBottomNavAvailability() {
    const nav = document.getElementById('miRegistryBottomNav');
    if (!nav) return;
    const blocked = bottomNavBlocked();
    nav.inert = blocked;
    nav.dataset.miRegistryNavBlocked = String(blocked);
    nav.setAttribute('aria-hidden', String(blocked));
    nav.style.visibility = blocked ? 'hidden' : 'visible';
    nav.style.opacity = blocked ? '0' : '1';
    nav.style.pointerEvents = blocked ? 'none' : '';
  }

  function focusRegistrySearch(mode = '') {
    const input = document.getElementById('search');
    if (!input) return;
    closeFilters();
    window.MedIndexMobileExperience?.closeSearch?.();
    if (mode === 'atc') input.placeholder = 'Kërko ATC, p.sh. N02…';
    else if (mode === 'form') input.placeholder = 'Kërko formën, p.sh. tablet…';
    else input.placeholder = 'Kërko emrin, substancën, klasën, përdorimin, ATC...';
    input.scrollIntoView({ block:'center', behavior:'smooth' });
    requestAnimationFrame(() => {
      input.focus({ preventScroll:true });
      input.select();
    });
  }

  function scrollRegistryTop() {
    const main = document.querySelector('.mi-main');
    const target = document.querySelector('.mi-page-heading') || document.getElementById('registryContent');
    if (main?.scrollTo) main.scrollTo({ top:0, behavior:'smooth' });
    else target?.scrollIntoView({ block:'start', behavior:'smooth' });
  }

  function openMoreMenu() {
    closeFilters();
    window.MedIndexMobileExperience?.closeSearch?.();
    const toggle = document.querySelector('[data-mi-sidebar-toggle]');
    if (toggle) {
      toggle.click();
      return;
    }
    window.dispatchEvent(new CustomEvent('medindex:mobile-more-requested'));
  }

  function buildBottomNav() {
    let nav = document.getElementById('miRegistryBottomNav');
    if (nav) {
      syncBottomNavAvailability();
      return nav;
    }
    nav = document.createElement('nav');
    nav.id = 'miRegistryBottomNav';
    nav.className = 'mi-registry-bottom-nav';
    nav.setAttribute('aria-label', 'Navigimi i shpejtë mobile');
    nav.innerHTML = `
      <button type="button" class="is-active" data-mi-registry-nav="home" aria-current="page">${ICONS.drugs}<span>Barnat</span></button>
      <button type="button" data-mi-registry-nav="search">${ICONS.search}<span>Kërko</span></button>
      <a href="/klasifikimi.html" data-mi-registry-nav="categories">${ICONS.categories}<span>Kategoritë</span></a>
      <a href="/recetat.html" data-mi-registry-nav="prescriptions">${ICONS.prescription}<span>Recetat</span></a>
      <button type="button" data-mi-registry-nav="more">${ICONS.menu}<span>Më shumë</span></button>`;
    document.body.appendChild(nav);
    nav.querySelector('[data-mi-registry-nav="home"]')?.addEventListener('click', scrollRegistryTop);
    nav.querySelector('[data-mi-registry-nav="search"]')?.addEventListener('click', () => focusRegistrySearch());
    nav.querySelector('[data-mi-registry-nav="more"]')?.addEventListener('click', openMoreMenu);
    syncBottomNavAvailability();
    return nav;
  }

  function activeFilterCount() {
    const search = Boolean(clean(document.getElementById('search')?.value));
    const status = Boolean(clean(document.getElementById('statusFilter')?.value));
    const pageSize = clean(document.getElementById('pageSize')?.value);
    return [search, status, pageSize && pageSize !== '25'].filter(Boolean).length;
  }

  function syncFilterBadge() {
    const count = activeFilterCount();
    const badge = document.querySelector('[data-mi-phase3-filter-count]');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    document.querySelector('[data-mi-phase3-clear]')?.toggleAttribute('hidden', count === 0);
  }

  function buildFilterBar() {
    let bar = document.getElementById('miRegistryMobileFilterBar');
    if (bar) return bar;
    const registry = document.getElementById('registryContent');
    if (!registry) return null;
    bar = document.createElement('section');
    bar.id = 'miRegistryMobileFilterBar';
    bar.className = 'mi-registry-mobile-filter-bar';
    bar.setAttribute('aria-label', 'Filtrat e regjistrit');
    bar.innerHTML = `
      <button type="button" class="mi-registry-filter-open" data-mi-phase3-filter-open aria-haspopup="dialog" aria-controls="miRegistryFilterSheet">
        ${ICONS.filter}<span>Filtra</span><strong data-mi-phase3-filter-count hidden>0</strong>
      </button>
      <button type="button" class="mi-registry-filter-clear" data-mi-phase3-clear hidden>Pastro</button>`;
    registry.before(bar);
    bar.querySelector('[data-mi-phase3-filter-open]')?.addEventListener('click', openFilters);
    bar.querySelector('[data-mi-phase3-clear]')?.addEventListener('click', clearFilters);
    syncFilterBadge();
    return bar;
  }

  function ensureSheet() {
    if (sheet?.isConnected) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'miRegistryFilterSheet';
    sheet.className = 'mi-registry-filter-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <button type="button" class="mi-registry-filter-backdrop" data-mi-phase3-filter-close aria-label="Mbyll filtrat"></button>
      <section class="mi-registry-filter-panel" role="dialog" aria-modal="true" aria-labelledby="miRegistryFilterTitle">
        <div class="mi-registry-filter-head">
          <div><strong id="miRegistryFilterTitle">Filtrat</strong><span>Rezultatet merren direkt nga serveri.</span></div>
          <button type="button" data-mi-phase3-filter-close aria-label="Mbyll">×</button>
        </div>
        <div class="mi-registry-filter-body">
          <label>Statusi
            <select id="miPhase3Status">
              <option value="">Të gjitha statuset</option>
              <option value="Gjenerik">Gjenerik</option>
              <option value="Origjinator">Origjinator</option>
            </select>
          </label>
          <label>Rezultate për faqe
            <select id="miPhase3PageSize">
              <option value="25">25 / faqe</option>
              <option value="50">50 / faqe</option>
            </select>
          </label>
          <div class="mi-registry-filter-shortcuts" aria-label="Kërkim i shpejtë">
            <span>Kërko shpejt sipas</span>
            <div>
              <button type="button" data-mi-phase3-search-mode="atc">ATC</button>
              <button type="button" data-mi-phase3-search-mode="form">Formës</button>
            </div>
          </div>
        </div>
        <div class="mi-registry-filter-actions">
          <button type="button" class="mi-registry-filter-reset" data-mi-phase3-filter-reset>Pastro</button>
          <button type="button" class="mi-registry-filter-apply" data-mi-phase3-filter-apply>Shfaq rezultatet</button>
        </div>
      </section>`;
    document.body.appendChild(sheet);
    sheet.querySelectorAll('[data-mi-phase3-filter-close]').forEach(node => node.addEventListener('click', closeFilters));
    sheet.querySelector('[data-mi-phase3-filter-reset]')?.addEventListener('click', clearFilters);
    sheet.querySelector('[data-mi-phase3-filter-apply]')?.addEventListener('click', applyFilters);
    sheet.querySelectorAll('[data-mi-phase3-search-mode]').forEach(node => node.addEventListener('click', () => {
      focusRegistrySearch(node.dataset.miPhase3SearchMode || '');
    }));
    return sheet;
  }

  function syncSheetValues() {
    const dialog = ensureSheet();
    if (!dialog) return;
    const status = clean(document.getElementById('statusFilter')?.value);
    const pageSize = clean(document.getElementById('pageSize')?.value) || '25';
    const statusControl = dialog.querySelector('#miPhase3Status');
    const pageSizeControl = dialog.querySelector('#miPhase3PageSize');
    if (statusControl) statusControl.value = status;
    if (pageSizeControl) pageSizeControl.value = ['25','50'].includes(pageSize) ? pageSize : '25';
  }

  function openFilters(event) {
    if (!mobileLiteActive()) return;
    window.MedIndexMobileExperience?.closeSearch?.();
    if (document.body?.classList.contains('mi-sidebar-open')) {
      document.querySelector('[data-mi-sidebar-close]')?.click();
    }
    lastFocus = event?.currentTarget || document.activeElement;
    syncSheetValues();
    const dialog = ensureSheet();
    dialog.hidden = false;
    document.body.classList.add('mi-registry-filter-open');
    syncBottomNavAvailability();
    requestAnimationFrame(() => dialog.querySelector('#miPhase3Status')?.focus({ preventScroll:true }));
  }

  function closeFilters() {
    if (!sheet) return;
    const wasOpen = !sheet.hidden;
    sheet.hidden = true;
    document.body.classList.remove('mi-registry-filter-open');
    syncBottomNavAvailability();
    if (wasOpen && lastFocus?.isConnected) lastFocus.focus({ preventScroll:true });
  }

  function dispatchIfChanged(control, value, eventName = 'change') {
    if (!control || clean(control.value) === clean(value)) return false;
    control.value = value;
    control.dispatchEvent(new Event(eventName, { bubbles:true }));
    return true;
  }

  function applyFilters() {
    const status = sheet?.querySelector('#miPhase3Status')?.value || '';
    const pageSize = sheet?.querySelector('#miPhase3PageSize')?.value || '25';
    dispatchIfChanged(document.getElementById('pageSize'), pageSize);
    dispatchIfChanged(document.getElementById('statusFilter'), status);
    closeFilters();
    syncFilterBadge();
  }

  function clearFilters() {
    const search = document.getElementById('search');
    const hadSearch = Boolean(clean(search?.value));
    dispatchIfChanged(document.getElementById('pageSize'), '25');
    dispatchIfChanged(document.getElementById('statusFilter'), '');
    if (hadSearch && search) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles:true }));
    }
    syncSheetValues();
    closeFilters();
    syncFilterBadge();
  }

  function releaseMobileShellOwner() {
    closeFilters();
    bodyClassObserver?.disconnect();
    bodyClassObserver = null;
    document.getElementById('miRegistryBottomNav')?.remove();
    document.getElementById('miRegistryMobileFilterBar')?.remove();
    root.dataset.registryMobilePhase3State = 'handoff';
  }

  function bindStateSync() {
    document.addEventListener('input', event => {
      if (event.target?.id === 'search') syncFilterBadge();
    }, true);
    document.addEventListener('change', event => {
      if (event.target?.id === 'statusFilter' || event.target?.id === 'pageSize') syncFilterBadge();
    }, true);
    window.addEventListener('medindex:mobile-lite-ready', syncFilterBadge);
    window.addEventListener('medindex:mobile-keyboard-change', syncBottomNavAvailability);
    window.addEventListener('medindex:mobile-search-opened', syncBottomNavAvailability);
    window.addEventListener('medindex:mobile-search-closed', syncBottomNavAvailability);

    if (!bodyClassObserver && document.body) {
      bodyClassObserver = new MutationObserver(syncBottomNavAvailability);
      bodyClassObserver.observe(document.body, { attributes:true, attributeFilter:['class'] });
    }

    // A request can be rejected by registry-runtime-loader while mobile-lite remains
    // the canonical owner. Only release the phone shell after the full runtime has
    // actually started, otherwise blocked legacy requests can tear down navigation.
    window.addEventListener('medindex:full-registry-started', releaseMobileShellOwner, { once:true });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && sheet && !sheet.hidden) closeFilters();
    }, true);
  }

  function install() {
    if (installed || !mobileLiteActive()) return;
    installed = true;
    root.dataset.registryMobilePhase3 = VERSION;
    root.dataset.registryMobilePhase3State = 'ready';
    root.dataset.registryMobilePhase3ModalPolicy = 'single-surface-v1';
    buildBottomNav();
    buildFilterBar();
    ensureSheet();
    bindStateSync();
    syncBottomNavAvailability();
    window.dispatchEvent(new CustomEvent('medindex:registry-mobile-phase3-ready', { detail:{ version:VERSION } }));
  }

  function startWhenLiteReady() {
    if (mobileLiteActive()) install();
    window.addEventListener('medindex:mobile-lite-ready', install, { once:true });
    window.addEventListener('medindex:tailadmin-ready', () => {
      if (!mobileLiteActive()) return;
      buildBottomNav();
      buildFilterBar();
      syncBottomNavAvailability();
    });
  }

  window.MedIndexRegistryMobilePhase3 = Object.freeze({
    version:VERSION,
    syncNavigation:syncBottomNavAvailability,
    openFilters,
    closeFilters,
    isNavigationBlocked:bottomNavBlocked,
  });

  media.addEventListener?.('change', event => {
    if (event.matches) return;
    closeFilters();
    bodyClassObserver?.disconnect();
    bodyClassObserver = null;
    document.getElementById('miRegistryBottomNav')?.remove();
    document.getElementById('miRegistryMobileFilterBar')?.remove();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWhenLiteReady, { once:true });
  else startWhenLiteReady();
})();