const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';
const FULL_TEXT = 'Montelukast (as 10.4 mg montelukast sodium) — tekst i plotë klinik për verifikimin e qelizës së gjatë.';

test.use({ serviceWorkers:'block', viewport:{ width:1440, height:900 } });

test('qeliza e gjatë hap tekstin e plotë pa zgjeruar rreshtin', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));

  const cell = page.locator('#tbody > tr td[data-registry-column-key="active-substance"]').first();
  await expect(cell).toBeVisible({ timeout:30000 });
  await cell.evaluate((node, text) => {
    node.textContent = text;
    window.MedIndexCellPreview?.refresh?.();
  }, FULL_TEXT);

  const trigger = cell.locator('.registry-cell-preview-trigger');
  await expect(trigger).toBeVisible({ timeout:10000 });
  await expect(trigger.locator('[data-lineicons-icon="expand-square-4"]')).toHaveCount(1);

  const row = cell.locator('xpath=ancestor::tr');
  const before = await row.getAttribute('data-registry-row-expanded');
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.locator('#registryCellPreviewDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.registry-cell-preview-title')).toContainText(/substanc|aktive/i);
  await expect(dialog.locator('.registry-cell-preview-body')).toHaveText(FULL_TEXT);
  await expect(dialog.locator('[data-lineicons-icon="xmark"]')).toHaveCount(1);
  await expect(row).toHaveAttribute('data-registry-row-expanded', before || 'false');

  const desktopGeometry = await dialog.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom };
  });
  expect(desktopGeometry.left).toBeGreaterThanOrEqual(0);
  expect(desktopGeometry.right).toBeLessThanOrEqual(1440);
  expect(desktopGeometry.top).toBeGreaterThanOrEqual(0);
  expect(desktopGeometry.bottom).toBeLessThanOrEqual(900);

  const close = dialog.locator('.registry-cell-preview-close');
  await close.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width:390, height:844 });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  const mobileGeometry = await dialog.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, bottom:rect.bottom };
  });
  expect(mobileGeometry.left).toBeGreaterThanOrEqual(-1);
  expect(mobileGeometry.right).toBeLessThanOrEqual(391);
  expect(mobileGeometry.bottom).toBeGreaterThanOrEqual(842);
  expect(mobileGeometry.bottom).toBeLessThanOrEqual(845);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
