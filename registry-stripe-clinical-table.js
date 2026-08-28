(() => {
  'use strict';

  const VERSION = 'stripe-clinical-table-v2';
  const ROOT = document.documentElement;
  const DENSITY_KEY = 'medindex.registry.density.v1';
  const COMPACT = 'compact';
  const COMFORTABLE = 'comfortable';

  let boundScroll = null;
  let frame = 0;

  const storedDensity = () => {
    try {
      return localStorage.getItem(DENSITY_KEY) === COMFORTABLE ? COMFORTABLE : COMPACT;
    } catch {
      return COMPACT;
    }
  };

  const densityLabel = value => value === COMFORTABLE ? 'Rehat' : 'Kompakte';

  function updateScrollState() {
    const wrapper = document.getElementById('registryContent');
    if (!wrapper) return;
    const max = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
    wrapper.classList.toggle('has-scroll-left', wrapper.scrollLeft > 2);
    wrapper.classList.toggle('has-scroll-right', max - wrapper.scrollLeft > 2);
    wrapper.dataset.registryScroll = max > 2 ? 'overflow' : 'fit';
  }

  function scheduleScrollState() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(updateScrollState);
  }

  function applyDensity(value, persist = false) {
    const next = value === COMFORTABLE ? COMFORTABLE : COMPACT;
    ROOT.dataset.registryDensity = next;
    ROOT.dataset.registryStripeTable = VERSION;

    const button = document.querySelector('[data-registry-density-toggle]');
    if (button) {
      button.dataset.density = next;
      button.setAttribute('aria-pressed', String(next === COMPACT));
      button.setAttribute('aria-label', `Dendësia e tabelës: ${densityLabel(next)}. Kliko për ta ndryshuar.`);
      button.title = 'Ndrysho dendësinë e tabelës';
      button.innerHTML = `<span aria-hidden="true">↕</span><span>Dendësi: <strong>${densityLabel(next)}</strong></span>`;
    }

    if (persist) {
      try { localStorage.setItem(DENSITY_KEY, next); } catch {}
    }

    window.dispatchEvent(new CustomEvent('medindex:registry-density-changed', {
      detail: { density: next, version: VERSION }
    }));

    requestAnimationFrame(() => {
      window.MedIndexRegistryLayoutGuard?.refresh?.();
      updateScrollState();
    });
  }

  function toggleDensity() {
    applyDensity(ROOT.dataset.registryDensity === COMFORTABLE ? COMPACT : COMFORTABLE, true);
  }

  function ensureDensityToggle() {
    const toolbar = document.getElementById('registryViewToolbar');
    const actionsWrap = toolbar?.querySelector('.registry-view-actions-wrap');
    const views = toolbar?.querySelector('.registry-view-actions');
    if (!toolbar || !actionsWrap || !views) return false;

    let button = toolbar.querySelector('[data-registry-density-toggle]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'registry-density-toggle';
      button.dataset.registryDensityToggle = '';
      actionsWrap.insertBefore(button, views);
    }

    applyDensity(ROOT.dataset.registryDensity || storedDensity(), false);
    return true;
  }

  function bindScroll() {
    const wrapper = document.getElementById('registryContent');
    if (!wrapper || wrapper === boundScroll) {
      updateScrollState();
      return;
    }
    boundScroll?.removeEventListener?.('scroll', scheduleScrollState);
    boundScroll = wrapper;
    wrapper.addEventListener('scroll', scheduleScrollState, { passive:true });
    updateScrollState();
  }

  function ensure() {
    ROOT.dataset.registryStripeTable = VERSION;
    if (!ROOT.dataset.registryDensity) applyDensity(storedDensity(), false);
    ensureDensityToggle();
    bindScroll();
  }

  function bind() {
    document.addEventListener('click', event => {
      const toggle = event.target.closest?.('[data-registry-density-toggle]');
      if (!toggle) return;
      event.preventDefault();
      toggleDensity();
    }, true);

    window.addEventListener('resize', scheduleScrollState, { passive:true });
    window.addEventListener('pageshow', ensure, { passive:true });

    [
      'medindex:registry-table-stable',
      'medindex:registry-rendered',
      'medindex:registry-page-ready',
      'medindex:registry-ready',
      'medindex:registry-dosage-ready',
      'medindex:tailadmin-ready'
    ].forEach(name => window.addEventListener(name, ensure));

  }

  function start() {
    applyDensity(storedDensity(), false);
    bind();
    ensure();
    requestAnimationFrame(ensure);
    setTimeout(ensure, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once:true });
  } else {
    start();
  }

  window.MedIndexStripeClinicalTable = Object.freeze({
    version: VERSION,
    refresh: ensure,
    setDensity: value => applyDensity(value, true),
    getDensity: () => ROOT.dataset.registryDensity || storedDensity()
  });
})();
