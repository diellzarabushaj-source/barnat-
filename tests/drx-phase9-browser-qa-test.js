'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('@playwright/test');

const ROOT=path.resolve(__dirname,'..');
const PORT=Number(process.env.DRX_PHASE9_QA_PORT || 4179);
const BASE=`http://127.0.0.1:${PORT}`;
const DRUG_ID='11111111-2222-4333-8444-555555555555';

const searchPayload={
  ok:true,
  results:[{
    drugId:DRUG_ID,registryNumber:42,pdid:'PD-42',name:'PARACETAMOL PHASE 9',
    substance:'Paracetamol',strength:'500 mg',form:'Tabletë',atcCode:'N02BE01',
    readiness:'CALCULATOR_READY',calculable:true,indication:'Dhimbje / temperaturë',
    summary:'Regjim i verifikuar për QA të Fazës 9.',useStatus:'PEDIATRIC_AND_ADULT',
    requires:{weight:true,height:false,age:true,indication:true},
  }],
  facets:{all:1,ready:1,text:0,blocked:0},
};

const productPayload={
  ok:true,
  product:{
    drugId:DRUG_ID,registryNumber:42,pdid:'PD-42',name:'PARACETAMOL PHASE 9',
    substance:'Paracetamol',
    substanceConceptId:'22222222-3333-4444-8555-666666666666',
    substanceCanonicalName:'Paracetamol',conceptKind:'single',
    clinicalVariantId:'33333333-4444-4555-8666-777777777777',
    variantStatus:'BOUND',populationKey:'ADULT_AND_PEDIATRIC',populationStatus:'VERIFIED',
    productCount:3,strength:'500 mg',form:'Tabletë',atcCode:'N02BE01',
    readiness:'CALCULATOR_READY',calculable:true,
    summary:'Regjim i verifikuar për QA të Fazës 9.',useStatus:'PEDIATRIC_AND_ADULT',
    requires:{weight:true,height:false,age:true,indication:true},restriction:'',
    warnings:['Mos tejkalo maksimumin ditor të verifikuar.'],
    regimen:{indication:'Dhimbje / temperaturë',route:'oral',basis:'kg/ditë',dosesPerDay:4,intervalHours:6,minWeightKg:5,maxWeightKg:80},
    calculationRegimen:{valid:true,selectionId:'card:42:pediatric',regimenUuid:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',indication:'Dhimbje / temperaturë',route:'oral'},
    textRegimens:[{sourceKey:'card:42:pediatric',indication:'Dhimbje / temperaturë',dose:'10 mg/kg/dozë',route:'oral',frequency:'çdo 6 orë',duration:'sipas nevojës',maximum:'60 mg/kg/ditë',warnings:''}],
    source:{url:'https://example.test/paracetamol-smpc',section:'4.2',verificationStatus:'verified',verifiedAt:'2026-08-30'},
    phase9Context:{
      contextVersion:'drx-phase9-product-context-v1',identityStatus:'VERIFIED',
      formKey:'tablet',releaseKey:'immediate_release',routeKey:'oral',
      v3Published:true,v3ProductKey:'phase8-pilot-paracetamol',v3VersionNo:1,
      source:{sourceKey:'emc-phase9-browser-fixture',snapshotId:'44444444-5555-4666-8777-888888888888',sourceTier:'EU_REGULATOR',documentVersion:'SmPC 2026-08-30',documentDate:'2026-08-30'},
    },
  },
};

const calculationPayload={
  ok:true,
  calculation:{
    outcome:'CALCULATED',drug:{name:'PARACETAMOL PHASE 9'},indication:'Dhimbje / temperaturë',
    doseUnit:'mg',isRate:false,perDose:{min:250,max:250},measure:null,dosesPerDay:4,
    daily:{min:1000,max:1000},route:'oral',
    warnings:['QA fixture — jo të dhëna klinike production.'],
    steps:[{label:'Pesha',value:25,unit:'kg'}],
    source:{url:'https://example.test/paracetamol-smpc',section:'4.2',verifiedAt:'2026-08-30'},
  },
};

function emptyLibrary(){
  return {
    ok:true,version:1,
    user:{id:'phase9-browser-user',email:'phase9@example.test',role:'editor',name:'Phase 9 QA'},
    prescriptions:[],prescriptionChapters:[],favorites:[],entityNotes:[],drugs:[],
    tombstones:{prescriptions:[],favorites:[],entityNotes:[],drugs:[]},
    generatedAt:new Date().toISOString(),
  };
}
function upsertBy(list,item,keyFn){
  const key=keyFn(item);
  const index=list.findIndex(row=>keyFn(row)===key);
  if(index>=0) list[index]=item; else list.push(item);
}
async function waitForServer(){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    try{ const response=await fetch(BASE+'/dozologjia.html',{cache:'no-store'}); if(response.ok) return; }catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw new Error('Phase 9 smoke server did not start.');
}
async function installRoutes(page,library){
  await page.route('**/api/profile-photo**',async route=>{
    const method=route.request().method();
    if(method==='GET' || method==='HEAD'){
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:false,url:null})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:false,url:null})});
  });
  await page.route('**/api/dosage/search**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(searchPayload)}));
  await page.route('**/api/dosage/product/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(productPayload)}));
  await page.route('**/api/dosage/calculate',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(calculationPayload)}));
  await page.route('**/api/user-library',async route=>{
    const request=route.request();
    if(request.method()==='PUT'){
      const body=request.postDataJSON() || {};
      for(const item of body.favorites || []){
        upsertBy(library.favorites,{entityType:item.entityType,entityKey:item.entityKey,payload:item.payload || {},clientUpdatedAt:item.clientUpdatedAt || new Date().toISOString(),serverUpdatedAt:new Date().toISOString()},row=>`${row.entityType}|${row.entityKey}`);
      }
      for(const item of body.tombstones?.favorites || []){
        const key=`${item.entityType}|${item.entityKey}`;
        library.favorites=library.favorites.filter(row=>`${row.entityType}|${row.entityKey}`!==key);
      }
      for(const item of body.entityNotes || []){
        upsertBy(library.entityNotes,{entityType:item.entityType,entityKey:item.entityKey,content:item.content,clientUpdatedAt:item.clientUpdatedAt || new Date().toISOString(),serverUpdatedAt:new Date().toISOString()},row=>`${row.entityType}|${row.entityKey}`);
      }
      for(const item of body.tombstones?.entityNotes || []){
        const key=`${item.entityType}|${item.entityKey}`;
        library.entityNotes=library.entityNotes.filter(row=>`${row.entityType}|${row.entityKey}`!==key);
      }
      library.generatedAt=new Date().toISOString();
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(library)});
  });
}
async function inspectViewport(browser,entry){
  const context=await browser.newContext({viewport:entry.viewport});
  const page=await context.newPage();
  const library=emptyLibrary();
  const errors=[];
  page.on('pageerror',error=>errors.push('pageerror: '+error.message));
  page.on('console',message=>{ if(message.type()==='error') errors.push('console: '+message.text()); });
  await installRoutes(page,library);

  await page.goto(BASE+'/dozologjia.html',{waitUntil:'domcontentloaded'});
  await page.locator('#dosageSearch').waitFor({state:'visible',timeout:10000});
  await page.locator('#dosageSearch').fill('para');
  await page.locator('[data-drug-id="'+DRUG_ID+'"]').waitFor({state:'visible'});
  await page.locator('[data-drug-id="'+DRUG_ID+'"]').click();

  const tabs=page.locator('#dosageProductBody [role="tab"]');
  try{
    await tabs.first().waitFor({state:'visible',timeout:10000});
  }catch(error){
    const diagnostic=await page.evaluate(()=>({
      href:location.href,
      status:document.querySelector('#dosageStatus')?.textContent || '',
      productText:document.querySelector('#dosageProductBody')?.textContent || '',
      productHidden:document.querySelector('#dosageProductBody')?.hidden ?? null,
      resultCount:document.querySelectorAll('[data-drug-id]').length,
      tabCount:document.querySelectorAll('#dosageProductBody [role="tab"]').length,
    }));
    throw new Error(entry.name+': product drawer did not render: '+JSON.stringify({diagnostic,errors})+'; '+error.message);
  }
  assert.equal(await tabs.count(),7,entry.name+': must render 7 clinical tabs');
  assert.deepEqual((await tabs.allTextContents()).map(v=>v.trim()),['Përmbledhje','Përdorimi','Dozimi','Siguria','Produktet','Shënime','Burime'],entry.name+': tab order changed');
  assert.equal(await page.locator('.phase9-flow-step').count(),8,entry.name+': clinical flow must have 8 steps');
  assert.equal(await page.locator('[role="tab"][aria-selected="true"]').count(),1,entry.name+': exactly one active tab');

  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true',entry.name+': ArrowRight');
  await page.keyboard.press('End');
  assert.equal(await tabs.nth(6).getAttribute('aria-selected'),'true',entry.name+': End');
  await page.keyboard.press('Home');
  assert.equal(await tabs.nth(0).getAttribute('aria-selected'),'true',entry.name+': Home');

  await page.getByRole('tab',{name:'Produktet'}).click();
  assert.equal(await page.locator('[data-action="toggle-phase9-favorite"]').count(),4,entry.name+': header + entity favorite actions');
  const substanceFavorite=page.locator('[data-action="toggle-phase9-favorite"][data-entity-type="substance"]');
  await substanceFavorite.click();
  await page.getByRole('tab',{name:'Produktet'}).click();
  assert.equal(await substanceFavorite.getAttribute('aria-pressed'),'true',entry.name+': substance favorite persists');

  await page.getByRole('tab',{name:'Shënime'}).click();
  const productNote=page.locator('[data-phase9-note-entity="product"]');
  await productNote.fill('Shënim personal Phase 9 QA');
  await page.locator('[data-action="save-phase9-note"][data-entity-type="product"]').click();
  await page.getByRole('tab',{name:'Shënime'}).click();
  assert.equal(await productNote.inputValue(),'Shënim personal Phase 9 QA',entry.name+': note persists');

  await page.locator('#patientWeightKg').fill('25');
  await page.locator('#patientAgeMonths').fill('8');
  await page.locator('#patientAgeUnit').selectOption({label:'vjet'});
  await page.locator('#pediatricCalculate').click();
  const prescriptionPreview=page.locator('.phase9-prescription-preview');
  await prescriptionPreview.waitFor({state:'visible'});
  if(!(await prescriptionPreview.getAttribute('open'))){
    await prescriptionPreview.locator('summary').click();
  }
  await page.locator('.phase9-prescription-text').waitFor({state:'visible'});
  const rx=await page.locator('.phase9-prescription-text').innerText();
  for(const fragment of ['Rx — DRx','PARACETAMOL PHASE 9','Indikacioni:','Doza:','Frekuenca:','Rruga:','Burimi i dozimit:','Konteksti V3:']){
    assert.ok(rx.includes(fragment),entry.name+': missing '+fragment);
  }
  assert.equal(await page.locator('#dosageCopyResult').isVisible(),true,entry.name+': copy action visible');

  const layout=await page.evaluate(()=>{
    const visible=node=>{
      const style=getComputedStyle(node),rect=node.getBoundingClientRect();
      return style.display!=='none' && style.visibility!=='hidden' && rect.width>0 && rect.height>0;
    };
    const critical=[...document.querySelectorAll('.phase9-tab-button,.phase9-favorite-button,.phase9-entity-favorite,.phase9-save-note,.phase9-delete-note,#pediatricCalculate')]
      .filter(visible).map(node=>({label:(node.textContent || node.id || node.className).trim(),height:node.getBoundingClientRect().height}));
    return {
      innerWidth:window.innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
      critical,
      activePanels:[...document.querySelectorAll('[data-product-panel]')].filter(panel=>!panel.hidden).length,
      brokenAria:[...document.querySelectorAll('[role="tab"][aria-controls]')].filter(tab=>!document.getElementById(tab.getAttribute('aria-controls'))).length,
    };
  });
  assert.ok(layout.scrollWidth<=layout.innerWidth+1,entry.name+`: overflow ${layout.scrollWidth} > ${layout.innerWidth}`);
  assert.equal(layout.activePanels,1,entry.name+': exactly one panel');
  assert.equal(layout.brokenAria,0,entry.name+': broken aria-controls');
  if(entry.viewport.width<=760){
    assert.deepEqual(layout.critical.filter(item=>item.height<43.5),[],entry.name+': touch targets under 44px');
  }
  assert.deepEqual(errors,[],entry.name+': browser errors');

  const screenshot=`drx-phase9-browser-${entry.name}.png`;
  await page.screenshot({path:path.join(ROOT,screenshot),fullPage:true});
  await context.close();
  return {name:entry.name,viewport:entry.viewport,tabCount:7,flowSteps:8,personalFavorites:library.favorites,personalNotes:library.entityNotes,layout,screenshot};
}

async function main(){
  const server=spawn(process.execPath,['tests/clinical-smoke-server.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
  let stderr='';
  server.stderr.on('data',chunk=>{ stderr+=chunk; });
  try{
    await waitForServer();
    const browser=await chromium.launch({headless:true});
    try{
      const results=[];
      for(const entry of [
        {name:'mobile-390',viewport:{width:390,height:844}},
        {name:'tablet-768',viewport:{width:768,height:1024}},
        {name:'desktop-1440',viewport:{width:1440,height:1000}},
      ]) results.push(await inspectViewport(browser,entry));
      fs.writeFileSync(path.join(ROOT,'drx-phase9-browser-evidence.json'),JSON.stringify({evidenceVersion:'drx-phase9-browser-qa-v1',generatedAt:new Date().toISOString(),viewports:results,serverErrors:stderr.trim()},null,2)+'\n');
      console.log('DRx Phase 9 browser QA: PASS');
    }finally{ await browser.close(); }
  }finally{ server.kill('SIGTERM'); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
