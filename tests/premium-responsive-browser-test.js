'use strict';
// Real browser geometry and navigation checks; clinical datasets are read-only.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const master = require('../lib/dozologjia-master');
const ROOT = path.resolve(__dirname, '..');
const pages = ['index','klasifikimi','icd','dozologjia','antibiotiket','analizat','recetat','protokollet','medical-hub','urgjencat','sistemi'];
const output = process.env.PREMIUM_AUDIT_OUTPUT;
const rows = [{id:'11111111-1111-4111-8111-111111111111',registryNumber:1,pdid:'1001',tradeName:'PRODUKT TESTUES ME EMËR TË GJATË PËR KONTROLLIN E PAMJES',activeSubstance:'Substancë testuese',atc:'N02BE01',strength:'500 mg',form:'Tabletë',drugClass:'Produkt testues',use:'Vetëm testim i ndërfaqes',productStatus:'Gjenerik',prescriptionNotation:'Produkt testues',retailPrice:2.45}];
(async () => {
 const server = spawn(process.execPath, ['tests/clinical-smoke-server.js'], {cwd:ROOT,env:{...process.env,PORT:'4196'},stdio:['ignore','pipe','pipe']});
 let browser;
 try {
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([code])=>{throw new Error(`Preview exited: ${code}`);})]);
  browser = await chromium.launch({headless:true});
  let checked = 0;
  for (const width of [320,390,768,1024,1440,1920]) {
   const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',isMobile:width<761,hasTouch:width<1024});
   await context.route('**/api/dosage?view=master-catalog', route => route.fulfill({json:master.catalog()}));
   await context.route('**/api/drug-search**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('view') === 'registry-detail') return route.fulfill({json:{ok:true,row:{...rows[0],packaging:'20 tableta',manufacturer:'Test'}}});
    const q=(url.searchParams.get('q')||'').toLowerCase();
    const found=rows.filter(row=>`${row.tradeName} ${row.activeSubstance}`.toLowerCase().includes(q));
    return route.fulfill({json:{ok:true,rows:found,results:[],pagination:{page:1,pageSize:25,total:found.length,totalPages:1,hasPrevious:false,hasNext:false}}});
   });
   for (const name of pages) {
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:4196/${name}.html`);
    await expect(page.locator('html')).toHaveAttribute('data-drx-sidebar-structure','taxonomy-v5');
    await page.waitForTimeout(180);
    const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.innerText.trim().length}));
    assert.ok(geometry.body>40,`${name}/${width}: meaningful content`);
    assert.ok(geometry.scroll<=geometry.width+1,`${name}/${width}: page overflow ${geometry.scroll}`);
    const dock=page.locator('#drxMobileNav');
    await expect(dock).toHaveCount(1);
    if(width<761){
     await expect(dock).toBeVisible();
     await expect(dock.locator('a')).toHaveCount(4);
     assert.equal(await dock.locator('a[aria-current="page"]').count(),['index','icd','dozologjia','recetat'].includes(name)?1:0);
     for(const item of await dock.locator('a,button').all()){
      const box=await item.boundingBox();assert.ok(box.width>=44&&box.height>=44,`${name}/${width}: dock target`);
     }
     await dock.locator('button').click();
     await expect(page.locator('#menuButton')).toHaveAttribute('aria-expanded','true');
     assert.equal(await page.locator('.main-shell').evaluate(el=>el.inert),true);
     await page.keyboard.press('Escape');
     assert.equal(await page.locator('.main-shell').evaluate(el=>el.inert),false);
     assert.equal(await page.evaluate(()=>document.activeElement.closest('#drxMobileNav')?.id),'drxMobileNav');
    }else await expect(dock).not.toBeVisible();
    if(name==='index'){
     await expect(page.locator('#registryRows')).toContainText('PRODUKT TESTUES');
     await page.locator('#searchInput').fill('nuk-ekziston');
     await expect(page.locator('#registryRows')).not.toContainText('PRODUKT TESTUES');
     if(width<761)await expect(dock).not.toBeVisible();
     await page.locator('#searchInput').fill('');
     await page.locator('#searchInput').blur();
     await expect(page.locator('#registryRows')).toContainText('PRODUKT TESTUES');
    }
    if(output&&['index','recetat','dozologjia','urgjencat'].includes(name)&&[390,1440].includes(width)){
     fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`premium-${name}-${width}.png`)});
    }
    assert.deepEqual(errors,[],`${name}/${width}: runtime errors`);
    checked++;await page.close();
   }
   await context.close();
  }
  for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await context.route('https://accounts.google.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
   for(const name of ['landing','login','regjistrimi','admin-login','blog','kontakt','rreth-nesh','admin']){
    const page=await context.newPage();await page.goto(`http://127.0.0.1:4196/${name}.html`);await page.waitForTimeout(100);
    assert.ok(await page.evaluate(()=>document.body.innerText.trim().length>40),`${name}/${width}: content`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}/${width}: overflow`);
    checked++;await page.close();
   }
   await context.close();
  }
  console.log(`PASS: ${checked} route/viewport checks (320–1920px), populated registry, search, touch targets, app navigation, drawer inert/Escape/focus and public pages.`);
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
