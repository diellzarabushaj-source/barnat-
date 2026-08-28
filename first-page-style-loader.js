(() => {
  'use strict';

  const VERSION = 'first-page-style-loader-20260828-4';
  const ID = 'firstPageClinicalStyles';
  const HREF = '/first-page-clinical.css?v=20260731-1';
  const RETIRED_FROZEN_ID = 'registryFrozenColumnStyles';
  const PHONE_QUERY = '(max-width:767px)';
  const phone = window.matchMedia?.(PHONE_QUERY);

  function mobileCascadeAnchor() {
    return document.querySelector('link[data-registry-mobile-critical-css],link[href*="registry-mobile-critical.css"]');
  }

  function tableAuthority() {
    return document.querySelector('link[data-registry-table-tools-css],link[href*="registry-table-tools.css"]');
  }

  function placeClinical(link) {
    const phoneAnchor = phone?.matches ? mobileCascadeAnchor() : null;
    const anchor = phoneAnchor || tableAuthority();
    if (anchor) {
      if (link.nextElementSibling !== anchor) anchor.before(link);
      return;
    }
    if (!link.isConnected) document.head.appendChild(link);
  }

  function ensureLink() {
    let link = document.getElementById(ID);
    if (!link) {
      link = document.createElement('link');
      link.id = ID;
      link.rel = 'stylesheet';
      link.href = HREF;
      link.dataset.firstPageClinical = '1';
    }
    return link;
  }

  function ensure() {
    const clinical = ensureLink();
    placeClinical(clinical);

    // Frozen-column ownership moved into registry-table-tools.css. Remove any
    // stale dynamic layer left by an older page lifecycle so it cannot override
    // the final table authority after navigation or bfcache restoration.
    document.getElementById(RETIRED_FROZEN_ID)?.remove();

    document.documentElement.dataset.firstPageStyleLoader = VERSION;
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
  phone?.addEventListener?.('change', ensure);
})();