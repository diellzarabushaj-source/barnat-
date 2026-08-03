(() => {
  'use strict';

  const STYLES = [
    ['recetatSignatureStyles', '/signature-templates.css?v=20260801-1', 'recetatSignature'],
    ['recetatPageStyles', '/recetat.css?v=20260801-1', 'recetatPage'],
    ['recetatAuditStyles', '/recetat-audit.css?v=20260801-1', 'recetatAudit'],
  ];

  function ensure() {
    STYLES.forEach(([id, href, marker]) => {
      let link = document.getElementById(id);
      if (!link) {
        link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
      }
      link.dataset[marker] = '1';
      if (link.getAttribute('href') !== href) link.href = href;
      document.head.appendChild(link);
    });
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('medindex:professional-ui-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
})();
