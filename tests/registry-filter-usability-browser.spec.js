'use strict';

const {test,expect}=require('@playwright/test');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const model=require('../registry-column-model.js');
const columnData=require('../lib/registry-column-data.js');
const ROOT=path.resolve(__dirname,'..');
let server,baseURL;
test.use({serviceWorkers:'block'});
const rows=[
 {id:'11111111-1111-4111-8111-111111111111',registryNumber:1,tradeName:'PARACETAMOL TEST',activeSubstance:'Paracetamol',atc:'N02BE01',strength:'500 mg',form:'Tabletë',use:'',retailPrice:0},
 {id:'22222222-2222-4222-8222-222222222222',registryNumber:2,tradeName:'AMOXICILLIN TEST',activeSubstance:'Amoxicillin',atc:'J01CA04',strength:'500 mg',form:'Kapsulë',use:'Përdorim testues',retailPrice:2.45},
 {id:'33333333-3333-4333-8333-333333333333',registryNumber:3,tradeName:'PARACETAMOL EXTRA TEST',activeSubstance:'Paracetamol',atc:'N02BE01',strength:'500 mg',form:'Tabletë',use:'Përdorim testues',retailPrice:4.8},
];
test.beforeAll(async()=>{
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const file=path.resolve(ROOT,'.'+url.pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(404);return res.end();}
  const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
  try{const body=fs.readFileSync(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));});
test.beforeEach(async({page})=>{
 await page.route('**/api/auth**',route=>new URL(route.request().url()).searchParams.has('scope')
  ?route.fulfill({json:{ok:true,registryColumns:Object.keys(model.fields)}})
  :route.fulfill({json:{authenticated:true,authUser:{id:'qa-owner'},user:{id:'qa-owner',email:'qa@example.test',name:'QA Doctor'}}}));
 await page.route('**/api/user-library**',route=>route.fulfill({json:{user:{id:'qa-owner',email:'qa@example.test'},favorites:[],entityNotes:[],noteVersions:[],tombstones:{entityNotes:[]},prescriptions:[],drugs:[]}}));
 await page.route('**/api/profile-photo**',route=>route.fulfill({json:{ok:true,photo:null}}));
 await page.route('**/api/dosage**',route=>route.fulfill({json:{ok:true,cards:[],adult:[],pediatric:[]}}));
 await page.route('**/api/drug-search**',route=>{
  const url=new URL(route.request().url()),filters=model.parseFilters(url.searchParams.get('columnFilters'));
  const options={q:url.searchParams.get('q'),atc:url.searchParams.get('atc'),formExact:url.searchParams.get('formExact'),columnFilters:filters};
  if(url.searchParams.get('view')==='registry-facets'){
   const column=url.searchParams.get('column');delete filters[column];
   const found=columnData.filterRows(rows,options,{});
   return route.fulfill({json:{ok:true,column,...columnData.facets(found,column,url.searchParams.get('valueSearch'),Number(url.searchParams.get('offset')))}});
  }
  const found=columnData.sortRows(columnData.filterRows(rows,options,{}),url.searchParams.get('sort'),url.searchParams.get('direction'));
  return route.fulfill({json:{ok:true,rows:found,pagination:{page:1,pageSize:25,total:found.length,totalPages:1}}});
 });
});
async function openFilter(page,column){
 if(await page.locator('#filterPanel').isHidden())await page.locator('#filterToggle').click();
 await page.locator('#columnFilterColumn').selectOption(column);await page.locator('#columnFilterOpen').click();
 await expect(page.locator('#columnFilterSearch')).toBeFocused();await expect(page.locator('.column-filter-value').first()).toBeVisible();
}

for(const width of [390,1440]){
 test(`Active filter descriptions show conditions, zero, empty values and combined selections at ${width}px`,async({page})=>{
  test.setTimeout(60_000); // Four complete edit/apply cycles, including WebKit touch interactions.
  await page.setViewportSize({width,height:900});await page.goto(baseURL+'/index.html');
  const resultRows=page.locator(width<761?'.registry-list-card':'#registryRows tr');
  await expect(resultRows).toHaveCount(3);
  await expect(page.locator('.column-filter-trigger')).toHaveCount(15);
  await expect(page.locator('#columnFilterOpen')).toHaveCount(1);
  await openFilter(page,'price');
  if(width<761){
   const targets=await page.locator('.column-filter-value,.column-select-all').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
   expect(targets).toHaveLength(4);for(const height of targets)expect(height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#columnFilterOperator').selectOption('between');
  await page.locator('#columnFilterText').fill('0');await page.locator('#columnFilterText2').fill('3');
  await page.locator('#registryColumnFilterPanel [data-apply]').click();
  await expect(resultRows).toHaveCount(2);
  const priceChip=page.locator('#registryActiveFilters [data-remove-filter="column:price"]');
  await expect(priceChip).toContainText('Çmimi: mes 0 – 3');await expect(priceChip).toHaveAttribute('aria-label',/mes 0 – 3/);
  await expect(priceChip).toHaveAttribute('data-remove-column','price');
  await expect(page.locator('.registry-column-filter-chips')).toBeHidden();
  await expect(page.locator('[data-remove-column]:visible')).toHaveCount(1);
  await priceChip.focus();await page.keyboard.press('Enter');await expect(priceChip).toHaveCount(0);await expect(page.locator('#filterToggle')).toBeFocused();
  await expect(resultRows).toHaveCount(3);
  await openFilter(page,'substance');await page.locator('#columnFilterSelectAll').uncheck();
  await page.locator('.column-filter-value input').nth(0).check();await page.locator('.column-filter-value input').nth(1).check();
  await page.locator('#columnFilterOperator').selectOption('contains');await page.locator('#columnFilterText').fill('amoxi');
  await page.locator('#registryColumnFilterPanel [data-apply]').click();
  await expect(resultRows).toHaveCount(1);
  const substanceChip=page.locator('#registryActiveFilters [data-remove-filter="column:substance"]');
  await expect(substanceChip).toContainText('Amoxicillin, Paracetamol · përmban amoxi');
  await openFilter(page,'use');await page.locator('#columnFilterOperator').selectOption('notEmpty');await page.locator('#registryColumnFilterPanel [data-apply]').click();
  const useChip=page.locator('#registryActiveFilters [data-remove-filter="column:use"]');
  await expect(useChip).toContainText('nuk është bosh');
  await expect(page.locator('[data-remove-column]:visible')).toHaveCount(2);
  await substanceChip.focus();await page.keyboard.press('Enter');await expect(substanceChip).toHaveCount(0);await expect(useChip).toBeFocused();
  await expect(resultRows).toHaveCount(2);
  await openFilter(page,'use');await page.locator('#columnFilterOperator').selectOption('empty');await page.locator('#registryColumnFilterPanel [data-apply]').click();
  await expect(useChip).toContainText('është bosh');await expect(useChip).not.toContainText('Të gjitha vlerat');
  await expect(resultRows).toHaveCount(1);
  await page.screenshot({path:test.info().outputPath('filter-conditions.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });

 for(const close of ['apply','cancel','escape','backdrop','clear','sort'])test(`Column filter retains drafts and restores focus after ${close} at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto(baseURL+'/index.html');await expect(page.locator(width<761?'.registry-list-card':'#registryRows tr')).toHaveCount(3);
  const panel=page.locator('#registryColumnFilterPanel');
   await openFilter(page,'price');
   await expect(page.locator('#appShell')).toHaveAttribute('inert','');
   expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
   await page.locator('#columnFilterOperator').selectOption('between');await page.locator('#columnFilterText').fill('0');await page.locator('#columnFilterText2').fill('5');
   for(const key of ['Control+k','Meta+k']){await page.keyboard.press(key);await expect(page.locator('#columnFilterSearch')).toBeFocused();}
   await expect(page.locator('#columnFilterText')).toHaveValue('0');await expect(page.locator('#columnFilterText2')).toHaveValue('5');
   await expect(panel).toBeVisible();
   await page.evaluate(()=>document.getElementById('searchInput').focus());await expect(page.locator('#columnFilterSearch')).toBeFocused();
   const scroll=await page.evaluate(()=>scrollY);await page.mouse.move(2,890);await page.mouse.wheel(0,500);
   // Wheel dispatch does not wait for scrolling; background WebKit windows can
   // suspend animation frames, so wait a bounded input-settling interval.
   await page.waitForTimeout(150);expect(await page.evaluate(()=>scrollY)).toBe(scroll);
   if(close==='apply')await page.screenshot({path:test.info().outputPath('column-dialog.png')});
   if(close==='escape')await page.keyboard.press('Escape');
   else if(close==='backdrop')await page.locator('.column-filter-backdrop').click({position:{x:2,y:890}});
   else await panel.locator(close==='sort'?'[data-direction="desc"]':`[data-${close}]`).click();
   await expect(panel).toBeHidden();await expect(panel).toHaveAttribute('inert','');
   await expect(page.locator('#appShell')).not.toHaveAttribute('inert','');
   expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');await expect(page.locator('#columnFilterOpen')).toBeFocused();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });

 test(`ATC hierarchy retains keyboard focus after column dialog cleanup at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto(baseURL+'/index.html');await expect(page.locator(width<761?'.registry-list-card':'#registryRows tr')).toHaveCount(3);
  await openFilter(page,'atc');await page.keyboard.press('Escape');
  await expect(page.locator('#columnFilterOpen')).toBeFocused();
  await page.locator('#atcPickerButton').click();await expect(page.locator('#atcPickerSearch')).toBeFocused();
  for(const code of ['J','J01','J01C'])await page.locator(`[data-atc-branch="${code}"] > summary`).click();
  await expect(page.locator('[data-atc-select="J01CA"]')).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.locator('#atcPickerButton')).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}

test('unknown totals preserve pagination and never display a false zero',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/api/drug-search**',route=>{
  const url=new URL(route.request().url());if(!['registry-page','registry-search'].includes(url.searchParams.get('view')))return route.fallback();
  const number=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||50);
  const found=Array.from({length:number===1?size:3},(_,i)=>({...rows[0],id:`00000000-0000-4000-8000-${String((number-1)*size+i+1).padStart(12,'0')}`,registryNumber:(number-1)*size+i+1}));
  return route.fulfill({json:{ok:true,rows:found,pagination:{page:number,pageSize:size,total:null,totalPages:null,hasPrevious:number>1,hasNext:number===1}}});
 });
 await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(50);
 await expect(page.locator('#pageIndicator')).toHaveText('1 / —');await expect(page.locator('#nextPageButton')).toBeEnabled();
 await expect(page.locator('#resultSummary')).not.toContainText('nga 0');
 await page.locator('#nextPageButton').click();await expect(page.locator('#registryRows tr')).toHaveCount(3);
 await expect(page.locator('#pageIndicator')).toHaveText('2 / —');await expect(page.locator('#nextPageButton')).toBeDisabled();await expect(page.locator('#prevPageButton')).toBeEnabled();
});

test('page navigation is guarded while a page is loading',async({page})=>{
 await page.setViewportSize({width:1440,height:900});let pending;
 await page.route('**/api/drug-search**',route=>{
  const url=new URL(route.request().url());if(!['registry-page','registry-search'].includes(url.searchParams.get('view')))return route.fallback();
  if(Number(url.searchParams.get('page'))===2){pending=route;return;}
  return route.fulfill({json:{ok:true,rows,pagination:{page:1,pageSize:50,total:103,totalPages:3,hasNext:true}}});
 });
 await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(3);await page.locator('#nextPageButton').click();
 await expect.poll(()=>Boolean(pending)).toBe(true);await expect(page.locator('#nextPageButton')).toBeDisabled();await expect(page.locator('#prevPageButton')).toBeDisabled();
 await pending.fulfill({json:{ok:true,rows,pagination:{page:2,pageSize:50,total:103,totalPages:3,hasPrevious:true,hasNext:true}}});
 await expect(page.locator('#pageIndicator')).toHaveText('2 / 3');await expect(page.locator('#prevPageButton')).toBeEnabled();await expect(page.locator('#nextPageButton')).toBeEnabled();
});

test('refresh replaces the cached search before revisiting the same term',async({page})=>{
 await page.setViewportSize({width:1440,height:900});let refreshed=false;
 await page.route('**/api/drug-search**',route=>{
  const url=new URL(route.request().url());if(!['registry-page','registry-search'].includes(url.searchParams.get('view')))return route.fallback();
  if(url.searchParams.get('refresh')==='true')refreshed=true;
  const q=url.searchParams.get('q'),found=q==='test'?[{...rows[0],tradeName:refreshed?'REFRESHED PRODUCT':'PREVIOUS PRODUCT'}]:q?[rows[1]]:rows;
  return route.fulfill({json:{ok:true,rows:found,pagination:{page:1,pageSize:50,total:found.length,totalPages:1}}});
 });
 await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(3);
 await page.locator('#searchInput').fill('test');await expect(page.locator('#registryRows')).toContainText('PREVIOUS PRODUCT');
 await page.locator('#refreshButton').click();await expect(page.locator('#registryRows')).toContainText('REFRESHED PRODUCT');
 await page.locator('#searchInput').fill('other');await expect(page.locator('#registryRows')).toContainText('AMOXICILLIN TEST');
 await page.locator('#searchInput').fill('test');await expect(page.locator('#registryRows')).toContainText('REFRESHED PRODUCT');
});

test('clearing during search debounce makes one settled registry request',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const queries=[];
 await page.route('**/api/drug-search**',route=>{const url=new URL(route.request().url());if(['registry-page','registry-search'].includes(url.searchParams.get('view')))queries.push(url.searchParams.get('q')||'');return route.fallback();});
 await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(3);queries.length=0;
 await page.clock.install();
 await page.evaluate(()=>{const input=document.getElementById('searchInput');input.value='amoxi';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('clearFiltersButton').click();});
 await page.clock.runFor(300);await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
 expect(queries).toEqual(['']);await expect(page.locator('#registryRows tr')).toHaveCount(3);
});

test('invalid successful HTML is an error and can be retried',async({page})=>{
 await page.setViewportSize({width:1440,height:900});let recover=false;
 await page.route('**/api/drug-search**',route=>{
  const url=new URL(route.request().url());if(!['registry-page','registry-search'].includes(url.searchParams.get('view'))||!url.searchParams.get('q'))return route.fallback();
  return recover?route.fulfill({json:{ok:true,rows:[rows[0]],pagination:{page:1,pageSize:50,total:1,totalPages:1}}}):route.fulfill({status:200,contentType:'text/html',body:'<html>proxy error</html>'});
 });
 await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(3);await page.locator('#searchInput').fill('invalid');
 await expect(page.locator('#emptyState h2')).toHaveText('Regjistri nuk u ngarkua');await expect(page.locator('#registryRows tr[data-row-id]')).toHaveCount(0);
 recover=true;await page.locator('#refreshButton').click();await expect(page.locator('#registryRows tr')).toHaveCount(1);await expect(page.locator('#emptyState')).toBeHidden();
});

test('a successful empty result clears an earlier network error',async({page})=>{
 await page.setViewportSize({width:1440,height:900});let recover=false;
 await page.route('**/api/drug-search**',route=>{
  const url=new URL(route.request().url());if(!['registry-page','registry-search'].includes(url.searchParams.get('view'))||!url.searchParams.get('q'))return route.fallback();
  return recover?route.fulfill({json:{ok:true,rows:[],pagination:{page:1,pageSize:50,total:0,totalPages:1}}}):route.fulfill({status:503,json:{ok:false,error:'Temporary unavailable'}});
 });
 await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(3);await page.locator('#searchInput').fill('nothing');
 await expect(page.locator('#emptyState h2')).toHaveText('Regjistri nuk u ngarkua');recover=true;await page.locator('#refreshButton').click();
 await expect(page.locator('#emptyState h2')).toHaveText('Nuk u gjet asnjë bar');await expect(page.locator('#emptyState p')).not.toContainText('Temporary');
});

for(const width of [390,1440])test(`facet timeouts expose a working retry at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});let attempts=0;
 await page.route('**/api/drug-search**',route=>{const url=new URL(route.request().url());if(url.searchParams.get('view')!=='registry-facets')return route.fallback();if(++attempts===1)return;return route.fallback();});
 await page.goto(baseURL+'/index.html');await expect(page.locator(width<761?'.registry-list-card':'#registryRows tr')).toHaveCount(3);await page.clock.install();
 await page.locator('#filterToggle').click();await page.locator('#columnFilterColumn').selectOption('name');await page.locator('#columnFilterOpen').click();
 await expect.poll(()=>attempts).toBe(1);await page.clock.runFor(20050);
 const retry=page.locator('#columnFilterValues button').filter({hasText:'Provo përsëri'});await expect(retry).toBeVisible();
 await retry.click();await expect(page.locator('.column-filter-value')).toHaveCount(3);await expect(page.locator('#columnFilterFeedback')).toContainText('3 vlera');
});

test('new facet text disables obsolete checkbox choices until it settles',async({page})=>{
 await page.setViewportSize({width:1440,height:900});let pending;
 await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(3);await openFilter(page,'name');
 await page.route('**/api/drug-search**',route=>new URL(route.request().url()).searchParams.get('valueSearch')==='par'?(pending=route,undefined):route.fallback());
 await page.locator('#columnFilterSearch').fill('par');await expect(page.locator('.column-filter-value input').first()).toBeDisabled();
 await expect.poll(()=>Boolean(pending)).toBe(true);await pending.fulfill({json:{ok:true,values:[{value:rows[0].tradeName,label:rows[0].tradeName,count:1}],total:1,hasMore:false}});
 await expect(page.locator('.column-filter-value')).toHaveCount(1);await expect(page.locator('.column-filter-value input')).toBeEnabled();
});

test('missing retail price is distinct from a real zero price',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/api/drug-search**',route=>new URL(route.request().url()).searchParams.get('view')==='registry-page'?route.fulfill({json:{ok:true,rows:[rows[0],{...rows[1],retailPrice:null}],pagination:{page:1,pageSize:50,total:2,totalPages:1}}}):route.fallback());
 await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(2);
 await expect(page.locator('#registryRows tr').nth(0).locator('[data-col="price"]')).toContainText(/0[,.]00/);
 await expect(page.locator('#registryRows tr').nth(1).locator('[data-col="price"]')).toHaveText('—');
});

test('a short new term cannot leave old products available for selection',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(3);
 await page.locator('#searchInput').fill('p');await expect(page.locator('#registryRows tr[data-row-id]')).toHaveCount(0);
 await expect(page.locator('#emptyState h2')).toHaveText('Vazhdo kërkimin');await expect(page.locator('#nextPageButton')).toBeDisabled();
 await page.locator('#searchInput').fill('7');await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
 await expect(page.locator('#emptyState h2')).not.toHaveText('Vazhdo kërkimin');
});

test('phone filter loading has one read-only list instead of old product actions',async({page})=>{
 await page.setViewportSize({width:390,height:844});let pending;
 await page.goto(baseURL+'/index.html');await expect(page.locator('.registry-list-card[data-row-id]')).toHaveCount(3);
 await page.route('**/api/drug-search**',route=>new URL(route.request().url()).searchParams.get('formCategory')?(pending=route,undefined):route.fallback());
 await page.locator('#filterToggle').click();await page.locator('#formPickerButton').click();await page.locator('[data-form-category="Kapsula"]').click();
 await expect.poll(()=>Boolean(pending)).toBe(true);await expect(page.locator('.registry-list-card[data-row-id]:visible')).toHaveCount(0);
 await expect(page.locator('#tableScroll')).toBeHidden();await expect(page.locator('#registryList')).toBeVisible();await expect(page.locator('.registry-list-skeleton')).not.toHaveCount(0);
 await pending.fulfill({json:{ok:true,rows:[rows[1]],pagination:{page:1,pageSize:25,total:1,totalPages:1}}});
 await expect(page.locator('.registry-list-card[data-row-id]')).toHaveCount(1);await expect(page.locator('#registryList')).toContainText('AMOXICILLIN TEST');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('too many searched values are explained before applying a broken filter',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(3);
 await page.route('**/api/drug-search**',route=>new URL(route.request().url()).searchParams.get('view')==='registry-facets'?route.fulfill({json:{ok:true,values:Array.from({length:150},(_,i)=>({value:'TEST '+i,label:'TEST '+i,count:1})),total:150,hasMore:false}}):route.fallback());
 await openFilter(page,'name');await page.locator('#columnFilterSearch').fill('test');await expect(page.locator('[data-only-shown]')).toBeEnabled();
 await page.locator('[data-only-shown]').click();await expect(page.locator('#columnFilterFeedback')).toContainText('100 vlera');
 await expect(page.locator('#registryColumnFilterPanel')).toBeVisible();
});

test('refresh failure cannot preserve products from a different search',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/api/drug-search**',route=>{
  const url=new URL(route.request().url());
  if(['registry-page','registry-search'].includes(url.searchParams.get('view'))&&url.searchParams.get('q')==='different')return route.fulfill({status:503,json:{ok:false,error:'Temporary unavailable'}});
  return route.fallback();
 });
 await page.goto(baseURL+'/index.html');await expect(page.locator('#registryRows tr')).toHaveCount(3);
 await page.evaluate(()=>{const input=document.getElementById('searchInput');input.value='different';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('refreshButton').click();});
 await expect(page.locator('#emptyState h2')).toHaveText('Regjistri nuk u ngarkua');
 await expect(page.locator('#registryRows tr[data-row-id]')).toHaveCount(0);
});
