const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/login-mobile-app';

const phones = [
  { name:'phone-320', width:320, height:700 },
  { name:'iphone-375', width:375, height:812 },
  { name:'iphone-390', width:390, height:844 },
  { name:'phone-430', width:430, height:932 },
  { name:'phone-landscape', width:844, height:390 },
];

function googleMock() {
  window.google = {
    accounts:{
      id:{
        initialize(options) { window.__medindexGoogleOptions = options; },
        renderButton(container, options) {
          container.replaceChildren();
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'mock-google-sign-in';
          button.setAttribute('aria-label', 'Vazhdo me Google');
          button.textContent = 'Vazhdo me Google';
          button.style.cssText = `display:block;width:${Number(options?.width || 320)}px;max-width:100%;height:52px;border:1px solid #cbd7dc;border-radius:14px;background:#fff;color:#13212a;font:700 14px/1 system-ui;`;
          container.append(button);
        },
      },
    },
  };
}

async function prepare(page) {
  await page.addInitScript(googleMock);
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
    status:200,
    contentType:'application/javascript',
    body:'',
  }));
  await page.route('**/api/auth', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          authenticated:false,
          sessionConfigured:true,
          hardened:true,
          googleConfigured:true,
          googleClientId:'mobile-app-audit-client',
          passwordFallbackConfigured:false,
          csrfToken:'mobile-app-audit-csrf',
          sessionHours:8,
        }),
      });
      return;
    }
    await route.fulfill({ status:401, contentType:'application/json', body:JSON.stringify({ error:'Audit credential only.' }) });
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left:box.left, right:box.right, top:box.top, bottom:box.bottom, width:box.width, height:box.height };
    };
    const visible = selector => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 1 && box.height > 1;
    };
    const visibleLogos = [...document.querySelectorAll('.landing-brand-logo img,.login-card-brand img')]
      .filter(node => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 1 && box.height > 1;
      }).length;
    const targets = [...document.querySelectorAll('a,button,summary,input')]
      .filter(node => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && !node.hidden && box.width > 1 && box.height > 1;
      })
      .map(node => ({ name:node.id || String(node.className || node.tagName), height:node.getBoundingClientRect().height }));
    return {
      htmlWidth:document.documentElement.scrollWidth,
      bodyWidth:document.body.scrollWidth,
      pageHeight:document.documentElement.scrollHeight,
      card:rect('.login-card'),
      google:rect('#googleLoginButton'),
      brand:rect('.landing-brand'),
      visibleLogos,
      showcaseVisible:visible('.landing-showcase'),
      navMetaVisible:visible('.landing-nav-meta'),
      cardBrandVisible:visible('.login-card-brand'),
      metaVisible:visible('.login-meta'),
      mobileCopyVisible:visible('.login-copy-mobile'),
      desktopCopyVisible:visible('.login-copy-desktop'),
      targets,
    };
  });
}

function inside(rect, viewport, tolerance = 1.5) {
  expect(rect).not.toBeNull();
  expect(rect.left).toBeGreaterThanOrEqual(-tolerance);
  expect(rect.right).toBeLessThanOrEqual(viewport.width + tolerance);
}

test('MedIndex login looks and behaves like a mobile app', async ({ page }) => {
  test.setTimeout(90000);
  fs.mkdirSync(OUTPUT, { recursive:true });
  await prepare(page);

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  for (const viewport of phones) {
    await page.setViewportSize({ width:viewport.width, height:viewport.height });
    await page.goto(`${BASE}/login.html`, { waitUntil:'domcontentloaded' });
    await expect(page.locator('.login-card')).toBeVisible();
    await expect(page.locator('.mock-google-sign-in')).toBeVisible();
    await page.waitForTimeout(160);

    const current = await snapshot(page);
    expect(current.htmlWidth, `${viewport.name}: html overflow`).toBeLessThanOrEqual(viewport.width + 1);
    expect(current.bodyWidth, `${viewport.name}: body overflow`).toBeLessThanOrEqual(viewport.width + 1);
    expect(current.visibleLogos, `${viewport.name}: one visible logo`).toBe(1);
    expect(current.showcaseVisible, `${viewport.name}: showcase hidden`).toBe(false);
    expect(current.navMetaVisible, `${viewport.name}: desktop nav hidden`).toBe(false);
    expect(current.cardBrandVisible, `${viewport.name}: duplicate card brand hidden`).toBe(false);
    expect(current.metaVisible, `${viewport.name}: desktop metadata hidden`).toBe(false);
    expect(current.mobileCopyVisible, `${viewport.name}: mobile copy visible`).toBe(true);
    expect(current.desktopCopyVisible, `${viewport.name}: desktop copy hidden`).toBe(false);

    inside(current.brand, viewport);
    inside(current.card, viewport);
    inside(current.google, viewport);

    const portrait = viewport.width <= 600;
    if (portrait) {
      const ergonomicMinimum = Math.min(viewport.width * .84, 334);
      expect(current.card.width, `${viewport.name}: ergonomic app card width`).toBeGreaterThanOrEqual(ergonomicMinimum);
      expect(current.card.width, `${viewport.name}: app card bounded`).toBeLessThanOrEqual(398);
      expect(current.pageHeight, `${viewport.name}: compact page`).toBeLessThanOrEqual(viewport.height + 100);
    } else {
      expect(current.card.width, `${viewport.name}: landscape card`).toBeGreaterThanOrEqual(480);
      expect(current.card.width, `${viewport.name}: landscape bounded`).toBeLessThanOrEqual(540);
    }

    for (const target of current.targets) {
      expect(target.height, `${viewport.name}: ${target.name} target`).toBeGreaterThanOrEqual(43.5);
    }

    await page.screenshot({ path:path.join(OUTPUT, `${viewport.name}.png`), fullPage:true });
  }

  await page.setViewportSize({ width:1440, height:900 });
  await page.goto(`${BASE}/login.html`, { waitUntil:'domcontentloaded' });
  await expect(page.locator('.mock-google-sign-in')).toBeVisible();
  const desktop = await snapshot(page);
  expect(desktop.showcaseVisible).toBe(true);
  expect(desktop.navMetaVisible).toBe(true);
  expect(desktop.cardBrandVisible).toBe(true);
  expect(desktop.desktopCopyVisible).toBe(true);
  expect(desktop.mobileCopyVisible).toBe(false);
  await page.screenshot({ path:path.join(OUTPUT, 'desktop-regression.png'), fullPage:true });

  expect(pageErrors).toEqual([]);
});
