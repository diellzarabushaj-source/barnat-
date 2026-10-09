'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium,webkit } = require('@playwright/test');
const root = path.resolve(__dirname,'..');
const captured = [];
const fixture = `<!doctype html><html lang="sq"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:Arial,sans-serif;margin:24px}h1{font-size:36px}button,a{display:block;padding:16px;margin:12px 0}#spacer{height:0}</style>
<div id="spacer"></div><h1>DRx — Test klinik privat</h1><p id="privateText">Patient-secret-query-doctor@example.test</p>
<button id="interaction">Hap informacionin</button><a href="/next.html">Vazhdo</a>
<script type="module" src="/drx-runtime-telemetry.js"></script>
<script defer src="/fixture-auth.js"></script></html>`;
const server = http.createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url,'http://localhost').pathname;
    if (pathname === '/api/auth' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      captured.push({ body:JSON.parse(body),csrf:req.headers['x-csrf-token'],origin:req.headers.origin });
      res.statusCode = 204; return res.end();
    }
    if (pathname === '/index.html') { res.setHeader('Content-Type','text/html'); return res.end(fixture); }
    if (pathname === '/next.html') { res.setHeader('Content-Type','text/html'); return res.end('<!doctype html><h1>Faqja tjetër</h1>'); }
    if(pathname === '/fixture-auth.js') {
      res.setHeader('Content-Type','text/javascript');
      return res.end(`window.dispatchEvent(new CustomEvent('medindex:auth-ready',{detail:{authenticated:true,supabaseAuthenticated:true,offline:false,csrfToken:'browser-fixture-csrf',authUser:{status:'active'}}}));
        document.getElementById('interaction').addEventListener('click',()=>{const deadline=performance.now()+80;while(performance.now()<deadline){};document.getElementById('interaction').textContent='U hap';});`);
    }
    if (['/drx-runtime-telemetry.js','/vendor/web-vitals.js'].includes(pathname)) {
      if(pathname === '/vendor/web-vitals.js') await new Promise(resolve=>setTimeout(resolve,120));
      res.setHeader('Content-Type','text/javascript'); return res.end(fs.readFileSync(path.join(root,pathname.slice(1))));
    }
    res.statusCode = 404; res.end();
  } catch { res.statusCode = 500; res.end(); }
});

async function main() {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const selected = process.env.RUNTIME_TELEMETRY_BROWSER === 'webkit' ? [['WebKit',webkit]] : process.env.RUNTIME_TELEMETRY_BROWSER === 'chromium' ? [['Chromium',chromium]] : [['Chromium',chromium],['WebKit',webkit]];
  try {
    for (const [name,browserType] of selected) {
      const browser = await browserType.launch({ headless:true });
      try {
        for (const width of [390,1440]) {
          const start = captured.length;
          const context = await browser.newContext({ viewport:{ width,height:844 } });
          await context.addInitScript(() => { Object.defineProperty(window.crypto,'getRandomValues',{ value:array => { array.fill(0); return array; } }); });
          const page = await context.newPage();
          await page.goto(`${base}/index.html?patient=private-query`,{ waitUntil:'load' });
          await page.waitForFunction(() => Boolean(window.DRxRuntimeTelemetry));
          const supported=await page.evaluate(()=>({
            lcp:PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint'),
            inp:Boolean(window.PerformanceEventTiming && 'interactionId' in PerformanceEventTiming.prototype),
            cls:PerformanceObserver.supportedEntryTypes.includes('layout-shift'),
          }));
          await page.waitForTimeout(650);
          await page.evaluate(() => { document.getElementById('spacer').style.height = '140px'; });
          await page.waitForTimeout(650);
          await page.getByRole('button',{ name:'Hap informacionin' }).click();
          await page.waitForTimeout(550);
          await page.getByRole('link',{ name:'Vazhdo' }).click();
          await page.waitForURL('**/next.html');
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline && (supported.inp ? !captured.slice(start).some(item => item.body.events.some(event => event.name === 'INP')) : captured.length === start)) await new Promise(resolve => setTimeout(resolve,25));
          const reports = captured.slice(start);
          assert.ok(reports.length > 0,`${name}/${width}: no final delivery`);
          const events = reports.flatMap(item => item.body.events);
          for (const item of reports) {
            assert.equal(item.csrf,'browser-fixture-csrf'); assert.equal(item.origin,base);
            assert.equal(item.body.module,'registry'); assert.equal(item.body.device,width === 390 ? 'mobile' : 'desktop');
            assert.ok(!JSON.stringify(item.body).includes('private')); assert.ok(!JSON.stringify(item.body).includes('@'));
          }
          assert.ok(events.some(event => event.name === 'NAV'),`${name}/${width}: no sampled navigation`);
          if(supported.lcp) assert.ok(events.some(event => event.name === 'LCP' && event.value > 0),`${name}/${width}: native LCP missing`);
          else assert.ok(!events.some(event => event.name === 'LCP'),`${name}/${width}: unsupported LCP became a sample`);
          if(supported.inp) assert.ok(events.some(event => event.name === 'INP' && event.value >= 50),`${name}/${width}: trusted interaction INP missing`);
          else assert.ok(!events.some(event => event.name === 'INP'),`${name}/${width}: unsupported INP became a sample`);
          if (supported.cls) assert.ok(events.some(event => event.name === 'CLS' && event.value > 0),`${name}/${width}: native CLS missing`);
          else assert.ok(!events.some(event => event.name === 'CLS'),`${name}/${width}: unsupported CLS became a sample`);
          console.log(`${name}/${width}: supported ${Object.keys(supported).filter(key=>supported[key]).join('/')} metrics, unavailable metrics absent, final navigation delivery and clinical-text exclusion passed.`);
          await context.close();
        }
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
