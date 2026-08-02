const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/prescription-document';
const PRIMARY_KEY = 'medindex_rx_diagnosis_context_v2';
const SECONDARY_KEY = 'medindex_rx_problem_list_draft_v1';
fs.mkdirSync(OUTPUT, { recursive:true });

test.describe.configure({ mode:'serial' });

const diagnosis = (code, titleSq, level = 'category', index = 0) => ({
  version:2,
  system:'ICD-10-WHO 2019',
  source:'medindex-icd-browser',
  code,
  level,
  titleSq,
  titleEn:titleSq,
  translationStatus:'machine-draft',
  childCount:0,
  selectedAt:Date.now() - index * 1000,
});

async function seedDiagnoses(page) {
  const primary = diagnosis('I10', 'Hipertensioni esencial (primar)');
  const secondary = [
    diagnosis('E11', 'Diabet mellitus tipi 2', 'category', 1),
    diagnosis('J45', 'Astma', 'category', 2),
  ];
  await page.addInitScript(({ primaryKey, secondaryKey, primaryValue, secondaryValues }) => {
    sessionStorage.setItem(primaryKey, JSON.stringify({ ...primaryValue, selectedAt:Date.now() }));
    localStorage.setItem(secondaryKey, JSON.stringify({
      version:1,
      savedAt:Date.now(),
      items:secondaryValues.map((item, index) => ({ ...item, selectedAt:Date.now() - index * 1000 })),
    }));
  }, { primaryKey:PRIMARY_KEY, secondaryKey:SECONDARY_KEY, primaryValue:primary, secondaryValues:secondary });
}

async function openReadyPrescription(page) {
  await page.goto(`${BASE}/recetat.html`, { waitUntil:'domcontentloaded' });
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-prescription-diagnosis-document', 'prescription-diagnosis-document-v1');
  await expect(html).toHaveAttribute('data-mi-prescription-icd', 'icd-context-v2');
}

async function formatPrescription(page) {
  await page.locator('#rxComposer').fill('Tab. Enalapril 10 mg\nSasia: Scat. No I (Një kuti)\nS (Signatura): Nga 1 tabletë një herë në ditë.');
  await page.locator('#rxFormatLocal').click();
  await expect(page.locator('#rxPreview .rx-canonical-preview')).toContainText('Rp:');
  await expect(page.locator('#rxExport')).toBeEnabled();
}

test('preview, copy, TXT export and print share the same diagnosis document', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin:BASE });
  await seedDiagnoses(page);
  await page.setViewportSize({ width:1280, height:900 });
  await openReadyPrescription(page);
  await formatPrescription(page);

  const diagnoses = page.locator('#rxDiagnosisDocument');
  await expect(diagnoses).toBeVisible();
  await expect(diagnoses.locator('.rx-document-diagnosis-primary')).toContainText('I10');
  await expect(diagnoses.locator('.rx-document-diagnosis-primary')).toContainText('Hipertensioni esencial');
  await expect(diagnoses.locator('.rx-document-diagnosis-secondary li')).toHaveCount(2);
  await expect(diagnoses.locator('.rx-document-diagnosis-secondary')).toContainText('E11');
  await expect(diagnoses.locator('.rx-document-diagnosis-secondary')).toContainText('J45');

  await page.locator('#rxCopy').click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('Diagnoza kryesore:\nI10 — Hipertensioni esencial (primar)');
  expect(clipboard).toContain('Diagnozat shoqëruese:\n- E11 — Diabet mellitus tipi 2');
  expect(clipboard).toContain('Rp:\nTab. Enalapril 10 mg');
  expect(clipboard).not.toContain('machine-draft');
  expect(clipboard).not.toContain('medindex-icd-browser');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#rxExport').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('recete-2026-08-02-i10.txt');
  const downloadPath = await download.path();
  const exported = fs.readFileSync(downloadPath, 'utf8').replace(/^\uFEFF/, '');
  expect(exported).toContain('Diagnoza kryesore:\nI10 — Hipertensioni esencial (primar)');
  expect(exported).toContain('- J45 — Astma');
  expect(exported).toContain('Rp:\nTab. Enalapril 10 mg');
  expect(exported).not.toContain('translationStatus');
  expect(exported).not.toContain('selectedAt');

  const popupPromise = page.waitForEvent('popup');
  await page.locator('#rxPrint').click();
  const popup = await popupPromise;
  await expect(popup.locator('.document-head h1')).toHaveText('Recetë');
  await expect(popup.locator('.diagnosis-group.primary')).toContainText('I10');
  await expect(popup.locator('.diagnosis-group.secondary li')).toHaveCount(2);
  await expect(popup.locator('pre')).toContainText('Tab. Enalapril 10 mg');
  const printBody = await popup.locator('body').innerText();
  expect(printBody).not.toContain('machine-draft');
  expect(printBody).not.toContain('medindex-icd-browser');
  await popup.close();

  await page.screenshot({ path:path.join(OUTPUT, 'prescription-diagnosis-document-desktop.png'), fullPage:true });
});

test('diagnosis document and export controls fit a phone viewport', async ({ page }) => {
  await seedDiagnoses(page);
  await page.setViewportSize({ width:390, height:844 });
  await openReadyPrescription(page);
  await formatPrescription(page);

  const documentHost = page.locator('#rxDiagnosisDocument');
  await expect(documentHost).toBeVisible();
  await expect(page.locator('#rxExport')).toBeVisible();
  const geometry = await documentHost.evaluate(node => {
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
  await expect(page.locator('.rx-document-diagnosis-secondary li')).toHaveCount(2);
  await page.screenshot({ path:path.join(OUTPUT, 'prescription-diagnosis-document-mobile.png'), fullPage:true });
});
