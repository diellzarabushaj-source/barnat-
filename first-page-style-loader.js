(() => {
  'use strict';

  const ID = 'firstPageClinicalStyles';
  const HREF = '/first-page-clinical.css?v=20260731-1';
  const FROZEN_ID = 'registryFrozenColumnStyles';
  const FROZEN_HREF = '/registry-frozen-columns.css?v=20260820-1';
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

  function ensureLink(id, href, datasetKey) {
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset[datasetKey] = '1';
    }
    return link;
  }

  function ensure() {
    const clinical = ensureLink(ID, HREF, 'firstPageClinical');
    place(clinical);

    // This tiny final layer owns only the horizontal freeze contract. It must
    // follow first-page-clinical.css because that legacy layer still contains
    // older selection/trade-name pinning rules.
    const frozen = ensureLink(FROZEN_ID, FROZEN_HREF, 'registryFrozenColumns');
    place(frozen);
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
  phone?.addEventListener?.('change', ensure);
})();