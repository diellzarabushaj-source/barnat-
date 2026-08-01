const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';

test.use({ serviceWorkers:'block', viewport:{ width:1440, height:900 } });

test('qeliza reale e dozimit të gjatë e rrit rreshtin inline pa hapur modal', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));

  await expect.poll(
    () => page.evaluate(() => window.MedIndexRegistryDosage?.clinicalStatus?.() || 'pending'),
    { timeout:30000, message:'integrimi klinik i dozimit nuk u bë gati' }
  ).toBe('ready');

  await expect.poll(
    () => page.evaluate(() => ({
      stable:window.MEDINDEX_REGISTRY_TABLE_AUDIT?.stable === true,
      pending:document.getElementById('dataTable')?.dataset.registryUnifiedPending === 'true',
      preview:window.MedIndexCellPreview?.version || '',
    })),
    { timeout:30000, message:'tabela ose kontrolluesi i zgjerimit nuk u stabilizua' }
  ).toEqual({ stable:true, pending:false, preview:'registry-cell-preview-20260801-7' });

  const cell = page.locator('#tbody > tr td[data-registry-column-key="dosage-adult"]').first();
  await expect(cell).toBeVisible({ timeout:30000 });
  await expect(cell).toContainText(/500|tablet|orë|nevoj/i);

  const previewResult = await cell.evaluate(node => {
    window.MedIndexCellPreview.refresh();
    return {
      text:String(node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim(),
      hasTrigger:Boolean(node.querySelector('.registry-cell-preview-trigger')),
      key:node.dataset.registryColumnKey,
    };
  });
  expect(previewResult.key).toBe('dosage-adult');
  expect(previewResult.text.length).toBeGreaterThan(54);
  expect(previewResult.hasTrigger).toBe(true);

  const trigger = cell.locator('.registry-cell-preview-trigger');
  await expect(trigger).toBeVisible({ timeout:10000 });
  const iconVisual = await trigger.evaluate(node => {
    const style = getComputedStyle(node, '::before');
    return {
      content:style.content,
      width:style.width,
      height:style.height,
      mask:style.webkitMaskImage || style.maskImage,
    };
  });
  expect(iconVisual.content).not.toBe('none');
  expect(iconVisual.width).toBe('16px');
  expect(iconVisual.height).toBe('16px');
  expect(iconVisual.mask).toContain('data:image/svg+xml');
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
