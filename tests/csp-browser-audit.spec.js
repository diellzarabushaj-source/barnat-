const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';
const pages = [
  '/index.html',
  '/klasifikimi.html',
  '/icd.html',
  '/analizat.html',
  '/dozologjia.html',
  '/protokollet.html',
  '/recetat.html',
];

test.use({ serviceWorkers:'block', viewport:{ width:1280, height:800 } });

test('all clinical pages run without CSP violations or blocked runtime assets', async ({ page }) => {
  const failures = [];

  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      console.error(`MEDINDEX_CSP_VIOLATION ${event.effectiveDirective} ${event.blockedURI || 'inline'}`);
    });
  });

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    if (text.startsWith('MEDINDEX_CSP_VIOLATION')) failures.push(text);
  });
  page.on('response', response => {
    const type = response.request().resourceType();
    if (['script', 'stylesheet'].includes(type) && response.status() >= 400) {
      failures.push(`${type} ${response.status()}: ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    const type = request.resourceType();
    if (['script', 'stylesheet'].includes(type)) {
      failures.push(`${type} failed: ${request.url()} — ${request.failure()?.errorText || 'unknown error'}`);
    }
  });

  for (const path of pages) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil:'domcontentloaded' });
    expect(response?.status(), `${path}: document request failed`).toBeLessThan(400);
    const csp = response?.headers()['content-security-policy'] || '';
    expect(csp, `${path}: CSP header is missing`).toContain("script-src 'self'");
    expect(csp, `${path}: inline script attributes are not blocked`).toContain("script-src-attr 'none'");
    expect(csp, `${path}: unsafe script policy returned`).not.toMatch(/script-src[^;]*(?:unsafe-inline|unsafe-eval)/);

    await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
    if (path === '/index.html') {
      await page.waitForFunction(() => window.MEDINDEX_REGISTRY_UI_READY && typeof window.MEDINDEX_REGISTRY_UI_READY.then === 'function');
      await page.evaluate(() => window.MEDINDEX_REGISTRY_UI_READY);
      await expect(page.locator('#countBadge')).not.toHaveText(/Gabim|Duke u ngarkuar/i);
    }
    await page.waitForTimeout(180);
  }

  expect(failures, failures.join('\n')).toEqual([]);
});
