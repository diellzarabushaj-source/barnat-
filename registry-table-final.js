(() => {
  'use strict';

  const VERSION = 'registry-table-final-v1';
  const MOBILE_BREAKPOINT = 760;
  const CLINICAL_KEYS = new Set([
    'select',
    'trade-name',
    'active-substance',
    'strength',
    'form',
    'dosage-adult',
    'dosage-pediatric',
    'clinical-status',
    'clinical-action',
  ]);
  const WIDTHS = Object.freeze({
    select:48,
    'trade-name':220,
    'active-substance':178,
    strength:88,
    form:150,
    'dosage-adult':260,
    'dosage-pediatric':260,
    'clinical-status':148,
    'clinical-action':52,
    status:108,
    company:150,
    originator:112,
    atc:100,
    'drug-class':190,
    use:210,
    indication:210,
    route:110,
    packaging:130,
    manufacturer:160,
    notes:220,
  });
  const DEFAULT_WIDTH = 156;
  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';

  let frame = 0;
  let idleHandle = 0;
  let observerAttempts = 0;
  let headerObserver = null;
  let rootObserver = null;
  let toolbarObserver = null;
  let bound = false;

  const keyOf = node => String(node?.dataset?.registryColumnKey || '').trim();
  const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;
  const currentView = () => document.documentElement.dataset.registryUxView === 'full' ? 'full' : 'clinical';

  function visibleHeaders() {
    const headers = [...document.querySelectorAll('#headerRow > th[data-registry-column-key]')];
    const view = currentView();
    return headers.filter(header => {
      const key = keyOf(header);
      if (!key) return false;
      if (view === 'clinical') return CLINICAL_KEYS.has(key);
      if (header.hidden || header.getAttribute('aria-hidden') === 'true') return false;
      return getComputedStyle(header).display !== 'none';
    });
  }

  function widthFor(header) {
    const key = keyOf(header);
    const configured = WIDTHS[key];
    if (Number.isFinite(configured)) return configured;
    const current = Number.parseFloat(getComputedStyle(header).width);
    return Number.isFinite(current) && current >= 52 ? Math.min(Math.max(current,72),280) : DEFAULT_WIDTH;
  }

  function rebuildColgroup(table, headers) {
    if (!table) return;

    const wrapperWidth = document.getElementById('registryContent')?.clientWidth || 0;
    const mobile = isMobile();
    const geometry = headers.map(header => [keyOf(header),widthFor(header)]);
    const total = geometry.reduce((sum,[,width]) => sum + width,0);
    const finalWidth = mobile ? '100%' : `${Math.ceil(Math.max(total,Math.max(0,wrapperWidth - 2)))}px`;
    const signature = mobile
      ? 'mobile'
      : `${geometry.map(([key,width]) => `${key}:${width}`).join('|')}@${Math.ceil(wrapperWidth)}`;
    const finalGroup = table.querySelector(':scope > colgroup[data-registry-table-final]');

    table.style.setProperty('--registry-table-final-width',finalWidth);
    if (table.dataset.registryFinalGeometry === signature && (mobile || finalGroup)) return;
    table.dataset.registryFinalGeometry = signature;

    table.querySelectorAll(':scope > colgroup').forEach(group => group.remove());
    if (!headers.length || mobile) return;

    const group = document.createElement('colgroup');
    group.dataset.registryTableFinal = VERSION;
    geometry.forEach(([key,width]) => {
      const col = document.createElement('col');
      col.dataset.registryColumnKey = key;
      col.style.width = `${width}px`;
      group.appendChild(col);
    });
    table.prepend(group);
    table.dataset.registryFinalColumns = headers.map(keyOf).join(',');
  }

  function normalizeTableGeometry() {
    const table = document.getElementById('dataTable');
    const wrapper = document.getElementById('registryContent');
    if (!table || !wrapper) return false;

    wrapper.dataset.registryTableFinal = VERSION;
    table.dataset.registryTableFinal = VERSION;
    rebuildColgroup(table,visibleHeaders());
    document.documentElement.dataset.registryTableFinal = VERSION;
    return true;
  }

  function normalizeToolbar() {
    const root = document.documentElement;
    const toolbar = document.getElementById('registryViewToolbar');
    const panel = document.getElementById('registryFilterPanel');
    if (toolbar) toolbar.classList.add('registry-view-toolbar-final');
    if (panel) panel.classList.add('registry-filter-panel-final');

    const toggle = document.querySelector('[data-registry-filter-toggle],#registryFilterToggle,.registry-filter-toggle');
    let open = false;
    if (toggle) open = toggle.getAttribute('aria-expanded') === 'true' || toggle.classList.contains('is-active');
    if (panel && !panel.hidden && panel.dataset.registryFilterOpen === 'true') open = true;
    root.dataset.registryFiltersOpen = String(open);
  }

  function stripLegacyDialogs() {
    document.querySelectorAll('.registry-dose-dialog,.registry-cell-preview-dialog').forEach(dialog => dialog.remove());
  }

  function pencilizeBatch() {
    idleHandle = 0;
    let processed = 0;
    while (processed < 40) {
      const button = document.querySelector('#tbody .clinical-editor-open:not([data-registry-final-pencil])');
      if (!button) break;
      button.dataset.registryFinalPencil = VERSION;
      button.setAttribute('aria-label','Redakto barin');
      button.setAttribute('title','Redakto');
      if (!button.querySelector('svg')) button.innerHTML = PENCIL;
      processed += 1;
    }
    if (document.querySelector('#tbody .clinical-editor-open:not([data-registry-final-pencil])')) scheduleIdleWork();
  }

  function scheduleIdleWork() {
    if (idleHandle) return;
    if ('requestIdleCallback' in window) {
      idleHandle = requestIdleCallback(() => {
        stripLegacyDialogs();
        pencilizeBatch();
      }, { timeout:5000 });
    } else {
      idleHandle = setTimeout(() => {
        stripLegacyDialogs();
        pencilizeBatch();
      },500);
    }
  }

  function reconcile() {
    frame = 0;
    normalizeToolbar();
    normalizeTableGeometry();
    scheduleIdleWork();
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(reconcile);
  }

  function bindObservers() {
    if (bound) return;
    bound = true;

    const header = document.getElementById('headerRow');
    if (header) {
      headerObserver = new MutationObserver(schedule);
      headerObserver.observe(header, {
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:['hidden','style','class','aria-hidden','data-registry-column-key'],
      });
    }

    rootObserver = new MutationObserver(schedule);
    rootObserver.observe(document.documentElement,{
      attributes:true,
      attributeFilter:['data-registry-ux-view','data-theme','class'],
    });

    const toolbar = document.getElementById('registryViewToolbar');
    const panel = document.getElementById('registryFilterPanel');
    if (toolbar || panel) {
      toolbarObserver = new MutationObserver(schedule);
      if (toolbar) toolbarObserver.observe(toolbar,{ attributes:true,subtree:true,attributeFilter:['aria-expanded','class'] });
      if (panel) toolbarObserver.observe(panel,{ attributes:true,attributeFilter:['hidden','class','data-registry-filter-open'] });
    }
  }

  function refreshObservers() {
    if (document.getElementById('headerRow') && document.getElementById('registryViewToolbar')) {
      bindObservers();
      return;
    }
    observerAttempts += 1;
    if (observerAttempts < 50) setTimeout(refreshObservers,120);
  }

  function start() {
    schedule();
    refreshObservers();
    window.addEventListener('resize',schedule,{ passive:true });
    window.addEventListener('orientationchange',schedule,{ passive:true });
    [
      'medindex:registry-ready',
      'medindex:registry-table-stable',
      'medindex:registry-view-change',
      'medindex:registry-columns-change',
      'medindex:registry-dosage-ready',
      'medindex:population-verification-ready',
      'medindex:registry-ui-release-ready',
    ].forEach(name => window.addEventListener(name,schedule));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{ once:true });
  else start();
})();
