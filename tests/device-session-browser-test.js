'use strict';
const assert = require('node:assert/strict');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, webkit } = require('@playwright/test');
const F = require('./device-session-fixture.js');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'drx-device-browser-'));
  const realNow = Date.now.bind(Date);
  let offset = 0;
  Date.now = () => realNow() + offset;
  const { auth, Device } = await F.modules();
  const middleware = await F.middleware();
  const browserType = process.env.DEVICE_SESSION_BROWSER === 'webkit' ? webkit : chromium;
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(temp, 'key.pem'),
    '-out', path.join(temp, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio:'pipe' });
  let base;
  let externalCookie = '';
  const server = https.createServer({ key:fs.readFileSync(path.join(temp, 'key.pem')), cert:fs.readFileSync(path.join(temp, 'cert.pem')) }, async (req, res) => {
    try {
      res.status = code => { res.statusCode = code; return res; };
      res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res; };
      if (req.method === 'POST' && req.headers.origin?.startsWith('https://127.0.0.1:')) externalCookie = req.headers.cookie || '';
      if (req.headers.host.startsWith('127.0.0.1:')) {
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<a href="${base}/recetat.html?draft=external">Hap DRx</a><a href="${base}/landing.html?return=%2Frecetat.html%3Fdraft%3Dwelcome">Kthehu</a><form method="post" action="${base}/api/auth"><input name="password" value="ignored"></form>`);
      }
      const decision = await middleware(new Request(base + req.url, { method:req.method, headers:req.headers }));
      if (!decision.headers.has('x-test-next')) {
        res.statusCode = decision.status;
        for (const [name, value] of decision.headers) res.setHeader(name, value);
        return res.end(await decision.text());
      }
      if (req.url.startsWith('/api/auth')) return await F.handler(req, res);
      if (req.url === '/api/device-data') return res.json({ owner:F.id });
      if (req.url.startsWith('/entry-resume.js')) {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(fs.readFileSync(path.join(F.ROOT, 'entry-resume.js')));
      }
      if (req.url.startsWith('/sidebar-taxonomy-core-v3.js')) {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(fs.readFileSync(path.join(F.ROOT, 'sidebar-taxonomy-core-v3.js')));
      }
      res.setHeader('Content-Type', 'text/html');
      return res.end('<!doctype html><html lang="sq"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><h1>DRx</h1>'
        + (req.url.startsWith('/landing.html') ? '<script src="/entry-resume.js" defer></script>' : '<script src="/sidebar-taxonomy-core-v3.js"></script>') + '</html>');
    } catch (error) { res.statusCode = 500; res.end(error.message); }
  });
  let context;
  const launch = () => browserType.launchPersistentContext(path.join(temp, 'profile'), {
    headless:true, ignoreHTTPSErrors:true, viewport:{ width:390, height:844 },
    ...(process.env.DEVICE_SESSION_EXECUTABLE ? { executablePath:process.env.DEVICE_SESSION_EXECUTABLE } : {}),
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `https://localhost:${server.address().port}`;
    context = await launch();
    let page = await context.newPage();
    await page.goto(base + '/landing.html');
    const login = await page.evaluate(async email => {
      const initial = await (await fetch('/api/auth')).json();
      return (await fetch('/api/auth', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-csrf-token':initial.csrfToken },
        body:JSON.stringify({ email, password:'Test-password-2026!' }) })).json();
    }, F.email);
    assert.equal(login.deviceRemembered, true);
    const saved = (await context.cookies()).find(cookie => cookie.name === 'medindex_device');
    assert.ok(saved?.httpOnly && saved.secure && saved.expires > realNow() / 1000 + 89 * 86400);
    assert.equal(await page.evaluate(() => document.cookie.includes('medindex_device')), false);
    await page.goto(base + '/recetat.html');
    // A fresh entry from another site must carry the persistent login cookie.
    // A same-site page.goto alone misses Strict-cookie redirect failures.
    await page.goto(`https://127.0.0.1:${server.address().port}/external`);
    await page.getByRole('link', { name:'Hap DRx' }).click();
    await page.waitForLoadState('domcontentloaded');
    assert.equal(new URL(page.url()).pathname, '/recetat.html', 'An external entry must not appear signed out.');
    assert.equal(new URL(page.url()).search, '?draft=external');
    await page.goto(base + '/landing.html?return=%2Frecetat.html%3Fdraft%3Dwelcome');
    assert.equal(new URL(page.url()).pathname, '/recetat.html', 'A returning browser must resume from the public entry page.');
    assert.equal(new URL(page.url()).search, '?draft=welcome');

    // Old Strict cookies are initially withheld on an external entry. The
    // landing page must recover them through a same-origin server check.
    const beforeMigration = F.state.refreshes;
    await context.addCookies((await context.cookies()).filter(c => ['medindex_device', 'medindex_session'].includes(c.name))
      .map(c => ({ ...c, sameSite:'Strict' })));
    await page.goto(`https://127.0.0.1:${server.address().port}/external`);
    await page.getByRole('link', { name:'Kthehu' }).click();
    await page.waitForURL(url => url.pathname === '/recetat.html' && url.search === '?draft=welcome');
    assert.equal(F.state.refreshes, beforeMigration, 'Migration must not rotate a healthy upstream session.');
    for (const cookie of (await context.cookies()).filter(c => ['medindex_device', 'medindex_session'].includes(c.name))) {
      assert.equal(cookie.sameSite, 'Lax', 'Existing cookies must migrate without signing in again.');
    }
    await page.goto(`https://127.0.0.1:${server.address().port}/external`);
    const blockedPost = page.waitForResponse(response => response.url() === base + '/api/auth' && response.request().method() === 'POST');
    await page.locator('form').evaluate(form => form.submit());
    assert.equal((await blockedPost).status(), 403, 'Cross-site form submissions remain forbidden.');
    assert.doesNotMatch(externalCookie, /medindex_(device|session)=/, 'Lax must withhold auth cookies on cross-site POST.');
    await page.waitForURL(base + '/api/auth', { waitUntil:'load' });
    await page.goto(base + '/recetat.html');
    await context.close(); context = null;

    // Reopen the actual browser profile after the short session has expired.
    offset += 9 * 3600000;
    context = await launch();
    page = await context.newPage();
    await page.goto(`https://127.0.0.1:${server.address().port}/external`);
    await page.getByRole('link', { name:'Hap DRx' }).click();
    await page.waitForURL(url => url.pathname === '/recetat.html' && url.search === '?draft=external');
    await page.goto(base + '/recetat.html?draft=demo');
    assert.equal(new URL(page.url()).pathname, '/recetat.html');
    assert.equal(new URL(page.url()).search, '?draft=demo');
    assert.ok(F.state.refreshes > 0);
    assert.ok(auth.sessionData((await context.cookies()).find(c => c.name === 'medindex_session')?.value));

    // A restored old browser can hit a slow auth server. Preserve its credential
    // and resume automatically once the connection recovers.
    await context.addCookies((await context.cookies()).filter(c => ['medindex_device', 'medindex_session'].includes(c.name))
      .map(c => ({ ...c, sameSite:'Strict' })));
    offset += 9 * 3600000;
    F.state.transient = true;
    await page.goto(`https://127.0.0.1:${server.address().port}/external`);
    const unavailable = page.waitForResponse(response => response.url() === base + '/api/auth' && response.status() === 503);
    await page.getByRole('link', { name:'Kthehu' }).click();
    await unavailable;
    assert.ok((await context.cookies()).some(c => c.name === 'medindex_device'), 'An outage must preserve the remembered browser.');
    F.state.transient = false;
    await page.waitForURL(url => url.pathname === '/recetat.html' && url.search === '?draft=welcome', { timeout:15000 });

    // A phone tab left open overnight renews and replays the safe read once.
    offset += 9 * 3600000;
    assert.equal(await page.evaluate(async () => (await (await fetch('/api/device-data')).json()).owner), F.id);
    const logout = await page.evaluate(async () => (await fetch('/api/auth', { method:'DELETE' })).status);
    assert.equal(logout, 200);
    assert.equal((await context.cookies()).some(cookie => ['medindex_device', 'medindex_session'].includes(cookie.name)), false);
    await page.goto(base + '/recetat.html');
    assert.equal(new URL(page.url()).pathname, '/landing.html');
    await context.close(); context = null;
    context = await launch();
    page = await context.newPage();
    await page.goto(base + '/recetat.html');
    assert.equal(new URL(page.url()).pathname, '/landing.html', 'Logout must survive a browser restart.');
    console.log(`${browserType.name()} remembered-device browser passed: external entries, landing resume, old-cookie migration, forbidden cross-site POST, HTTPS HttpOnly persistence, profile restart after 9 hours, overnight recovery and persistent logout.`);
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    Date.now = realNow;
    fs.rmSync(temp, { recursive:true, force:true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
