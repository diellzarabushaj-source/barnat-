const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-visual';
const STORAGE_KEY = 'medindex_icd_code_comparison_v1';
fs.mkdirSync(OUTPUT, { recursive:true });
test.describe.configure({ mode:'serial' });

async function waitForIcd(page) {
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-icd-tree', 'ready');
  await expect(html).toHaveAttribute('data-mi-icd-coding-workspace', 'icd-coding-workspace-v1');
  await expect(html).toHaveAttribute('data-mi-icd-code-comparison', 'icd-code-comparison-v1');
  await expect(html).toHaveAttribute('data-mi-icd-code-comparison-bridge', 'icd-code-comparison-bridge-v1');
}

async function waitForActiveCode(page, code) {
  await expect(page.locator('#icdCodingWorkspaceCode')).toHaveText(code);
  await expect(page.locator('#icdCodingWorkspaceReadiness')).toHaveAttribute('data-tone', 'ready');
  await expect(page.locator('[data-mi-icd-compare-active]')).toBeVisible();
}

test('workspace compares a category with its subcategory and persists only code identifiers', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable:true,
      value:{ writeText:async value => { window.__comparisonClipboard = value; } },
    });
  });

  await page.setViewportSize({ width:1360, height:960 });
  await page.goto(`${BASE}/icd.html?code=A00`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page);
  await waitForActiveCode(page, 'A00');

  await page.locator('[data-mi-icd-compare-active]').click();
  await expect(page.locator('#icdComparisonPanel')).toBeVisible();
  await expect(page.locator('.icd-comparison-card')).toHaveCount(1);
  await expect(page.locator('[data-comparison-code="A00"]')).toBeVisible();
  await expect(page.locator('#icdComparisonCount')).toHaveText('1/3');

  await page.goto(`${BASE}/icd.html?code=A00.0`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page);
  await waitForActiveCode(page, 'A00.0');
  await expect(page.locator('[data-comparison-code="A00"]')).toBeVisible();

  await page.locator('[data-mi-icd-compare-active]').click();
  await expect(page.locator('.icd-comparison-card')).toHaveCount(2);
  await expect(page.locator('[data-comparison-code="A00.0"]')).toBeVisible();
  await expect(page.locator('#icdComparisonCount')).toHaveText('2/3');
  await expect(page.locator('#icdComparisonSummary')).toContainText('Kategori dhe nënkod i saj');
  await expect(page.locator('#icdComparisonSummary')).toContainText('A00-A09');

  await page.locator('[data-mi-icd-comparison-copy]').click();
  const copied = await page.evaluate(() => window.__comparisonClipboard || '');
  expect(copied).toContain('KRAHASIM ICD-10-WHO 2019');
  expect(copied).toContain('A00 —');
  expect(copied).toContain('A00.0 —');
  expect(copied).toContain('vendim klinik');
  expect(copied).not.toContain('selectedAt');
  expect(copied).not.toContain('medindex_icd_code_comparison_v1');

  const stored = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || 'null'), STORAGE_KEY);
  expect(stored).toEqual({ version:1, codes:['A00', 'A00.0'] });
  await page.screenshot({ path:path.join(OUTPUT, 'icd-code-comparison-desktop.png'), fullPage:true });
});

test('detail panel can add a code and the comparison enforces the three-code limit without eviction', async ({ page }) => {
  await page.goto(`${BASE}/icd.html?code=A00.1`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page);
  await waitForActiveCode(page, 'A00.1');

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('medindex:icd-open-detail', { detail:{ code:'A00.1' } }));
  });
  await expect(page.locator('#detailOverlay')).toBeVisible();
  await expect(page.locator('#icdAddComparison')).toBeVisible();
  await page.locator('#icdAddComparison').click();
  await expect(page.locator('[data-comparison-code="A00.1"]')).toBeVisible();

  const additions = await page.evaluate(async () => {
    const api = window.MedIndexIcdCodeComparison;
    return [await api.addCode('A00.0'), await api.addCode('A00'), await api.addCode('I10')];
  });
  expect(additions).toEqual([true, true, false]);
  await expect(page.locator('.icd-comparison-card')).toHaveCount(3);
  await expect(page.locator('#icdComparisonCount')).toHaveText('3/3');
  await expect(page.locator('[data-comparison-code="I10"]')).toHaveCount(0);
  await expect(page.locator('#icdComparisonStatus')).toContainText('maksimum 3 kode');

  await page.locator('[data-mi-icd-comparison-remove="A00"]').click();
  await expect(page.locator('.icd-comparison-card')).toHaveCount(2);
  const addedAfterRemoval = await page.evaluate(() => window.MedIndexIcdCodeComparison.addCode('I10'));
  expect(addedAfterRemoval).toBe(true);
  await expect(page.locator('[data-comparison-code="I10"]')).toBeVisible();
  await expect(page.locator('#icdComparisonSummary')).toContainText('Degë të ndryshme ICD-10');
});

test('a compared code can be transferred explicitly as a secondary diagnosis', async ({ page }) => {
  await page.goto(`${BASE}/icd.html?code=A00.1`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page);
  await waitForActiveCode(page, 'A00.1');

  await page.locator('[data-mi-icd-compare-active]').click();
  await expect(page.locator('[data-comparison-code="A00.1"]')).toBeVisible();
  await page.locator('[data-mi-icd-comparison-secondary="A00.1"]').click();

  await page.waitForURL(/\/recetat\.html\?from=icd-secondary/);
  await expect(page.locator('html')).toHaveClass(/auth-ready/);
  await expect(page.locator('html')).toHaveAttribute('data-mi-icd-problem-list', 'icd-problem-list-v1');
  await expect(page.locator('[data-problem-code="A00.1"]')).toBeVisible();
});

test('three comparison cards remain bounded and collapsible on a phone viewport', async ({ page }) => {
  await page.addInitScript(key => {
    sessionStorage.setItem(key, JSON.stringify({ version:1, codes:['A00', 'A00.0', 'A00.1'] }));
  }, STORAGE_KEY);
  await page.setViewportSize({ width:390, height:844 });
  await page.goto(`${BASE}/icd.html?code=A00.0`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page);
  await expect(page.locator('.icd-comparison-card')).toHaveCount(3);

  const geometry = await page.locator('#icdComparisonPanel').evaluate(node => {
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

  await page.locator('[data-mi-icd-comparison-toggle]').click();
  await expect(page.locator('#icdComparisonBody')).toBeHidden();
  await expect(page.locator('[data-mi-icd-comparison-toggle]')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('[data-mi-icd-comparison-toggle]').click();
  await expect(page.locator('#icdComparisonBody')).toBeVisible();
  await page.screenshot({ path:path.join(OUTPUT, 'icd-code-comparison-mobile.png'), fullPage:true });
});