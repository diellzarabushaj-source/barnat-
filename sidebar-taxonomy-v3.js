(() => {
  'use strict';

  const CORE_SRC = '/sidebar-taxonomy-core-v3.js?v=sidebar-taxonomy-v5-polish1';
  const ANTIBIOTICS_HREF = '/antibiotiket.html';
  let observer = null;

  function currentPath() {
    return location.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  }

  function antibioticLinkMarkup() {
    return '<span class="nav-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.1 5.2a4 4 0 0 1 5.7 0l5 5a4 4 0 0 1-5.7 5.7l-5-5a4 4 0 0 1 0-5.7Z"/><path d="m9.8 12.6 5.6-5.6"/><path d="M5.5 18.5h5"/><path d="M8 16v5"/></svg></span><span>Antibiotikët</span>';
  }

  function ensureAntibioticsNav() {
    const nav = document.querySelector('.sidebar .nav-stack');
    if (!nav) return;

    let link = nav.querySelector(`a.nav-item[href="${ANTIBIOTICS_HREF}"]`);
    if (!link) {
      link = document.createElement('a');
      link.className = 'nav-item';
      link.href = ANTIBIOTICS_HREF;
      link.dataset.drxAntibioticsNav = '1';
      link.innerHTML = antibioticLinkMarkup();
    }

    const dose = nav.querySelector('a.nav-item[href="/dozologjia.html"]');
    if (dose && dose.nextElementSibling !== link) dose.after(link);
    else if (!link.isConnected) {
      const urgent = nav.querySelector('a.nav-item[href="/urgjencat.html"]');
      if (urgent) urgent.after(link);
      else nav.append(link);
    }

    const active = currentPath() === ANTIBIOTICS_HREF;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  function observeSidebar() {
    if (observer) return;
    const nav = document.querySelector('.sidebar .nav-stack');
    if (!nav) return;
    observer = new MutationObserver(() => ensureAntibioticsNav());
    observer.observe(nav, { childList:true, subtree:false });
  }

  function loadCore() {
    if (document.querySelector('script[data-drx-sidebar-core]')) return;
    const script = document.createElement('script');
    script.src = CORE_SRC;
    script.async = false;
    script.dataset.drxSidebarCore = '1';
    script.addEventListener('load', () => {
      ensureAntibioticsNav();
      observeSidebar();
      document.documentElement.dataset.drxAntibioticsNav = 'ready';
    }, { once:true });
    script.addEventListener('error', () => {
      ensureAntibioticsNav();
      observeSidebar();
      console.error('DRx sidebar core failed to load.');
    }, { once:true });
    document.head.appendChild(script);
  }

  function boot() {
    ensureAntibioticsNav();
    loadCore();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
