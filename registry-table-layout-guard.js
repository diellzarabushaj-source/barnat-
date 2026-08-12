(() => {
  'use strict';

  const VERSION = 'registry-table-layout-guard-v3';
  const ROOT = document.documentElement;
  const REMOVED_KEYS = new Set(['clinical-status', 'clinical-action', 'personal-note']);
  const FALLBACK_WIDTHS = Object.freeze({
    select:44, number:68, 'trade-name':210, 'active-substance':172, atc:88,
    'drug-class':210, use:230, pdid:98, protocol:122, strength:82, form:142,
    'prescription-label':235, packaging:150, mah:190, manufacturer:180,
    'ma-certificate':138, status:112, 'wholesale-price':116, 'margin-price':116,
    vat:78, 'retail-price':116, validity:140, 'dosage-adult':250,
    'dosage-pediatric':250, 'dose-calculator':132,
  });

  let frame = 0;

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

  function sync() {
    frame = 0;
    const wrapper = document.getElementById('registryContent');
    const table = document.getElementById('dataTable');
    const group = table?.querySelector(':scope > colgroup[data-registry-unified-colgroup]');
    if (!wrapper || !table || !group || window.innerWidth <= 760) return;

    let visibleWidth = 0;
    let visibleColumns = 0;
    let hiddenColumns = 0;

    group.querySelectorAll(':scope > col[data-registry-column-key]').forEach(col => {
      const key = clean(col.dataset.registryColumnKey);
      const baseWidth = rememberedWidth(col, key);
      const show = shouldShow(table, key);

      if (show) {
        col.style.removeProperty('display');
        col.style.setProperty('width', `${baseWidth}px`);
        visibleWidth += baseWidth;
        visibleColumns += 1;
      } else {
        col.style.setProperty('display', 'none', 'important');
        col.style.setProperty('width', '0px', 'important');
        hiddenColumns += 1;
      }
    });

    const wrapperWidth = Math.max(0, Math.round(wrapper.clientWidth || 0));
    const contentWidth = Math.ceil(visibleWidth);
    const targetWidth = Math.max(contentWidth, wrapperWidth);
    table.style.setProperty('--registry-unified-width', `${targetWidth}px`);
    table.style.setProperty('width', `${targetWidth}px`, 'important');
    table.style.setProperty('min-width', `${targetWidth}px`, 'important');

    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, table.scrollWidth - wrapper.clientWidth);
      if (wrapper.scrollLeft > maxScroll) wrapper.scrollLeft = maxScroll;
    });

    const removedColumnsStillVisible = [...REMOVED_KEYS].filter(key => {
      const header = headerFor(table, key);
      return Boolean(header && getComputedStyle(header).display !== 'none');
    });
    const calculatorHeader = headerFor(table, 'dose-calculator');
    const calculatorActuallyVisible = Boolean(calculatorHeader && getComputedStyle(calculatorHeader).display !== 'none');
    const calculatorStateMatches = calculatorActuallyVisible === doseVisible();
    const exactWidth = targetWidth === Math.max(contentWidth, wrapperWidth);

    const audit = {
      version:VERSION,
      view:ROOT.dataset.registryUxView || 'clinical',
      doseCalculatorVisible:doseVisible(),
      calculatorActuallyVisible,
      calculatorStateMatches,
      visibleColumns,
      hiddenColumns,
      visibleWidth:contentWidth,
      wrapperWidth,
      tableWidth:targetWidth,
      removedColumnsStillVisible,
      excessReservedWidth:Math.max(0, targetWidth - Math.max(contentWidth, wrapperWidth)),
      stable:exactWidth && calculatorStateMatches && removedColumnsStillVisible.length === 0,
    };
    window.MEDINDEX_REGISTRY_LAYOUT_AUDIT = audit;
    ROOT.dataset.registryLayoutGuard = VERSION;
    ROOT.dataset.registryLayoutIntegrity = audit.stable ? 'ok' : 'mismatch';
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  }

  [
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

  window.MedIndexRegistryLayoutGuard = Object.freeze({ version:VERSION, refresh:schedule });
})();
