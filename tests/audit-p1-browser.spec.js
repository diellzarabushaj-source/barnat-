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
    if (url.pathname === '/api/auth') payload = {authenticated:true,user:{...identity,name:'Test Doctor'}};
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
