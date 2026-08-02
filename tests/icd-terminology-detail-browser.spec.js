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
  await page.waitForFunction(() => document.documentElement.dataset.miIcdTree === 'ready');
  await page.waitForFunction(() => document.documentElement.dataset.miIcdTerminologyDetail === 'icd-terminology-detail-v1');
  await expect(page.locator('[data-icd-tree-node="I"]')).toBeVisible();
}

async function openA00Branch(page) {
  await page.locator('[data-tree-toggle="I"]').click();
  await expect(page.locator('[data-icd-tree-node="A00-A09"]')).toBeVisible();
  await page.locator('[data-tree-toggle="A00-A09"]').click();
  await expect(page.locator('[data-icd-tree-node="A00"]')).toBeVisible();
}

test('draft terminology is explicit and bilingual copy remains available', async ({ page }) => {
  await openIcd(page, { width:1280, height:900 });
  await openA00Branch(page);
  await page.locator('[data-icd-tree-node="A00"] [data-open-code="A00"]').click();

  const overlay = page.locator('#detailOverlay');
  const trust = page.locator('.icd-terminology-trust');
  await expect(overlay).toBeVisible();
  await expect(trust).toBeVisible();
  await expect(page.locator('#detailTranslationBadge')).toHaveText('Draft automatik');
  await expect(trust).toContainText('Kërkon rishikim terminologjik');
  await expect(trust).toContainText('Kodi ICD-10 është referenca kryesore');
  await expect(trust).toHaveAttribute('data-terminology-status', 'machine-draft');

  const copy = page.getByRole('button', { name:'Kopjo kodin + titujt' });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.locator('#detailActionStatus')).toHaveText('Kodi dhe titujt shqip/anglisht u kopjuan.');

  await page.screenshot({ path:path.join(OUTPUT, 'terminology-detail-draft-desktop.png'), fullPage:true });
});

test('missing Albanian translation is clear and fits the mobile viewport', async ({ page }) => {
  await openIcd(page, { width:390, height:844 });
  await openA00Branch(page);
  await page.locator('[data-tree-toggle="A00"]').click();
  await expect(page.locator('[data-icd-tree-node="A00.0"]')).toBeVisible();
  await page.locator('[data-icd-tree-node="A00.0"] [data-open-code="A00.0"]').click();

  const overlay = page.locator('#detailOverlay');
  const trust = page.locator('.icd-terminology-trust');
  await expect(overlay).toBeVisible();
  await expect(trust).toBeVisible();
  await expect(page.locator('#detailTranslationBadge')).toHaveText('Vetëm anglisht');
  await expect(trust).toContainText('Përkthimi shqip mungon');
  await expect(trust).toHaveClass(/is-missing/);

  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('#detailOverlay .med-panel')?.getBoundingClientRect();
    const card = document.querySelector('.icd-terminology-trust')?.getBoundingClientRect();
    return {
      viewportWidth:innerWidth,
      viewportHeight:innerHeight,
      documentWidth:document.documentElement.scrollWidth,
      panel:panel && { left:panel.left, right:panel.right, top:panel.top, bottom:panel.bottom },
      card:card && { left:card.left, right:card.right },
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.panel.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.panel.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.card.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.card.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  await page.screenshot({ path:path.join(OUTPUT, 'terminology-detail-missing-mobile.png'), fullPage:true });
});
