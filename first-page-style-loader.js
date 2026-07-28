(() => {
  'use strict';

  const ID = 'firstPageClinicalStyles';
  const HREF = '/first-page-clinical.css?v=20260727-2';

  function ensure() {
    let link = document.getElementById(ID);
    if (!link) {
      link = document.createElement('link');
      link.id = ID;
      link.rel = 'stylesheet';
      link.href = HREF;
      link.dataset.firstPageClinical = '1';
    }
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
})();
