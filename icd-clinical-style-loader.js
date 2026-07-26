(() => {
  'use strict';

  const ID = 'icdClinicalWorkspaceStyles';
  const HREF = '/icd-clinical-workspace.css?v=20260725-1';

  function ensure() {
    let link = document.getElementById(ID);
    if (!link) {
      link = document.createElement('link');
      link.id = ID;
      link.rel = 'stylesheet';
      link.href = HREF;
      link.dataset.icdClinicalWorkspace = '1';
    }
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
})();
