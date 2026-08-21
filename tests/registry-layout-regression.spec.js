const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4174';
const LAYOUT_VERSION = 'registry-table-layout-guard-v6';

test.use({ serviceWorkers:'block', viewport:{ width:1440, height:900 } });

async function waitForRegistryLayout(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));

  await expect.poll(
    () => page.evaluate(() => ({
      tableStable:window.MEDINDEX_REGISTRY_TABLE_AUDIT?.stable === true,
      guard:window.MedIndexRegistryLayoutGuard?.version || '',
      adult:Boolean(document.querySelector('#headerRow th[data-registry-column-key="dosage-adult"]')),
      pediatric:Boolean(document.querySelector('#headerRow th[data-registry-column-key="dosage-pediatric"]')),
      // The header settles while the body still holds the loading placeholder, which carries no drug.
      // Measuring geometry or expanding a row before real rows land reads the placeholder instead.
      drugRows:document.querySelectorAll('#tbody > tr[data-registry-number]').length > 0,
    })),
    { timeout:30000, message:'registry table and layout guard did not reach the dosage-column ready state' },
  ).toEqual({
    tableStable:true,
    guard:LAYOUT_VERSION,
    adult:true,
    pediatric:true,
    drugRows:true,
  });
}

test('reduced desktop columns fill the registry surface without a blank gutter or stale horizontal offset', async ({ page }) => {
  await waitForRegistryLayout(page);

  await page.evaluate(() => window.MedIndexRegistryUnified?.setView?.('full'));
  await expect.poll(() => page.evaluate(() => ({
    view:document.documentElement.dataset.registryUxView,
    status:Boolean(document.querySelector('#headerRow th[data-registry-column-key="status"]')),
  })), { timeout:10000 }).toEqual({ view:'full', status:true });

  await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.remove('hide-registry-dosage-adult', 'hide-registry-dosage-pediatric');
    root.dataset.registryDoseColumnVisible = 'false';

    document.getElementById('registry-layout-regression-visible-columns')?.remove();
    const style = document.createElement('style');
    style.id = 'registry-layout-regression-visible-columns';
    style.textContent = `
      #dataTable :is(th,td)[data-registry-column-key]:not([data-registry-column-key="strength"]):not([data-registry-column-key="form"]):not([data-registry-column-key="status"]):not([data-registry-column-key="dosage-adult"]):not([data-registry-column-key="dosage-pediatric"]) {
        display:none!important;
      }
      #dataTable :is(th,td)[data-registry-column-key="strength"],
      #dataTable :is(th,td)[data-registry-column-key="form"],
      #dataTable :is(th,td)[data-registry-column-key="status"],
      #dataTable :is(th,td)[data-registry-column-key="dosage-adult"],
      #dataTable :is(th,td)[data-registry-column-key="dosage-pediatric"] {
        display:table-cell!important;
      }
    `;
    document.head.appendChild(style);

    const wrapper = document.getElementById('registryContent');
    if (wrapper) wrapper.scrollLeft = 999;
    window.MedIndexRegistryLayoutGuard.refresh();
  });

  await expect.poll(
    () => page.evaluate(() => {
      const wrapper = document.getElementById('registryContent');
      const table = document.getElementById('dataTable');
      const audit = window.MEDINDEX_REGISTRY_LAYOUT_AUDIT || {};
      const visibleHeaders = Array.from(document.querySelectorAll('#headerRow th[data-registry-column-key]'))
        .filter(node => getComputedStyle(node).display !== 'none')
        .map(node => node.dataset.registryColumnKey);
      if (!wrapper || !table) return { ready:false };
      return {
        ready:true,
        version:audit.version || '',
        mode:audit.mode || '',
        stable:audit.stable === true,
        stretched:audit.stretchedToFit === true,
        phantom:audit.phantomOverflow === true,
        overflow:Number(audit.overflowPx || 0),
        scrollLeft:wrapper.scrollLeft,
        widthDelta:Math.abs(Math.round(table.getBoundingClientRect().width) - wrapper.clientWidth),
        visibleHeaders,
      };
    }),
    { timeout:10000, message:'reduced-column registry retained blank space, phantom overflow or stale scroll' },
  ).toEqual({
    ready:true,
    version:LAYOUT_VERSION,
    mode:'desktop',
    stable:true,
    stretched:true,
    phantom:false,
    overflow:0,
    scrollLeft:0,
    widthDelta:0,
    visibleHeaders:['strength', 'form', 'status', 'dosage-adult', 'dosage-pediatric'],
  });

  const geometry = await page.evaluate(() => {
    const wrapper = document.getElementById('registryContent');
    const table = document.getElementById('dataTable');
    const audit = window.MEDINDEX_REGISTRY_LAYOUT_AUDIT;
    return {
      wrapperWidth:wrapper.clientWidth,
      tableWidth:Math.round(table.getBoundingClientRect().width),
      scrollWidth:wrapper.scrollWidth,
      scrollLeft:wrapper.scrollLeft,
      audit,
    };
  });

  expect(Math.abs(geometry.tableWidth - geometry.wrapperWidth)).toBeLessThanOrEqual(2);
  expect(geometry.scrollWidth - geometry.wrapperWidth).toBeLessThanOrEqual(2);
  expect(geometry.scrollLeft).toBe(0);
  expect(geometry.audit.excessReservedWidth).toBe(0);
  expect(geometry.audit.removedColumnsStillVisible).toEqual([]);

  const adultCell = page.locator('#tbody > tr[data-registry-number] td[data-registry-column-key="dosage-adult"]').first();
  await expect(adultCell).toBeVisible({ timeout:10000 });
  const adultRow = adultCell.locator('xpath=ancestor::tr');
  await expect.poll(() => adultRow.evaluate(() => typeof window.MedIndexRegistryRows?.toggleRow === 'function'), { timeout:10000 }).toBe(true);
  expect(await adultRow.evaluate(row => window.MedIndexRegistryRows.toggleRow(row, true))).toBe(true);
  await expect(adultRow).toHaveAttribute('data-registry-row-expanded', 'true');

  const expandedGeometry = await adultRow.evaluate(row => {
    const wrapper = document.getElementById('registryContent');
    const rowRect = row.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    return {
      expanded:row.dataset.registryRowExpanded,
      rowLeft:rowRect.left,
      rowRight:rowRect.right,
      wrapperLeft:wrapperRect.left,
      wrapperRight:wrapperRect.right,
    };
  });

  expect(expandedGeometry.expanded).toBe('true');
  expect(expandedGeometry.rowLeft).toBeGreaterThanOrEqual(expandedGeometry.wrapperLeft - 2);
  expect(expandedGeometry.rowRight).toBeLessThanOrEqual(expandedGeometry.wrapperRight + 2);
});