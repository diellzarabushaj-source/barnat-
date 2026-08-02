const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-visual';
const PRIMARY_KEY = 'medindex_rx_diagnosis_context_v2';
const DRAFT_KEY = 'medindex_rx_problem_list_draft_v1';
const RECENT_KEY = 'medindex_icd_recent_diagnoses_v1';
fs.mkdirSync(OUTPUT, { recursive:true });
test.describe.configure({ mode:'serial' });

const context = (code, titleSq, level = 'category', index = 0) => ({
  version:2,
  system:'ICD-10-WHO 2019',
  source:'medindex-icd-browser',
  code,
  level,
  titleSq,
  titleEn:titleSq,
  translationStatus:'standardized',
  sourceUrl:`https://icd.who.int/browse10/2019/en#/${code}`,
  childCount:0,
  selectedAt:Date.now() - index * 1000,
});

async function waitForPrescription(page) {
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-prescription-icd', 'icd-context-v2');
  await expect(html).toHaveAttribute('data-mi-icd-problem-list', 'icd-problem-list-v1');
}

async function waitForIcd(page) {
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-icd-tree', 'ready');
  await expect(html).toHaveAttribute('data-mi-icd-problem-list', 'icd-problem-list-v1');
}

test('primary diagnosis stays unique while a secondary diagnosis can be promoted explicitly', async ({ page }) => {
  const primary = context('I10', 'Hipertensioni esencial (primar)');
  const problemItems = [
    primary,
    context('E11', 'Diabet mellitus tipi 2'),
    context('J45', 'Astma'),
  ];
  await page.addInitScript(({ primaryKey, draftKey, primaryValue, values }) => {
    sessionStorage.setItem(primaryKey, JSON.stringify({ ...primaryValue, selectedAt:Date.now() }));
    localStorage.setItem(draftKey, JSON.stringify({ version:1, savedAt:Date.now(), items:values.map((item, index) => ({ ...item, selectedAt:Date.now() - index })) }));
  }, { primaryKey:PRIMARY_KEY, draftKey:DRAFT_KEY, primaryValue:primary, values:problemItems });

  await page.setViewportSize({ width:1280, height:900 });
  await page.goto(`${BASE}/recetat.html`, { waitUntil:'domcontentloaded' });
  await waitForPrescription(page);

  await expect(page.locator('#rxDiagnosis')).toHaveValue(/^I10 — /);
  await expect(page.locator('#rxIcdProblemList')).toBeVisible();
  await expect(page.locator('.rx-icd-problem-item')).toHaveCount(2);
  await expect(page.locator('[data-problem-code="I10"]')).toHaveCount(0);

  await page.locator('[data-mi-problem-promote="E11"]').click();
  await expect(page.locator('#rxDiagnosis')).toHaveValue(/^E11 — /);
  await expect(page.locator('[data-problem-code="E11"]')).toHaveCount(0);
  await expect(page.locator('[data-problem-code="I10"]')).toBeVisible();
  await expect(page.locator('#rxStatus')).toContainText('E11 u bë diagnoza kryesore');

  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), DRAFT_KEY);
  expect(stored.items.map(item => item.code)).toEqual(['I10', 'J45']);
  await page.screenshot({ path:path.join(OUTPUT, 'icd-problem-list-desktop.png'), fullPage:true });
});

test('ICD detail sends a category to the prescription as a secondary diagnosis', async ({ page }) => {
  await page.setViewportSize({ width:1280, height:900 });
  await page.goto(`${BASE}/icd.html?return=recetat`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('medindex:icd-open-detail', { detail:{ code:'A00' } }));
  });
  await expect(page.locator('#detailOverlay')).toBeVisible();
  await expect(page.locator('#icdAddSecondaryDiagnosis')).toBeVisible();
  await page.locator('#icdAddSecondaryDiagnosis').click();

  await page.waitForURL(/\/recetat\.html\?from=icd-secondary/);
  await waitForPrescription(page);
  await expect(page.locator('#rxIcdProblemList')).toBeVisible();
  await expect(page.locator('[data-problem-code="A00"]')).toContainText('A00');
  await expect(page.locator('#rxStatus')).toContainText('A00 u shtua si diagnozë shoqëruese');
});

test('recent diagnosis buttons stay paired with their visible code after primary filtering', async ({ page }) => {
  const primary = context('I10', 'Hipertensioni esencial (primar)');
  const recent = [
    primary,
    context('E11', 'Diabet mellitus tipi 2', 'category', 1),
    context('J45', 'Astma', 'category', 2),
  ];
  await page.addInitScript(({ primaryKey, recentKey, primaryValue, values }) => {
    sessionStorage.setItem(primaryKey, JSON.stringify({ ...primaryValue, selectedAt:Date.now() }));
    localStorage.setItem(recentKey, JSON.stringify(values.map((item, index) => ({ ...item, selectedAt:Date.now() - index * 1000 }))));
  }, { primaryKey:PRIMARY_KEY, recentKey:RECENT_KEY, primaryValue:primary, values:recent });

  await page.goto(`${BASE}/recetat.html`, { waitUntil:'domcontentloaded' });
  await waitForPrescription(page);
  await expect(page.locator('#rxIcdRecent')).toBeVisible();

  const pairs = await page.locator('#rxIcdRecent .rx-icd-recent-item').evaluateAll(nodes => nodes.map(node => ({
    code:node.querySelector('.rx-icd-recent-code')?.textContent.trim(),
    secondary:node.querySelector('[data-mi-recent-secondary]')?.dataset.miRecentSecondary || '',
    hidden:Boolean(node.querySelector('[data-mi-recent-secondary]')?.hidden),
  })));
  expect(pairs).toEqual([
    { code:'I10', secondary:'I10', hidden:true },
    { code:'E11', secondary:'E11', hidden:false },
    { code:'J45', secondary:'J45', hidden:false },
  ]);

  await page.locator('[data-mi-recent-secondary="E11"]').click();
  await expect(page.locator('[data-problem-code="E11"]')).toBeVisible();
  await expect(page.locator('[data-problem-code="I10"]')).toHaveCount(0);
});

test('secondary diagnoses stay bounded and fit a phone viewport', async ({ page }) => {
  const values = [
    context('I10', 'Hipertensioni esencial'),
    context('E11', 'Diabet mellitus tipi 2'),
    context('J45', 'Astma'),
    context('N39', 'Çrregullime të tjera të sistemit urinar'),
    context('M54', 'Dorsalgjia'),
    context('K76', 'Sëmundje të tjera të mëlçisë'),
    context('R51', 'Dhimbje koke'),
  ];
  await page.addInitScript(({ key, items }) => {
    localStorage.setItem(key, JSON.stringify({
      version:1,
      savedAt:Date.now(),
      items:items.map((item, index) => ({ ...item, selectedAt:Date.now() - index })),
    }));
  }, { key:DRAFT_KEY, items:values });

  await page.setViewportSize({ width:390, height:844 });
  await page.goto(`${BASE}/recetat.html`, { waitUntil:'domcontentloaded' });
  await waitForPrescription(page);

  const list = page.locator('#rxIcdProblemList');
  await expect(list).toBeVisible();
  await expect(page.locator('.rx-icd-problem-item')).toHaveCount(5);
  const geometry = await list.evaluate(node => {
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

  await page.locator('[data-mi-problem-remove="I10"]').click();
  await expect(page.locator('.rx-icd-problem-item')).toHaveCount(4);
  await page.locator('[data-mi-problem-clear]').click();
  await expect(list).toBeHidden();
  await page.screenshot({ path:path.join(OUTPUT, 'icd-problem-list-mobile.png'), fullPage:true });
});
