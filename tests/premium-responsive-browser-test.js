'use strict';
// Real browser geometry and navigation checks; clinical datasets are read-only.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, expect } = require('@playwright/test');
const master = require('../lib/dozologjia-master');
const emergencyFixture = require('./urgjencat-browser-fixture');
const pediatricReference = {
 ...require('../data/pediatric-common-drugs-reference.json'),
 weightAgeDefaults:require('../data/pediatric-weight-age-defaults.json'),
 clinicalAudit:require('../data/pediatric-clinical-audit-v1.json'),
};
// Synthetic interface data only; no medical recommendation or live API access.
const labFixture = {ok:true,data:{source:'QA fixture',
 categories:[{id:'qa-category',title:'Kategori testuese'}],
 tests:[{id:'qa-test',categoryId:'qa-category',formName:'Analizë testuese',albanianName:'Vetëm kontroll i ndërfaqes'}],
 indications:[{id:'qa-diagnosis',slug:'qa-diagnosis',title:'Diagnozë testuese me emër të gjatë për kontrollin e pamjes',summary:'Përshkrim i gjatë testues që duhet të lexohet i plotë në telefon.',icdCodes:[],tests:[],catalogGaps:[]}],
}};
const ROOT = path.resolve(__dirname, '..');
const pages = ['index','klasifikimi','icd','dozologjia','antibiotiket','analizat','recetat','protokollet','medical-hub','urgjencat','sistemi'];
const output = process.env.PREMIUM_AUDIT_OUTPUT;
const rows = [{id:'11111111-1111-4111-8111-111111111111',registryNumber:1,pdid:'1001',tradeName:'PRODUKT TESTUES ME EMËR TË GJATË PËR KONTROLLIN E PAMJES',activeSubstance:'Substancë testuese',atc:'N02BE01',strength:'500 mg',form:'Tabletë',drugClass:'Produkt testues',use:'Vetëm testim i ndërfaqes',productStatus:'Gjenerik',prescriptionNotation:'Produkt testues',retailPrice:2.45}];
(async () => {
 const server = spawn(process.execPath, ['tests/clinical-smoke-server.js'], {cwd:ROOT,env:{...process.env,PORT:'4196'},stdio:['ignore','pipe','pipe']});
 let browser;
 try {
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([code])=>{throw new Error(`Preview exited: ${code}`);})]);
  const engine = process.env.PREMIUM_BROWSER || 'chromium';
  assert.ok(['chromium','webkit'].includes(engine), 'Supported browser engine');
  browser = await ({chromium,webkit})[engine].launch({headless:true});
  let checked = 0;
  for (const width of [320,390,768,1024,1440,1920]) {
   const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',isMobile:width<761,hasTouch:width<1024});
   await context.route('**/api/dosage?view=master-catalog', route => route.fulfill({json:master.catalog()}));
   await context.route('**/api/dosage?view=pediatric-common-reference', route => route.fulfill({json:pediatricReference}));
   await context.route('**/api/icd?dataset=labs', route => route.fulfill({json:labFixture}));
   await context.addInitScript(data=>{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(input,init)=>{
     const url=new URL(input instanceof Request?input.url:String(input),location.href);
     if(url.hostname==='4wdtp8cz.apicdn.sanity.io'&&url.pathname.includes('/data/query/production')){
      return Promise.resolve(new Response(JSON.stringify({result:data}),{status:200,headers:{'Content-Type':'application/json'}}));
     }
     return nativeFetch(input,init);
    };
   },emergencyFixture);
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
    if(name==='dozologjia'){
     await expect(page.locator('#pediatricCommonCount')).not.toContainText('Nuk u ngarkua');
     await expect(page.locator('#pediatricCommonSections')).toContainText('Paracetamol');
    }
    if(name==='urgjencat')await expect(page.locator('#emergencyDetail .ec-detail-inner')).toBeVisible();
    if(name==='analizat')await expect(page.locator('#labTestTotal')).toHaveText('1');
    const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.innerText.trim().length}));
    if(geometry.scroll>geometry.width+1){
     const offenders=await page.locator('.page-wrap *').evaluateAll(nodes=>nodes.map(el=>{
      const box=el.getBoundingClientRect(),style=getComputedStyle(el);
      return {tag:el.tagName,id:el.id,class:el.className,x:box.x,right:box.right,width:box.width,min:style.minWidth,overflow:style.overflowX};
     }).filter(el=>el.width>0&&el.right>innerWidth+1).slice(0,30));
     console.error(`${name}/${width} overflow diagnostics: ${JSON.stringify(offenders)}`);
    }
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
     const action=page.locator('#registryRows [data-open-row]').first();
     await expect(action).toBeVisible();
     if(width<761){
      const selection=page.locator('#registryRows [data-select-row]').first();
      await selection.check();
      await expect(page.locator('#selectedCount')).toHaveText('1');
      await expect(page.locator('#openPrescriptionButton')).toBeEnabled();
      await expect(dock).toBeVisible();
      await selection.uncheck();
      await expect(page.locator('#selectedCount')).toHaveText('0');
      const box=await action.boundingBox();assert.ok(box.x+box.width<=width+1,`registry/${width}: reachable row actions ${JSON.stringify(box)}`);
      await action.click();await expect(page.locator('#detailDrawer')).toHaveClass(/is-open/);
      await page.locator('#drawerClose').click();await expect(page.locator('#detailDrawer')).not.toHaveClass(/is-open/);
      const more=page.locator('#registryRows .registry-more-trigger').first();await more.click();
      const menu=page.locator('#registryRows .registry-more[open] .registry-more-menu');
      await expect(menu).toBeVisible();const menuBox=await menu.boundingBox();const dockBox=await dock.boundingBox();
      assert.ok(menuBox.y+menuBox.height<=dockBox.y,`registry/${width}: row menu clears navigation`);await more.click();
     }
     await page.locator('#searchInput').fill('nuk-ekziston');
     await expect(page.locator('#registryRows')).not.toContainText('PRODUKT TESTUES');
     if(width<761)await expect(dock).not.toBeVisible();
     await page.locator('#searchInput').fill('');
     await page.locator('#searchInput').blur();
     await expect(page.locator('#registryRows')).toContainText('PRODUKT TESTUES');
    }
    if(name==='protokollet'&&width<761){
     const metrics=await page.locator('.protocol-metric').all();
     assert.equal(metrics.length,4);
     const boxes=await Promise.all(metrics.map(metric=>metric.boundingBox()));
     assert.equal(Math.round(boxes[0].y),Math.round(boxes[1].y),'First summary row');
     assert.equal(Math.round(boxes[2].y),Math.round(boxes[3].y),'Second summary row');
     assert.ok(boxes[2].y>boxes[0].y,'Two summary rows');
     assert.ok(boxes[3].y+boxes[3].height-boxes[0].y<=200,'Compact summary keeps search reachable');
     const search=await page.locator('#protocolSearch').boundingBox();
     const dockBox=await dock.boundingBox();
     assert.ok(search.y+search.height<dockBox.y,'Protocol search above phone navigation');
     for(const control of await page.locator('.clinical-toolbar input,.clinical-toolbar select').all()){
      const box=await control.boundingBox();
      assert.ok(box.height>=44&&box.x>=0&&box.x+box.width<=width+1,'Protocol filter touch bounds');
     }
    }
    if(name==='analizat'&&width<761){
     await page.locator('#labDiseaseTrigger').click();
     const option=page.locator('#labDiseaseList [data-disease-id]').first();
     await expect(option).toBeVisible();
     const box=await option.boundingBox();
     assert.ok(box.height>=44&&box.x>=0&&box.x+box.width<=width+1,'Diagnosis picker stays reachable');
     await option.click();
     await expect(option).toHaveAttribute('aria-selected','true');
     await page.keyboard.press('Escape');
     await expect(page.locator('#labDiseasePopover')).not.toBeVisible();
     await expect(page.locator('#labDiseaseTriggerText')).toContainText('Diagnozë testuese');
     const text=await page.locator('#labDiseaseTriggerText').evaluate(el=>({font:parseFloat(getComputedStyle(el).fontSize),height:el.clientHeight,scroll:el.scrollHeight}));
     assert.ok(text.font>=14&&text.scroll<=text.height+1,'Selected diagnosis is readable without clipping');
     const triggerBox=await page.locator('#labDiseaseTrigger').boundingBox();
     const titleBox=await page.locator('#labDiseaseTriggerText').boundingBox();
     const manualBox=await page.locator('#labManualSearch').boundingBox();
     assert.ok(titleBox.y+titleBox.height<=triggerBox.y+triggerBox.height-6,'Diagnosis title fits inside its button');
     assert.ok(triggerBox.y+triggerBox.height<=manualBox.y,'Diagnosis button clears manual search');
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
    await expect.poll(async()=>{
     try{return await page.evaluate(()=>document.body.innerText.trim().length>40&&document.documentElement.scrollWidth<=innerWidth+1);}
     catch(error){if(/Execution context was destroyed/.test(error.message))return false;throw error;}
    },{message:`${name}/${width}: stable populated page without overflow`}).toBe(true);
    checked++;await page.close();
   }
   await context.close();
  }
  console.log(`PASS (${engine}): ${checked} route/viewport checks (320–1920px), populated registry, selection navigation, search, protocol controls, touch targets, drawer inert/Escape/focus and public pages.`);
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
