'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit} = require('@playwright/test');

const source = fs.readFileSync(path.join(__dirname, '../auth-client.js'), 'utf8');
const leaseKey = 'medindex_offline_lease_v3';
const valid = {authenticated:true, hardened:true, sessionVersion:3, supabaseAuthenticated:true,
  sessionHours:8, user:{email:'doctor@example.test', name:'Doctor'}, authUser:{id:'test-account'}};
const fixture = '<!doctype html><html lang="sq"><head><meta charset="utf-8"><style>.auth-checking #private{display:none}</style></head>'
  + '<body><div id="miShellBoot"><span class="mi-boot-text">Po verifikohet sesioni…</span></div>'
  + '<nav id="appMenu"></nav><main id="private">Përmbajtja private</main><script src="/auth-client.js"></script></body></html>';

(async () => {
  const browserType = process.env.AUTH_RECOVERY_BROWSER === 'webkit' ? webkit : chromium;
  const browser = await browserType.launch({headless:true,
    ...(process.env.TEST_BROWSER_CHANNEL ? {channel:process.env.TEST_BROWSER_CHANNEL} : {})});
  let context;
  async function open(respond, {lease, offline = false} = {}) {
    await context?.close();
    context = await browser.newContext({viewport:{width:390, height:844}, serviceWorkers:'block'});
    await context.addInitScript(({leaseKey, lease, offline}) => {
      if (lease && location.pathname === '/protected.html') localStorage.setItem(leaseKey, JSON.stringify(lease));
      window.testOnline = !offline;
      Object.defineProperty(navigator, 'onLine', {get:() => window.testOnline});
    }, {leaseKey, lease, offline});
    await context.route('http://drx.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth') return respond(route);
      return route.fulfill({status:200, contentType:url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
        body:url.pathname === '/auth-client.js' ? source : url.pathname.endsWith('.js') ? ''
          : url.pathname === '/protected.html' ? fixture : '<h1>Hyrja</h1>'});
    });
    const page = await context.newPage();
    page.on('pageerror', error => console.error('Auth fixture error:', error.message));
    await page.goto('http://drx.test/protected.html');
    return page;
  }
  const answer = (route, status, body) => route.fulfill({status, contentType:'application/json', body:JSON.stringify(body)});
  const lease = {version:3, hardened:true, supabaseAuthenticated:true, verifiedAt:Date.now(),
    expiresAt:Date.now() + 3600000, account:{id:'test-account', email:'doctor@example.test'}};
  try {
    // A server outage after reopening an old tab is not a rejected login.
    let healthy = false;
    let page = await open(route => answer(route, healthy ? 200 : 503, healthy ? valid : {authenticated:false}),
      {lease:{...lease, verifiedAt:Date.now() - 9 * 3600000, expiresAt:Date.now() - 3600000}});
    await page.waitForTimeout(350);
    assert.equal(new URL(page.url()).pathname, '/protected.html', '503 must not send a remembered browser to sign-in');
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('auth-ready')), false);
    await page.getByRole('button', {name:'Provo përsëri'}).waitFor();
    healthy = true;
    await page.getByRole('button', {name:'Provo përsëri'}).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
    assert.ok(await page.evaluate(key => localStorage.getItem(key), leaseKey));

    // Refresh on a slow phone connection can take longer than the former 3.2s.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    page = await open(async route => { await gate; return answer(route, 200, valid); });
    await page.waitForTimeout(3600);
    assert.equal(new URL(page.url()).pathname, '/protected.html', 'slow renewal must stay on the requested page');
    assert.equal(await page.locator('#private').isVisible(), false, 'pending auth must not expose private content');
    release();
    await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));

    // A failed revalidation must retain the previously verified offline lease.
    healthy = false;
    page = await open(route => answer(route, healthy ? 200 : 503, healthy ? valid : {authenticated:false}), {lease, offline:true});
    await page.waitForFunction(() => document.documentElement.classList.contains('auth-offline'));
    await page.evaluate(() => { window.testOnline = true; window.dispatchEvent(new Event('online')); });
    await page.waitForTimeout(900);
    assert.equal(new URL(page.url()).pathname, '/protected.html');
    assert.equal(await page.locator('.session-expired-banner').count(), 0);
    assert.ok(await page.evaluate(key => localStorage.getItem(key), leaseKey), 'transient failure must preserve the lease');
    healthy = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => !document.documentElement.classList.contains('auth-offline'));

    // Genuine rejection remains fail-closed, including a revoked remembered login.
    for (const status of [200, 401, 403]) {
      page = await open(route => answer(route, status, {authenticated:false}), {lease});
      await page.waitForURL(url => url.pathname === '/landing.html');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), leaseKey), null);
    }
    console.log('Phone auth recovery passed: transient startup/revalidation, slow renewal, hidden private content, retry, and revoked sessions.');
  } finally {
    await context?.close();
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
