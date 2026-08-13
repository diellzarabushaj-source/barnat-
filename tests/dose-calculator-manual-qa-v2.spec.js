const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const BASE = 'http://127.0.0.1:4173/index.html';
const OUT = '/tmp/dose-manual-qa';
fs.mkdirSync(OUT, { recursive:true });
test.use({ serviceWorkers:'block' });

const officialSource = {
  key:'SRC-QA', name:'SmPC zyrtare — QA', publisher:'Autoriteti zyrtar', type:'smPC',
  url:'https://example.test/smpc', documentDate:'2026-01-01', accessedDate:'2026-08-05',
  sectionPage:'4.2', official:true,
};

function makeRule({ key, indication, group, dose, minAge, maxAge = null, template, times = 1 }) {
  return {
    ruleKey:key, indicationKey:`IND-${key}`, indicationName:indication, icdCode:'Z00.0', patientGroup:group,
    calculationMethod:'fixed_dose', doseMinValue:dose, doseMaxValue:dose, doseUnit:'mg', doseBasis:'per_dose',
    weightBasis:'none', frequencyMode:times === 1 ? 'once' : 'times_per_day', intervalMinHours:null,
    intervalMaxHours:null, timesPerDay:times, maxSingleDoseMg:dose, maxDailyDoseMg:dose * times,
    maxDoses24h:times, durationMode:'range_days', durationMinDays:3, durationMaxDays:3,
    reviewAfterDays:null, minAgeMonths:minAge, maxAgeMonths:maxAge, minWeightKg:null, maxWeightKg:null,
    route:'PO', prn:false, renalAdjustmentRequired:false, specialistOnly:false, outOfRangeAction:'block',
    sourceSection:'4.2', verifiedBy:'Clinical QA', verifiedAt:'2026-08-05T12:00:00Z',
    clinicalNotes:'Kontrollo kundërindikacionet.',
    plainLanguageTemplate:template || 'Jep {quantity} ({dose}) nga goja, {frequency}, për 3 ditë.', versionNo:1,
    conversion:{ enabled:true, tabletSplitAllowed:false, roundingIncrementValue:null, roundingIncrementUnit:null, status:'automatic' },
    source:officialSource,
  };
}

function makeProduct({ key, number, pdid, name, substance, group, dose, unit, form, rule }) {
  return {
    productKey:key, drugId:`drug-${key}`, registryNumber:String(number), pdid:String(pdid), tradeName:name,
    activeSubstance:substance, atcCode:'A00AA00', pharmaceuticalForm:form, route:'PO', patientGroup:group,
    numeratorValue:dose, numeratorUnit:'mg', denominatorValue:1, denominatorUnit:unit,
    displayLabel:`${name} — ${dose} mg — ${form}`, tabletSplitDenominator:1, isScored:false,
    measurableIncrementMl:null, roundingMode:'exact', versionNo:1, rules:[rule],
  };
}

const catalog = [
  makeProduct({
    key:'PROD-ADULT', number:1, pdid:1001, name:'PARACETAMOL TEST', substance:'Paracetamol',
    group:'adult_only', dose:500, unit:'tablet', form:'Tabletë',
    rule:makeRule({ key:'ADULT', indication:'Dhimbje / temperaturë', group:'adult_only', dose:500,
      minAge:216, times:3, template:'Jep {quantity} ({dose}) nga goja, {frequency}, për 3 ditë.' }),
  }),
  makeProduct({
    key:'PROD-ALL', number:2, pdid:1002, name:'AMOXICILLIN TEST', substance:'Amoxicillin',
    group:'pediatric_and_adult', dose:500, unit:'capsule', form:'Kapsulë',
    rule:makeRule({ key:'ALL', indication:'Infeksion bakterial — QA', group:'pediatric_and_adult', dose:500,
      minAge:144, times:3, template:'Jep {quantity} ({dose}) nga goja, {frequency}, për 3 ditë.' }),
  }),
  makeProduct({
    key:'PROD-PED', number:3, pdid:1003, name:'ONCEAIR PEDIATRIC CHEWABLE TABLETS WITH EXTENDED DISPLAY NAME',
    substance:'Montelukast', group:'pediatric_only', dose:4, unit:'tablet', form:'Tabletë përtypëse',
    rule:makeRule({ key:'PED', indication:'Astmë pediatrike — QA', group:'pediatric_only', dose:4,
      minAge:24, maxAge:215, template:'Jep {quantity} përtypëse ({dose}) nga goja, {frequency}.' }),
  }),
];

const safePayload = {
  ok:true,
  meta:{ schemaVersion:'2.0.0', failClosed:true, officialVerifiedOnly:true, generatedAt:'2026-08-05T12:00:00Z' },
  catalog,
};

const safetyPayload = {
  ok:true,
  meta:{
    schemaVersion:'2.0.0',
    failClosed:true,
    officialVerifiedOnly:true,
    publishedOnly:true,
    coverageRequired:true,
    generatedAt:'2026-08-05T12:00:00Z',
  },
  catalog:catalog.map(product => ({
    productKey:product.productKey,
    coverageVerified:true,
    coverageReason:'',
    requiresManualGate:false,
    safety:[],
  })),
};

async function mockCatalog(page, payload = safePayload) {
  await page.route('**/api/dose-calculator', route => route.fulfill({
    status:200, contentType:'application/json; charset=utf-8', body:JSON.stringify(payload),
  }));
}

async function mockSafety(page, payload = safetyPayload) {
  await page.route('**/api/dosage?view=safety*', route => route.fulfill({
    status:200, contentType:'application/json; charset=utf-8', body:JSON.stringify(payload),
  }));
}

async function openRegistry(page, payload = safePayload) {
  await mockCatalog(page, payload);
  await mockSafety(page);
  await page.goto(BASE, { waitUntil:'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('auth-ready')), { timeout:10000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.MedIndexDoseCalculator?.catalogStatus?.() || 'loading'), { timeout:15000 }).toBe('ready');
  await expect.poll(() => page.evaluate(() => window.MedIndexDoseSafety?.status?.() || 'loading'), { timeout:15000 }).toBe('ready');
  await expect.poll(() => page.locator('#tbody > tr').count(), { timeout:15000 }).toBe(3);
  await expect.poll(() => page.locator('#tbody .dose-calculator-open').count(), { timeout:15000 }).toBe(3);
}

const rowFor = (page, text) => page.locator('#tbody > tr').filter({ hasText:text }).first();

test('desktop physician flow: table, filter, calculation, safety and keyboard', async ({ page }) => {
  await page.setViewportSize({ width:1440, height:900 });
  await openRegistry(page);

  const rows = page.locator('#tbody > tr');
  const header = page.locator('#headerRow [data-registry-dose-calculator-column="dose-calculator"]');
  await expect(rows).toHaveCount(3);
  await expect(header).toHaveAttribute('data-dose-header-meta', '3 në këtë faqe');
  await expect(page.locator('#doseCalculatorModal')).toHaveCount(1);
  expect(await rows.evaluateAll(list => list.map(row => row.querySelectorAll('[data-registry-dose-calculator-column="dose-calculator"]').length))).toEqual([1,1,1]);
  const nameContract = await rows.evaluateAll(list => list.map(row => ({
    text:row.querySelector('.drug-name-text')?.textContent || '',
    name:row.dataset.drugName || '',
    action:row.querySelector('.drug-actions-trigger')?.getAttribute('aria-label') || '',
    details:row.querySelector('.registry-row-details-toggle')?.getAttribute('aria-label') || '',
  })));
  nameContract.flatMap(item => Object.values(item)).forEach(value => {
    expect(value).not.toMatch(/(?:Shiko|Mbyll) detajet.*(?:Shiko|Mbyll) detajet/);
  });
  nameContract.forEach(item => {
    expect(item.text).not.toMatch(/(?:Shiko|Mbyll) detajet/);
    expect(item.name).not.toMatch(/(?:Shiko|Mbyll) detajet/);
  });

  const engineContract = await page.evaluate(() => {
    const engine = window.MedIndexDoseCalculator._test;
    const product = {
      numeratorValue:100, numeratorUnit:'mg', denominatorValue:1, denominatorUnit:'tablet',
      tabletSplitDenominator:1, measurableIncrementMl:null, roundingMode:'exact',
    };
    const conversion = { enabled:true, status:'automatic', tabletSplitAllowed:false };
    const daily = engine.computeDose({
      calculationMethod:'fixed_dose', doseMinValue:1200, doseMaxValue:1200, doseUnit:'mg',
      doseBasis:'per_day', frequencyMode:'times_per_day', timesPerDay:3,
      maxDailyDoseMg:1200, conversion,
    }, product, null);
    const interval = engine.computeDose({
      calculationMethod:'fixed_dose', doseMinValue:600, doseMaxValue:600, doseUnit:'mg',
      doseBasis:'per_dose', frequencyMode:'interval', intervalMinHours:4, maxDoses24h:6,
      maxDailyDoseMg:3000, conversion,
    }, product, null);
    const alias = engine.computeDose({
      calculationMethod:'fixed_dose', doseMinValue:500, doseMaxValue:500, doseUnit:'µg',
      doseBasis:'per_dose', frequencyMode:'once', conversion,
    }, { ...product, numeratorValue:0.5, numeratorUnit:'mg' }, null);
    return {
      dailyDose:daily.doseMin,
      intervalDose:interval.doseMin,
      aliasQuantity:alias.quantityMin,
      childBlocked:engine.ageMatchesRule({ patientGroup:'adult_only', minAgeMonths:null, maxAgeMonths:null }, 120),
      adultAllowed:engine.ageMatchesRule({ patientGroup:'adult_only', minAgeMonths:null, maxAgeMonths:null }, 300),
      preferred:engine.preferredUnique([{ ruleKey:'A' }, { ruleKey:'B', preferred:true }])[0].ruleKey,
      staticTemplate:engine.renderPlainLanguageTemplate('Jep një tabletë.', { quantity:'1 tabletë' }),
      computedTemplate:engine.renderPlainLanguageTemplate('Jep {quantity} ({dose}).', { quantity:'1 tabletë', dose:'500 mg' }),
    };
  });
  expect(engineContract).toEqual({
    dailyDose:400,
    intervalDose:500,
    aliasQuantity:1,
    childBlocked:false,
    adultAllowed:true,
    preferred:'B',
    staticTemplate:'',
    computedTemplate:'Jep 1 tabletë (500 mg).',
  });

  const adultRow = rowFor(page, 'PARACETAMOL TEST');
  const adultButton = adultRow.locator('.dose-calculator-open');
  await expect(adultButton).toHaveText('Kalkulo dozën');
  expect(await adultRow.locator('[data-registry-dose-calculator-column="dose-calculator"]').evaluate(node => getComputedStyle(node).position)).toBe('sticky');
  expect(await adultButton.evaluate(node => getComputedStyle(node, '::after').content.replace(/^['"]|['"]$/g, ''))).toBe('Kalkulo');

  const search = page.locator('#search');
  for (let i = 0; i < 4; i += 1) {
    await search.fill('PARACETAMOL');
    await expect(page.locator('#tbody > tr:visible')).toHaveCount(1);
    await search.fill('');
    await expect(page.locator('#tbody > tr:visible')).toHaveCount(3);
    await expect(page.locator('#tbody .dose-calculator-open')).toHaveCount(3);
  }
  await page.screenshot({ path:`${OUT}/desktop-table.png` });

  await adultButton.click();
  const modal = page.locator('#doseCalculatorModal');
  const age = modal.locator('[data-dose-age]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('[data-dose-weight]')).toBeDisabled();
  await age.fill('30');
  await expect(modal.locator('[data-dose-result-text]')).toContainText('Jep 1 tabletë (500 mg)');
  await modal.locator('summary').click();
  await expect(modal.locator('[data-dose-details]')).toContainText('Doza zyrtare:');
  await expect(modal.locator('[data-dose-details] a')).toHaveAttribute('href', officialSource.url);

  await modal.getByRole('button', { name:'Pacient i ri' }).click();
  await expect(age).toHaveValue('');
  await expect(age).toBeFocused();
  await age.fill('10');
  await expect(modal.locator('[data-dose-result-text]')).toHaveText('Ky preparat nuk përdoret te fëmijët sipas burimit zyrtar. Doza nuk mund të kalkulohet.');
  await page.keyboard.press('Escape');
  await expect(adultButton).toBeFocused();

  await adultButton.press('Enter');
  const close = modal.getByRole('button', { name:'Mbyll kalkulatorin' });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.querySelector('#doseCalculatorModal').contains(document.activeElement))).toBe(true);
  await close.click();
  await expect(adultButton).toBeFocused();

  const pedButton = rowFor(page, 'ONCEAIR PEDIATRIC').locator('.dose-calculator-open');
  await pedButton.click();
  await modal.locator('[data-dose-age]').fill('30');
  await expect(modal.locator('[data-dose-result-text]')).toHaveText('Ky preparat nuk përdoret te të rriturit sipas burimit zyrtar. Doza nuk mund të kalkulohet.');
  await page.keyboard.press('Escape');

  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => ({ table:window.MedIndexDoseTableUx.metrics(), modal:window.MedIndexDoseModalAccessibility.metrics() }));
  expect(metrics.table.queuedRows).toBe(0);
  expect(metrics.table.maxRunMs).toBeLessThan(50);
  expect(metrics.modal.focusRestores).toBeGreaterThanOrEqual(3);
  expect(metrics.modal.translatedBlocks).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path:`${OUT}/desktop-result.png` });
});

test('mobile physician flow: 44px action and no modal overflow', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await openRegistry(page);
  const button = rowFor(page, 'AMOXICILLIN TEST').locator('.dose-calculator-open');
  const box = await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await button.evaluate(node => getComputedStyle(node, '::after').content.replace(/^['"]|['"]$/g, ''))).toBe('Kalkulo');
  await button.click();
  const modal = page.locator('#doseCalculatorModal');
  await modal.locator('[data-dose-age]').fill('12');
  await expect(modal.locator('[data-dose-result-text]')).toContainText('Jep 1 kapsulë (500 mg)');
  const geometry = await page.evaluate(() => {
    const box = document.querySelector('#doseCalculatorModal [role="dialog"]').getBoundingClientRect();
    return { scrollWidth:document.documentElement.scrollWidth, width:innerWidth, left:box.left, right:box.right };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  await page.screenshot({ path:`${OUT}/mobile-result.png` });
});

test('fail closed: unsafe catalog never exposes a dose button', async ({ page }) => {
  await mockCatalog(page, { ok:true, meta:{ failClosed:false, officialVerifiedOnly:false }, catalog });
  await page.goto(BASE, { waitUntil:'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.MedIndexDoseCalculator?.catalogStatus?.() || 'loading'), { timeout:15000 }).toBe('error');
  await expect(page.locator('#tbody .dose-calculator-open')).toHaveCount(0);
  await expect(page.locator('#tbody [data-registry-dose-calculator-column="dose-calculator"] .registry-dosage-muted')).toHaveCount(3);
});
