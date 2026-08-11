const { test, expect } = require('@playwright/test');

const BASE = process.env.PHASE6_BASE_URL || 'http://127.0.0.1:4175';

test.describe('Phase 6 single-version contract', () => {
  test('normal navigation replaces a cached Release A with network Release B', async ({ page }) => {
    const first = await page.goto(`${BASE}/index.html?phase6=A`, { waitUntil:'domcontentloaded' });
    expect(first?.ok()).toBeTruthy();
    await expect(page.locator('#phase6Version')).toHaveText('A');

    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout:15000 });

    const controlledA = await page.goto(`${BASE}/index.html?phase6=A`, { waitUntil:'domcontentloaded' });
    expect(controlledA?.ok()).toBeTruthy();
    await expect(page.locator('#phase6Version')).toHaveText('A');

    const second = await page.goto(`${BASE}/index.html?phase6=B`, { waitUntil:'domcontentloaded' });
    expect(second?.ok()).toBeTruthy();
    await expect(page.locator('#phase6Version')).toHaveText('B');
    await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.phase6ServerRelease)).toBe('B');
    expect((await second.headers())['x-medindex-cache']).toBe('page-network');

    const shim = await page.evaluate(async () => fetch('/sw-resilient-v3.js?phase6-test=1', { cache:'no-store' }).then(response => response.text()));
    expect(shim).toContain("importScripts('/sw.js?v=");
    expect(shim).not.toContain('async function navigationResponse');
  });

  test('release mismatch warns without forcing reload while work is unsaved', async ({ page, request }) => {
    await page.goto(`${BASE}/index.html?phase6=dirty`, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.MedIndexOffline?.checkRelease), null, { timeout:15000 });

    const before = await page.evaluate(() => ({
      marker:document.documentElement.dataset.phase6ServerRelease,
      release:window.MedIndexOffline.release(),
    }));
    expect(before.marker).toBe('dirty');
    expect(before.release).toBeTruthy();

    const change = await request.post(`${BASE}/__phase6/release?value=phase6-next-release`);
    expect(change.ok()).toBeTruthy();

    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'phase6UnsavedInput';
      input.defaultValue = '';
      input.value = 'draft i paruajtur';
      document.body.appendChild(input);
      input.focus();
    });

    await page.evaluate(() => window.MedIndexOffline.checkRelease());
    await expect(page.locator('#miOfflineStatus')).toContainText('ruaj dhe rifresko');
    await expect(page.locator('#phase6Version')).toHaveText('dirty');
    expect(await page.evaluate(() => window.MedIndexOffline.pendingRelease())).toBe('phase6-next-release');
  });
});
