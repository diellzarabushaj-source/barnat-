(() => {
  'use strict';
  if (document.body?.dataset.tailadminReady === '1') return;
  if (document.querySelector('script[data-medindex-tailadmin-core]')) return;
  const script = document.createElement('script');
  script.src = '/tailadmin-shell-core.js';
  script.async = true;
  script.dataset.medindexTailadminCore = 'legacy-migration';
  document.head.appendChild(script);
})();
