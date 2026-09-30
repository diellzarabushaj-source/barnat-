const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = path.join(os.tmpdir(), 'login-mobile-app');

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
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box && {left:box.left,right:box.right,width:box.width,height:box.height};
    };
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    return {
      htmlWidth:document.documentElement.scrollWidth,
      bodyWidth:document.body.scrollWidth,
      card:rect('.auth-card'),google:rect('#googleLoginButton'),brand:rect('.lp-nav__brand'),
      logos:[...document.querySelectorAll('.auth-nav img')].filter(visible).length,
      targets:[...document.querySelectorAll('.auth-card button,.auth-card input,.auth-nav a')]
        .filter(visible).map(node=>({name:node.id||node.className,height:node.getBoundingClientRect().height})),
    };
  });
}

function inside(rect,viewport){
 expect(rect).toBeTruthy();
 expect(rect.left).toBeGreaterThanOrEqual(-1.5);
 expect(rect.right).toBeLessThanOrEqual(viewport.width+1.5);
}

test('DRx landing opens the responsive account form with working password controls',async({page})=>{
 test.setTimeout(90000);
 fs.mkdirSync(OUTPUT,{recursive:true});await prepare(page);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const viewport of [...phones,{name:'desktop',width:1440,height:900}]){
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await page.goto(`${BASE}/landing.html`);
  await page.locator('.lp-hero__cta a[href="login.html"]').click();
  await expect(page.locator('.auth-card')).toBeVisible();
  await expect(page.locator('.mock-google-sign-in')).toBeVisible();
  await expect(page.locator('#passwordFallback')).toBeHidden();
  const current=await snapshot(page);
  expect(current.htmlWidth).toBeLessThanOrEqual(viewport.width+1);
  expect(current.bodyWidth).toBeLessThanOrEqual(viewport.width+1);
  expect(current.logos).toBe(1);
  inside(current.brand,viewport);inside(current.card,viewport);inside(current.google,viewport);
  expect(current.card.width).toBeGreaterThanOrEqual(Math.min(viewport.width*.84,334));
  for(const target of current.targets)expect(target.height,`${viewport.name}: ${target.name}`).toBeGreaterThanOrEqual(43.5);
  await page.locator('#loginPassword').fill('audit-password');
  await page.locator('#toggleLoginPassword').click();
  await expect(page.locator('#loginPassword')).toHaveAttribute('type','text');
  await expect(page.locator('#toggleLoginPassword')).toHaveAttribute('aria-pressed','true');
  await page.locator('#toggleLoginPassword').click();
  await expect(page.locator('#loginPassword')).toHaveAttribute('type','password');
  await page.screenshot({path:path.join(OUTPUT,`${viewport.name}.png`),fullPage:true});
 }
 expect(errors).toEqual([]);
});
