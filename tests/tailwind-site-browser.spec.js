const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers:'block' });
test.setTimeout(120000);

const viewports = [
  { name:'desktop', width:1440, height:900 },
  { name:'mobile', width:390, height:844 },
];

const clinicalPages = [
  'index.html',
  'analizat.html',
  'icd.html',
  'dozologjia.html',
  'recetat.html',
  'protokollet.html',
  'medical-hub.html',
  'urgjencat.html',
  'sistemi.html',
];

const publicPages = ['rreth-nesh.html', 'kontakt.html', 'blog.html'];

async function auditViewport(page, label) {
  const audit = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const visibleControls = [...document.querySelectorAll('button,input,select,textarea,a[role="button"]')]
      .filter(node => {
        const rect = node.getBoundingClientRect();
        const computed = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && computed.display !== 'none' && computed.visibility !== 'hidden';
      })
      .slice(0, 20)
      .map(node => ({
        tag:node.tagName,
        id:node.id || '',
        width:node.getBoundingClientRect().width,
        height:node.getBoundingClientRect().height,
      }));

    return {
      token:style.getPropertyValue('--tw-teal-500').trim(),
      pageWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      bodyWidth:document.body?.scrollWidth || 0,
      controls:visibleControls,
      title:document.title,
      page:document.documentElement.dataset.miPage || '',
    };
  });

  expect(audit.token, `${label}: Tailwind token was not applied`).toBe('#147d7e');
  expect(audit.pageWidth, `${label}: document has horizontal overflow`).toBeLessThanOrEqual(audit.viewportWidth + 2);
  expect(audit.bodyWidth, `${label}: body has horizontal overflow`).toBeLessThanOrEqual(audit.viewportWidth + 2);
  expect(audit.controls.length, `${label}: no visible interactive controls`).toBeGreaterThan(0);

  for (const control of audit.controls) {
    if (control.tag === 'A' && control.height < 32) continue;
    expect(control.height, `${label}: ${control.tag}#${control.id} is too short`).toBeGreaterThanOrEqual(32);
  }

  return audit;
}

for (const viewport of viewports) {
  test(`all authenticated clinical pages share the Tailwind system on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const file of clinicalPages) {
      await page.goto(`http://127.0.0.1:4173/${file}`, { waitUntil:'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'), null, { timeout:20000 });
      await expect(page.locator('.mi-app-shell')).toBeVisible({ timeout:20000 });
      await auditViewport(page, `${file} / ${viewport.name}`);
    }

    await page.screenshot({
      path:`/tmp/tailwind-clinical-${viewport.name}.png`,
      fullPage:false,
    });
  });

  test(`public pages share the Tailwind system on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const file of publicPages) {
      await page.goto(`http://127.0.0.1:4173/${file}`, { waitUntil:'domcontentloaded' });
      await expect(page.locator('.info-shell')).toBeVisible();
      await expect(page.locator('link[data-medindex-tailwind-ui]')).toHaveCount(1);
      await auditViewport(page, `${file} / ${viewport.name}`);
    }

    await page.screenshot({
      path:`/tmp/tailwind-public-${viewport.name}.png`,
      fullPage:true,
    });
  });

  test(`login and recovery load the Tailwind system on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/auth', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          authenticated:false,
          sessionConfigured:true,
          hardened:true,
          googleConfigured:false,
          passwordFallbackConfigured:true,
          csrfToken:'tailwind-site-browser-test',
        }),
      });
    });

    await page.goto('http://127.0.0.1:4173/login.html', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.miTailwindUi === '20260805-1');
    await expect(page.locator('.plan-block')).toBeVisible();
    await auditViewport(page, `login.html / ${viewport.name}`);

    await page.unroute('**/api/auth');
    await page.goto('http://127.0.0.1:4173/recovery.html', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.miTailwindUi === '20260805-1');
    await expect(page.locator('.recovery-card')).toBeVisible();
    await auditViewport(page, `recovery.html / ${viewport.name}`);
  });
}
