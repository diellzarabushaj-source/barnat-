(() => {
  'use strict';

  const STYLES = [
    ['recetatSignatureStyles', '/signature-templates.css?v=20260801-1', 'recetatSignature'],
    ['recetatPageStyles', '/recetat.css?v=20260801-1', 'recetatPage'],
    ['recetatAuditStyles', '/recetat-audit.css?v=20260801-1', 'recetatAudit'],
    ['recetatProtocolHandoffStyles', '/prescription-protocol-handoff.css?v=20260812-1', 'recetatProtocolHandoff'],
  ];

  function ensureStyles() {
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

  function ensureProtocolHandoff() {
    if (document.querySelector('script[data-recetat-protocol-handoff]')) return;
    const script = document.createElement('script');
    script.src = '/prescription-protocol-handoff.js?v=20260812-1';
    script.defer = true;
    script.dataset.recetatProtocolHandoff = '1';
    document.head.appendChild(script);
  }

  function ensureStarterLibrary() {
    if (document.querySelector('script[data-recetat-starter-library]')) return;
    const script = document.createElement('script');
    script.src = '/prescription-starter-library.js?v=20260818-2';
    script.async = false;
    script.dataset.recetatStarterLibrary = '1';
    document.head.appendChild(script);
  }

  function ensure() {
    ensureStyles();
    ensureProtocolHandoff();
    ensureStarterLibrary();
  }

  ensure();
  window.addEventListener('medindex:tailadmin-ready', ensure);
  window.addEventListener('medindex:professional-ui-ready', ensure);
  window.addEventListener('pageshow', ensure, { passive:true });
})();
