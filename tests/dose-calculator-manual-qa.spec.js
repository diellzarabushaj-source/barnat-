const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const BASE_URL = 'http://127.0.0.1:4173/index.html';
const QA_DIR = '/tmp/dose-manual-qa';
fs.mkdirSync(QA_DIR, { recursive:true });

test.use({ serviceWorkers:'block' });

function source(sectionPage = '4.2') {
  return {
    key:'SRC-MANUAL-QA', name:'SmPC zyrtare — test browser', publisher:'Autoriteti zyrtar',
    type:'smPC', url:'https://example.test/smpc', documentDate:'2026-01-01',
    accessedDate:'2026-08-05', sectionPage, official:true,
  };
}

function rule({
  ruleKey, indicationKey, indicationName, patientGroup, dose, doseUnit = 'mg',
  frequencyMode = 'once', intervalMinHours = null, intervalMaxHours = null,
  timesPerDay = 1, durationMinDays = 1, durationMaxDays = 1,
  minAgeMonths = null, maxAgeMonths = null, template,
}) {
  return {
    ruleKey, indicationKey, indicationName, icdCode:'Z00.0', patientGroup,
    calculationMethod:'fixed_dose', doseMinValue:dose, doseMaxValue:dose,
    doseUnit, doseBasis:'per_dose', weightBasis:'none', frequencyMode,
    intervalMinHours, intervalMaxHours, timesPerDay,
    maxSingleDoseMg:doseUnit === 'mg' ? dose : null,
    maxDailyDoseMg:doseUnit === 'mg' && timesPerDay ? dose * timesPerDay : null,
    maxDoses24h:timesPerDay, durationMode:'range_days', durationMinDays, durationMaxDays,
    reviewAfterDays:null, minAgeMonths, maxAgeMonths, minWeightKg:null, maxWeightKg:null,
    route:'PO', prn:frequencyMode === 'prn', renalAdjustmentRequired:false, specialistOnly:false,
    outOfRangeAction:'block', sourceSection:'4.2', verifiedBy:'Clinical QA',
    verifiedAt:'2026-08-05T12:00:00Z', clinicalNotes:'Kontrollo kundërindikacionet dhe terapinë shoqëruese.',
    plainLanguageTemplate:template, versionNo:1,
    conversion:{ enabled:true, tabletSplitAllowed:false, roundingIncrementValue:null, roundingIncrementUnit:null, status:'automatic' },
    source:source(),
  };
}

function product({
  productKey, registryNumber, pdid, tradeName, activeSubstance, atcCode,
  form, patientGroup, numeratorValue, denominatorUnit, displayLabel, rules,
}) {
  return {
    productKey, drugId:`drug-${productKey}`, registryNumber:String(registryNumber), pdid:String(pdid),
    tradeName, activeSubstance, atcCode, pharmaceuticalForm:form, route:'PO', patientGroup,
    numeratorValue, numeratorUnit:'mg', denominatorValue:1, denominatorUnit,
    displayLabel, tabletSplitDenominator:1, isScored:false, measurableIncrementMl:null,
    roundingMode:'exact', versionNo:1, rules,
  };
}

const catalog = [
  product({
    productKey:'PROD-QA-ADULT', registryNumber:1, pdid:1001, tradeName:'PARACETAMOL TEST',
    activeSubstance:'Paracetamol', atcCode:'N02BE01', form:'Tabletë', patientGroup:'adult_only',
    numeratorValue:500, denominatorUnit:'tablet', displayLabel:'PARACETAMOL TEST — 500 mg — Tabletë',
    rules:[rule({
      ruleKey:'RULE-QA-ADULT', indicationKey:'IND-QA-PAIN', indicationName:'Dhimbje / temperaturë',
      patientGroup:'adult_only', dose:500, frequencyMode:'interval', intervalMinHours:8,
      intervalMaxHours:8, timesPerDay:3, durationMinDays:3, durationMaxDays:3, minAgeMonths:216,
      template:'Jep 1 tabletë (500 mg) nga goja, çdo 8 orë sipas nevojës, për 3 ditë.',
    })],
  }),
  product({
    productKey:'PROD-QA-ALL', registryNumber:2, pdid:1002, tradeName:'AMOXICILLIN TEST',
    activeSubstance:'Amoxicillin', atcCode:'J01CA04', form:'Kapsulë', patientGroup:'pediatric_and_adult',
    numeratorValue:500, denominatorUnit:'capsule', displayLabel:'AMOXICILLIN TEST — 500 mg — Kapsulë',
    rules:[rule({
      ruleKey:'RULE-QA-ALL', indicationKey:'IND-QA-INFECTION', indicationName:'Infeksion bakterial — skemë testuese',
      patientGroup:'pediatric_and_adult', dose:500, frequencyMode:'times_per_day', timesPerDay:3,
      durationMinDays:5, durationMaxDays:5, minAgeMonths:144,
      template:'Jep 1 kapsulë (500 mg) nga goja, 3 herë në ditë, për 5 ditë.',
    })],
  }),
  product({
    productKey:'PROD-QA-PED', registryNumber:3, pdid:1003,
    tradeName:'ONCEAIR PEDIATRIC CHEWABLE TABLETS WITH EXTENDED DISPLAY NAME',
    activeSubstance:'Montelukast', atcCode:'R03DC03', form:'Tabletë përtypëse', patientGroup:'pediatric_only',
    numeratorValue:4, denominatorUnit:'tablet', displayLabel:'ONCEAIR PEDIATRIC — 4 mg — Tabletë përtypëse',
    rules:[rule({
      ruleKey:'RULE-QA-PED', indicationKey:'IND-QA-ASTHMA', indicationName:'Astmë pediatrike — skemë testuese',
      patientGroup:'pediatric_only', dose:4, frequencyMode:'once', timesPerDay:1,
      durationMinDays:28, durationMaxDays:28, minAgeMonths:24, maxAgeMonths:215,
      template:'Jep 1 tabletë përtypëse (4 mg) nga goja, një herë në ditë.',
    })],
  }),
];

const safePayload = {
  ok:true,
  meta:{ schemaVersion:'2.0.0', failClosed:true, officialVerifiedOnly:true, generatedAt:'2026-08-05T12:00:00Z' },
  catalog,
};

async function routeCatalog(page, payload = safePayload) {
  await page.route('**/api/dose-calculator', route => route.fulfill({
    status:200,
    contentType:'application/json; charset=utf-8',
    body:JSON.stringify(payload),
  }));
}

async function openRegistry(page, payload = safePayload) {
  await routeCatalog(page, payload);
  await page.goto(BASE_URL, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await page.waitForFunction(() => window.MedIndexDoseCalculator?.catalogStatus?.() === 'ready');
  await page.waitForFunction(() => document.querySelectorAll('#tbody > tr:not(.empty-state)').length >= 3);
  await page.waitForFunction(() => document.querySelectorAll('.dose-table-button').length === 3);
}

function rowFor(page, text) {
  return page.locator('#tbody > tr').filter({ hasText:text }).first();
}

test('desktop: tabela, filtrimi dhe modal-i punojnë si rrjedhë reale e mjekut', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin:'http://127.0.0.1:4173' });
  await page.setViewportSize({ width:1440, height:900 });
  await openRegistry(page);

  const rows = page.locator('#tbody > tr').filter({ hasNot:page.locator('.empty-state') });
  await expect(rows).toHaveCount(3);
  await expect(page.locator('#headerRow [data-registry-dose-calculator-column="dose-calculator"]')).toContainText('3 në këtë faqe');
  await expect(page.locator('.dose-table-button')).toHaveCount(3);
  await expect(page.locator('#doseCalculatorModal')).toHaveCount(1);

  const cellCounts = await rows.evaluateAll(items => items.map(row => row.querySelectorAll('[data-registry-dose-calculator-column="dose-calculator"]').length));
  expect(cellCounts).toEqual([1, 1, 1]);
  const stickyPosition = await rowFor(page, 'PARACETAMOL TEST').locator('[data-registry-dose-calculator-column="dose-calculator"]').evaluate(node => getComputedStyle(node).position);
  expect(stickyPosition).toBe('sticky');

  await page.screenshot({ path:`${QA_DIR}/desktop-table.png`, fullPage:false });

  const search = page.locator('#search');
  for (let index = 0; index < 4; index += 1) {
    await search.fill('PARACETAMOL');
    await expect(page.locator('#tbody > tr:visible')).toHaveCount(1);
    await expect(page.locator('#tbody > tr:visible [data-registry-dose-calculator-column="dose-calculator"]')).toHaveCount(1);
    await search.fill('');
    await expect(page.locator('#tbody > tr:visible')).toHaveCount(3);
    await expect(page.locator('.dose-table-button')).toHaveCount(3);
  }

  const adultRow = rowFor(page, 'PARACETAMOL TEST');
  const adultButton = adultRow.getByRole('button', { name:/Kalkulo dozën për PARACETAMOL TEST/i });
  await adultButton.click();
  const modal = page.locator('#doseCalculatorModal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('[data-dose-product-name]')).toContainText('PARACETAMOL TEST');
  await expect(modal.locator('[data-dose-weight]')).toBeDisabled();

  const age = modal.locator('[data-dose-age]');
  await age.fill('30');
  await expect(modal.locator('[data-dose-result]')).toBeVisible();
  await expect(modal.locator('[data-dose-result-text]')).toContainText('Jep 1 tabletë (500 mg)');
  await modal.locator('summary').click();
  await expect(modal.locator('[data-dose-details]')).toContainText('Doza zyrtare:');
  await expect(modal.locator('[data-dose-details] a')).toHaveAttribute('href', 'https://example.test/smpc');
  await page.screenshot({ path:`${QA_DIR}/desktop-result.png`, fullPage:false });

  const copy = modal.getByRole('button', { name:'Kopjo udhëzimin' });
  await copy.click();
  await expect(copy).toHaveText('U kopjua');

  await modal.getByRole('button', { name:'Pacient i ri' }).click();
  await expect(age).toHaveValue('');
  await expect(modal.locator('[data-dose-result]')).toBeHidden();
  await expect(age).toBeFocused();

  await age.fill('10');
  await expect(modal.locator('[data-dose-result]')).toHaveClass(/is-error/);
  await expect(modal.locator('[data-dose-result-text]')).toHaveText('Ky preparat nuk përdoret te fëmijët sipas burimit zyrtar. Doza nuk mund të kalkulohet.');

  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(adultButton).toBeFocused();

  await adultButton.press('Enter');
  await expect(modal).toBeVisible();
  const close = modal.getByRole('button', { name:'Mbyll kalkulatorin' });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.querySelector('#doseCalculatorModal')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.querySelector('#doseCalculatorModal')?.contains(document.activeElement))).toBe(true);
  await close.click();
  await expect(adultButton).toBeFocused();

  const pediatricRow = rowFor(page, 'ONCEAIR PEDIATRIC');
  const pediatricButton = pediatricRow.getByRole('button', { name:/Kalkulo dozën për ONCEAIR PEDIATRIC/i });
  await pediatricButton.click();
  await modal.locator('[data-dose-age]').fill('30');
  await expect(modal.locator('[data-dose-result-text]')).toHaveText('Ky preparat nuk përdoret te të rriturit sipas burimit zyrtar. Doza nuk mund të kalkulohet.');
  await page.keyboard.press('Escape');

  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => ({
    table:window.MedIndexDoseTableUx?.metrics?.(),
    modal:window.MedIndexDoseModalAccessibility?.metrics?.(),
  }));
  expect(metrics.table.queuedRows).toBe(0);
  expect(metrics.table.maxRunMs).toBeLessThan(50);
  expect(metrics.table.processedCells).toBeGreaterThanOrEqual(3);
  expect(metrics.modal.focusRestores).toBeGreaterThanOrEqual(3);
  expect(metrics.modal.translatedBlocks).toBeGreaterThanOrEqual(2);
});

test('mobile: butoni 44px, etiketa Doza dhe modal pa overflow', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await openRegistry(page);

  const allAgesRow = rowFor(page, 'AMOXICILLIN TEST');
  const button = allAgesRow.getByRole('button', { name:/Kalkulo dozën për AMOXICILLIN TEST/i });
  const box = await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(button.locator('.dose-table-button-label-mobile')).toBeVisible();
  await expect(button.locator('.dose-table-button-label-mobile')).toHaveText('Doza');
  await expect(button.locator('.dose-table-button-label-desktop')).toBeHidden();

  await page.screenshot({ path:`${QA_DIR}/mobile-table.png`, fullPage:false });
  await button.click();
  const modal = page.locator('#doseCalculatorModal');
  await modal.locator('[data-dose-age]').fill('12');
  await expect(modal.locator('[data-dose-result-text]')).toContainText('Jep 1 kapsulë (500 mg)');

  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector('#doseCalculatorModal [role="dialog"]')?.getBoundingClientRect();
    return {
      viewport:{ width:innerWidth, height:innerHeight },
      bodyWidth:document.documentElement.scrollWidth,
      dialog:dialog ? { left:dialog.left, right:dialog.right, top:dialog.top, bottom:dialog.bottom, width:dialog.width } : null,
    };
  });
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.dialog.left).toBeGreaterThanOrEqual(0);
  expect(geometry.dialog.right).toBeLessThanOrEqual(geometry.viewport.width);
  expect(geometry.dialog.top).toBeGreaterThanOrEqual(0);
  expect(geometry.dialog.width).toBeLessThanOrEqual(geometry.viewport.width);
  await page.screenshot({ path:`${QA_DIR}/mobile-result.png`, fullPage:false });
});

test('siguria fail-closed: katalogu jo i verifikuar nuk krijon asnjë buton', async ({ page }) => {
  const unsafePayload = {
    ok:true,
    meta:{ schemaVersion:'2.0.0', failClosed:false, officialVerifiedOnly:false },
    catalog,
  };
  await routeCatalog(page, unsafePayload);
  await page.goto(BASE_URL, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await page.waitForFunction(() => window.MedIndexDoseCalculator?.catalogStatus?.() === 'error');
  await expect(page.locator('.dose-calculator-open')).toHaveCount(0);
  await expect(page.locator('[data-registry-dose-calculator-column="dose-calculator"] .registry-dosage-muted')).toHaveCount(3);
  const labels = await page.locator('[data-registry-dose-calculator-column="dose-calculator"] .registry-dosage-muted').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  expect(labels.every(label => label === 'Nuk ka kalkulim të verifikuar')).toBe(true);
});
