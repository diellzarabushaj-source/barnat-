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

async function auditViewport(page, label, { requireControls = false } = {}) {
  const audit = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const visibleInteractive = [...document.querySelectorAll('button,input,select,textarea,a[href],[role="button"]')]
      .filter(node => {
        const rect = node.getBoundingClientRect();
        const computed = getComputedStyle(node);
        return rect.width > 0
          && rect.height > 0
          && computed.display !== 'none'
          && computed.visibility !== 'hidden'
          && computed.opacity !== '0';
      })
      .slice(0, 40)
      .map(node => ({
        tag:node.tagName,
        id:node.id || '',
        href:node.getAttribute('href') || '',
        width:node.getBoundingClientRect().width,
        height:node.getBoundingClientRect().height,
      }));

    return {
      token:style.getPropertyValue('--tw-teal-500').trim(),
      pageWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      bodyWidth:document.body?.scrollWidth || 0,
      interactive:visibleInteractive,
      controls:visibleInteractive.filter(item => item.tag !== 'A'),
      links:visibleInteractive.filter(item => item.tag === 'A'),
      title:document.title,
      page:document.documentElement.dataset.miPage || '',
    };
  });

  expect(audit.token, `${label}: Tailwind token was not applied`).toBe('#147d7e');
  expect(audit.pageWidth, `${label}: document has horizontal overflow`).toBeLessThanOrEqual(audit.viewportWidth + 2);
  expect(audit.bodyWidth, `${label}: body has horizontal overflow`).toBeLessThanOrEqual(audit.viewportWidth + 2);

  if (requireControls) {
    expect(audit.controls.length, `${label}: no visible form or button controls`).toBeGreaterThan(0);
  }

  for (const control of audit.controls) {
    expect(control.height, `${label}: ${control.tag}#${control.id} is below the compact 28px floor`).toBeGreaterThanOrEqual(28);
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
      await auditViewport(page, `${file} / ${viewport.name}`, { requireControls:true });

      if (file === 'icd.html') {
        const refresh = page.locator('#icdSourceHealthRefresh');
        await expect(refresh).toBeVisible();
        const box = await refresh.boundingBox();
        expect(box).not.toBeNull();
        expect(box.height, `ICD refresh touch target on ${viewport.name}`).toBeGreaterThanOrEqual(viewport.name === 'mobile' ? 44 : 40);
        expect(box.width, `ICD refresh touch target width on ${viewport.name}`).toBeGreaterThanOrEqual(viewport.name === 'mobile' ? 44 : 40);
      }
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
      const audit = await auditViewport(page, `${file} / ${viewport.name}`);
      expect(audit.links.length, `${file}: public navigation links are missing`).toBeGreaterThan(0);
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
    await auditViewport(page, `login.html / ${viewport.name}`, { requireControls:true });
    const ctaBox = await page.locator('.plan-cta').boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox.height, `login CTA on ${viewport.name}`).toBeGreaterThanOrEqual(44);

    await page.unroute('**/api/auth');
    await page.goto('http://127.0.0.1:4173/recovery.html', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.miTailwindUi === '20260805-1');
    await expect(page.locator('.recovery-card')).toBeVisible();
    await auditViewport(page, `recovery.html / ${viewport.name}`);
  });
}
