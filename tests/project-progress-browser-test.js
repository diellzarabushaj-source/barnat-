'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
const payload = {
  ok:true, repository:'diellzarabushaj-source/barnat-', capturedAt:'2026-11-11T10:03:00Z', refreshAfterMs:300_000,
  sources:{main:'live',checks:'live',issues:'live',commits:'live'},
  main:{sha:'a'.repeat(40),shortSha:'aaaaaaa',title:'Polish DRx project',date:'2026-11-11T10:00:00Z'},
  deployment:{sha:'a'.repeat(40),shortSha:'aaaaaaa',state:'synced'},
  checks:{state:'passed',passed:8,failed:0,pending:0,total:8},
  issues:{total:4,closed:3,open:1,percent:75,exact:true,items:[{number:14,title:'Complete clinical review',updatedAt:'2026-11-11T09:00:00Z',labels:['clinical'],url:'https://github.com/diellzarabushaj-source/barnat-/issues/14'}]},
  commits:[{sha:'aaaaaaa',title:'Polish DRx project',date:'2026-11-11T10:00:00Z',url:'https://github.com/diellzarabushaj-source/barnat-/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}],
};

test('project pulse renders verified desktop/mobile metrics and keeps the admin gate', {
  skip:process.env.RUN_PROJECT_PULSE_BROWSER !== '1' ? 'Requires a browser-enabled runner' : false,
}, async () => {
  const server = http.createServer((req,res) => {
    const target = new URL(req.url,'http://localhost');
    const file = path.resolve(root,'.'+target.pathname);
    if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    for (const width of [1280,390]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      await page.route('**/api/project-progress', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)}));
      await page.route('**/api/neon-status', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({connected:true,counts:{drugs:1200,dosageRegimens:180,icdCodes:15000,labTests:90},overall:{code:'healthy',label:'Në rregull'},checkedAt:'2026-11-11T10:04:00Z'})}));
      await page.goto(`http://127.0.0.1:${server.address().port}/project-progress.html`);
      await page.locator('#pulsePercent').getByText('75%').waitFor();
      assert.equal(await page.locator('#pulseDeployState').textContent(),'I njëjtë me main');
      assert.equal(await page.locator('#pulseLiveDrugs').textContent(),'1.200');
      assert.equal(await page.locator('#pulseGate').isVisible(),false);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow,false,`horizontal overflow at ${width}px`);
      await page.close();
    }
    const unauthorized = await browser.newPage();
    await unauthorized.route('**/api/project-progress', route => route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({ok:false,error:'Qasja u refuzua'})}));
    await unauthorized.goto(`http://127.0.0.1:${server.address().port}/project-progress.html`);
    await unauthorized.locator('#pulseGateTitle').getByText('Vetëm për administratorin').waitFor();
    assert.equal(await unauthorized.locator('#pulseDashboard').isVisible(),false);
    await unauthorized.close();
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
