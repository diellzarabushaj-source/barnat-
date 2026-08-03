const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/login-visual';

const viewports = [
  { name:'phone-320', width:320, height:700 },
  { name:'iphone-375', width:375, height:812 },
  { name:'iphone-390', width:390, height:844 },
  { name:'phone-430', width:430, height:932 },
  { name:'phone-landscape', width:844, height:390 },
  { name:'tablet-portrait', width:820, height:1180 },
  { name:'tablet-landscape', width:1180, height:820 },
  { name:'desktop', width:1440, height:900 },
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
          button.style.cssText = `display:block;width:${Math.max(200, Number(options?.width || 320))}px;max-width:100%;height:50px;border:1px solid #cbd7dc;border-radius:10px;background:#fff;color:#13212a;font:700 14px/1 system-ui;`;
          container.append(button);
        },
      },
    },
  };
}

async function prepare(page, state) {
  await page.addInitScript(googleMock);
  await page.route('**/images/brand/medindex-mark-mplus.svg', route => route.fulfill({
    status:200,
    contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#0f7779"/><text x="11" y="31" fill="white" font-size="21" font-family="Arial" font-weight="700">M</text><text x="31" y="29" fill="#d6a84f" font-size="15" font-family="Arial" font-weight="700">+</text></svg>',
  }));
  await page.route('**/images/brand/diellza-avatar.svg', route => route.fulfill({
    status:200,
    contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="#dbe7e7"/></svg>',
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
          googleClientId:'login-audit-client',
          passwordFallbackConfigured:Boolean(state.fallbackEnabled),
          csrfToken:'login-audit-csrf',
          sessionHours:8,
        }),
      });
      return;
    }
    await route.fulfill({ status:401, contentType:'application/json', body:JSON.stringify({ error:'Audit-only credential.' }) });
  });
}

function inside(rect, viewport, tolerance = 1.5) {
  expect(rect).not.toBeNull();
  expect(rect.left).toBeGreaterThanOrEqual(-tolerance);
  expect(rect.right).toBeLessThanOrEqual(viewport.width + tolerance);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return { left:value.left, right:value.right, top:value.top, bottom:value.bottom, width:value.width, height:value.height };
    };
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const brandLogo = document.querySelector('.mi-brand-logo');
    const hero = document.querySelector('.mi-hero-copy');
    const targets = [...document.querySelectorAll('a,button,summary')]
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
      nav:rect('.mi-nav-inner'),
      logoBox:rect('.mi-brand-logo'),
      card:rect('.mi-login-card'),
      copy:rect('.mi-hero-copy'),
      google:rect('#googleLoginButton'),
      wave:rect('.mi-wave'),
      logoCount:document.querySelectorAll('.mi-brand-logo').length,
      logoReady:getComputedStyle(brandLogo).backgroundImage.includes('medindex-mark-mplus.svg'),
      heroHidden:getComputedStyle(hero).display === 'none',
      duplicates,
      h1Count:document.querySelectorAll('h1').length,
      h2Count:document.querySelectorAll('h2').length,
      inputFont:parseFloat(getComputedStyle(document.querySelector('#password')).fontSize),
      targets,
    };
  });
}

test('MedIndex login is compact and stable on iPhone, tablet and desktop', async ({ page }) => {
  test.setTimeout(90000);
  fs.mkdirSync(OUTPUT, { recursive:true });
  const state = { fallbackEnabled:false };
  await prepare(page, state);

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  for (const viewport of viewports) {
    await page.setViewportSize({ width:viewport.width, height:viewport.height });
    await page.goto(`${BASE}/login.html`, { waitUntil:'domcontentloaded' });
    await expect(page.locator('.mi-login-card')).toBeVisible();
    await expect(page.locator('.mock-google-sign-in')).toBeVisible();
    await expect(page.locator('.mi-brand-logo')).toBeVisible();
    await expect(page.locator('#passwordFallback')).toBeHidden();
    await page.waitForTimeout(180);

    const current = await snapshot(page);
    expect(current.htmlWidth, `${viewport.name}: html overflow`).toBeLessThanOrEqual(viewport.width + 1);
    expect(current.bodyWidth, `${viewport.name}: body overflow`).toBeLessThanOrEqual(viewport.width + 1);
    expect(current.logoCount, `${viewport.name}: one logo`).toBe(1);
    expect(current.logoReady, `${viewport.name}: approved logo background`).toBe(true);
    expect(current.duplicates, `${viewport.name}: duplicate IDs`).toEqual([]);
    expect(current.h1Count).toBe(1);
    expect(current.h2Count).toBe(1);
    expect(current.inputFont).toBeGreaterThanOrEqual(16);

    inside(current.nav, viewport);
    inside(current.logoBox, viewport);
    inside(current.card, viewport);
    inside(current.google, viewport);

    const portraitPhone = viewport.width <= 560;
    const landscapePhone = viewport.width > viewport.height && viewport.height <= 520;
    if (portraitPhone || landscapePhone) {
      expect(current.heroHidden, `${viewport.name}: marketing hero hidden on phone`).toBe(true);
      if (portraitPhone) {
        expect(current.card.width, `${viewport.name}: card uses portrait width`).toBeGreaterThan(viewport.width * 0.88);
      } else {
        expect(current.card.width, `${viewport.name}: ergonomic landscape card`).toBeGreaterThanOrEqual(480);
        expect(current.card.width, `${viewport.name}: bounded landscape card`).toBeLessThanOrEqual(560);
      }
      expect(current.pageHeight, `${viewport.name}: compact phone page`).toBeLessThanOrEqual(viewport.height + 180);
    } else if (viewport.width <= 820) {
      expect(current.heroHidden).toBe(false);
      expect(current.card.top, `${viewport.name}: login first`).toBeLessThan(current.copy.top);
    }

    if (viewport.width >= 1024) {
      expect(current.copy.right, `${viewport.name}: desktop columns`).toBeLessThan(current.card.left);
      expect(current.card.bottom, `${viewport.name}: card clear of wave`).toBeLessThanOrEqual(current.wave.top + 2);
    }

    for (const target of current.targets) {
      expect(target.height, `${viewport.name}: ${target.name} touch target`).toBeGreaterThanOrEqual(43.5);
    }

    await page.screenshot({ path:path.join(OUTPUT, `${viewport.name}.png`), fullPage:true });
  }

  state.fallbackEnabled = true;
  await page.setViewportSize({ width:390, height:844 });
  await page.goto(`${BASE}/login.html?fallback=1`, { waitUntil:'domcontentloaded' });
  await expect(page.locator('#passwordFallback')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('#togglePassword')).toBeVisible();
  await expect(page.locator('#loginSubmit')).toBeVisible();

  const fallback = await page.evaluate(() => {
    const rect = selector => {
      const value = document.querySelector(selector)?.getBoundingClientRect();
      return value ? { left:value.left, right:value.right, width:value.width, height:value.height } : null;
    };
    return {
      scrollWidth:document.documentElement.scrollWidth,
      inputFont:parseFloat(getComputedStyle(document.querySelector('#password')).fontSize),
      input:rect('#password'),
      toggle:rect('#togglePassword'),
      submit:rect('#loginSubmit'),
      summary:rect('#passwordFallback summary'),
    };
  });

  expect(fallback.scrollWidth).toBeLessThanOrEqual(391);
  expect(fallback.inputFont).toBeGreaterThanOrEqual(16);
  inside(fallback.input, { width:390, height:844 });
  inside(fallback.toggle, { width:390, height:844 });
  inside(fallback.submit, { width:390, height:844 });
  inside(fallback.summary, { width:390, height:844 });
  expect(fallback.toggle.height).toBeGreaterThanOrEqual(43.5);
  expect(fallback.submit.height).toBeGreaterThanOrEqual(43.5);
  expect(fallback.summary.height).toBeGreaterThanOrEqual(43.5);

  await page.screenshot({ path:path.join(OUTPUT, 'iphone-390-password-fallback.png'), fullPage:true });
  expect(pageErrors).toEqual([]);
});
