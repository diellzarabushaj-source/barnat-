'use strict';
const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let server, baseURL;
const drugs = [
  {id:'11111111-1111-4111-8111-111111111111',registryNumber:1,tradeName:'PARACETAMOL TEST',activeSubstance:'Paracetamol',strength:'500 mg',form:'Tabletë',atc:'N02BE01',approvedPopulation:'Pediatric only'},
  {id:'22222222-2222-4222-8222-222222222222',registryNumber:2,tradeName:'AMOXICILLIN TEST',activeSubstance:'Amoxicillin',strength:'500 mg',form:'Kapsulë',atc:'J01CA04',approvedPopulation:'Pediatric and adult both'},
];
test.use({serviceWorkers:'block'});
test.beforeAll(async () => {
  server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://localhost');
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {await new Promise(resolve => server.close(resolve));});
async function api(page, identity = {id:'doctor-a',email:'a@example.test'}) {
  await page.route('**/api/**',async route => {
    const url = new URL(route.request().url());
    let payload = {ok:true,items:[],adult:[],pediatric:[],cards:[],forms:[]};
    if (url.pathname === '/api/auth') payload = url.searchParams.get('scope') === 'ui-preferences'
      ? {ok:true,userId:identity.id,registryColumns:Object.keys(require('../registry-column-model.js').fields)}
      : {authenticated:true,user:{...identity,name:'Test Doctor'}};
    if (url.pathname === '/api/user-library') payload = {ok:true,user:identity,prescriptions:[],favorites:[],drugs:[],notes:{},tombstones:{prescriptions:[],favorites:[],drugs:[]}};
    if (url.pathname === '/api/drug-search') {
      if (url.searchParams.get('view') === 'registry-detail') payload = {ok:true,row:drugs.find(drug => drug.id === url.searchParams.get('id'))};
      else payload = {ok:true,rows:drugs,results:drugs,pagination:{page:1,pageSize:50,total:2,totalPages:1,hasNext:false},query:{},meta:{source:'fixture'}};
    }
    await route.fulfill({json:payload});
  });
}
async function compose(page) {
  await page.goto(`${baseURL}/recetat.html`);
  await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
  await page.locator('#rxTabBtnCompose').click();
}
for (const width of [390,1440]) {
  test(`Recetat clinical context is legible and contained at ${width}px`,async ({page}) => {
    await page.setViewportSize({width,height:900});
    await api(page);
    const errors=[];page.on('pageerror',error => errors.push(error.message));
    await compose(page);
    const icons = await page.locator('#rxClinicalContext svg').evaluateAll(nodes => nodes.map(node => ({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,fill:getComputedStyle(node).fill})));
    expect(icons.length).toBeGreaterThan(3);
    expect(icons.every(icon => icon.width <= 24 && icon.height <= 24 && icon.fill === 'none')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`../../outputs/p1-recetat-${width}.png`,fullPage:false});
    expect(errors).toEqual([]);
  });
}
test('Complete draft survives reload, resets review and stays with its account',async ({page}) => {
  const identity={id:'doctor-a',email:'a@example.test'};
  await api(page,identity);
  await page.addInitScript(drug => {
    if (!sessionStorage.getItem('fixture-seeded')) {
      sessionStorage.setItem('fixture-seeded','true');
      sessionStorage.setItem('medindexPrescriptionSelection',JSON.stringify([drug]));
    }
  }, {...drugs[0],substance:'Paracetamol',route:'PO',doseInstruction:'1 tabletë',frequency:'çdo 8 orë',duration:'3 ditë',dispense:'Scat. No I',signatura:'Nga 1 tabletë çdo 8 orë.',sourceUrl:'https://example.test/source'});
  await compose(page);
  await expect(page.locator('.rx-order-card')).toHaveCount(1);
  await page.locator('#rxDiagnosis').fill('Diagnozë test për draftin');
  await page.locator('[data-order-field="duration"]').fill('5 ditë');
  await expect(page.locator('#rxDraftPersistence')).toContainText('u ruajt');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('medindex_rx_workspace_v2:doctor-a')));
  expect(saved.diagnosis).toBe('Diagnozë test për draftin');
  expect(saved.selectedDrugs[0].duration).toBe('5 ditë');
  expect(saved.selectedDrugs[0].sourceUrl).toBe('https://example.test/source');
  expect(saved.clinicalContext).toBeTruthy();
  // Seed obsolete approval flags: restoration must never accept them.
  await page.evaluate(() => {
    const key='medindex_rx_workspace_v2:doctor-a';const draft=JSON.parse(localStorage.getItem(key));
    draft.clinicalReviewConfirmed=true;draft.dosageReviewConfirmed=true;draft.generatedReviewConfirmed=true;
    localStorage.setItem(key,JSON.stringify(draft));
  });
  await page.reload();
  await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#rxDiagnosis')).toHaveValue(saved.diagnosis);
  await expect(page.locator('.rx-order-card')).toHaveCount(1);
  await expect(page.locator('[data-order-field="duration"]')).toHaveValue('5 ditë');
  await expect(page.locator('#rxClinicalReview input')).not.toBeChecked();
  await expect(page.locator('#rxSave')).toBeDisabled();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.MedIndexPrescriptionIcdContext))).toBe(true);
  await page.evaluate(()=>window.MedIndexPrescriptionIcdContext.apply({version:2,code:'J18.9',level:'subcategory',titleSq:'Pneumoni test',selectedAt:Date.now()}));
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('medindex_rx_workspace_v2:doctor-a'))?.diagnosisCoding?.code)).toBe('J18.9');
  await page.reload();
  await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>page.evaluate(()=>window.MedIndexPrescriptionIcdContext?.current?.()?.code)).toBe('J18.9');
  identity.id='doctor-b';identity.email='b@example.test';
  await page.reload();
  await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#rxDiagnosis')).toHaveValue('');
  await expect(page.locator('#rxComposer')).toHaveValue('');
  await expect(page.locator('.rx-order-card')).toHaveCount(0);
});
test('Drawer ignores late responses and keeps keyboard focus inside',async ({page}) => {
  await api(page);
  let resolveA;
  const pendingA = new Promise(resolve => {resolveA=resolve;});
  await page.route('**/api/drug-search?view=registry-detail**',async route => {
    const drug=drugs.find(item => item.id === new URL(route.request().url()).searchParams.get('id'));
    if (drug.id===drugs[0].id) await pendingA;
    await route.fulfill({json:{ok:true,row:drug}}).catch(() => {});
  });
  await page.goto(`${baseURL}/index.html`);
  const a=page.locator(`[data-open-row="${drugs[0].id}"]`),b=page.locator(`[data-open-row="${drugs[1].id}"]`);
  await a.click();
  await expect(page.locator('#drawerPrescriptionButton')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(a).toBeFocused();
  await b.click();
  await expect(page.locator('#drawerBody')).toContainText('Amoxicillin');
  resolveA();
  await expect(page.locator('#drawerBody')).not.toContainText('Paracetamol');
  await expect(page.locator('#drawerPrescriptionButton')).toBeEnabled();
  for (let i=0;i<18;i++) {
    await page.keyboard.press(i%2 ? 'Shift+Tab' : 'Tab');
    expect(await page.evaluate(() => document.querySelector('#detailDrawer').contains(document.activeElement))).toBe(true);
  }
  expect(await page.locator('#appShell').evaluate(node => node.inert)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(b).toBeFocused();
  expect(await page.locator('#appShell').evaluate(node => node.inert)).toBe(false);
});
test('Note and calculator dialogs trap focus, close with Escape and restore their trigger',async ({page}) => {
  await api(page);
  await page.goto(`${baseURL}/index.html`);
  const menu=page.locator(`[data-row-menu-key="${drugs[0].id}"] summary`);
  await menu.click();
  const note=page.locator(`[data-row-note="${drugs[0].id}"]`);
  await note.click();
  await expect(page.locator('#registryNoteText')).toBeFocused();
  for (let i=0;i<12;i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('#registryNoteDialog').contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#registryNoteDialog')).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  const calc=page.locator(`[data-row-menu-key="${drugs[0].id}"] [data-dose-calculator-open]`);
  await calc.click();
  await expect(page.locator('.drx-dose-dialog')).toBeVisible();
  for (let i=0;i<15;i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('.drx-dose-dialog').contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.drx-dose-dialog')).toBeHidden();
  await expect(calc).toBeFocused();
});
test('Search advances to page two and retains population information',async ({page}) => {
  await api(page);
  const requests=[];
  await page.route('**/api/drug-search**',async route => {
    const url=new URL(route.request().url());
    const view=url.searchParams.get('view');
    if (view!=='registry-page' && view!=='registry-search') return route.fallback();
    const searching=url.searchParams.get('q')==='amox';
    const roster=searching ? Array.from({length:87},(_,i)=>({...drugs[1],id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,registryNumber:i+1,tradeName:`AMOX TEST ${i+1}`})) : drugs;
    const number=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||50);
    if (searching) requests.push({number,sort:url.searchParams.get('sort')});
    await route.fulfill({json:{ok:true,rows:roster.slice((number-1)*size,number*size),pagination:{page:number,pageSize:size,total:roster.length,totalPages:Math.ceil(roster.length/size),hasPrevious:number>1,hasNext:number*size<roster.length},query:{q:url.searchParams.get('q')||''},meta:{source:'fixture'}}});
  });
  await page.goto(`${baseURL}/index.html`);
  await expect(page.locator('[data-open-row]')).toHaveCount(2);
  await page.locator('#searchInput').fill('amox');
  await expect(page.locator('#nextPageButton')).toBeEnabled();
  await page.locator('#nextPageButton').click();
  await expect(page.locator('#registryRows')).toContainText('AMOX TEST 87');
  await expect(page.locator('#nextPageButton')).toBeDisabled();
  expect(requests.some(request=>request.number===2)).toBe(true);
  await expect(page.locator('#registryRows')).toContainText('Të rritur');
});
test('Prescription regimen chooser owns keyboard focus without applying a dose',async ({page}) => {
  await api(page);
  const regimen={regimenId:'fixture-amoxicillin',substance:'Amoxicillin',atc:'J01CA04',form:'Kapsulë',referenceStrength:'500 mg',population:'Të rritur',route:'PO',status:'VERIFIKUAR',indication:'Indikacion test',frequency:'çdo 8 orë',duration:'7 ditë',sourceUrl:'https://example.test/source'};
  await page.route('**/api/prescription-dosage-context**',route=>route.fulfill({json:{ok:true,adult:[regimen],pediatric:[],cards:[],forms:[],meta:{clinicalAutoFillEnabled:true}}}));
  await compose(page);
  await page.locator('#rxAddDrugButton').click();
  await page.locator('#rxDrugSearch').fill('amox');
  await page.locator('#rxDrugResults [data-drug-result]').filter({hasText:'AMOXICILLIN TEST'}).click();
  await expect(page.locator('#rxDosageChooser')).toBeVisible();
  for (let i=0;i<12;i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>document.querySelector('#rxDosageChooser').contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#rxDosageChooser')).toBeHidden();
  await expect(page.locator('.rx-order-card')).toHaveCount(0);
  await expect(page.locator('#rxAddDrugButton')).toBeFocused();
});

// P2 regressions: first-visit phone layout, reversible filters and note recovery.
for (const width of [390,1440]) test(`Registry first visit and explicit preference at ${width}px`,async ({page}) => {
  await page.setViewportSize({width,height:844}); await api(page);
  await page.goto(`${baseURL}/index.html`);
  await expect(page.locator('[data-open-row]')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width === 390) {
    const cards=page.locator('.registry-list-card'); await expect(cards).toHaveCount(2);
    for (const field of ['substance','strength','form','population']) await expect(cards.first().locator(`[data-col="${field}"]`)).toBeVisible();
    expect((await cards.nth(1).locator('.drug-name').boundingBox()).y).toBeLessThan(844);
    await expect(page.locator('.metrics-row')).toBeHidden();
    await page.screenshot({path:`../../outputs/p2-registry-${width}.png`,fullPage:false});
    await expect(cards.first().locator('.registry-list-details')).not.toHaveAttribute('open','');
    await cards.first().locator('.registry-list-details summary').click();
    await expect(page.locator('#detailDrawer')).toHaveAttribute('aria-hidden','true');
    await expect(cards.first().locator('[data-col="adultDose"]')).toBeVisible();
    await page.locator('[data-view="table"]').click();
    await page.reload(); await expect(page.locator('#registryRows tr')).toHaveCount(2);
  } else {
    await expect(page.locator('#registryRows tr')).toHaveCount(2);
    await page.locator('[data-sort="name"]').click();
    await expect(page.locator('th[data-col="name"]')).toHaveAttribute('aria-sort','ascending');
    await page.locator('[data-sort="name"]').click();
    await expect(page.locator('th[data-col="name"]')).toHaveAttribute('aria-sort','descending');
  }
  if (width === 1440) await page.screenshot({path:`../../outputs/p2-registry-${width}.png`,fullPage:false});
});

test('URL restores page, form, sort and filters; removing a column preserves other criteria',async ({page}) => {
  await api(page);
  const seen=[];
  await page.route('**/api/drug-search**',async route => {
    const u=new URL(route.request().url()); if (u.searchParams.get('view') !== 'registry-page') return route.fallback();
    seen.push(Object.fromEntries(u.searchParams));
    const number=Number(u.searchParams.get('page') || 1),size=Number(u.searchParams.get('pageSize') || 50);
    await route.fulfill({json:{ok:true,rows:drugs,pagination:{page:number,pageSize:size,total:100,totalPages:4,hasNext:number<4},query:{}}});
  });
  const params=new URLSearchParams({q:'amox',page:'2',pageSize:'25',sort:'name',columnSort:'1',direction:'desc',formType:'form',formValue:'Kapsulë',atc:'J01',columnFilters:JSON.stringify({form:{mode:'include',values:['Kapsulë']},price:{op:'between',text:'2',text2:'8'}})});
  await page.goto(`${baseURL}/index.html?${params}`);
  await expect(page.locator('#registryActiveFilters')).toContainText('Çmimi: mes 2 – 8');
  await expect(page.locator('#searchInput')).toHaveValue('amox');
  await page.locator('[data-remove-filter="column:form"]').click();
  await expect(page.locator('[data-remove-filter="form-scope"]')).toBeVisible();
  const saved=page.url(); await page.reload(); await expect(page.locator('#registryRows tr')).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get('formValue')).toBe('Kapsulë');
  expect(seen.at(-1).formExact).toBe('Kapsulë'); expect(seen.at(-1).sort).toBe('name'); expect(seen.at(-1).direction).toBe('desc');
  await page.locator('[data-select-row]').first().check();
  await page.locator('#openPrescriptionButton').click();
  await expect(page).toHaveURL(/recetat\.html/);
  const back=page.locator(`a[href="${new URL(saved).pathname + new URL(saved).search}"]`).first();
  await expect(back).toHaveCount(1); await back.click();
  await expect(page.locator('#searchInput')).toHaveValue('amox');
  expect(new URL(page.url()).searchParams.get('formValue')).toBe('Kapsulë');
});

for (const mode of ['restore','conflict','failure','account change']) test(`Note delete and undo: ${mode}`,async ({page}) => {
  await api(page);
  const original='  Shënim i saktë\nMe rresht të dytë dhe ë.  ';
  let content=original,version=1; const writes=[]; let switched=false;
  await page.route('**/api/user-library**',async route => {
    const body=route.request().postDataJSON();
    const operation=body?.entityNotes?.[0] || body?.tombstones?.entityNotes?.[0];
    if(operation && body.noteOwner!==(switched ? 'doctor-b' : 'doctor-a')) return route.fulfill({status:409,json:{code:'NOTE_OWNER_CHANGED',error:'Llogaria ka ndryshuar.'}});
    if(operation && operation.expectedVersion!==version) return route.fulfill({status:409,json:{code:'NOTE_VERSION_CONFLICT',error:'Shënimi ka ndryshuar; rikthimi nuk e mbishkruan.'}});
    if (body?.tombstones?.entityNotes?.length) {
      if (mode === 'failure') return route.fulfill({status:503,json:{error:'Ruajtja dështoi'}});
      content=''; version++;
    }
    if (body?.entityNotes?.length) { content=body.entityNotes[0].content; writes.push(content); version++; }
    const identity={entityType:'product',entityKey:drugs[0].id,rowVersion:version};
    await route.fulfill({json:{ok:true,user:switched ? {id:'doctor-b',email:'b@example.test'} : {id:'doctor-a',email:'a@example.test'},favorites:[],entityNotes:content ? [{...identity,content}] : [],tombstones:{entityNotes:content ? [] : [{...identity,deletedAt:new Date().toISOString()}]},noteVersions:[{...identity,deleted:!content}],noteOperations:operation ? [{...identity,operationId:operation.operationId,deleted:!content}] : [],prescriptions:[],drugs:[],notes:{}}});
  });
  await page.goto(`${baseURL}/index.html`);
  await page.locator(`[data-row-menu-key="${drugs[0].id}"] summary`).click();
  await page.locator(`[data-row-note="${drugs[0].id}"]`).click();
  await expect(page.locator('#registryNoteText')).toHaveValue(original);
  await page.locator('[data-note-delete]').click();
  if (mode === 'failure') {
    await expect(page.locator('#registryNoteText')).toHaveValue(original);
    await expect(page.locator('#registryNoteUndo')).toHaveCount(0); expect(content).toBe(original); return;
  }
  await expect(page.locator('#registryNoteUndo button')).toBeVisible();
  if (mode === 'conflict') { content='Shënimi nga një pajisje tjetër'; version++; }
  if (mode === 'account change') switched=true;
  await page.locator('#registryNoteUndo button').click();
  if (mode === 'conflict') {
    await expect(page.locator('#registryNoteUndo')).toContainText('nuk e mbishkruan'); expect(writes).toEqual([]);
  } else if (mode === 'account change') {
    await expect(page.locator('#registryNoteUndo button')).toHaveCount(0); expect(writes).toEqual([]);
  } else { await expect(page.locator('#toast')).toContainText('u rikthye'); expect(content).toBe(original); expect(writes).toEqual([original]); }
});

for (const width of [390,1440]) test(`Medical Hub source details, review and print stay accessible at ${width}px`,async ({page}) => {
  const {medicalHubFixtureResponse}=require('./medical-hub-browser-fixture.js');
  await api(page); await page.setViewportSize({width,height:844});
  await page.route('**/api/medical-hub**',route => {
    const response=medicalHubFixtureResponse(new URL(route.request().url()));
    if (response.payload.item) {
      const text=value=>({_type:'block',style:'normal',children:[{_type:'span',text:value,marks:[]}]});
      const cell=(value,columnIndex,extra={})=>({_type:'medicalTableCell',columnIndex,content:[text(value)],...extra});
      const table={_type:'medicalTable',title:'Tabelë provuese',columns:['Kolona e parë','Kolona e dytë','Kolona e tretë'],rows:[{richCells:[cell('Përmbajtja e parë e gjatë për të provuar tabelën',0),cell('Qelizë e bashkuar',1,{rowSpan:2}),cell('Përmbajtja e tretë e gjatë',2)]},{richCells:[cell('Rreshti tjetër',0),cell('Vlera tjetër',2)]}]};
      Object.assign(response.payload.item,{_type:'medicalTopic',version:'source-faithful-google-doc-test',sections:[{_key:'reading',title:'Përmbajtja provuese',sectionType:'general',content:[table]},{_key:'rx',title:'Rx provuese',sectionType:'prescription',content:[text('1. Hapi provues'),text('OSE alternativa provuese'),table,text('2. Hapi tjetër provues')]}]});
    }
    return route.fulfill({status:response.status,json:response.payload});
  });
  await page.goto(`${baseURL}/medical-hub.html`);
  const source=page.locator('.ck-source-disclosure').first(); await expect(source).toBeVisible();
  await expect(source).not.toHaveAttribute('open','');
  await expect(page.locator('.ck-detail-head .ck-review-badge').first()).toBeVisible();
  await source.locator('summary').first().click(); await expect(source.locator('.ck-source-publication')).toContainText('Doctor on Duty');
  await source.locator('summary').first().click();
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint'))); await expect(source).toHaveAttribute('open','');
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint'))); await expect(source).not.toHaveAttribute('open','');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.ck-medical-table')).toHaveCount(2);
  await expect(page.locator('.ck-medical-table [rowspan="2"]')).toHaveCount(2);
  await expect(page.locator('.is-source-rx-section')).toContainText('OSE alternativa provuese');
  expect(await page.locator('.ck-medical-table-wrap').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).overflowX==='auto' && node.getBoundingClientRect().width<=innerWidth))).toBe(true);
  await page.screenshot({path:`../../outputs/p2-medical-hub-${width}.png`,fullPage:false});
});
