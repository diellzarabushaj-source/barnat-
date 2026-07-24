const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers:'allow', viewport:{ width:1440, height:900 } });

const geometryOf = async (page, selectors) => page.evaluate(selectors => {
  const toObject = rect => rect ? { x:rect.x, y:rect.y, top:rect.top, right:rect.right, bottom:rect.bottom, left:rect.left, width:rect.width, height:rect.height } : null;
  return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
    const node = document.querySelector(selector);
    return [key, {
      rect:toObject(node?.getBoundingClientRect()),
      parent:node?.parentElement?.tagName || null,
      position:node ? getComputedStyle(node).position : null,
      hidden:Boolean(node?.hidden),
    }];
  }).concat([['viewport', { width:innerWidth, height:innerHeight }], ['professionalVersion', document.documentElement.dataset.miProfessionalVersion || null]]));
}, selectors);

function expectInsideViewport(item, viewport) {
  expect(item.rect.left).toBeGreaterThanOrEqual(0);
  expect(item.rect.right).toBeLessThanOrEqual(viewport.width);
  expect(item.rect.top).toBeGreaterThanOrEqual(0);
  expect(item.rect.bottom).toBeLessThanOrEqual(viewport.height);
}

test('mjeku gjen shërbimin, krijon recetë dhe vazhdon offline', async ({ page, context }) => {
  await page.goto('http://127.0.0.1:4173/index.html', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(page.locator('.mi-app-shell')).toBeVisible();
  await expect(page.locator('.mi-page-heading h1')).toHaveText('Barnat');

  const globalSearch = page.locator('#miGlobalSearch');
  await globalSearch.fill('paracetamol');
  await expect(page.locator('#miCommandPalette')).toBeVisible();
  await expect(page.locator('#miCommandPalette')).toContainText('Shto barin');
  const option = page.getByRole('option', { name:/Shto barin “paracetamol” në recetë/i });
  const paletteGeometry = await geometryOf(page, {
    input:'#miGlobalSearch', palette:'#miCommandPalette', option:'[data-command-index="2"]',
  });
  console.log(`PALETTE_GEOMETRY ${JSON.stringify(paletteGeometry)}`);
  expect(paletteGeometry.palette.parent).toBe('BODY');
  expect(paletteGeometry.palette.position).toBe('fixed');
  expectInsideViewport(paletteGeometry.option, paletteGeometry.viewport);
  await option.click();
  await page.waitForURL(/recetat\.html/);
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));

  const drugSearch = page.locator('#rxDrugSearch');
  await expect(drugSearch).toBeVisible();
  await expect(drugSearch).toHaveValue('paracetamol');
  const firstDrug = page.locator('#rxDrugResults .rx-drug-result').first();
  await expect(firstDrug).toContainText('Paracetamol', { timeout:10000 });
  const drugGeometry = await geometryOf(page, {
    picker:'#rxDrugPopover', search:'#rxDrugSearch', result:'#rxDrugResults .rx-drug-result',
  });
  console.log(`DRUG_PICKER_GEOMETRY ${JSON.stringify(drugGeometry)}`);
  expect(drugGeometry.picker.parent).toBe('BODY');
  expect(drugGeometry.picker.position).toBe('fixed');
  expectInsideViewport(drugGeometry.search, drugGeometry.viewport);
  expectInsideViewport(drugGeometry.result, drugGeometry.viewport);
  await firstDrug.click();
  await expect(page.locator('#rxComposer')).toHaveValue(/Paracetamol/i);
  await page.locator('#rxDiagnosis').fill('R51 — Dhimbje koke');
  await page.waitForTimeout(600);

  const restoredPage = await context.newPage();
  await restoredPage.goto('http://127.0.0.1:4173/recetat.html', { waitUntil:'domcontentloaded' });
  await restoredPage.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(restoredPage.locator('#rxComposer')).toHaveValue(/Paracetamol/i);
  await expect(restoredPage.locator('#rxDiagnosis')).toHaveValue(/Dhimbje koke/i);

  const dialogPromise = restoredPage.waitForEvent('dialog');
  const navigationPromise = restoredPage.goto('http://127.0.0.1:4173/icd.html', { waitUntil:'domcontentloaded' });
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.accept();
  await navigationPromise;
  await restoredPage.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(restoredPage.locator('.mi-page-heading h1')).toHaveText('ICD');
  await restoredPage.locator('[data-open-code]').first().click();
  await expect(restoredPage.locator('#detailOverlay')).toBeVisible();
  const useDiagnosis = restoredPage.getByRole('button', { name:'Përdore në recetë' });
  await expect(useDiagnosis).toBeVisible();
  await useDiagnosis.click();
  await restoredPage.waitForURL(/recetat\.html/);
  await restoredPage.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(restoredPage.locator('#rxDiagnosis')).toHaveValue(/J85/i);
  await expect(restoredPage.locator('#rxComposer')).toHaveValue(/Paracetamol/i);

  restoredPage.once('dialog', dialog => dialog.accept());
  await restoredPage.goto('http://127.0.0.1:4173/index.html', { waitUntil:'domcontentloaded' });
  await restoredPage.evaluate(() => navigator.serviceWorker.ready);
  await restoredPage.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout:15000 });
  await context.setOffline(true);
  await restoredPage.goto('http://127.0.0.1:4173/analizat.html', { waitUntil:'domcontentloaded', timeout:15000 });
  await restoredPage.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(restoredPage.locator('.mi-page-heading h1')).toHaveText('Analizat laboratorike');
  await expect(restoredPage.locator('#miOfflineStatus')).toHaveAttribute('data-state', 'offline');
  await context.setOffline(false);
});
