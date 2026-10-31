const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = process.env.DRX_AUTH_SCREENSHOTS || path.join(os.tmpdir(), 'login-mobile-app');

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

test('DRx standalone login keeps the responsive account form with working password controls',async({page})=>{
 test.setTimeout(90000);
 fs.mkdirSync(OUTPUT,{recursive:true});await prepare(page);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const viewport of [...phones,{name:'desktop',width:1440,height:900}]){
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await page.goto(`${BASE}/login.html`);
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


test('Homepage account dialog stays on the page, switches forms and restores focus', async ({page}) => {
 test.setTimeout(90000);
 await prepare(page);
 await page.route('**/api/auth?scope=verification', route => route.fulfill({status:401,contentType:'application/json',body:'{"error":"No account"}'}));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const viewport of [...phones,{name:'desktop',width:1440,height:900}]){
  await page.setViewportSize(viewport);
  await page.goto(BASE+'/landing.html');
  const trigger=page.locator('.lp-hero__cta a[href="login.html"]');
  await trigger.click();
  const dialog=page.locator('[data-home-auth]');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#loginEmail')).toBeFocused();
  await expect(page).toHaveURL(/landing\.html$/);
  expect(await dialog.evaluate(el=>getComputedStyle(el,'::backdrop').backdropFilter)).toContain('blur');
  const bounds=await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width+1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width+1);
  await page.locator('#loginPassword').fill('temporary-test-only');
  await page.locator('[data-auth-view="registration"]').click();
  await expect(page.locator('#signupEmail')).toBeFocused();
  await expect(page.locator('#signupPassword')).toBeVisible();
  await page.locator('[data-auth-view="login"]').click();
  await expect(page.locator('#loginPassword')).toHaveValue('');
  await page.screenshot({path:path.join(OUTPUT,'dialog-'+viewport.name+'.png'),fullPage:false});
  await page.locator('[data-auth-close]').click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('');
 }
 expect(errors).toEqual([]);
});

test('Dialog keeps auth errors, CSRF, back navigation and request cleanup intact', async ({page}) => {
 await prepare(page);
 let posts=0;
 await page.route('**/api/auth', async route=>{
  if(route.request().method()==='GET') return route.fallback();
  posts++;
  expect(route.request().headers()['x-csrf-token']).toBe('mobile-app-audit-csrf');
  const body=route.request().postDataJSON();
  expect(body.csrfToken).toBe('mobile-app-audit-csrf');
  await route.fulfill({status:401,contentType:'application/json',body:'{"error":"Emaili ose fjalëkalimi nuk është i saktë."}'});
 });
 await page.goto(BASE+'/landing.html');
 const trigger=page.locator('.lp-hero__cta a[href="login.html"]');
 for(let attempt=0;attempt<2;attempt++){
  await trigger.click();
  await expect(page.locator('#loginEmail')).toBeFocused();
  await page.locator('#loginEmail').fill('modal-test@example.com');
  await page.locator('#loginPassword').fill('test-only-password');
  await page.locator('#emailLoginSubmit').click();
  await expect(page.locator('#loginMessage')).toContainText('nuk është i saktë');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-home-auth]')).not.toBeVisible();
 }
 expect(posts).toBe(2);
 await trigger.click();
 await expect(page.locator('#loginEmail')).toBeFocused();
 await page.goBack();
 await expect(page.locator('[data-home-auth]')).not.toBeVisible();
 await page.goForward();
 await expect(page.locator('#loginEmail')).toBeFocused();
 await page.mouse.click(2,2);
 await expect(page.locator('[data-home-auth]')).not.toBeVisible();
});

test('Unavailable modal assets preserve a working standalone login link',async({page})=>{
 await prepare(page);
 await page.route('**/login.js?*',route=>route.abort());
 await page.goto(BASE+'/landing.html');
 await page.locator('.lp-hero__cta a[href="login.html"]').click();
 await expect(page.locator('[data-auth-fallback]')).toHaveAttribute('href','/login.html');
 await page.locator('[data-auth-fallback]').click();
 await expect(page).toHaveURL(/\/login\.html$/);
});


test('Homepage email login preserves the requested destination and server session', async({page})=>{
 await prepare(page);
 await page.route('**/api/auth',async route=>{
  if(route.request().method()==='GET')return route.fallback();
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,supabaseAuthenticated:true,sessionVersion:3,user:{id:'fixture-user',email:'modal-test@example.com'}})});
 });
 await page.goto(BASE+'/landing.html');
 await page.locator('a[href="login.html?return=%2Frecetat.html"]').click();
 await expect(page.locator('#loginEmail')).toBeFocused();
 await page.locator('#loginEmail').fill('modal-test@example.com');
 await page.locator('#loginPassword').fill('test-password-only');
 await page.locator('#emailLoginSubmit').click();
 await expect(page).toHaveURL(/\/recetat\.html$/);
});

test('Homepage signup keeps email confirmation and profile enrollment inside the dialog',async({page})=>{
 await prepare(page);
 await page.route('**/api/auth?scope=verification',route=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"No account"}'}));
 await page.route('**/api/auth',async route=>{
  if(route.request().method()==='GET')return route.fallback();
  const body=route.request().postDataJSON();
  expect(body.action).toBe('signup');
  expect(body.csrfToken).toBe('mobile-app-audit-csrf');
  await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"confirmationRequired":false,"message":"Llogaria u krijua."}'});
 });
 await page.goto(BASE+'/landing.html');
 await page.locator('.lp-hero__cta a[href="login.html"]').click();
 await expect(page.locator('#loginEmail')).toBeFocused();
 await page.locator('[data-auth-view="registration"]').click();
 await expect(page.locator('#signupEmail')).toBeFocused();
 await page.locator('#signupEmail').fill('modal-test@example.com');
 await page.locator('#signupPassword').fill('test-password-only');
 await page.locator('#signupSubmit').click();
 await expect(page.locator('#loginEmail')).toHaveValue('modal-test@example.com');
 await expect(page).toHaveURL(/landing\.html$/);
});

test('Closing a dialog during an auth request cannot navigate or reinitialize Google later', async({page})=>{
 await prepare(page);
 await page.goto(BASE+'/landing.html');
 await page.route('**/api/auth',async route=>{
  await new Promise(resolve=>setTimeout(resolve,600));
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:true,supabaseAuthenticated:true,sessionVersion:3})}).catch(()=>{});
 });
 await page.locator('.lp-hero__cta a[href="login.html"]').click();
 await expect(page.locator('#loginEmail')).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(page.locator('[data-home-auth]')).not.toBeVisible();
 await page.waitForTimeout(850);
 await expect(page).toHaveURL(/landing\.html$/);
 expect(await page.evaluate(()=>window.__medindexGoogleOptions)).toBeUndefined();
});
