const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';
const FULL_TEXT = 'Montelukast (as 10.4 mg montelukast sodium) — tekst i plotë klinik për verifikimin e qelizës së gjatë. Teksti vazhdon që rreshti të rritet vertikalisht dhe të mos hapet asnjë dritare e re.';

test.use({ serviceWorkers:'block', viewport:{ width:1440, height:900 } });

test('qeliza e gjatë e rrit rreshtin inline pa hapur modal', async ({ page }) => {
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
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  const row = cell.locator('xpath=ancestor::tr');
  const compactHeight = await row.evaluate(node => node.getBoundingClientRect().height);

  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(row).toHaveAttribute('data-registry-row-expanded', 'true');
  await expect(row).toHaveClass(/registry-row-expanded/);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#registryCellPreviewDialog')).toHaveCount(0);
  await expect(page.locator('dialog.registry-cell-preview-dialog')).toHaveCount(0);

  await expect.poll(async () => row.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(compactHeight);
  const expandedHeight = await row.evaluate(node => node.getBoundingClientRect().height);
  const expandedStyles = await cell.evaluate(node => {
    const style = getComputedStyle(node);
    return { height:node.getBoundingClientRect().height, overflow:style.overflow, whiteSpace:style.whiteSpace };
  });
  expect(expandedStyles.height).toBeGreaterThan(compactHeight);
  expect(expandedStyles.overflow).toBe('visible');
  expect(expandedStyles.whiteSpace).toBe('normal');

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('data-registry-row-expanded', 'false');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => row.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(expandedHeight);

  await page.setViewportSize({ width:390, height:844 });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('data-registry-row-expanded', 'true');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#registryCellPreviewDialog')).toHaveCount(0);
  await expect(page.locator('dialog.registry-cell-preview-dialog')).toHaveCount(0);

  const mobileGeometry = await row.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, height:rect.height, viewport:window.innerWidth };
  });
  expect(mobileGeometry.height).toBeGreaterThan(compactHeight);
  expect(mobileGeometry.left).toBeGreaterThanOrEqual(-1);
  expect(mobileGeometry.right).toBeLessThanOrEqual(mobileGeometry.viewport + 1);
});
