const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-clinical-guidance';
const SHEET_ID = '19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw';
fs.mkdirSync(OUTPUT, { recursive:true });
test.describe.configure({ mode:'serial' });

function clinicalPayload(entries, source = 'Google Sheet i dhënë nga përdoruesi') {
  return {
    ok:true,
    data:{
      source,
      sourceSpreadsheetId:SHEET_ID,
      version:'ICD-10-WHO 2019',
      counts:{ total:701, familyMedicine:701, emergency:648, critical:247 },
      entries,
    },
  };
}

async function mockClinicalDataset(page, entries, options = {}) {
  let requests = 0;
  let blocked = Boolean(options.blockUntilRecovery);
  await page.route('**/api/icd*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/icd' && !url.search) {
      requests += 1;
      if (options.fail || blocked || (options.failOnce && requests === 1)) {
        await route.fulfill({ status:503, contentType:'application/json', body:JSON.stringify({ ok:false, data:null }) });
        return;
      }
      await route.fulfill({
        status:200,
        headers:{
          'content-type':'application/json; charset=utf-8',
          'x-medindex-data-source':options.dataSource || 'sheets',
        },
        body:JSON.stringify(clinicalPayload(entries)),
      });
      return;
    }
    await route.fallback();
  });
  return {
    requests:() => requests,
    allowRecovery:() => { blocked = false; },
  };
}

async function waitForIcd(page, code) {
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-icd-tree', 'ready');
  await expect(html).toHaveAttribute('data-mi-icd-coding-workspace', 'icd-coding-workspace-v1');
  await expect(html).toHaveAttribute('data-mi-icd-clinical-guidance', 'icd-clinical-guidance-v1');
  await expect(html).toHaveAttribute('data-mi-icd-clinical-guidance-recovery', 'icd-clinical-guidance-recovery-v3');
  await expect(page.locator('#icdCodingWorkspaceCode')).toHaveText(code);
}

test('critical emergency context comes from the curated Google Sheet and does not fabricate official notes', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable:true,
      value:{ writeText:async value => { window.__clinicalGuidanceClipboard = value; } },
    });
  });
  await mockClinicalDataset(page, [{
    code:'A41',
    title:'Sepsa tjetër',
    englishTitle:'Other sepsis',
    chapter:'I',
    group:'Infeksionet bakteriale sistemike dhe të transmetueshme',
    primaryCare:'Themelor',
    emergency:'Kritik',
    priority:'1 – Thelbësor / urgjent',
    summary:'Përdoret për dokumentimin dhe klasifikimin e sepsës tjetër.',
    warning:'Gjendje potencialisht kërcënuese për jetën; kërkon vlerësim dhe stabilizim urgjent.',
    keywords:['A41', 'sepsë', 'shok septik', 'infeksion sistemik'],
    codingNotes:['Kod i kategorisë ICD-10 me tre karaktere; kontrollo nënkategorinë më specifike.'],
    sourceUrl:'https://icd.who.int/browse10/2019/en#/A41',
    isFamilyMedicine:true,
    isEmergency:true,
    isCritical:true,
  }]);

  await page.setViewportSize({ width:1360, height:1000 });
  await page.goto(`${BASE}/icd.html?code=A41`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page, 'A41');

  const panel = page.locator('#icdClinicalGuidance');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-context', 'exact');
  await expect(panel).toHaveAttribute('data-tone', 'critical');
  await expect(page.locator('#icdClinicalGuidanceFamily')).toHaveText('Themelor');
  await expect(page.locator('#icdClinicalGuidanceEmergency')).toHaveText('Kritik');
  await expect(page.locator('#icdClinicalGuidancePriority')).toContainText('1 – Thelbësor');
  await expect(page.locator('#icdClinicalGuidanceWarningTitle')).toHaveText('Gjendje potencialisht kritike');
  await expect(page.locator('#icdClinicalGuidanceWarningText')).toContainText('stabilizim urgjent');
  await expect(page.locator('#icdClinicalGuidanceOfficialContent')).toContainText('Nuk janë të disponueshme në burimin aktual');
  await expect(page.locator('#icdClinicalGuidanceOfficialContent')).toContainText('nuk fabrikon');
  await expect(page.locator('#icdClinicalGuidanceSource')).toHaveText('Google Sheet klinik · drejtpërdrejt');
  await expect(page.locator('#icdClinicalGuidanceSourceLink')).toBeVisible();

  await page.locator('[data-mi-icd-clinical-copy]').click();
  const copied = await page.evaluate(() => window.__clinicalGuidanceClipboard || '');
  expect(copied).toContain('KONTEKST KLINIK ICD-10-WHO 2019');
  expect(copied).toContain('Urgjencë: Kritik');
  expect(copied).toContain('nuk janë të disponueshme në burimin aktual');
  expect(copied).not.toMatch(/sourceSpreadsheetId|dataSource|selectedAt|patient|sessionStorage/i);
  await page.screenshot({ path:path.join(OUTPUT, 'critical-a41-desktop.png'), fullPage:true });
});

test('subcategory inherits only its category context and the clinical dataset is fetched once', async ({ page }) => {
  const control = await mockClinicalDataset(page, [
    {
      code:'A00',
      title:'Kolera',
      primaryCare:'E dobishme',
      emergency:'Shumë i rëndësishëm',
      priority:'2 – I rëndësishëm',
      summary:'Përdoret për dokumentimin dhe klasifikimin e kolerës.',
      warning:'Mund të kërkojë vlerësim urgjent, varësisht shenjave vitale dhe komplikimeve.',
      codingNotes:['Kontrollo nënkategorinë më specifike.'],
      keywords:['kolera', 'diarre ujore', 'dehidrim'],
    },
    {
      code:'I10',
      title:'Hipertensioni esencial (primar)',
      primaryCare:'Themelor',
      emergency:'Shumë i rëndësishëm',
      priority:'1 – Thelbësor / urgjent',
      summary:'Kod kryesor për dokumentimin e hipertensionit esencial.',
      warning:'Vlerëso shenjat e dëmtimit akut të organeve target.',
      codingNotes:['Përdor nënkod ose kod të kombinuar kur dokumentacioni e kërkon.'],
    },
  ]);

  await page.goto(`${BASE}/icd.html?code=A00.0`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page, 'A00.0');
  await expect(page.locator('#icdClinicalGuidance')).toHaveAttribute('data-context', 'inherited');
  await expect(page.locator('#icdClinicalGuidanceInheritance')).toContainText('Kontekst i trashëguar nga A00');
  await expect(page.locator('#icdClinicalGuidanceInheritance')).toContainText('A00.0 nuk ka rresht të veçantë');
  await expect(page.locator('#icdClinicalGuidanceCodingNotes')).toContainText('verifiko nënkodin A00.0');
  expect(control.requests()).toBe(1);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('medindex:icd-state', { detail:{ code:'I10' } }));
  });
  await expect(page.locator('#icdClinicalGuidanceFamily')).toHaveText('Themelor');
  await expect(page.locator('#icdClinicalGuidanceEmergency')).toHaveText('Shumë i rëndësishëm');
  await expect(page.locator('#icdClinicalGuidance')).toHaveAttribute('data-context', 'exact');
  expect(control.requests()).toBe(1);
});

test('an uncurated code receives no invented family-medicine or emergency priority', async ({ page }) => {
  await mockClinicalDataset(page, [{
    code:'I10',
    title:'Hipertensioni esencial (primar)',
    primaryCare:'Themelor',
    emergency:'Shumë i rëndësishëm',
    priority:'1 – Thelbësor / urgjent',
  }]);

  await page.goto(`${BASE}/icd.html?code=A00.0`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page, 'A00.0');
  await expect(page.locator('#icdClinicalGuidanceEmpty')).toContainText('A00.0 nuk është në setin e përzgjedhur');
  await expect(page.locator('#icdClinicalGuidanceEmpty')).toContainText('nuk i cakton prioritet klinik pa të dhëna burimore');
  await expect(page.locator('#icdClinicalGuidanceContent')).toBeHidden();
  await expect(page.locator('#icdCodingWorkspaceContent')).toBeVisible();
});

test('clinical source failure exposes recovery and leaves the ICD workspace usable', async ({ page }) => {
  const control = await mockClinicalDataset(page, [{
    code:'I10',
    title:'Hipertensioni esencial (primar)',
    primaryCare:'Themelor',
    emergency:'Shumë i rëndësishëm',
    priority:'1 – Thelbësor / urgjent',
    warning:'Vlerëso shenjat e dëmtimit akut të organeve target.',
  }], { blockUntilRecovery:true });

  await page.goto(`${BASE}/icd.html?code=I10`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page, 'I10');
  await expect(page.locator('#icdClinicalGuidanceState')).toHaveAttribute('data-tone', 'error', { timeout:15000 });
  await expect(page.locator('#icdClinicalGuidanceEmpty')).toContainText('Konteksti klinik nuk u ngarkua');
  await expect(page.locator('[data-mi-icd-clinical-retry-visible]')).toBeVisible();
  await expect(page.locator('#icdCodingWorkspaceContent')).toBeVisible();
  await expect(page.locator('#icdCodingWorkspaceCode')).toHaveText('I10');

  control.allowRecovery();
  await Promise.all([
    page.waitForNavigation({ waitUntil:'domcontentloaded' }),
    page.locator('[data-mi-icd-clinical-retry-visible]').click(),
  ]);
  await waitForIcd(page, 'I10');
  await expect(page.locator('#icdClinicalGuidanceContent')).toBeVisible({ timeout:15000 });
  await expect(page.locator('#icdClinicalGuidanceFamily')).toHaveText('Themelor');
  await expect(page.locator('[data-mi-icd-clinical-retry-visible]')).toHaveCount(0);
  await expect(page.locator('#icdCodingWorkspaceCode')).toHaveText('I10');
  expect(control.requests()).toBeGreaterThanOrEqual(2);
});

test('long MF and emergency guidance remains bounded on a phone viewport', async ({ page }) => {
  await mockClinicalDataset(page, [{
    code:'I10',
    title:'Hipertensioni esencial (primar)',
    primaryCare:'Themelor',
    emergency:'Shumë i rëndësishëm',
    priority:'1 – Thelbësor / urgjent',
    summary:'Përdoret për dokumentimin e hipertensionit esencial dhe për dallimin nga sëmundja hipertensive e zemrës ose e veshkave kur dokumentacioni klinik mbështet një kod të kombinuar më specifik.',
    warning:'Vlerëso menjëherë shenjat e dëmtimit akut të organeve target, simptomat neurologjike, dhimbjen e gjoksit, dispnenë dhe ndryshimet e vetëdijes.',
    keywords:['hipertension', 'tension i lartë', 'organ target', 'dhimbje gjoksi', 'dispne', 'neurologji'],
    codingNotes:['Kontrollo nëse dokumentacioni mbështet I11, I12 ose një nënkod tjetër më specifik para kodimit përfundimtar.'],
  }]);

  await page.setViewportSize({ width:390, height:844 });
  await page.goto(`${BASE}/icd.html?code=I10`, { waitUntil:'domcontentloaded' });
  await waitForIcd(page, 'I10');
  await expect(page.locator('#icdClinicalGuidanceContent')).toBeVisible();

  const geometry = await page.locator('#icdClinicalGuidance').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {
      left:rect.left,
      right:rect.right,
      viewport:innerWidth,
      documentWidth:document.documentElement.scrollWidth,
      buttonWidths:[...node.querySelectorAll('button,a')].map(item => item.getBoundingClientRect().width),
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.buttonWidths.every(width => width <= geometry.viewport)).toBe(true);
  await page.screenshot({ path:path.join(OUTPUT, 'i10-mobile.png'), fullPage:true });
});
