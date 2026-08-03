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

function mockGoogleIdentity() {
  window.__medindexLayoutShifts = [];
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__medindexLayoutShifts.push(entry.value);
      }
    });
    observer.observe({ type:'layout-shift', buffered:true });
  } catch {}

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
          button.style.cssText = `display:block;width:${Math.max(200, Number(options?.width || 320))}px;max-width:100%;height:52px;border:1px solid #cbd7dc;border-radius:10px;background:#fff;color:#13212a;font:700 14px/1 system-ui;`;
          container.append(button);
        },
      },
    },
  };
}

async function prepare(page, state) {
  await page.addInitScript(mockGoogleIdentity);
  await page.route('**/api/auth', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
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

async function report(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return { left:value.left, right:value.right, top:value.top, bottom:value.bottom, width:value.width, height:value.height };
    };
    const alpha = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const value = getComputedStyle(node).color;
      const match = value.match(/rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)/);
      return match?.[1] == null ? 1 : Number(match[1]);
    };
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const logos = [...document.querySelectorAll('.mi-brand-logo img')];
    const visibleTargets = [...document.querySelectorAll('a,button,summary,input')]
      .filter(node => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && !node.hidden && box.width > 0 && box.height > 0;
      })
      .map(node => ({
        tag:node.tagName,
        id:node.id,
        className:String(node.className || ''),
        width:node.getBoundingClientRect().width,
        height:node.getBoundingClientRect().height,
      }));
    const mobileSheet = document.querySelector('link[data-mobile-login-css]')?.sheet;
    return {
      viewport:{ width:innerWidth, height:innerHeight },
      htmlScrollWidth:document.documentElement.scrollWidth,
      bodyScrollWidth:document.body.scrollWidth,
      nav:rect('.mi-nav-inner'),
      logoBox:rect('.mi-brand-logo'),
      copy:rect('.mi-hero-copy'),
      card:rect('.mi-login-card'),
      google:rect('#googleLoginButton'),
      wave:rect('.mi-wave'),
      logoCount:logos.length,
      logoReady:logos.length === 1 && logos[0].complete && logos[0].naturalWidth > 0 && logos[0].naturalHeight > 0,
      duplicates,
      h1Count:document.querySelectorAll('h1').length,
      h2Count:document.querySelectorAll('h2').length,
      mobileCssRules:mobileSheet ? mobileSheet.cssRules.length : 0,
      targets:visibleTargets,
      heroDescriptionAlpha:alpha('.mi-hero-description'),
      navLinkAlpha:alpha('.mi-nav-link'),
      brandSubtitleAlpha:alpha('.mi-brand-copy small'),
      founderMetaAlpha:alpha('.mi-founder-quote p'),
      cls:(window.__medindexLayoutShifts || []).reduce((sum, value) => sum + value, 0),
      inputFontSize:document.querySelector('#password') ? parseFloat(getComputedStyle(document.querySelector('#password')).fontSize) : null,
    };
  });
}

test('MedIndex login remains stable, accessible and viewport-safe at every approved breakpoint', async ({ page }) => {
  test.setTimeout(90000);
  fs.mkdirSync(OUTPUT, { recursive:true });
  const state = { fallbackEnabled:false };
  await prepare(page, state);

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/accounts\.google\.com|Content Security Policy/i.test(text)) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  for (const viewport of viewports) {
    await page.setViewportSize({ width:viewport.width, height:viewport.height });
    await page.goto(`${BASE}/login.html`, { waitUntil:'domcontentloaded' });
    await expect(page.locator('.mi-login-card')).toBeVisible();
    await expect(page.locator('.mock-google-sign-in')).toBeVisible();
    await expect(page.locator('.mi-brand-logo img')).toBeVisible();
    await expect(page.locator('#passwordFallback')).toBeHidden();
    await page.waitForTimeout(250);

    const current = await report(page);
    expect(current.htmlScrollWidth, `${viewport.name}: html horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);
    expect(current.bodyScrollWidth, `${viewport.name}: body horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);
    expect(current.logoCount, `${viewport.name}: exactly one MedIndex logo`).toBe(1);
    expect(current.logoReady, `${viewport.name}: MedIndex logo must load`).toBe(true);
    expect(current.duplicates, `${viewport.name}: duplicate IDs`).toEqual([]);
    expect(current.h1Count, `${viewport.name}: one page heading`).toBe(1);
    expect(current.h2Count, `${viewport.name}: one login heading`).toBe(1);
    expect(current.mobileCssRules, `${viewport.name}: mobile stylesheet loaded`).toBeGreaterThan(10);
    expect(current.cls, `${viewport.name}: cumulative layout shift`).toBeLessThan(0.1);
    expect(current.inputFontSize, `${viewport.name}: iPhone input zoom prevention`).toBeGreaterThanOrEqual(16);

    inside(current.nav, viewport);
    inside(current.logoBox, viewport);
    inside(current.card, viewport);
    inside(current.google, viewport);

    if (viewport.width <= 820 && !(viewport.width > viewport.height && viewport.height <= 520)) {
      expect(current.card.top, `${viewport.name}: login is first`).toBeLessThan(current.copy.top);
      if (viewport.width <= 560) {
        expect(current.card.width, `${viewport.name}: phone card uses available width`).toBeGreaterThan(viewport.width * 0.86);
      } else {
        const ergonomicTabletWidth = Math.min(560, viewport.width - 32);
        expect(current.card.width, `${viewport.name}: tablet card keeps an ergonomic reading width`).toBeGreaterThanOrEqual(ergonomicTabletWidth - 1);
      }
    }

    if (viewport.width >= 1024) {
      expect(current.copy.right, `${viewport.name}: desktop columns do not overlap`).toBeLessThan(current.card.left);
      expect(current.card.bottom, `${viewport.name}: primary card stays clear of decorative wave`).toBeLessThanOrEqual(current.wave.top + 2);
    }

    for (const target of current.targets) {
      if (target.tag === 'INPUT') continue;
      expect(target.height, `${viewport.name}: ${target.id || target.className || target.tag} touch height`).toBeGreaterThanOrEqual(43.5);
    }

    expect(current.heroDescriptionAlpha, `${viewport.name}: hero copy contrast`).toBeGreaterThanOrEqual(0.88);
    if (viewport.width > 1020) expect(current.navLinkAlpha, `${viewport.name}: nav contrast`).toBeGreaterThanOrEqual(0.86);
    if (viewport.width > 560) expect(current.brandSubtitleAlpha, `${viewport.name}: brand subtitle contrast`).toBeGreaterThanOrEqual(0.86);
    expect(current.founderMetaAlpha, `${viewport.name}: founder metadata contrast`).toBeGreaterThanOrEqual(0.86);

    await page.screenshot({ path:path.join(OUTPUT, `${viewport.name}.png`), fullPage:true });
  }

  state.fallbackEnabled = true;
  await page.setViewportSize({ width:390, height:844 });
  await page.goto(`${BASE}/login.html?fallback=1`, { waitUntil:'domcontentloaded' });
  await expect(page.locator('#passwordFallback')).toBeVisible();
  await expect(page.locator('#passwordFallback')).toHaveAttribute('open', '');
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
    };
  });
  expect(fallback.scrollWidth).toBeLessThanOrEqual(391);
  expect(fallback.inputFont).toBeGreaterThanOrEqual(16);
  inside(fallback.input, { width:390, height:844 });
  inside(fallback.toggle, { width:390, height:844 });
  inside(fallback.submit, { width:390, height:844 });
  expect(fallback.toggle.height).toBeGreaterThanOrEqual(43.5);
  expect(fallback.submit.height).toBeGreaterThanOrEqual(43.5);
  await page.screenshot({ path:path.join(OUTPUT, 'iphone-390-password-fallback.png'), fullPage:true });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
