const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-visual';
fs.mkdirSync(OUTPUT, { recursive:true });
test.describe.configure({ mode:'serial' });

async function installClipboardCapture(page) {
  await page.addInitScript(() => {
    window.__medindexCopiedText = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable:true,
      value:{ writeText:async value => { window.__medindexCopiedText = String(value); } },
    });
  });
}

async function waitForWorkspace(page) {
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-icd-tree', 'ready');
  await expect(html).toHaveAttribute('data-mi-icd-coding-workspace', 'icd-coding-workspace-v1');
  await expect(page.locator('#icdCodingWorkspace')).toBeVisible();
}

test('category workspace shows hierarchy, specificity and clinical actions', async ({ page }) => {
  await installClipboardCapture(page);
  await page.setViewportSize({ width:1360, height:920 });
  await page.goto(`${BASE}/icd.html?code=A00`, { waitUntil:'domcontentloaded' });
  await waitForWorkspace(page);

  await expect(page.locator('#icdCodingWorkspaceCode')).toHaveText('A00');
  await expect(page.locator('#icdCodingWorkspaceLevel')).toHaveText('Kategori');
  await expect(page.locator('#icdCodingWorkspaceName')).not.toHaveText('Po ngarkohet kodi…');
  await expect(page.locator('#icdCodingWorkspacePath')).toContainText('I');
  await expect(page.locator('#icdCodingWorkspacePath')).toContainText('A00-A09');
  await expect(page.locator('#icdCodingWorkspacePath')).toContainText('A00');
  await expect(page.locator('#icdCodingWorkspaceSpecificity')).toContainText('nënkode direkte');
  await expect(page.locator('[data-mi-icd-workspace-primary]')).toBeVisible();
  await expect(page.locator('[data-mi-icd-workspace-secondary]')).toBeVisible();
  await expect(page.locator('[data-mi-icd-workspace-children]')).toBeVisible();

  await page.locator('[data-mi-icd-workspace-copy]').click();
  await expect(page.locator('#icdCodingWorkspaceActionStatus')).toContainText('u kopjua');
  const copied = await page.evaluate(() => window.__medindexCopiedText);
  expect(copied).toContain('Kodi: A00');
  expect(copied).toContain('Niveli: Kategori');
  expect(copied).toContain('Hierarkia: I › A00-A09 › A00');
  expect(copied).not.toContain('translationStatus');
  expect(copied).not.toContain('selectedAt');

  await page.locator('[data-mi-icd-workspace-detail]').click();
  await expect(page.locator('#detailOverlay')).toBeVisible();
  await expect(page.locator('#detailKicker')).toContainText('A00');
  await page.locator('#detailClose').click();
  await page.screenshot({ path:path.join(OUTPUT, 'icd-coding-workspace-category.png'), fullPage:true });
});

test('chapter and block remain navigation-only while tree clicks update the workspace', async ({ page }) => {
  await page.setViewportSize({ width:1280, height:900 });
  await page.goto(`${BASE}/icd.html?code=I`, { waitUntil:'domcontentloaded' });
  await waitForWorkspace(page);

  await expect(page.locator('#icdCodingWorkspaceCode')).toHaveText('I');
  await expect(page.locator('#icdCodingWorkspaceLevel')).toHaveText('Kapitull');
  await expect(page.locator('#icdCodingWorkspaceReadiness')).toHaveText('Vetëm për navigim');
  await expect(page.locator('[data-mi-icd-workspace-primary]')).toBeHidden();
  await expect(page.locator('[data-mi-icd-workspace-secondary]')).toBeHidden();
  await expect(page.locator('[data-mi-icd-workspace-children]')).toBeVisible();

  await page.locator('[data-icd-tree-node="I"] [data-tree-toggle]').click();
  await expect(page.locator('[data-icd-tree-node="I"]')).toHaveAttribute('aria-expanded', 'true');
  const blockButton = page.locator('[data-icd-tree-node][data-level="block"] [data-tree-toggle]').first();
  await expect(blockButton).toBeVisible();
  const blockCode = await blockButton.getAttribute('data-tree-toggle');
  await blockButton.click();
  await expect(page.locator('#icdCodingWorkspaceCode')).toHaveText(blockCode);
  await expect(page.locator('#icdCodingWorkspaceLevel')).toHaveText('Bllok');
  await expect(page.locator('[data-mi-icd-workspace-primary]')).toBeHidden();
  await expect(page.locator('[data-mi-icd-workspace-secondary]')).toBeHidden();
});

test('subcategory is marked specific and transfers as a secondary diagnosis', async ({ page }) => {
  await page.setViewportSize({ width:1280, height:900 });
  await page.goto(`${BASE}/icd.html?code=A00.1`, { waitUntil:'domcontentloaded' });
  await waitForWorkspace(page);

  await expect(page.locator('#icdCodingWorkspaceCode')).toHaveText('A00.1');
  await expect(page.locator('#icdCodingWorkspaceLevel')).toHaveText('Nënkategori');
  await expect(page.locator('#icdCodingWorkspaceSpecificity')).toHaveText('Kodi më specifik i disponueshëm');
  await expect(page.locator('[data-mi-icd-workspace-children]')).toBeHidden();
  await expect(page.locator('[data-mi-icd-workspace-secondary]')).toBeVisible();

  await page.locator('[data-mi-icd-workspace-secondary]').click();
  await page.waitForURL(/\/recetat\.html\?from=icd-secondary/);
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-icd-problem-list', 'icd-problem-list-v1');
  await expect(page.locator('#rxIcdProblemList')).toBeVisible();
  await expect(page.locator('[data-problem-code="A00.1"]')).toBeVisible();
});

test('workspace fits a phone viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto(`${BASE}/icd.html?code=I10`, { waitUntil:'domcontentloaded' });
  await waitForWorkspace(page);
  await expect(page.locator('#icdCodingWorkspaceCode')).toHaveText('I10');

  const geometry = await page.locator('#icdCodingWorkspace').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {
      left:rect.left,
      right:rect.right,
      viewport:innerWidth,
      documentWidth:document.documentElement.scrollWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  await expect(page.locator('.icd-coding-workspace-grid section')).toHaveCount(3);
  await page.screenshot({ path:path.join(OUTPUT, 'icd-coding-workspace-mobile.png'), fullPage:true });
});
