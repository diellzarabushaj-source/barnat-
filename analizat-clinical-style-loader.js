(() => {
  'use strict';

  const ID = 'analizatClinicalCardsStyles';
  const HREF = '/analizat-clinical-cards.css?v=20260726-1';

  function ensure() {
    let link = document.getElementById(ID);
    if (!link) {
      link = document.createElement('link');
      link.id = ID;
      link.rel = 'stylesheet';
      link.href = HREF;
      link.dataset.analizatClinicalCards = '1';
    }
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
})();
