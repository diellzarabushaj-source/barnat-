const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/atc-visual';
fs.mkdirSync(OUTPUT, { recursive:true });

test.use({ serviceWorkers:'block' });
test.describe.configure({ mode:'serial' });

async function openAtc(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/index.html?atc=N02`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(page.locator('.mi-app-shell')).toBeVisible();

  if (viewport.width < 1024) {
    await page.locator('[data-mi-sidebar-toggle]').click();
    await expect(page.locator('body')).toHaveClass(/mi-sidebar-open/);
  }

  const root = page.locator('[data-mi-atc-root-trigger]');
  await expect(root).toBeVisible();
  if (await root.getAttribute('aria-expanded') !== 'true') await root.click();

  const nGroup = page.locator('[data-mi-atc-group-trigger="N"]');
  await expect(nGroup).toBeVisible();
  if (await nGroup.getAttribute('aria-expanded') !== 'true') await nGroup.click();
  await expect(page.locator('[data-mi-atc-code="N02"]')).toBeVisible();
  await expect(page.locator('[data-mi-atc-code="N02"]')).toHaveAttribute('aria-current', 'page');
  // ATC data is intentionally deferred from startup. The visual audit verifies
  // the final context state, so allow the lazy context layer to finish rather
  // than treating its bounded activation time as a rendering failure.
  await expect(page.locator('#registryAtcContext')).toBeVisible({ timeout:15000 });
  await page.waitForTimeout(300);
}

async function assertNoOverflow(page) {
  const geometry = await page.evaluate(() => [
    '[data-mi-atc-menu]',
    '[data-mi-atc-root-panel]',
    '[data-mi-atc-group="N"]',
    '[data-mi-atc-code="N02"]',
    '#registryAtcContext',
  ].map(selector => {
    const node = document.querySelector(selector);
    const rect = node?.getBoundingClientRect();
    return {
      selector,
      exists:Boolean(node),
      left:rect?.left,
      right:rect?.right,
      viewportWidth:innerWidth,
      scrollWidth:node?.scrollWidth,
      clientWidth:node?.clientWidth,
    };
  }));

  for (const item of geometry) {
    expect(item.exists, `${item.selector} is missing`).toBeTruthy();
    expect(item.left, `${item.selector} overflows left`).toBeGreaterThanOrEqual(-1);
    expect(item.right, `${item.selector} overflows right`).toBeLessThanOrEqual(item.viewportWidth + 1);
    expect(item.scrollWidth, `${item.selector} clips horizontally`).toBeLessThanOrEqual(item.clientWidth + 2);
  }
}

async function assertMobileFocus(page) {
  const state = await page.evaluate(() => {
    const open = document.querySelector('[data-mi-atc-group="N"]');
    const trigger = open?.querySelector('.mi-atc-group-trigger');
    const label = open?.querySelector('.mi-atc-group-name');
    const other = document.querySelector('[data-mi-atc-group="M"]');
    const all = document.querySelector('[data-mi-atc-all-link]');
    return {
      openDisplay:getComputedStyle(open).display,
      otherDisplay:getComputedStyle(other).display,
      allDisplay:getComputedStyle(all).display,
      triggerPosition:getComputedStyle(trigger).position,
      backIcon:getComputedStyle(trigger, '::before').content,
      backLabel:getComputedStyle(label, '::before').content,
    };
  });
  expect(state.openDisplay).not.toBe('none');
  expect(state.otherDisplay).toBe('none');
  expect(state.allDisplay).toBe('none');
  expect(state.triggerPosition).toBe('sticky');
  expect(state.backIcon).toContain('←');
  expect(state.backLabel).toContain('Kthehu te grupet');
}

for (const profile of [
  { name:'desktop', width:1440, height:1000 },
  { name:'tablet', width:820, height:1180 },
  { name:'mobile', width:390, height:844 },
]) {
  test(`${profile.name} ATC visual audit`, async ({ page }) => {
    await openAtc(page, profile);
    await assertNoOverflow(page);

    await page.screenshot({ path:path.join(OUTPUT, `${profile.name}-full.png`), fullPage:true });
    await page.locator('#miSidebar').screenshot({ path:path.join(OUTPUT, `${profile.name}-sidebar.png`) });

    if (profile.width < 1024) await assertMobileFocus(page);
  });
}