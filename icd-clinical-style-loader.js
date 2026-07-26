(() => {
  'use strict';

  const ID = 'icdClinicalWorkspaceStyles';
  const HREF = '/icd-tailadmin-cards-v2.css?v=20260726-1';

  function ensure() {
    let link = document.getElementById(ID);
    if (!link) {
      link = document.createElement('link');
      link.id = ID;
      link.rel = 'stylesheet';
      link.dataset.icdClinicalWorkspace = '1';
    }
    if (link.getAttribute('href') !== HREF) link.href = HREF;
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
})();
