const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';
const PHONE_WIDTHS = [320, 360, 375, 390, 414];

async function waitForSidebarReady(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('auth-ready')), { timeout:10000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.miMobileExperience), { timeout:10000 }).toBe('production-audit-v2');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.miMobileSidebarHardening), { timeout:10000 }).toBe('mobile-sidebar-deep-audit-v3');
  await expect(page.locator('.mi-app-shell')).toBeVisible();
  await expect(page.locator('#miSidebar')).toBeAttached();
}

async function visibleToggle(page) {
  const toggle = page.locator('[data-mi-sidebar-toggle]:visible').first();
  await expect(toggle).toBeVisible();
  return toggle;
}

async function waitForOpenDrawerToSettle(page) {
  await expect.poll(
    () => page.locator('#miSidebar').evaluate(node => {
      const box = node.getBoundingClientRect();
      return Math.abs(box.left) <= 1 && box.right > 40;
    }),
    { timeout:3000, intervals:[50, 75, 100, 150] },
  ).toBe(true);
}

async function openSidebar(page) {
  const toggle = await visibleToggle(page);
  await toggle.click();
  await expect(page.locator('body')).toHaveClass(/\bmi-sidebar-open\b/);
  await expect(page.locator('#miSidebar')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#miSidebar')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#miSidebar')).toHaveAttribute('aria-modal', 'true');
  await expect.poll(() => page.locator('#miSidebar').evaluate(node => node.inert)).toBe(false);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-mi-sidebar-close]')).toBeFocused();
  await expect.poll(() => page.locator('.mi-workspace').evaluate(node => node.inert)).toBe(true);
  await expect(page.locator('html')).toHaveClass(/\bmi-mobile-sidebar-open\b/);
  await waitForOpenDrawerToSettle(page);
  return toggle;
}

async function expectClosed(page, { focusTarget = null } = {}) {
  await expect(page.locator('body')).not.toHaveClass(/\bmi-sidebar-open\b/);
  await expect(page.locator('html')).not.toHaveClass(/\bmi-mobile-sidebar-open\b/);
  await expect.poll(() => page.locator('.mi-workspace').evaluate(node => node.inert)).toBe(false);
  await expect(page.locator('.mi-workspace')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#miSidebar')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#miSidebar')).not.toHaveAttribute('role', 'dialog');
  await expect(page.locator('#miSidebar')).not.toHaveAttribute('aria-modal', 'true');
  await expect.poll(() => page.locator('#miSidebar').evaluate(node => node.inert)).toBe(true);
  if (focusTarget) await expect(focusTarget).toBeFocused();
}

function expectInsideViewport(box, viewport, tolerance = 1) {
  expect(box).not.toBeNull();
  expect(box.left).toBeGreaterThanOrEqual(-tolerance);
  expect(box.right).toBeLessThanOrEqual(viewport.width + tolerance);
  expect(box.top).toBeGreaterThanOrEqual(-tolerance);
  expect(box.bottom).toBeLessThanOrEqual(viewport.height + tolerance);
}

test.describe('mobile sidebar deep audit', () => {
  test.use({ serviceWorkers:'allow', hasTouch:true });

  test('drawer geometry and every primary touch target stay safe from 320px through 414px', async ({ page }) => {
    for (const width of PHONE_WIDTHS) {
      const viewport = { width, height:844 };
      await page.setViewportSize(viewport);
      await waitForSidebarReady(page);
      const toggle = await openSidebar(page);

      const report = await page.evaluate(() => ({
        htmlWidth:document.documentElement.scrollWidth,
        bodyWidth:document.body.scrollWidth,
        sidebar:document.getElementById('miSidebar')?.getBoundingClientRect().toJSON(),
        overlay:getComputedStyle(document.querySelector('[data-mi-sidebar-overlay]')).visibility,
        close:document.querySelector('[data-mi-sidebar-close]')?.getBoundingClientRect().toJSON(),
        items:[...document.querySelectorAll('#appMenu > .mi-menu-group .mi-menu-item, #appMenu > .mi-menu-group .app-menu-link')]
          .filter(node => node.getClientRects().length && !node.closest('[hidden]'))
          .map(node => ({ label:node.getAttribute('aria-label') || node.textContent.trim(), box:node.getBoundingClientRect().toJSON() })),
      }));

      expect(report.htmlWidth).toBeLessThanOrEqual(width + 1);
      expect(report.bodyWidth).toBeLessThanOrEqual(width + 1);
      expectInsideViewport(report.sidebar, viewport);
      expect(report.sidebar.width).toBeLessThanOrEqual(width - 43);
      expect(report.overlay).toBe('visible');
      expect(report.close.width).toBeGreaterThanOrEqual(43.5);
      expect(report.close.height).toBeGreaterThanOrEqual(43.5);
      expect(report.items.length).toBeGreaterThan(5);
      for (const item of report.items) {
        expect(item.box.height, `${width}px ${item.label} touch height`).toBeGreaterThanOrEqual(43.5);
      }

      await page.locator('[data-mi-sidebar-close]').click();
      await expectClosed(page, { focusTarget:toggle });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('overlay and Escape close through the canonical shell and restore focus', async ({ page }) => {
    const viewport = { width:375, height:812 };
    await page.setViewportSize(viewport);
    await waitForSidebarReady(page);

    let toggle = await openSidebar(page);
    await page.mouse.click(viewport.width - 8, Math.round(viewport.height / 2));
    await expectClosed(page, { focusTarget:toggle });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    toggle = await openSidebar(page);
    await page.keyboard.press('Escape');
    await expectClosed(page, { focusTarget:toggle });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('Tab and Shift+Tab cannot escape the open drawer', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await waitForSidebarReady(page);
    await openSidebar(page);

    const focusState = await page.evaluate(() => {
      const panel = document.getElementById('miSidebar');
      const items = [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(node => !node.hidden && !node.closest('[hidden]') && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length);
      items.at(-1)?.focus();
      return { count:items.length, firstLabel:items[0]?.getAttribute('aria-label') || '', lastLabel:items.at(-1)?.getAttribute('aria-label') || '' };
    });
    expect(focusState.count).toBeGreaterThan(4);

    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => {
      const panel = document.getElementById('miSidebar');
      const items = [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(node => !node.hidden && !node.closest('[hidden]') && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length);
      return document.activeElement === items[0];
    })).toBe(true);

    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => {
      const panel = document.getElementById('miSidebar');
      const items = [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(node => !node.hidden && !node.closest('[hidden]') && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length);
      return document.activeElement === items.at(-1);
    })).toBe(true);
  });

  test('ATC nested destination closes the drawer without stale inert or open state', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await waitForSidebarReady(page);
    const toggle = await openSidebar(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.miAtcSidebar), { timeout:10000 }).toBe('nested-v2');

    const rootTrigger = page.locator('[data-mi-atc-root-trigger]');
    if (await rootTrigger.getAttribute('aria-expanded') !== 'true') await rootTrigger.click();
    const groupTrigger = page.locator('[data-mi-atc-group-trigger]').first();
    await expect(groupTrigger).toBeVisible();
    if (await groupTrigger.getAttribute('aria-expanded') !== 'true') await groupTrigger.click();

    await page.evaluate(() => {
      document.addEventListener('click', event => {
        if (event.target?.closest?.('[data-mi-atc-code],[data-mi-atc-all-link]')) event.preventDefault();
      }, { capture:true, once:true });
    });

    const destination = page.locator('[data-mi-atc-submenu]:not([hidden]) [data-mi-atc-code]').first();
    await expect(destination).toBeVisible();
    await destination.click();
    await expectClosed(page, { focusTarget:toggle });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('short landscape keeps close control and scrollable navigation reachable', async ({ page }) => {
    const viewport = { width:667, height:375 };
    await page.setViewportSize(viewport);
    await waitForSidebarReady(page);
    await openSidebar(page);

    const report = await page.evaluate(() => {
      const sidebar = document.getElementById('miSidebar');
      const close = document.querySelector('[data-mi-sidebar-close]');
      const scroll = document.querySelector('.mi-sidebar-scroll');
      scroll.scrollTop = scroll.scrollHeight;
      return {
        sidebar:sidebar.getBoundingClientRect().toJSON(),
        close:close.getBoundingClientRect().toJSON(),
        scrollClient:scroll.clientHeight,
        scrollHeight:scroll.scrollHeight,
        scrollTop:scroll.scrollTop,
      };
    });

    expectInsideViewport(report.sidebar, viewport);
    expectInsideViewport(report.close, viewport);
    expect(report.close.width).toBeGreaterThanOrEqual(43.5);
    expect(report.close.height).toBeGreaterThanOrEqual(43.5);
    expect(report.scrollClient).toBeGreaterThan(100);
    expect(report.scrollHeight).toBeGreaterThan(report.scrollClient);
    expect(report.scrollTop).toBeGreaterThan(0);
  });

  test('resizing an open drawer to desktop clears mobile-only modal state', async ({ page }) => {
    await page.setViewportSize({ width:375, height:812 });
    await waitForSidebarReady(page);
    await openSidebar(page);

    await page.setViewportSize({ width:1280, height:800 });
    await expect.poll(() => page.locator('body').evaluate(node => node.classList.contains('mi-sidebar-open'))).toBe(false);
    await expect.poll(() => page.locator('.mi-workspace').evaluate(node => node.inert)).toBe(false);
    await expect.poll(() => page.locator('#miSidebar').evaluate(node => node.inert)).toBe(false);
    await expect(page.locator('html')).not.toHaveClass(/\bmi-mobile-sidebar-open\b/);
    await expect(page.locator('#miSidebar')).not.toHaveAttribute('role', 'dialog');
    await expect(page.locator('#miSidebar')).not.toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#miSidebar')).toBeVisible();
  });
});