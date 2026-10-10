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
