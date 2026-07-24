const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers:'allow', viewport:{ width:1440, height:900 } });

test('mjeku gjen shërbimin, krijon recetë dhe vazhdon offline', async ({ page, context }) => {
  await page.goto('http://127.0.0.1:4173/index.html', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(page.locator('.mi-app-shell')).toBeVisible();
  await expect(page.locator('.mi-page-heading h1')).toHaveText('Barnat');

  const globalSearch = page.locator('#miGlobalSearch');
  await globalSearch.fill('paracetamol');
  await expect(page.locator('#miCommandPalette')).toBeVisible();
  await expect(page.locator('#miCommandPalette')).toContainText('Shto barin');
  await page.getByRole('option', { name:/Shto barin “paracetamol” në recetë/i }).click();
  await page.waitForURL(/recetat\.html/);
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));

  const drugSearch = page.locator('#rxDrugSearch');
  await expect(drugSearch).toBeVisible();
  await expect(drugSearch).toHaveValue('paracetamol');
  await expect(page.locator('#rxDrugResults .rx-drug-result').first()).toContainText('Paracetamol', { timeout:10000 });
  await page.locator('#rxDrugResults .rx-drug-result').first().click();
  await expect(page.locator('#rxComposer')).toHaveValue(/Paracetamol/i);
  await page.locator('#rxDiagnosis').fill('R51 — Dhimbje koke');
  await page.waitForTimeout(600);

  const restoredPage = await context.newPage();
  await restoredPage.goto('http://127.0.0.1:4173/recetat.html', { waitUntil:'domcontentloaded' });
  await restoredPage.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(restoredPage.locator('#rxComposer')).toHaveValue(/Paracetamol/i);
  await expect(restoredPage.locator('#rxDiagnosis')).toHaveValue(/Dhimbje koke/i);

  await restoredPage.goto('http://127.0.0.1:4173/icd.html', { waitUntil:'domcontentloaded' });
  await restoredPage.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await restoredPage.locator('[data-open-code]').first().click();
  await expect(restoredPage.locator('#detailOverlay')).toBeVisible();
  const useDiagnosis = restoredPage.getByRole('button', { name:'Përdore në recetë' });
  await expect(useDiagnosis).toBeVisible();
  await useDiagnosis.click();
  await restoredPage.waitForURL(/recetat\.html/);
  await restoredPage.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(restoredPage.locator('#rxDiagnosis')).not.toHaveValue('');

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
