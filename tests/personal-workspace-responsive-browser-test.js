'use strict';
// Populated personal workspaces: document overflow alone misses clipped controls.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const { chromium, webkit, expect } = require('@playwright/test');
const { emptyUserLibrarySnapshot } = require('./phase5-browser-fixture');
const ROOT = path.resolve(__dirname, '..');
const widths = [320,360,390,430,600,760,768,1024,1440];
const products = [
  {id:'11111111-1111-4111-8111-111111111111',tradeName:'Aspetax Protect Adipharm — EMËR TESTUES SHUMË I GJATË PËR LEJUESHMËRINË NË TELEFON',activeSubstance:'Acetylsalicylic acid',strength:'100 mg',form:'Gastro-resistant tablet',registryNumber:98},
  {id:'22222222-2222-4222-8222-222222222222',tradeName:'BACTIGRAM',activeSubstance:'Cefaclor monohydrate',strength:'500 mg',form:'Capsule, hard',registryNumber:100},
  {id:'33333333-3333-4333-8333-333333333333',tradeName:'PRODUKTTESTUESMEIDENTITETSHUMËTËGJATËPATËNDARËDHEPAHAPËSIRAPËRKONTROLL',activeSubstance:'Substancë testuese',strength:'500 mg',form:'Tabletë',registryNumber:101},
];
const favorites = products.map((row,index)=>({entityType:'product',entityKey:row.id,payload:{...row,drugId:row.id},serverUpdatedAt:`2026-09-30T0${9-index}:00:00Z`}));
const snapshot = emptyUserLibrarySnapshot({favorites,entityNotes:favorites.slice(0,2).map(row=>({...row,rowVersion:1,content:'Shënim testues me tekst të gjatë. '+ 'https://example.test/'.repeat(12)})),noteVersions:favorites.slice(0,2).map(row=>({entityType:row.entityType,entityKey:row.entityKey,rowVersion:1,deleted:false}))});
(async()=>{
  const server = spawn(process.execPath,['tests/clinical-smoke-server.js'],{cwd:ROOT,env:{...process.env,PORT:'4197'},stdio:['ignore','pipe','pipe']});
  let browser,checked=0;
  try {
    await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([code])=>{throw new Error(`Preview exited: ${code}`);})]);
    const engine=process.env.PERSONAL_BROWSER==='webkit'?webkit:chromium;
    browser=await engine.launch({headless:true});
    for(const width of widths){
      const context=await browser.newContext({viewport:{width,height:width===760?430:844},serviceWorkers:'block',isMobile:width<=760,hasTouch:width<1024});
      let libraryReads=0;
      await context.route('**/api/user-library**',route=>{
        libraryReads++;
        return route.fulfill({json:snapshot});
      });
      await context.route('**/api/drug-search**',route=>{
        const url=new URL(route.request().url());
        return route.fulfill({json:url.searchParams.get('view')==='registry-detail'
          ?{ok:true,row:products.find(row=>row.id===url.searchParams.get('id'))||products[0]}
          :{ok:true,rows:products,pagination:{page:1,pageSize:25,total:3,totalPages:1}}});
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      for(const view of ['favorites','notes']){
        await page.goto(`http://127.0.0.1:4197/index.html#${view}`);
        await expect(page.locator('html')).toHaveAttribute('data-drx-sidebar-structure','taxonomy-v5');
        await expect(page.locator('#personalList .personal-item')).toHaveCount(view==='favorites'?3:2);
        await expect(page.locator('#pageTitle')).toHaveText(view==='favorites'?'Favoritët':'Shënimet');
        if(process.env.PERSONAL_AUDIT_OUTPUT&&width===390){
          fs.mkdirSync(process.env.PERSONAL_AUDIT_OUTPUT,{recursive:true});
          await page.screenshot({path:path.join(process.env.PERSONAL_AUDIT_OUTPUT,`${view}-${process.env.PERSONAL_BROWSER||'chromium'}-${width}.png`)});
        }
        const bounds=await page.evaluate(()=>{
          const box=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
          return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,workspace:box(document.getElementById('personalWorkspace')),
            controls:[...document.querySelectorAll('.personal-toolbar button,.personal-toolbar input,.personal-toolbar select,.personal-item-actions button')].map(el=>({id:el.id||el.textContent,...box(el)})),
            tabs:box(document.querySelector('.personal-tabs')),sort:box(document.getElementById('personalSortSelect')),
            content:[...document.querySelectorAll('.personal-item-title strong,.personal-item-meta,.personal-note-copy')].map(el=>({...box(el),scroll:el.scrollWidth,client:el.clientWidth}))};
        });
        assert.ok(bounds.scroll<=width+1,`${view}/${width}: page overflow`);
        for(const control of bounds.controls){
          assert.ok(control.x>=bounds.workspace.x-1&&control.right<=bounds.workspace.right+1,`${view}/${width}: clipped ${control.id}: ${JSON.stringify(bounds)}`);
          if(width<=760)assert.ok(control.height>=44&&control.width>=44,`${view}/${width}: touch target ${control.id}`);
        }
        for(const box of bounds.content){
          assert.ok(box.x>=bounds.workspace.x-1&&box.right<=bounds.workspace.right+1,`${view}/${width}: content bounds`);
          if(width<=760)assert.ok(box.scroll<=box.client+1,`${view}/${width}: clipped medicine identity or note`);
        }
        if(width<=760){
          assert.ok(bounds.tabs.bottom<=bounds.sort.y+1,`${view}/${width}: tabs and controls must stack`);
          assert.ok(bounds.controls.find(el=>el.id==='personalSearchInput').width>=160,`${view}/${width}: usable search field`);
        }
        await page.locator('#personalSortSelect').selectOption('name');
        await expect(page.locator('#personalList .personal-item').first()).toContainText('Aspetax');
        await page.locator('#personalSearchInput').fill('BACTIGRAM');
        await expect(page.locator('#personalList .personal-item')).toHaveCount(1);
        await expect(page.locator('#personalList')).toContainText('BACTIGRAM');
        await page.locator('#personalSearchInput').fill('nuk-ekziston');
        await expect(page.locator('#personalEmpty')).toBeVisible();
        await page.locator('#personalSearchInput').fill('');
        await page.locator('#personalSearchInput').blur();
        await expect(page.locator('#personalList .personal-item')).toHaveCount(view==='favorites'?3:2);
        const before=libraryReads;
        await page.locator('#personalRefreshButton').click();
        await expect(page.locator('#personalRefreshButton')).toBeEnabled();
        assert.ok(libraryReads>before,`${view}/${width}: explicit refresh reads library`);
        assert.deepEqual(errors,[],`${view}/${width}: runtime errors`);
        checked++;
      }
      await context.close();
    }
    console.log(`PASS: ${checked} populated Favorites/Notes checks in ${process.env.PERSONAL_BROWSER||'chromium'} at 320–1440px: unclipped controls, touch targets, wrapped identity, search, sort and refresh.`);
  }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
