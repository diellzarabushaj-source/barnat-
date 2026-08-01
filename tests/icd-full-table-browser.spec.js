const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-visual';
fs.mkdirSync(OUTPUT, { recursive:true });

test.describe.configure({ mode:'serial' });

async function openIcd(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/icd.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(page.locator('.mi-app-shell')).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.miIcdSidebar === 'ready');
  await expect(page.locator('#icdTableBody [data-icd-row="A00"]')).toBeVisible();
}

async function openA00(page, mobile) {
  if (mobile) {
    await page.locator('[data-mi-sidebar-toggle]').click();
    await expect(page.locator('body')).toHaveClass(/mi-sidebar-open/);
  }
  const root = page.locator('[data-mi-icd-menu] .mi-icd-root-trigger');
  if (await root.getAttribute('aria-expanded') !== 'true') await root.click();
  const chapter = page.locator('[data-mi-icd-chapter-trigger="I"]');
  if (await chapter.getAttribute('aria-expanded') !== 'true') await chapter.click();
  const block = page.locator('[data-mi-icd-block-trigger="A00-A09"]');
  if (await block.getAttribute('aria-expanded') !== 'true') await block.click();
  await expect(page.locator('[data-mi-icd-filter-parent="A00"]')).toBeVisible();
  await page.locator('[data-mi-icd-filter-parent="A00"]').click();
  await expect(page).toHaveURL(/parent=A00/);
  await expect(page.locator('#icdTableBody [data-icd-row="A00.0"]')).toBeVisible();
  await expect(page.locator('#icdTableBody [data-icd-row="A00.1"]')).toBeVisible();
  await expect(page.locator('#icdContextTitle')).toContainText('A00');
  if (mobile) await expect(page.locator('body')).not.toHaveClass(/mi-sidebar-open/);
}

async function assertViewport(page) {
  const report = await page.evaluate(() => ({
    documentWidth:document.documentElement.scrollWidth,
    viewportWidth:innerWidth,
    panel:document.querySelector('.icd-registry-panel')?.getBoundingClientRect().toJSON(),
    table:document.querySelector('.icd-table')?.getBoundingClientRect().toJSON(),
    sidebar:document.querySelector('#miSidebar')?.getBoundingClientRect().toJSON(),
  }));
  expect(report.documentWidth).toBeLessThanOrEqual(report.viewportWidth + 2);
  expect(report.panel.right).toBeLessThanOrEqual(report.viewportWidth + 2);
  expect(report.panel.left).toBeGreaterThanOrEqual(-1);
}

for (const profile of [
  { name:'desktop', width:1440, height:1000 },
  { name:'tablet', width:820, height:1180 },
  { name:'mobile', width:390, height:844 },
]) {
  test(`${profile.name} full ICD hierarchy and table`, async ({ page }) => {
    await openIcd(page, profile);
    await openA00(page, profile.width < 1024);
    await assertViewport(page);
    await page.screenshot({ path:path.join(OUTPUT, `${profile.name}-full.png`), fullPage:true });
    if (profile.width >= 1024) await page.locator('#miSidebar').screenshot({ path:path.join(OUTPUT, `${profile.name}-sidebar.png`) });
  });
}

test('ICD search exposes keyboard-accessible suggestions', async ({ page }) => {
  await openIcd(page, { width:1280, height:900 });
  const search = page.locator('#icdSearch');
  await search.fill('hipertension');
  await expect(page.locator('#icdSuggestions')).toBeVisible();
  await search.press('ArrowDown');
  await expect(page.locator('#icdSuggestions [aria-selected="true"]')).toHaveCount(1);
  await search.press('Enter');
  await expect(page).toHaveURL(/q=I10|parent=I10/);
});
