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
  await expect(page.locator('html')).toHaveClass(/auth-ready/);
  await expect(page.locator('.mi-app-shell')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-mi-icd-tree', 'ready');
  await expect(page.locator('[data-icd-tree-node="I"]')).toBeVisible();
  await expect(page.locator('[data-icd-tree-node="IX"]')).toBeVisible();
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
  await page.locator('[data-tree-toggle="IX"]').click();
  await expect(page.locator('[data-icd-tree-node="IX"]')).toHaveAttribute('aria-expanded', 'true');
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
  await expect(page.getByRole('button', { name:'Kopjo kodin' })).toBeVisible();
  await expect(page.locator('.icd-detail-specificity')).toContainText('nënkode direkte');
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
  await expect(page.locator('.icd-detail-specificity')).toContainText('Nivel navigues');
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

test('structured ICD diagnosis reaches the prescription and persists provenance', async ({ page }) => {
  await openIcd(page, { width:1280, height:900 });
  await page.locator('[data-tree-toggle="I"]').click();
  await page.locator('[data-tree-toggle="A00-A09"]').click();
  await page.locator('[data-icd-tree-node="A00"] [data-open-code="A00"]').click();
  await expect(page.locator('#detailOverlay')).toBeVisible();
  await page.getByRole('button', { name:'Përdore në recetë' }).click();
  await page.waitForURL(/recetat\.html\?from=icd/);
  await expect(page.locator('html')).toHaveClass(/auth-ready/);
  await expect(page.locator('html')).toHaveAttribute('data-mi-prescription-icd', 'icd-context-v2');

  const diagnosis = page.locator('#rxDiagnosis');
  await expect(diagnosis).toHaveValue(/^A00 — /);
  await expect(page.locator('#rxIcdContext')).toBeVisible();
  await expect(page.locator('#rxIcdContext .rx-icd-code')).toHaveText('A00');
  await expect(page.locator('#rxIcdContext')).toContainText('Kategori');

  await page.locator('#rxComposer').fill('Rp:\nTab. Paracetamol 500 mg\nSasia: Scat. No I\nS (Signatura): Nga 1 tabletë çdo 8 orë sipas nevojës.');
  await page.locator('#rxFormatLocal').click();
  await expect(page.locator('#rxSave')).toBeEnabled();
  await page.locator('#rxSave').click();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('regjistriBarnave_protokollet_v1') || '[]');
    return saved[0]?.diagnosisCoding?.code || '';
  })).toBe('A00');
  await expect(page.locator('.rx-icd-saved-badge')).toHaveText('A00');

  await diagnosis.fill('Diagnozë e shkruar manualisht');
  await expect(page.locator('#rxIcdContext')).toBeHidden();
  await page.waitForTimeout(260);
  await page.locator('#rxSave').click();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('regjistriBarnave_protokollet_v1') || '[]');
    return Boolean(saved[0]?.diagnosisCoding);
  })).toBe(false);
});

test('existing draft diagnosis is not overwritten until the doctor confirms', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('medindex_rx_autodraft_v1', JSON.stringify({
      version:1,
      savedAt:Date.now(),
      composer:'',
      diagnosis:'Diagnozë ekzistuese',
    }));
    sessionStorage.setItem('medindex_rx_diagnosis_context_v2', JSON.stringify({
      version:2,
      system:'ICD-10-WHO 2019',
      source:'medindex-icd-browser',
      code:'A00.1',
      level:'subcategory',
      titleSq:'Kolera për shkak të Vibrio cholerae 01, biotipi eltor',
      titleEn:'Cholera due to Vibrio cholerae 01, biovar eltor',
      translationStatus:'standardized',
      sourceUrl:'https://icd.who.int/browse10/2019/en#/A00.1',
      childCount:0,
      selectedAt:Date.now(),
    }));
  });
  await page.setViewportSize({ width:390, height:844 });
  await page.goto(`${BASE}/recetat.html`, { waitUntil:'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(/auth-ready/);
  await expect(page.locator('html')).toHaveAttribute('data-mi-prescription-icd', 'icd-context-v2');

  await expect(page.locator('#rxDiagnosis')).toHaveValue('Diagnozë ekzistuese');
  await expect(page.locator('#rxIcdContext')).toBeVisible();
  await expect(page.locator('#rxIcdContext')).toHaveClass(/is-pending/);
  await expect(page.locator('#rxIcdContext')).toContainText('nuk u mbishkrua');
  await page.getByRole('button', { name:'Apliko kodin' }).click();
  await expect(page.locator('#rxDiagnosis')).toHaveValue(/^A00\.1 — /);
  await expect(page.locator('#rxIcdContext')).not.toHaveClass(/is-pending/);
  const geometry = await page.locator('#rxIcdContext').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, width:innerWidth, documentWidth:document.documentElement.scrollWidth };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width + 1);
  await page.screenshot({ path:path.join(OUTPUT, 'mobile-prescription-icd-conflict.png'), fullPage:true });
});
