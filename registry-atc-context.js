(() => {
  'use strict';

  const PANEL_ID = 'registryAtcContext';
  const TITLE_ID = 'registryAtcContextTitle';
  const MOBILE_BREAKPOINT = 1024;
  let lastTrigger = null;

  const clean = value => String(value ?? '').trim();

  function currentState(detail) {
    const source = detail && typeof detail === 'object'
      ? detail
      : window.MEDINDEX_REGISTRY_ATC_STATE || {};
    const activeAtc = clean(source.activeAtc || window.MedIndexATC?.readRegistryUrlState?.(location.href)?.atc);
    return {
      activeAtc,
      label:clean(source.label) || window.MedIndexATC?.getCategoryLabel?.(activeAtc) || '',
      categoryTotal:Number(source.categoryTotal) || 0,
      filteredTotal:Number(source.filteredTotal) || 0,
      query:clean(source.query),
      page:Number(source.page) || 1,
      pageSize:Number(source.pageSize) || 50,
    };
  }

  function findActiveCategoryLink(code) {
    return [...document.querySelectorAll('[data-mi-atc-code]')]
      .find(link => clean(link.dataset.miAtcCode) === clean(code)) || null;
  }

  function reducedMotion() {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  }

  function revealCategoryNavigation(attempt = 0) {
    const state = currentState();
    const rootTrigger = document.querySelector('[data-mi-atc-root-trigger]');
    if (!rootTrigger) {
      if (attempt < 12) setTimeout(() => revealCategoryNavigation(attempt + 1), 100);
      return;
    }

    if (rootTrigger.getAttribute('aria-expanded') !== 'true') rootTrigger.click();

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = findActiveCategoryLink(state.activeAtc) || rootTrigger;
      target.scrollIntoView?.({
        behavior:reducedMotion() ? 'auto' : 'smooth',
        block:'center',
      });
      target.focus?.({ preventScroll:true });
    }));
  }

  function openCategoryNavigation() {
    const mobile = window.innerWidth < MOBILE_BREAKPOINT;
    const sidebarToggle = document.querySelector('[data-mi-sidebar-toggle]');
    if (mobile && sidebarToggle?.getAttribute('aria-expanded') !== 'true') sidebarToggle.click();
    setTimeout(() => revealCategoryNavigation(), mobile ? 180 : 0);
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'registry-atc-context';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', TITLE_ID);
    panel.innerHTML = `
      <div class="registry-atc-context__identity">
        <span class="registry-atc-context__icon" aria-hidden="true">ATC</span>
        <div class="registry-atc-context__copy">
          <p class="registry-atc-context__eyebrow">Kategoria aktive</p>
          <h2 id="${TITLE_ID}"></h2>
          <p class="registry-atc-context__summary" data-atc-context-summary aria-live="polite"></p>
        </div>
      </div>
      <div class="registry-atc-context__actions">
        <button class="registry-atc-context__back" data-atc-context-browse type="button" aria-label="Shiko kategoritë në navigim">
          <span aria-hidden="true">☷</span>
          <span>Shiko kategoritë</span>
        </button>
        <button class="registry-atc-context__clear" data-atc-context-clear type="button">
          Hiqe filtrin ATC
        </button>
      </div>`;

    const toolbar = document.querySelector('.toolbar');
    const registry = document.getElementById('registryContent');
    const anchor = toolbar || registry;
    if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    else document.body.appendChild(panel);

    panel.querySelector('[data-atc-context-browse]')?.addEventListener('click', event => {
      lastTrigger = event.currentTarget;
      openCategoryNavigation();
    });

    panel.querySelector('[data-atc-context-clear]')?.addEventListener('click', event => {
      lastTrigger = event.currentTarget;
      clearAtcFilter();
    });

    return panel;
  }

  function summaryText(state) {
    const category = state.categoryTotal === 1
      ? '1 produkt në këtë kategori'
      : `${state.categoryTotal} produkte në këtë kategori`;
    if (!state.query) return category;
    const filtered = state.filteredTotal === 1 ? '1 rezultat' : `${state.filteredTotal} rezultate`;
    return `${category} · ${filtered} për “${state.query}”`;
  }

  function render(detail) {
    const state = currentState(detail);
    const panel = ensurePanel();
    if (!state.activeAtc) {
      panel.hidden = true;
      panel.removeAttribute('data-atc-code');
      return;
    }

    panel.hidden = false;
    panel.dataset.atcCode = state.activeAtc;
    panel.querySelector(`#${TITLE_ID}`).textContent = state.label || `Kategoria ATC ${state.activeAtc}`;
    panel.querySelector('[data-atc-context-summary]').textContent = summaryText(state);
  }

  function clearAtcFilter() {
    const state = currentState();
    const builder = window.MedIndexATC?.registryUrlFromState;
    const next = typeof builder === 'function'
      ? builder(location.href, {
          atc:'',
          query:state.query,
          page:1,
          pageSize:state.pageSize,
        })
      : '/index.html';

    history.pushState({ medindexRegistry:true, clearedAtc:true }, '', next);
    window.dispatchEvent(new PopStateEvent('popstate', { state:history.state }));

    requestAnimationFrame(() => {
      const target = document.getElementById('search') || document.getElementById('registryContent');
      target?.focus?.({ preventScroll:true });
      target?.scrollIntoView?.({ behavior:'smooth', block:'center' });
    });
  }

  function init() {
    ensurePanel();
    render();
    window.addEventListener('medindex:registry-atc-state', event => render(event.detail));
    window.addEventListener('pageshow', () => render());
    window.addEventListener('medindex:tailadmin-ready', () => {
      const panel = document.getElementById(PANEL_ID);
      const toolbar = document.querySelector('.toolbar');
      if (panel && toolbar?.parentNode && panel.nextElementSibling !== toolbar) toolbar.parentNode.insertBefore(panel, toolbar);
      render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();