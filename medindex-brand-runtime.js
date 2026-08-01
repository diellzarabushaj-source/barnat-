(() => {
  'use strict';

  const VERSION = 'medindex-brand-v1';
  const ROOT = '/public/images/brand/';
  const ASSETS = Object.freeze({
    fullLight:`${ROOT}medindex-full-on-light.png`,
    fullDark:`${ROOT}medindex-full-on-dark.png`,
    iconLight:`${ROOT}medindex-icon-on-light.png`,
    iconDark:`${ROOT}medindex-icon-on-dark.png`,
  });

  function installStyles() {
    if (document.getElementById('medindexBrandRuntimeStyles')) return;
    const style = document.createElement('style');
    style.id = 'medindexBrandRuntimeStyles';
    style.textContent = `
      .mi-brand[data-medindex-brand="${VERSION}"]{display:flex!important;align-items:center!important;min-width:0!important;text-decoration:none!important}
      .medindex-brand-picture{display:block;min-width:0;line-height:0}
      .medindex-brand-picture img{display:block;width:100%;height:100%;object-fit:contain;object-position:left center;filter:none!important}
      .medindex-brand-picture .medindex-brand-dark{display:none}
      html[data-theme="dark"] .medindex-brand-picture .medindex-brand-light,html.dark .medindex-brand-picture .medindex-brand-light{display:none}
      html[data-theme="dark"] .medindex-brand-picture .medindex-brand-dark,html.dark .medindex-brand-picture .medindex-brand-dark{display:block}
      .mi-sidebar:not(.mi-sidebar-collapsed) .medindex-brand-full{width:154px;height:58px}
      .medindex-brand-icon{display:none;width:38px;height:38px;flex:0 0 38px}
      body.mi-sidebar-collapsed .mi-sidebar .medindex-brand-full{display:none}
      body.mi-sidebar-collapsed .mi-sidebar .medindex-brand-icon{display:block}
      .mi-mobile-brand[data-medindex-brand="${VERSION}"]{display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:0!important}
      .mi-mobile-brand[data-medindex-brand="${VERSION}"] .medindex-brand-icon{display:block;width:34px;height:34px}
      .mi-mobile-brand[data-medindex-brand="${VERSION}"] .medindex-brand-full{display:none}
      @media(max-width:1023px){.mi-sidebar .medindex-brand-full{display:none!important}.mi-sidebar .medindex-brand-icon{display:block!important;width:38px;height:38px}.mi-sidebar-header{min-height:66px!important}}
      @media(min-width:1024px){body:not(.mi-sidebar-collapsed) .mi-sidebar .mi-brand{justify-content:flex-start!important}}
    `;
    document.head.appendChild(style);
  }

  function picture(kind, className) {
    const full = kind === 'full';
    const light = full ? ASSETS.fullLight : ASSETS.iconLight;
    const dark = full ? ASSETS.fullDark : ASSETS.iconDark;
    return `<span class="medindex-brand-picture ${className}" aria-hidden="true">
      <img class="medindex-brand-light" src="${light}" alt="" decoding="async" draggable="false">
      <img class="medindex-brand-dark" src="${dark}" alt="" decoding="async" draggable="false">
    </span>`;
  }

  function enhanceSidebarBrand() {
    const brand = document.querySelector('.mi-sidebar .mi-brand');
    if (!brand || brand.dataset.medindexBrand === VERSION) return;
    brand.dataset.medindexBrand = VERSION;
    brand.setAttribute('aria-label', 'MedIndex by Dr. Diellza Rabushaj');
    brand.innerHTML = `${picture('full','medindex-brand-full')}${picture('icon','medindex-brand-icon')}`;
  }

  function enhanceMobileBrand() {
    const brand = document.querySelector('.mi-mobile-brand');
    if (!brand || brand.dataset.medindexBrand === VERSION) return;
    brand.dataset.medindexBrand = VERSION;
    brand.setAttribute('aria-label', 'MedIndex');
    brand.innerHTML = picture('icon','medindex-brand-icon');
  }

  function ensureFavicons() {
    document.querySelectorAll('link[data-medindex-brand-icon]').forEach(node => node.remove());
    const entries = [
      ['icon','(prefers-color-scheme: light)',ASSETS.iconLight],
      ['icon','(prefers-color-scheme: dark)',ASSETS.iconDark],
      ['apple-touch-icon','',ASSETS.iconLight],
    ];
    entries.forEach(([rel, media, href]) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = `${href}?v=${VERSION}`;
      link.dataset.medindexBrandIcon = VERSION;
      if (media) link.media = media;
      document.head.appendChild(link);
    });
  }

  function apply() {
    installStyles();
    enhanceSidebarBrand();
    enhanceMobileBrand();
    ensureFavicons();
    document.documentElement.dataset.medindexBrand = VERSION;
  }

  let frame = 0;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      apply();
    });
  }

  const observer = new MutationObserver(schedule);
  function start() {
    apply();
    observer.observe(document.body, { childList:true, subtree:true });
  }

  window.addEventListener('medindex:tailadmin-ready', schedule);
  window.addEventListener('medindex:theme-change', schedule);
  window.addEventListener('pageshow', schedule, { passive:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
