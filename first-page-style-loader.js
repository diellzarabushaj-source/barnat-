(() => {
  'use strict';

  const VERSION = 'first-page-style-loader-single-css-v1';

  function ensure() {
    const finalLink = [...document.querySelectorAll('link[rel="stylesheet"][href]')]
      .find(link => /registry-table-tools\.css/i.test(link.getAttribute('href') || ''));
    document.documentElement.dataset.firstPageStyleLoader = finalLink
      ? VERSION
      : 'single-css-missing';
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
})();
