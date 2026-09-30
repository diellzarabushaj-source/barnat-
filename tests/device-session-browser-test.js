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
  const server = https.createServer({ key:fs.readFileSync(path.join(temp, 'key.pem')), cert:fs.readFileSync(path.join(temp, 'cert.pem')) }, async (req, res) => {
    try {
      res.status = code => { res.statusCode = code; return res; };
      res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res; };
      const decision = await middleware(new Request(base + req.url, { method:req.method, headers:req.headers }));
      if (!decision.headers.has('x-test-next')) {
        res.statusCode = decision.status;
        for (const [name, value] of decision.headers) res.setHeader(name, value);
        return res.end(await decision.text());
      }
      if (req.url.startsWith('/api/auth')) return await F.handler(req, res);
      if (req.url === '/api/device-data') return res.json({ owner:F.id });
      if (req.url.startsWith('/sidebar-taxonomy-core-v3.js')) {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(fs.readFileSync(path.join(F.ROOT, 'sidebar-taxonomy-core-v3.js')));
      }
      res.setHeader('Content-Type', 'text/html');
      return res.end('<!doctype html><html lang="sq"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><h1>DRx</h1><script src="/sidebar-taxonomy-core-v3.js"></script></html>');
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
    await context.close(); context = null;

    // Reopen the actual browser profile after the short session has expired.
    offset += 9 * 3600000;
    context = await launch();
    page = await context.newPage();
    await page.goto(base + '/recetat.html?draft=demo');
    assert.equal(new URL(page.url()).pathname, '/recetat.html');
    assert.equal(new URL(page.url()).search, '?draft=demo');
    assert.ok(F.state.refreshes > 0);
    assert.ok(auth.sessionData((await context.cookies()).find(c => c.name === 'medindex_session')?.value));

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
    console.log(`${browserType.name()} remembered-device browser passed: HTTPS HttpOnly cookie persistence, profile restart after 9 hours, protected deep link, overnight active-tab recovery and persistent logout.`);
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    Date.now = realNow;
    fs.rmSync(temp, { recursive:true, force:true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
