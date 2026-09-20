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
    let failNext = false;
    let slowNext = false;
    let failCatalog = true;
    let hangNext = false;
    await page.addInitScript(() => Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedDose=text;}}}));
    await page.route('http://dosage.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth') return route.fulfill({json:{authenticated:true}});
      if (url.searchParams.get('view') === 'master-catalog') {
        if (failCatalog) { failCatalog = false; return route.abort('failed'); }
        return route.fulfill({json:engine.catalog()});
      }
      if (url.searchParams.get('view') === 'master-calculate') {
        calls++;
        if (failNext) { failNext = false; return route.abort('failed'); }
        if (slowNext) { slowNext = false; await new Promise(resolve => setTimeout(resolve, 500)); }
        if (hangNext) { hangNext = false; await new Promise(resolve => setTimeout(resolve, 13000)); }
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
    await page.getByRole('button',{name:'Ringarko skemat',exact:true}).click();
    await page.locator('#masterDrugs input').first().waitFor();
    await page.locator('#dosageSearch').fill('temperature');
    assert.ok(await page.locator('#masterDrugs').innerText().then(s=>s.includes('Paracetamol')));
    await page.locator('#masterDrugs label').filter({hasText:'Paracetamol'}).click();
    await page.getByRole('button',{name:'Plotëso fushën e radhës'}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'masterWeight');
    await page.locator('#masterWeight').fill('18');
    for (const box of await page.locator('#masterGates input').all()) await box.check();
    await page.waitForTimeout(250);
    assert.equal(calls,0,'Blank prior dose must not become zero');
    await page.getByRole('button',{name:'Asgjë',exact:true}).click();
    await page.locator('.dz-dose').waitFor();
    assert.match(await page.locator('.dz-dose').innerText(),/270/);
    await page.getByText('Si u llogarit doza',{exact:true}).click();
    assert.match(await page.locator('#masterResult').innerText(),/15 mg\/kg × 18 kg = 270 mg/);
    await page.locator('#masterCopy').click();
    assert.match(await page.evaluate(()=>window.copiedDose),/për një marrje/);
    await page.getByRole('button',{name:'Njësia ime…',exact:true}).click();
    assert.equal(await page.locator('#masterCopy').isDisabled(),true,'Unsaved concentration cannot be copied');
    await page.locator('#mineMg').fill('0');
    await page.getByRole('button',{name:'Ruaj për këtë bar',exact:true}).click();
    assert.match(await page.locator('.dz-editor [role="alert"]').innerText(),/më të mëdha se zero/);
    await page.locator('#mineMg').fill('125');
    await page.locator('#mineMl').fill('5');
    await page.getByRole('button',{name:'Ruaj për këtë bar',exact:true}).click();
    assert.match(await page.locator('.dz-volume').innerText(),/10,8 mL/);
    await page.locator('#masterCopy').click();
    assert.match(await page.evaluate(()=>window.copiedDose),/Produkt i zgjedhur manualisht/);
    slowNext = true;
    await page.locator('#masterWeight').fill('20');
    await page.waitForTimeout(220);
    await page.locator('#masterWeight').fill('21');
    await page.waitForTimeout(800);
    assert.match(await page.locator('.dz-dose').innerText(),/315/,'A delayed old response must not replace the current dose');
    failNext = true;
    await page.locator('#masterWeight').fill('18');
    await page.getByRole('button',{name:'Provo përsëri',exact:true}).waitFor();
    assert.equal(await page.locator('.dz-dose').isVisible(),false);
    await page.getByRole('button',{name:'Provo përsëri',exact:true}).click();
    await page.locator('.dz-dose').waitFor();
    assert.match(await page.locator('.dz-dose').innerText(),/270/);
    await page.locator('#drugPicker summary').click();
    await page.locator('#dosageSearch').fill('Tramadol');
    await page.locator('#masterDrugs label').click();
    assert.equal(await page.locator('#masterRegimens input:checked').count(),0,'Multiple regimens need an explicit choice');
    assert.equal(await page.locator('#regimenPicker').getAttribute('open'),'');
    assert.match(await page.locator('#masterRegimens').innerText(),/mg për marrje/);
    await page.locator('#masterRegimens label').first().click();
    if (await page.locator('#masterWeight').count()) assert.equal(await page.locator('#masterWeight').inputValue(),'18');
    if (await page.locator('#masterAge').count()) await page.locator('#masterAge').fill('18');
    for (const id of ['masterDaily','masterTotal']) if (await page.locator('#'+id).count()) await page.locator('#'+id).fill('0');
    for (const box of await page.locator('#masterGates input').all()) await box.check();
    await page.locator('.dz-dose').waitFor();
    assert.equal(await page.locator('input[name="dz-shelf"]').count(),0,'Parenteral routes must not use unverified shelf conversions');
    assert.equal(await page.getByRole('button',{name:'Njësia ime…',exact:true}).count(),0);
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
    hangNext = true;
    await page.locator('#masterWeight').fill('26');
    await page.getByRole('button',{name:'Provo përsëri',exact:true}).waitFor({timeout:16000});
    assert.equal(await page.locator('.dz-dose').isVisible(),false,'A timed-out request must not leave a dose');
    await page.getByRole('button',{name:'Provo përsëri',exact:true}).click();
    await page.locator('.dz-dose').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
    await page.setViewportSize({width:1440,height:1000});
    await page.waitForFunction(() => document.getElementById('drugPicker').open);
    assert.equal(await page.locator('#drugPicker').getAttribute('open'),'');
    assert.deepEqual(errors,[]);
    console.log('PASS: indication search, next field, formula, stale response rejection, network retry, route-bound conversion, daily copy, patient reset and responsive controls');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
