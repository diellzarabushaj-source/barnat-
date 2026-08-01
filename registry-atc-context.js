(() => {
  'use strict';

  const PANEL_ID = 'registryAtcContext';
  const TITLE_ID = 'registryAtcContextTitle';
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
        <a class="registry-atc-context__back" data-atc-context-back href="/klasifikimi.html">
          <span aria-hidden="true">←</span>
          <span>Kthehu te klasifikimi</span>
        </a>
        <button class="registry-atc-context__clear" data-atc-context-clear type="button">
          Hiqe filtrin ATC
        </button>
      </div>`;

    const toolbar = document.querySelector('.toolbar');
    const registry = document.getElementById('registryContent');
    const anchor = toolbar || registry;
    if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    else document.body.appendChild(panel);

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

    const back = panel.querySelector('[data-atc-context-back]');
    if (back) back.href = window.MedIndexATC?.classificationUrl?.(state.activeAtc) || `/klasifikimi.html#${encodeURIComponent(state.activeAtc)}`;
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