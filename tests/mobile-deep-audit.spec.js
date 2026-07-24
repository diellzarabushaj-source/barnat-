const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';
const PHONE = { width:390, height:844 };
const TABLET = { width:820, height:1180 };

const sections = [
  { path:'/index.html', heading:'Barnat', key:'#search' },
  { path:'/klasifikimi.html', heading:'Klasifikimi ATC', key:'#atcSearch' },
  { path:'/icd.html', heading:'ICD', key:'#icdSmartSearch' },
  { path:'/analizat.html', heading:'Analizat laboratorike', key:'#labSearch' },
  { path:'/dozologjia.html', heading:'Dozologjia', key:'#dosageSearch' },
  { path:'/protokollet.html', heading:'Protokollet', key:'#protocolSearch' },
  { path:'/recetat.html', heading:'Recetat', key:'#rxComposer' },
];

async function openReady(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await page.waitForFunction(() => document.documentElement.dataset.miMobileExperience === 'production-audit-v1');
  await expect(page.locator('.mi-app-shell')).toBeVisible();
}

async function viewportReport(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return { left:value.left, right:value.right, top:value.top, bottom:value.bottom, width:value.width, height:value.height };
    };
    return {
      width:innerWidth,
      height:innerHeight,
      htmlScrollWidth:document.documentElement.scrollWidth,
      bodyScrollWidth:document.body.scrollWidth,
      shell:rect('.mi-app-shell'),
      topbar:rect('.mi-topbar'),
      main:rect('.mi-main'),
      mobileVersion:document.documentElement.dataset.miMobileExperience || null,
    };
  });
}

function expectInsideViewport(rect, viewport, tolerance = 1) {
  expect(rect).not.toBeNull();
  const left = rect.left ?? rect.x;
  const top = rect.top ?? rect.y;
  const right = rect.right ?? (left + rect.width);
  const bottom = rect.bottom ?? (top + rect.height);
  expect(left).toBeGreaterThanOrEqual(-tolerance);
  expect(right).toBeLessThanOrEqual(viewport.width + tolerance);
  expect(top).toBeGreaterThanOrEqual(-tolerance);
  expect(bottom).toBeLessThanOrEqual(viewport.height + tolerance);
}

async function expectNoDocumentOverflow(page) {
  const report = await viewportReport(page);
  expect(report.mobileVersion).toBe('production-audit-v1');
  expect(report.htmlScrollWidth).toBeLessThanOrEqual(report.width + 1);
  expect(report.bodyScrollWidth).toBeLessThanOrEqual(report.width + 1);
  expectInsideViewport(report.shell, report);
  expect(report.topbar.top).toBeGreaterThanOrEqual(0);
  expect(report.topbar.right).toBeLessThanOrEqual(report.width + 1);
  expect(report.main.left).toBeGreaterThanOrEqual(0);
  expect(report.main.right).toBeLessThanOrEqual(report.width + 1);
}

async function expectTouchTarget(locator, minimum = 44) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(minimum - 0.5);
  expect(box.height).toBeGreaterThanOrEqual(minimum - 0.5);
}

async function expectDrawerCycle(page) {
  const toggle = page.locator('[data-mi-sidebar-toggle]').first();
  const sidebar = page.locator('.mi-sidebar');
  await expectTouchTarget(toggle);
  await toggle.click();
  await expect(page.locator('body')).toHaveClass(/mi-sidebar-open/);
  await expect(sidebar).toHaveAttribute('aria-hidden', 'false');
  await expect.poll(async () => (await sidebar.boundingBox())?.x ?? -999, { timeout:2000 }).toBeGreaterThanOrEqual(-1);
  const drawer = await sidebar.boundingBox();
  expectInsideViewport(drawer, { width:(await page.viewportSize()).width, height:(await page.viewportSize()).height });
  expect(drawer.width).toBeLessThanOrEqual((await page.viewportSize()).width - 43);
  expect(await page.locator('.mi-workspace').evaluate(node => node.inert)).toBe(true);
  await page.locator('[data-mi-sidebar-overlay]').click({ position:{ x:Math.max(1, (await page.viewportSize()).width - 8), y:80 } });
  await expect(page.locator('body')).not.toHaveClass(/mi-sidebar-open/);
  await expect.poll(async () => (await sidebar.boundingBox())?.right ?? -999, { timeout:2000 }).toBeLessThanOrEqual(1);
  expect(await page.locator('.mi-workspace').evaluate(node => node.inert)).toBe(false);
}

test.describe('mobile physician experience', () => {
  test.use({ serviceWorkers:'allow', viewport:PHONE, hasTouch:true });

  test('all clinical sections fit the phone viewport and expose usable controls', async ({ page }) => {
    for (const section of sections) {
      await openReady(page, section.path);
      await expect(page.locator('.mi-page-heading h1')).toHaveText(section.heading);
      await expectNoDocumentOverflow(page);

      await expectTouchTarget(page.locator('[data-mi-sidebar-toggle]').first());
      await expectTouchTarget(page.locator('[data-mi-mobile-search]').first());
      await expectTouchTarget(page.locator('.mi-topbar [data-mi-theme-toggle]').first());
      await expectTouchTarget(page.locator('.mi-primary-action').first());
      await expect(page.locator('.mi-primary-action')).toHaveAttribute('aria-label', 'Recetë e re');

      const key = page.locator(section.key).first();
      await key.scrollIntoViewIfNeeded();
      await expect(key).toBeVisible();
      const keyBox = await key.boundingBox();
      expect(keyBox.width).toBeGreaterThan(120);
      expect(keyBox.height).toBeGreaterThanOrEqual(section.key === '#rxComposer' ? 180 : 43.5);
      await expectNoDocumentOverflow(page);

      if (section.path === '/index.html') {
        const wrapper = page.locator('.table-wrap');
        await expect(wrapper).toBeVisible();
        const scrollability = await wrapper.evaluate(node => ({ scrollWidth:node.scrollWidth, clientWidth:node.clientWidth, overflowX:getComputedStyle(node).overflowX }));
        expect(scrollability.scrollWidth).toBeGreaterThan(scrollability.clientWidth);
        expect(scrollability.overflowX).toMatch(/auto|scroll/);
        await wrapper.evaluate(node => { node.scrollLeft = 180; });
        expect(await wrapper.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
      }
    }
  });

  test('drawer, dark mode, mobile search and landscape remain stable', async ({ page }) => {
    await openReady(page, '/index.html');
    await expectDrawerCycle(page);

    const theme = page.locator('.mi-topbar [data-mi-theme-toggle]').first();
    const originalTheme = await page.locator('html').getAttribute('data-theme');
    await theme.click();
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe(originalTheme);

    const searchTrigger = page.locator('[data-mi-mobile-search]').first();
    await searchTrigger.click();
    await expect(page.locator('body')).toHaveClass(/mi-mobile-search-open/);
    await expect(searchTrigger).toHaveAttribute('aria-expanded', 'true');
    const input = page.locator('#miGlobalSearch');
    await expect(input).toBeVisible();
    await input.fill('paracetamol');
    await expect(page.locator('#miCommandPalette')).toBeVisible();
    const searchGeometry = await page.evaluate(() => {
      const box = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom, width:rect.width, height:rect.height };
      };
      return { input:box('#miGlobalSearch'), palette:box('#miCommandPalette'), width:innerWidth, height:innerHeight };
    });
    expectInsideViewport(searchGeometry.input, searchGeometry);
    expectInsideViewport(searchGeometry.palette, searchGeometry);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/mi-mobile-search-open/);
    await expect(searchTrigger).toBeFocused();

    await page.setViewportSize({ width:844, height:390 });
    await page.waitForTimeout(150);
    await expectNoDocumentOverflow(page);
    await expect(page.locator('.mi-mobile-brand')).toBeHidden();
    await expectDrawerCycle(page);
  });

  test('mobile search, prescription picker, ICD dialog and offline flow stay inside the viewport', async ({ page, context }) => {
    await openReady(page, '/index.html');
    await page.locator('[data-mi-mobile-search]').click();
    await page.locator('#miGlobalSearch').fill('paracetamol');
    const addDrug = page.getByRole('option', { name:/Shto barin “paracetamol” në recetë/i });
    await expect(addDrug).toBeVisible();
    await addDrug.click();
    await page.waitForURL(/recetat\.html/);
    await page.waitForFunction(() => document.documentElement.dataset.miMobileExperience === 'production-audit-v1');

    const picker = page.locator('#rxDrugPopover');
    await expect(picker).toBeVisible();
    const pickerBox = await picker.boundingBox();
    expectInsideViewport(pickerBox, { width:PHONE.width, height:PHONE.height });
    const result = page.locator('#rxDrugResults .rx-drug-result').first();
    await expectTouchTarget(result);
    await result.click();
    await expect(page.locator('#rxComposer')).toHaveValue(/Paracetamol/i);
    await page.locator('#rxDiagnosis').fill('R51 — Dhimbje koke');
    await page.waitForTimeout(500);

    page.once('dialog', dialog => dialog.accept());
    await page.goto(`${BASE}/icd.html`, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
    await page.locator('[data-open-code]').first().click();
    const overlay = page.locator('#detailOverlay');
    await expect(overlay).toBeVisible();
    const panel = page.locator('#detailOverlay .med-panel');
    const panelBox = await panel.boundingBox();
    expectInsideViewport(panelBox, { width:PHONE.width, height:PHONE.height });
    const useDiagnosis = page.getByRole('button', { name:'Përdore në recetë' });
    await expectTouchTarget(useDiagnosis);
    await useDiagnosis.click();
    await page.waitForURL(/recetat\.html/);
    await expect(page.locator('#rxDiagnosis')).toHaveValue(/J85/i);
    await expect(page.locator('#rxComposer')).toHaveValue(/Paracetamol/i);

    page.once('dialog', dialog => dialog.accept());
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout:15000 });
    await context.setOffline(true);
    await page.goto(`${BASE}/analizat.html`, { waitUntil:'domcontentloaded', timeout:15000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
    await expect(page.locator('.mi-page-heading h1')).toHaveText('Analizat laboratorike');
    await expect(page.locator('#miOfflineStatus')).toHaveAttribute('data-state', 'offline');
    await expectNoDocumentOverflow(page);
    await context.setOffline(false);
  });
});

test.describe('tablet breakpoint and orientation', () => {
  test.use({ serviceWorkers:'allow', viewport:TABLET, hasTouch:true });

  test('tablet portrait uses a drawer and landscape restores the desktop shell', async ({ page }) => {
    await openReady(page, '/klasifikimi.html');
    await expectNoDocumentOverflow(page);
    await expect(page.locator('.mi-sidebar')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-mi-mobile-search]')).toBeVisible();
    await expectDrawerCycle(page);

    await page.setViewportSize({ width:1180, height:820 });
    await page.waitForTimeout(180);
    await expectNoDocumentOverflow(page);
    await expect(page.locator('.mi-sidebar')).toBeVisible();
    await expect(page.locator('.mi-sidebar')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#miGlobalSearch')).toBeVisible();
    await expect(page.locator('[data-mi-mobile-search]')).toBeHidden();

    await page.setViewportSize(TABLET);
    await page.waitForTimeout(180);
    await expect(page.locator('.mi-sidebar')).toHaveAttribute('aria-hidden', 'true');
    await expectNoDocumentOverflow(page);
  });
});