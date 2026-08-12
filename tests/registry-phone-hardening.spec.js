const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';
const PHONE_WIDTHS = [320, 360, 375, 390, 414];

async function waitForPhoneReady(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('auth-ready')), { timeout:10000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.miMobileExperience), { timeout:10000 }).toBe('production-audit-v2');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.registryPhoneHardening), { timeout:10000 }).toBe('registry-mobile-phone-hardening-v1');
  await expect(page.locator('.mi-app-shell')).toBeVisible();
}

function expectInside(rect, viewport, tolerance = 1) {
  expect(rect).not.toBeNull();
  expect(rect.left).toBeGreaterThanOrEqual(-tolerance);
  expect(rect.right).toBeLessThanOrEqual(viewport.width + tolerance);
  expect(rect.top).toBeGreaterThanOrEqual(-tolerance);
  expect(rect.bottom).toBeLessThanOrEqual(viewport.height + tolerance);
}

test.describe('registry phone hardening', () => {
  test.use({ serviceWorkers:'allow', hasTouch:true });

  for (const width of PHONE_WIDTHS) {
    test(`${width}px registry has no horizontal overflow and keeps controls tappable`, async ({ page }) => {
      const viewport = { width, height:844 };
      await page.setViewportSize(viewport);
      await waitForPhoneReady(page);

      const report = await page.evaluate(() => ({
        innerWidth,
        htmlWidth:document.documentElement.scrollWidth,
        bodyWidth:document.body.scrollWidth,
        main:document.querySelector('.mi-main')?.getBoundingClientRect().toJSON(),
        nav:document.querySelector('#miRegistryBottomNav')?.getBoundingClientRect().toJSON(),
      }));

      expect(report.htmlWidth).toBeLessThanOrEqual(width + 1);
      expect(report.bodyWidth).toBeLessThanOrEqual(width + 1);
      expectInside(report.main, viewport);
      if (report.nav) expectInside(report.nav, viewport);

      const navItems = page.locator('#miRegistryBottomNav :is(a,button)');
      if (await navItems.count()) {
        for (let index = 0; index < await navItems.count(); index += 1) {
          const box = await navItems.nth(index).boundingBox();
          expect(box.width).toBeGreaterThanOrEqual(43.5);
          expect(box.height).toBeGreaterThanOrEqual(43.5);
        }
      }

      await page.evaluate(() => {
        document.documentElement.dataset.registryMobileLite ||= 'test';
        let host = document.getElementById('phoneHardeningTypographyProbe');
        if (host) host.remove();
        host = document.createElement('article');
        host.id = 'phoneHardeningTypographyProbe';
        host.className = 'mobile-lite-card';
        host.innerHTML = '<span class="mobile-lite-name">Trade name</span><span class="mobile-lite-substance">Substance</span><span class="mobile-lite-meta">ATC · 500 mg</span><button class="mobile-lite-more">Më shumë</button>';
        document.body.appendChild(host);
      });

      const weights = await page.evaluate(() => ({
        name:getComputedStyle(document.querySelector('#phoneHardeningTypographyProbe .mobile-lite-name')).fontWeight,
        substance:getComputedStyle(document.querySelector('#phoneHardeningTypographyProbe .mobile-lite-substance')).fontWeight,
        meta:getComputedStyle(document.querySelector('#phoneHardeningTypographyProbe .mobile-lite-meta')).fontWeight,
        width:document.getElementById('phoneHardeningTypographyProbe').getBoundingClientRect().width,
      }));
      expect(Number(weights.name)).toBeGreaterThanOrEqual(600);
      expect(Number(weights.substance)).toBeGreaterThanOrEqual(500);
      expect(Number(weights.meta)).toBeLessThanOrEqual(400);
      expect(weights.width).toBeLessThanOrEqual(width + 1);
    });
  }

  test('detail overlay traps focus, Escape closes it, and focus returns to the trigger', async ({ page }) => {
    await page.setViewportSize({ width:375, height:812 });
    await waitForPhoneReady(page);

    await page.evaluate(() => {
      const shell = document.querySelector('.mi-app-shell');
      const trigger = document.createElement('button');
      trigger.id = 'phoneHardeningDetailTrigger';
      trigger.type = 'button';
      trigger.dataset.mobileLiteDetail = 'probe';
      trigger.textContent = 'Open detail';
      shell.appendChild(trigger);

      const overlay = document.createElement('div');
      overlay.id = 'mobileLiteDrugDetail';
      overlay.className = 'mobile-lite-detail';
      overlay.hidden = true;
      overlay.innerHTML = '<div class="mobile-lite-detail-backdrop"></div><section class="mobile-lite-detail-sheet" role="dialog" aria-modal="true"><button type="button" data-mobile-lite-close>Close</button><a href="#probe">Probe link</a></section>';
      document.body.appendChild(overlay);

      const close = overlay.querySelector('[data-mobile-lite-close]');
      close.addEventListener('click', () => {
        overlay.hidden = true;
        document.body.classList.remove('mobile-lite-detail-open');
      });
      trigger.addEventListener('click', () => {
        overlay.hidden = false;
        document.body.classList.add('mobile-lite-detail-open');
      });
    });

    const trigger = page.locator('#phoneHardeningDetailTrigger');
    await trigger.click();
    await expect.poll(() => page.locator('html').getAttribute('data-registry-phone-overlay')).toBe('mobileLiteDrugDetail');
    await expect(page.locator('.mi-app-shell')).toHaveJSProperty('inert', true);
    await expect(page.locator('[data-mobile-lite-close]')).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.locator('[data-mobile-lite-close]').press('Shift+Tab');
    await expect(page.getByRole('link', { name:'Probe link' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-mobile-lite-close]')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#mobileLiteDrugDetail')).toBeHidden();
    await expect.poll(() => page.locator('.mi-app-shell').evaluate(node => node.inert)).toBe(false);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});