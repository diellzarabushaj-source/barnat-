'use strict';
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/dozologjia-master');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let calls = 0;
    await page.addInitScript(() => Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedDose=text;}}}));
    await page.route('http://dosage.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth') return route.fulfill({json:{authenticated:true}});
      if (url.searchParams.get('view') === 'master-catalog') return route.fulfill({json:engine.catalog()});
      if (url.searchParams.get('view') === 'master-calculate') {
        calls++;
        return route.fulfill({json:engine.calculate(route.request().postDataJSON())});
      }
      const name = url.pathname.slice(1);
      const file = path.join(__dirname,'..',name);
      if (['dozologjia.html','dozologjia-v2.js','dozologjia-v2.css','drx-dashboard-stripe.css'].includes(name)) {
        return route.fulfill({body:fs.readFileSync(file),contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
      }
      return route.fulfill({body:'',contentType:'application/javascript'});
    });
    await page.goto('http://dosage.test/dozologjia.html');
    await page.locator('#masterDrugs input').first().waitFor();
    await page.locator('#dosageSearch').fill('temperature');
    assert.ok(await page.locator('#masterDrugs').innerText().then(s=>s.includes('Paracetamol')));
    await page.locator('#masterDrugs label').filter({hasText:'Paracetamol'}).click();
    await page.locator('#masterWeight').fill('18');
    for (const box of await page.locator('#masterGates input').all()) await box.check();
    await page.waitForTimeout(250);
    assert.equal(calls,0,'Blank prior dose must not become zero');
    await page.getByRole('button',{name:'Asgjë',exact:true}).click();
    await page.locator('.dz-dose').waitFor();
    assert.match(await page.locator('.dz-dose').innerText(),/270/);
    await page.locator('#masterCopy').click();
    assert.match(await page.evaluate(()=>window.copiedDose),/për një marrje/);
    await page.locator('#drugPicker summary').click();
    await page.locator('#dosageSearch').fill('Tramadol');
    await page.locator('#masterDrugs label').click();
    assert.equal(await page.locator('#masterRegimens input:checked').count(),0,'Multiple regimens need an explicit choice');
    await page.locator('#masterRegimens label').first().click();
    if (await page.locator('#masterWeight').count()) assert.equal(await page.locator('#masterWeight').inputValue(),'18');
    await page.getByRole('button',{name:'Pacient i ri'}).click();
    if (await page.locator('#masterAge').count()) assert.equal(await page.locator('#masterAge').inputValue(),'');
    assert.equal(await page.locator('#masterGates input:checked').count(),0);
    await page.locator('#drugPicker summary').click();
    await page.locator('#dosageSearch').fill('Diclofenac');
    await page.locator('#masterDrugs label').click();
    await page.locator('#masterWeight').fill('25');
    await page.locator('#masterAge').fill('8');
    for (const box of await page.locator('#masterGates input').all()) await box.check();
    await page.locator('#masterCopy').waitFor();
    await page.locator('#masterCopy').click();
    assert.match(await page.evaluate(()=>window.copiedDose),/gjithsej në 24 orë, jo për një marrje/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: indication search, explicit regimen, blank prior dose, calculation, new patient, mobile overflow and runtime errors');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
