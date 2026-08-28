(() => {
  'use strict';

  const VERSION = 'first-page-style-loader-20260828-canonical-v3';
  const ID = 'firstPageClinicalStyles';
  const HREF = '/first-page-clinical.css?v=20260731-1';
  const FROZEN_ID = 'registryFrozenColumnStyles';
  const FROZEN_HREF = '/registry-frozen-columns.css?v=20260828-admin-stripe-v3';
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

  function placeCanonicalRegistryStylesLast() {
    const canonical = document.querySelector(
      'link[data-registry-table-tools-css],link[href*="registry-table-tools.css"]'
    );
    if (canonical && document.head.lastElementChild !== canonical) {
      document.head.appendChild(canonical);
    }
  }

  function ensure() {
    const clinical = ensureLink(ID, HREF, 'firstPageClinical');
    place(clinical);

    // The frozen layer resolves legacy pinning, then the canonical Admin Stripe
    // registry stylesheet is re-anchored last so late first-page CSS cannot
    // override the release contract.
    const frozen = ensureLink(FROZEN_ID, FROZEN_HREF, 'registryFrozenColumns');
    place(frozen);
    placeCanonicalRegistryStylesLast();
    document.documentElement.dataset.firstPageStyleLoader = VERSION;
  }

  ensure();
  [
    'medindex:tailadmin-ready',
    'medindex:registry-ready',
    'medindex:registry-table-stable',
    'medindex:registry-dosage-ready'
  ].forEach(name => window.addEventListener(name, ensure));
  window.addEventListener('pageshow', ensure, { passive:true });
  phone?.addEventListener?.('change', ensure);
})();