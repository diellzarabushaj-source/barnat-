(() => {
  'use strict';

  const VERSION = 'registry-table-layout-guard-v5';
  const ROOT = document.documentElement;
  const MOBILE_BREAKPOINT = 760;
  const TOLERANCE_PX = 2;
  const VISIBILITY_STYLE_ID = 'registry-layout-body-visibility';
  const REMOVED_KEYS = new Set(['clinical-status', 'clinical-action', 'personal-note']);
  const NEVER_FLEX = new Set([
    'select', 'number', 'dose-calculator', 'strength', 'status', 'atc', 'pdid',
    'protocol', 'wholesale-price', 'margin-price', 'vat', 'retail-price', 'validity',
  ]);
  const FLEX_WEIGHTS = Object.freeze({
    'trade-name':1.45,
    'active-substance':1.15,
    'drug-class':1.15,
    use:1.35,
    form:0.45,
    'prescription-label':1.30,
    packaging:0.60,
    mah:0.90,
    manufacturer:0.90,
    'dosage-adult':2.60,
    'dosage-pediatric':2.60,
  });
  const FALLBACK_WIDTHS = Object.freeze({
    select:44, number:68, 'trade-name':210, 'active-substance':172, atc:88,
    'drug-class':210, use:230, pdid:98, protocol:122, strength:82, form:142,
    'prescription-label':235, packaging:150, mah:190, manufacturer:180,
    'ma-certificate':138, status:112, 'wholesale-price':116, 'margin-price':116,
    vat:78, 'retail-price':116, validity:140, 'dosage-adult':250,
    'dosage-pediatric':250, 'dose-calculator':132,
  });

  let frame = 0;
  let resizeObserver = null;
  let observedWrapper = null;
  let headerObserver = null;
  let observedHeader = null;
  let rootObserver = null;

  const clean = value => String(value ?? '').trim();
  const doseVisible = () => ROOT.dataset.registryDoseColumnVisible === 'true';
  const escapeSelector = value => window.CSS?.escape
    ? window.CSS.escape(String(value ?? ''))
    : String(value ?? '').replace(/["\\]/g, '\\$&');

  function headerFor(table, key) {
    if (!key) return null;
    return table.querySelector(`thead th[data-registry-column-key="${escapeSelector(key)}"]`);
  }

  function shouldShow(table, key) {
    if (!key || REMOVED_KEYS.has(key)) return false;
    if (key === 'dose-calculator' && !doseVisible()) return false;
    const header = headerFor(table, key);
    if (!header) return false;
    return getComputedStyle(header).display !== 'none';
  }

  function rememberedWidth(col, key) {
    if (key === 'dose-calculator') {
      col.dataset.registryLayoutBaseWidth = String(FALLBACK_WIDTHS[key]);
      return FALLBACK_WIDTHS[key];
    }
    const remembered = Number(col.dataset.registryLayoutBaseWidth);
    if (Number.isFinite(remembered) && remembered > 0) return remembered;
    const inlineWidth = Number.parseFloat(col.style.width || '');
    const width = Number.isFinite(inlineWidth) && inlineWidth > 0
      ? inlineWidth
      : (FALLBACK_WIDTHS[key] || 150);
    col.dataset.registryLayoutBaseWidth = String(width);
    return width;
  }

  function fitVisibleColumns(records, wrapperWidth) {
    const baseContentWidth = records.reduce((sum, item) => sum + item.baseWidth, 0);
    if (!records.length || wrapperWidth <= 0 || baseContentWidth >= wrapperWidth) {
      return { baseContentWidth, fittedWidth:baseContentWidth, stretched:false };
    }

    let flexible = records.filter(item => Number(FLEX_WEIGHTS[item.key]) > 0);
    if (!flexible.length) flexible = records.filter(item => !NEVER_FLEX.has(item.key));
    if (!flexible.length && records.length) flexible = [records[records.length - 1]];

    const spare = wrapperWidth - baseContentWidth;
    const weightFor = item => Number(FLEX_WEIGHTS[item.key]) > 0 ? Number(FLEX_WEIGHTS[item.key]) : 1;
    const totalWeight = flexible.reduce((sum, item) => sum + weightFor(item), 0) || flexible.length;
    let allocated = 0;

    flexible.forEach((item, index) => {
      const isLast = index === flexible.length - 1;
      const share = isLast
        ? spare - allocated
        : Math.floor(spare * (weightFor(item) / totalWeight));
      const safeShare = Math.max(0, share);
      item.width = item.baseWidth + safeShare;
      allocated += safeShare;
    });

    records.forEach(item => {
      if (!Number.isFinite(item.width)) item.width = item.baseWidth;
    });

    return {
      baseContentWidth,
      fittedWidth:records.reduce((sum, item) => sum + item.width, 0),
      stretched:true,
    };
  }

  function visibilityStyle() {
    let style = document.getElementById(VISIBILITY_STYLE_ID);
    if (style) return style;
    style = document.createElement('style');
    style.id = VISIBILITY_STYLE_ID;
    style.dataset.registryLayoutGuard = VERSION;
    document.head.appendChild(style);
    return style;
  }

  function syncBodyColumnVisibility(hiddenKeys) {
    const style = visibilityStyle();
    const rules = [...hiddenKeys]
      .filter(Boolean)
      .sort()
      .map(key => `#dataTable tbody td[data-registry-column-key="${escapeSelector(key)}"]{display:none!important}`)
      .join('\n');
    if (style.textContent !== rules) style.textContent = rules;
  }

  function clearBodyColumnVisibility() {
    const style = document.getElementById(VISIBILITY_STYLE_ID);
    if (style?.textContent) style.textContent = '';
  }

  function publishAudit(audit) {
    window.MEDINDEX_REGISTRY_LAYOUT_AUDIT = audit;
    ROOT.dataset.registryLayoutGuard = VERSION;
    ROOT.dataset.registryLayoutIntegrity = audit.stable ? 'ok' : 'mismatch';
  }

  function resetForMobile(table, wrapper) {
    clearBodyColumnVisibility();
    table.style.removeProperty('--registry-unified-width');
    table.style.removeProperty('width');
    table.style.removeProperty('min-width');
    table.style.removeProperty('max-width');
    wrapper.scrollLeft = 0;
    publishAudit({
      version:VERSION,
      mode:'native-mobile',
      view:ROOT.dataset.registryUxView || 'clinical',
      viewportWidth:Math.round(window.innerWidth || 0),
      stable:true,
    });
  }

  function measureAndAudit({ table, wrapper, visibleRecords, hiddenColumns, fit, contentWidth, targetWidth }) {
    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, table.scrollWidth - wrapper.clientWidth);
      if (fit.baseContentWidth <= wrapper.clientWidth + TOLERANCE_PX) wrapper.scrollLeft = 0;
      else if (wrapper.scrollLeft > maxScroll) wrapper.scrollLeft = maxScroll;

      const removedColumnsStillVisible = [...REMOVED_KEYS].filter(key => {
        const header = headerFor(table, key);
        return Boolean(header && getComputedStyle(header).display !== 'none');
      });
      const calculatorHeader = headerFor(table, 'dose-calculator');
      const calculatorActuallyVisible = Boolean(calculatorHeader && getComputedStyle(calculatorHeader).display !== 'none');
      const calculatorStateMatches = calculatorActuallyVisible === doseVisible();
      const measuredTableWidth = Math.round(table.getBoundingClientRect().width || 0);
      const wrapperWidth = Math.max(0, Math.round(wrapper.clientWidth || 0));
      const overflowPx = Math.max(0, Math.ceil(table.scrollWidth - wrapper.clientWidth));
      const shouldFit = fit.baseContentWidth <= wrapperWidth + TOLERANCE_PX;
      const phantomOverflow = shouldFit && overflowPx > TOLERANCE_PX;
      const widthMismatch = Math.abs(measuredTableWidth - targetWidth) > TOLERANCE_PX;

      publishAudit({
        version:VERSION,
        mode:'desktop',
        view:ROOT.dataset.registryUxView || 'clinical',
        doseCalculatorVisible:doseVisible(),
        calculatorActuallyVisible,
        calculatorStateMatches,
        visibleColumns:visibleRecords.length,
        hiddenColumns,
        baseVisibleWidth:Math.ceil(fit.baseContentWidth),
        visibleWidth:contentWidth,
        wrapperWidth,
        requestedTableWidth:targetWidth,
        measuredTableWidth,
        overflowPx,
        phantomOverflow,
        widthMismatch,
        stretchedToFit:fit.stretched,
        removedColumnsStillVisible,
        excessReservedWidth:Math.max(0, targetWidth - Math.max(contentWidth, wrapperWidth)),
        stable:calculatorStateMatches
          && removedColumnsStillVisible.length === 0
          && !phantomOverflow
          && !widthMismatch,
      });
    });
  }

  function bindObservers() {
    const wrapper = document.getElementById('registryContent');
    const header = document.getElementById('headerRow');

    if ('ResizeObserver' in window && wrapper && observedWrapper !== wrapper) {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(wrapper);
      observedWrapper = wrapper;
    }

    if ('MutationObserver' in window && header && observedHeader !== header) {
      headerObserver?.disconnect();
      headerObserver = new MutationObserver(schedule);
      headerObserver.observe(header, {
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:['class', 'style', 'hidden', 'aria-hidden', 'data-registry-column-key'],
      });
      observedHeader = header;
    }

    if ('MutationObserver' in window && !rootObserver) {
      rootObserver = new MutationObserver(schedule);
      rootObserver.observe(ROOT, {
        attributes:true,
        attributeFilter:['class', 'data-registry-ux-view', 'data-registry-dose-column-visible'],
      });
    }
  }

  function sync() {
    frame = 0;
    bindObservers();

    const wrapper = document.getElementById('registryContent');
    const table = document.getElementById('dataTable');
    if (!wrapper || !table) return;

    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      resetForMobile(table, wrapper);
      return;
    }

    const group = table.querySelector(':scope > colgroup[data-registry-unified-colgroup]');
    if (!group) return;

    const visibleRecords = [];
    const hiddenKeys = new Set();
    let hiddenColumns = 0;

    group.querySelectorAll(':scope > col[data-registry-column-key]').forEach(col => {
      const key = clean(col.dataset.registryColumnKey);
      const baseWidth = rememberedWidth(col, key);
      const show = shouldShow(table, key);

      if (show) {
        col.style.removeProperty('display');
        col.style.removeProperty('visibility');
        visibleRecords.push({ col, key, baseWidth, width:baseWidth });
      } else {
        col.style.setProperty('display', 'none', 'important');
        col.style.setProperty('width', '0px', 'important');
        hiddenKeys.add(key);
        hiddenColumns += 1;
      }
    });

    syncBodyColumnVisibility(hiddenKeys);

    const wrapperWidth = Math.max(0, Math.round(wrapper.clientWidth || 0));
    const fit = fitVisibleColumns(visibleRecords, wrapperWidth);

    visibleRecords.forEach(item => {
      item.col.style.setProperty('width', `${item.width}px`, 'important');
    });

    const contentWidth = Math.ceil(fit.fittedWidth);
    const targetWidth = Math.max(contentWidth, wrapperWidth);
    table.style.setProperty('--registry-unified-width', `${targetWidth}px`);
    table.style.setProperty('width', `${targetWidth}px`, 'important');
    table.style.setProperty('min-width', `${targetWidth}px`, 'important');
    table.style.setProperty('max-width', `${targetWidth}px`, 'important');

    measureAndAudit({ table, wrapper, visibleRecords, hiddenColumns, fit, contentWidth, targetWidth });
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  }

  [
    'medindex:desktop-lite-ready',
    'medindex:registry-table-stable',
    'medindex:registry-page-ready',
    'medindex:registry-ready',
    'medindex:registry-dosage-ready',
    'medindex:registry-dose-column-changed',
    'medindex:tailadmin-ready',
  ].forEach(name => window.addEventListener(name, schedule));

  window.addEventListener('resize', schedule, { passive:true });
  window.addEventListener('pageshow', schedule, { passive:true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once:true });
  else schedule();

  window.MedIndexRegistryLayoutGuard = Object.freeze({
    version:VERSION,
    refresh:schedule,
    audit:() => window.MEDINDEX_REGISTRY_LAYOUT_AUDIT,
  });
})();
