(() => {
  'use strict';

  const ID = 'firstPageClinicalStyles';
  const HREF = '/first-page-clinical.css?v=20260731-1';
  const PHONE_QUERY = '(max-width:767px)';
  const phone = window.matchMedia?.(PHONE_QUERY);

  function mobileCascadeAnchor() {
    return document.querySelector('link[data-registry-mobile-critical-css],link[href*="registry-mobile-critical.css"]');
  }

  function place(link) {
    const anchor = phone?.matches ? mobileCascadeAnchor() : null;
    if (anchor) {
      if (link.nextElementSibling !== anchor) anchor.before(link);
      return;
    }
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
  }

  function ensure() {
    let link = document.getElementById(ID);
    if (!link) {
      link = document.createElement('link');
      link.id = ID;
      link.rel = 'stylesheet';
      link.href = HREF;
      link.dataset.firstPageClinical = '1';
    }
    place(link);
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
  phone?.addEventListener?.('change', ensure);
})();