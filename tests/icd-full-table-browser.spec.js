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
  await page.waitForFunction(() => document.documentElement.dataset.miIcdTree === 'ready');
  await expect(page.locator('[data-icd-tree-node="I"]')).toBeVisible();
  await expect(page.locator('[data-icd-tree-node="II"]')).toBeVisible();
  await expect.poll(() => page.locator('[data-icd-tree-node][aria-level="1"]').count()).toBeGreaterThanOrEqual(2);
}

async function expandA00(page) {
  await page.locator('[data-tree-toggle="I"]').click();
  await expect(page.locator('[data-icd-tree-node="A00-A09"]')).toBeVisible();
  await page.locator('[data-tree-toggle="A00-A09"]').click();
  await expect(page.locator('[data-icd-tree-node="A00"]')).toBeVisible();
  await page.locator('[data-tree-toggle="A00"]').click();
  await expect(page.locator('[data-icd-tree-node="A00.0"]')).toBeVisible();
  await expect(page.locator('[data-icd-tree-node="A00.1"]')).toBeVisible();
  await expect(page.locator('[data-icd-tree-node="I"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-icd-tree-node="A00-A09"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-icd-tree-node="A00"]')).toHaveAttribute('aria-expanded', 'true');
}

async function assertViewport(page) {
  const report = await page.evaluate(() => {
    const panel = document.querySelector('.icd-tree-panel')?.getBoundingClientRect();
    const tree = document.querySelector('#icdTree')?.getBoundingClientRect();
    return {
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      panel:panel && { left:panel.left, right:panel.right },
      tree:tree && { left:tree.left, right:tree.right },
    };
  });
  expect(report.documentWidth).toBeLessThanOrEqual(report.viewportWidth + 2);
  expect(report.panel.left).toBeGreaterThanOrEqual(-1);
  expect(report.panel.right).toBeLessThanOrEqual(report.viewportWidth + 2);
  expect(report.tree.left).toBeGreaterThanOrEqual(-1);
  expect(report.tree.right).toBeLessThanOrEqual(report.viewportWidth + 2);
}

for (const profile of [
  { name:'desktop', width:1440, height:1000 },
  { name:'tablet', width:820, height:1180 },
  { name:'mobile', width:390, height:844 },
]) {
  test(`${profile.name} ICD hierarchy tree expands chapter, block and category`, async ({ page }) => {
    await openIcd(page, profile);
    await expandA00(page);
    await assertViewport(page);
    await page.screenshot({ path:path.join(OUTPUT, `${profile.name}-tree.png`), fullPage:true });
  });
}

test('accordion keeps one chapter branch open', async ({ page }) => {
  await openIcd(page, { width:1280, height:900 });
  await page.locator('[data-tree-toggle="I"]').click();
  await expect(page.locator('[data-icd-tree-node="I"]')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('[data-tree-toggle="II"]').click();
  await expect(page.locator('[data-icd-tree-node="II"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-icd-tree-node="I"]')).toHaveAttribute('aria-expanded', 'false');
});

test('tree detail panel and prescription action fit a phone viewport', async ({ page }) => {
  await openIcd(page, { width:390, height:844 });
  await page.locator('[data-tree-toggle="I"]').click();
  await page.locator('[data-tree-toggle="A00-A09"]').click();
  await page.locator('[data-icd-tree-node="A00"] [data-open-code="A00"]').click();
  const overlay = page.locator('#detailOverlay');
  await expect(overlay).toBeVisible();
  await expect(page.getByRole('button', { name:'Përdore në recetë' })).toBeVisible();
  const geometry = await page.evaluate(() => {
    const rect = document.querySelector('#detailOverlay .med-panel').getBoundingClientRect();
    return { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom, width:innerWidth, height:innerHeight };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
  await page.screenshot({ path:path.join(OUTPUT, 'mobile-tree-detail.png'), fullPage:true });
});

test('chapter and block levels cannot be transferred as diagnoses', async ({ page }) => {
  await openIcd(page, { width:1280, height:900 });
  await page.locator('[data-icd-tree-node="I"] [data-open-code="I"]').click();
  await expect(page.locator('#detailOverlay')).toBeVisible();
  await expect(page.getByRole('button', { name:'Përdore në recetë' })).toBeHidden();
});

test('ICD search reveals the selected code and supports keyboard navigation', async ({ page }) => {
  await openIcd(page, { width:1280, height:900 });
  const search = page.locator('#icdSearch');
  await search.fill('hipertension');
  await expect(page.locator('#icdSuggestions')).toBeVisible();
  await search.press('ArrowDown');
  await expect(page.locator('#icdSuggestions [aria-selected="true"]')).toHaveCount(1);
  await search.press('Enter');
  await expect(page).toHaveURL(/code=I10/);
  await expect(page.locator('[data-icd-tree-node="I10"] .icd-tree-row')).toHaveClass(/is-selected/);
});

test('tree keyboard arrows open and close a branch', async ({ page }) => {
  await openIcd(page, { width:1280, height:900 });
  const chapter = page.locator('[data-tree-toggle="I"]');
  await chapter.focus();
  await chapter.press('ArrowRight');
  await expect(page.locator('[data-icd-tree-node="I"]')).toHaveAttribute('aria-expanded', 'true');
  await chapter.press('ArrowLeft');
  await expect(page.locator('[data-icd-tree-node="I"]')).toHaveAttribute('aria-expanded', 'false');
});
