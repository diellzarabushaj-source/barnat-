(() => {
  'use strict';

  const VERSION = 'registry-list-owner-v1';
  const ROOT = document.documentElement;
  const DESKTOP_QUERY = '(min-width: 768px)';
  const media = window.matchMedia?.(DESKTOP_QUERY);

  let frame = 0;
  let rootObserver = null;
  let parentObserver = null;
  let observedParent = null;

  const isDesktop = () => media?.matches !== false;
  const listOwnsSurface = () => isDesktop() && ROOT.dataset.miRegistryView === 'list';

  function setHiddenState(node, hidden) {
    if (!(node instanceof HTMLElement)) return;
    node.hidden = hidden;
    node.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if ('inert' in node) node.inert = hidden;
  }

  function syncOwnership() {
    frame = 0;
    const listOwns = listOwnsSurface();
    ROOT.dataset.registrySurfaceOwner = listOwns ? 'list' : 'table';
    ROOT.dataset.registryListOwnerGuard = VERSION;

    // The full-table controller is allowed to exist for data/runtime reasons,
    // but its chrome must never become a second visible owner while List is
    // active. This is deliberately limited to the table-only toolbar; the
    // shared search/filter panel remains available to both surfaces.
    const tableToolbar = document.getElementById('registryViewToolbar');
    if (tableToolbar) setHiddenState(tableToolbar, listOwns);

    const table = document.getElementById('registryContent');
    const pagination = document.getElementById('pagination');
    if (table) table.setAttribute('aria-hidden', listOwns ? 'true' : 'false');
    if (pagination) pagination.setAttribute('aria-hidden', listOwns ? 'true' : 'false');

    const listPanel = document.getElementById('registryListView');
    if (listPanel && listOwns) listPanel.setAttribute('aria-hidden', 'false');
  }

  function scheduleSync() {
    if (frame) return;
    frame = requestAnimationFrame(syncOwnership);
  }

  function observeRegistryParent() {
    const table = document.getElementById('registryContent');
    const parent = table?.parentElement || null;
    if (!parent || parent === observedParent) return;

    parentObserver?.disconnect();
    observedParent = parent;
    parentObserver = new MutationObserver(scheduleSync);
    parentObserver.observe(parent, { childList:true });
  }

  function boot() {
    if (ROOT.dataset.miPage !== 'barnat') return;

    rootObserver = new MutationObserver(records => {
      if (records.some(record => record.attributeName === 'data-mi-registry-view')) scheduleSync();
    });
    rootObserver.observe(ROOT, { attributes:true, attributeFilter:['data-mi-registry-view'] });

    observeRegistryParent();
    syncOwnership();

    [
      'medindex:registry-page-ready',
      'medindex:registry-data-ready',
      'medindex:registry-ready',
      'medindex:tailadmin-ready',
    ].forEach(name => window.addEventListener(name, () => {
      observeRegistryParent();
      scheduleSync();
    }, { passive:true }));

    window.addEventListener('pageshow', () => {
      observeRegistryParent();
      scheduleSync();
    }, { passive:true });
    media?.addEventListener?.('change', scheduleSync);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  window.MedIndexRegistryListOwnerGuard = Object.freeze({
    version:VERSION,
    sync:syncOwnership,
    owner:() => listOwnsSurface() ? 'list' : 'table',
  });
})();
