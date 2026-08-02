const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-visual';
fs.mkdirSync(OUTPUT, { recursive:true });
test.describe.configure({ mode:'serial' });

const diagnosisContext = {
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
};

async function waitForPrescription(page) {
  await expect(page.locator('html')).toHaveClass(/auth-ready/);
  await expect(page.locator('html')).toHaveAttribute('data-mi-prescription-icd', 'icd-context-v2');
  await expect(page.locator('html')).toHaveAttribute('data-mi-icd-prescription-roundtrip', 'icd-rx-roundtrip-v1');
}

async function waitForIcd(page) {
  await expect(page.locator('html')).toHaveClass(/auth-ready/);
  await expect(page.locator('html')).toHaveAttribute('data-mi-icd-tree', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-mi-icd-prescription-roundtrip', 'icd-rx-roundtrip-v1');
}

test('prescription draft survives the internal ICD round trip and return state follows code navigation', async ({ page }) => {
  await page.addInitScript(context => {
    sessionStorage.setItem('medindex_rx_diagnosis_context_v2', JSON.stringify({ ...context, selectedAt:Date.now() }));
  }, diagnosisContext);
  await page.setViewportSize({ width:1280, height:900 });
  await page.goto(`${BASE}/recetat.html`, { waitUntil:'domcontentloaded' });
  await waitForPrescription(page);

  const composerValue = 'Rp:\nTab. Paracetamol 500 mg\nSasia: Scat. No I\nS (Signatura): Nga 1 tabletë çdo 8 orë sipas nevojës.';
  await page.locator('#rxComposer').fill(composerValue);
  await expect(page.locator('#rxDiagnosis')).toHaveValue(/^A00\.1 — /);
  const internalLink = page.locator('#rxIcdContext .rx-icd-medindex-link');
  await expect(internalLink).toBeVisible();
  await internalLink.click();

  await page.waitForURL(/\/icd\.html\?[^#]*code=A00\.1[^#]*return=recetat/);
  await waitForIcd(page);
  await expect(page.locator('#icdReturnPrescription')).toBeVisible();

  const search = page.locator('#icdSearch');
  await search.fill('I10');
  await expect(page.locator('#icdSuggestions')).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page).toHaveURL(/code=I10/);
  await expect(page).toHaveURL(/return=recetat/);

  await page.locator('#icdReturnPrescription').click();
  await page.waitForURL(/\/recetat\.html\?from=icd-return/);
  await waitForPrescription(page);
  await expect(page.locator('#rxComposer')).toHaveValue(composerValue);
  await expect(page.locator('#rxDiagnosis')).toHaveValue(/^A00\.1 — /);
  await expect(page.locator('#rxIcdRecent')).toBeVisible();
  await expect(page.locator('#rxIcdRecent .rx-icd-recent-code').first()).toHaveText('A00.1');
  await page.screenshot({ path:path.join(OUTPUT, 'prescription-icd-roundtrip-desktop.png'), fullPage:true });
});

test('recent ICD diagnoses are bounded, reusable and fit a phone viewport', async ({ page }) => {
  const recent = [
    ['I10', 'Hipertensioni esencial (primar)', 'category'],
    ['E11.9', 'Diabet mellitus tipi 2 pa komplikime', 'subcategory'],
    ['J45.9', 'Astma, e paspecifikuar', 'subcategory'],
    ['R51', 'Dhimbje koke', 'category'],
    ['M54.5', 'Dhimbje e mesit', 'subcategory'],
    ['K21.9', 'Refluksi gastro-ezofageal pa ezofagit', 'subcategory'],
    ['N39.0', 'Infeksion i traktit urinar, vend i paspecifikuar', 'subcategory'],
  ].map(([code, titleSq, level], index) => ({
    version:2,
    system:'ICD-10-WHO 2019',
    source:'medindex-icd-browser',
    code,
    level,
    titleSq,
    titleEn:titleSq,
    translationStatus:'standardized',
    childCount:0,
    selectedAt:Date.now() - index * 1000,
  }));
  await page.addInitScript(items => {
    localStorage.setItem('medindex_icd_recent_diagnoses_v1', JSON.stringify(items));
  }, recent);
  await page.setViewportSize({ width:390, height:844 });
  await page.goto(`${BASE}/recetat.html`, { waitUntil:'domcontentloaded' });
  await waitForPrescription(page);

  const items = page.locator('#rxIcdRecent .rx-icd-recent-item');
  await expect(page.locator('#rxIcdRecent')).toBeVisible();
  await expect(items).toHaveCount(6);
  await page.locator('[data-mi-icd-recent-apply="0"]').click();
  await expect(page.locator('#rxDiagnosis')).toHaveValue(/^I10 — /);
  await expect(page.locator('#rxIcdContext')).toBeVisible();
  await expect(page.locator('#rxIcdContext .rx-icd-medindex-link')).toBeVisible();

  const geometry = await page.locator('#rxIcdRecent').evaluate(node => {
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
  await page.screenshot({ path:path.join(OUTPUT, 'prescription-icd-recent-mobile.png'), fullPage:true });
});
