(() => {
  'use strict';

  const SOURCE = 'registry-verification-ui.js?v=20260801-1';
  let scheduled = false;
  let loaded = false;
  let editorSyncInstalled = false;

  function installEditorSync() {
    if (editorSyncInstalled) return;
    const title = document.getElementById('clinicalEditorTitle');
    if (!title) return;
    editorSyncInstalled = true;

    const relay = document.createElement('button');
    relay.type = 'button';
    relay.className = 'clinical-editor-open';
    relay.tabIndex = -1;
    relay.setAttribute('aria-hidden', 'true');
    relay.dataset.populationEditorRelay = 'true';
    relay.style.setProperty('display', 'none', 'important');
    document.body.appendChild(relay);

    const synchronize = () => {
      const match = String(title.textContent || '').trim().match(/^(\d+)\./);
      const registryNumber = Number(match?.[1]);
      if (!Number.isInteger(registryNumber) || registryNumber < 1) return;
      relay.dataset.registryNumber = String(registryNumber);
      relay.dispatchEvent(new MouseEvent('click', { bubbles:true, composed:true }));
    };

    new MutationObserver(synchronize).observe(title, { childList:true, characterData:true, subtree:true });
    synchronize();
  }

  function load() {
    if (loaded || document.querySelector('script[data-registry-verification-ui-runtime]')) return;
    loaded = true;
    const script = document.createElement('script');
    script.src = SOURCE;
    script.defer = true;
    script.dataset.registryVerificationUiRuntime = 'true';
    script.addEventListener('load', installEditorSync, { once:true });
    document.head.appendChild(script);
  }

  function schedule() {
    if (scheduled || loaded) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      load();
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout:5000 });
    else setTimeout(run, 2500);
  }

  if (Array.isArray(window.MEDINDEX_REGISTRY_ROWS) && window.MEDINDEX_REGISTRY_ROWS.length) schedule();
  else window.addEventListener('medindex:registry-ready', schedule, { once:true });
})();
