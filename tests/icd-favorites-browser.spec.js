const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-visual';
const STORAGE_KEY = 'medindex_icd_favorites_v1';
fs.mkdirSync(OUTPUT, { recursive:true });
test.describe.configure({ mode:'serial' });

async function waitForIcdReady(page) {
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-icd-tree', 'ready');
  await expect(html).toHaveAttribute('data-mi-icd-favorites', 'icd-favorites-v1');
}

async function openIcd(page, viewport = { width:1280, height:900 }) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/icd.html`, { waitUntil:'domcontentloaded' });
  await waitForIcdReady(page);
  await expect(page.locator('[data-icd-tree-node="I"]')).toBeVisible();
}

async function openA00Detail(page) {
  await page.locator('[data-tree-toggle="I"]').click();
  await expect(page.locator('[data-icd-tree-node="A00-A09"]')).toBeVisible();
  await page.locator('[data-tree-toggle="A00-A09"]').click();
  await expect(page.locator('[data-icd-tree-node="A00"]')).toBeVisible();
  await page.locator('[data-icd-tree-node="A00"] [data-open-code="A00"]').click();
  await expect(page.locator('#detailOverlay')).toBeVisible();
  await expect(page.locator('#icdFavoriteCode')).toBeVisible();
}

test('a doctor saves, reopens and removes an ICD favorite without losing the tree workflow', async ({ page }) => {
  await openIcd(page);
  await openA00Detail(page);

  const favoriteButton = page.locator('#icdFavoriteCode');
  await expect(favoriteButton).toHaveText('☆ Shto te të preferuarat');
  await expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');
  await favoriteButton.click();
  await expect(favoriteButton).toHaveText('★ Hiqe nga të preferuarat');
  await expect(favoriteButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#detailActionStatus')).toContainText('A00 u shtua');
  await page.locator('#detailClose').click();

  await expect(page.locator('#icdFavoritesCount')).toHaveText('1');
  await page.locator('#icdFavoritesToggle').click();
  await expect(page.locator('#icdFavoritesPanel')).toBeVisible();
  await expect(page.locator('[data-favorite-code="A00"]')).toContainText('A00');
  await page.screenshot({ path:path.join(OUTPUT, 'icd-favorites-desktop.png'), fullPage:true });

  await page.reload({ waitUntil:'domcontentloaded' });
  await waitForIcdReady(page);
  await expect(page.locator('#icdFavoritesCount')).toHaveText('1');
  await page.locator('#icdFavoritesToggle').click();
  await page.locator('[data-favorite-open="A00"]').click();

  await expect(page).toHaveURL(/code=A00/);
  await expect(page.locator('[data-icd-tree-node="A00"] .icd-tree-row')).toHaveClass(/is-selected/);
  await expect(page.locator('#detailOverlay')).toBeVisible();
  await expect(page.locator('#icdFavoriteCode')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#icdFavoriteCode').click();
  await expect(page.locator('#icdFavoriteCode')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#icdFavoritesCount')).toHaveText('0');
});

test('favorites stay bounded, removable and inside the mobile viewport', async ({ page }) => {
  const now = Date.now();
  const items = Array.from({ length:30 }, (_, index) => ({
    code:`A${String(index).padStart(2, '0')}`,
    level:'category',
    titleSq:`Kategori e preferuar ${index}`,
    titleEn:`Favorite category ${index}`,
    displayTitle:`Kategori e preferuar ${index}`,
    translationStatus:'standardized',
    savedAt:now - index,
  }));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key:STORAGE_KEY,
    value:{ version:1, updatedAt:now, items },
  });

  await openIcd(page, { width:390, height:844 });
  await expect(page.locator('#icdFavoritesCount')).toHaveText('24');
  await page.locator('#icdFavoritesToggle').click();
  await expect(page.locator('#icdFavoritesPanel')).toBeVisible();
  await expect(page.locator('.icd-favorite-item')).toHaveCount(24);

  const geometry = await page.evaluate(() => {
    const panel = document.getElementById('icdFavoritesPanel')?.getBoundingClientRect();
    return {
      viewportWidth:innerWidth,
      documentWidth:document.documentElement.scrollWidth,
      panel:panel && { left:panel.left, right:panel.right, width:panel.width },
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.panel.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  await page.locator('[data-favorite-remove="A00"]').click();
  await expect(page.locator('#icdFavoritesCount')).toHaveText('23');
  await expect(page.locator('[data-favorite-code="A00"]')).toHaveCount(0);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#icdFavoritesClear').click();
  await expect(page.locator('#icdFavoritesCount')).toHaveText('0');
  await expect(page.locator('#icdFavoritesEmpty')).toBeVisible();
  await page.screenshot({ path:path.join(OUTPUT, 'icd-favorites-mobile.png'), fullPage:true });
});
