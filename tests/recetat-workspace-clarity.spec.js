'use strict';
const {test,expect}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let server,baseURL;
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/medical-hub'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(require('./recetat-source-browser-fixture')(url)));}
  if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({ok:true,adult:[],pediatric:[],cards:[],items:[]}));}
  const file=path.resolve(ROOT,'.'+url.pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(404);return res.end();}
  const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
  try{const body=fs.readFileSync(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));});
function prescription(id,diagnosis,chapterKey,date,name){return {id,name:'Recetë sintetikë '+id,indication:diagnosis,chapterKey,createdAt:date,updatedAt:date,formatVersion:4,selectedDrugs:[],notes:[],missing:[],sourceText:'Rp:\nTab. '+name+' 10 mg\nSasia: 1 kuti\nS: Udhëzim sintetik për provë.',sections:[{type:'single',title:'Trajtimi',medications:[{name,form:'Tab.',dose:'10 mg',quantity:'1 kuti',individualSignature:'Udhëzim sintetik për provë.'}]}]};}
const SAVED=[prescription('old','Alfa QA','te-tjera','2026-10-01T10:00:00Z','Bar QA A'),prescription('new','Beta QA','respiratore','2026-10-23T10:00:00Z','Bar QA B'),prescription('middle','Gama QA','respiratore','2026-10-15T10:00:00Z','Bar QA C')];
async function setup(page,items=[],selection=[]){
 const writes=[];
 await page.addInitScript(({items,owner,selection})=>{
  localStorage.setItem('regjistriBarnave_protokollet_v1',JSON.stringify(items));localStorage.setItem('medindex_prescription_starter_seed_v1','1');localStorage.setItem('medindex_user_library_meta_v1',JSON.stringify({owner}));
  if(selection.length)sessionStorage.setItem('medindexPrescriptionSelection',JSON.stringify(selection));
 },{items,owner:OWNER,selection});
 await page.route('**/api/auth**',route=>route.fulfill({json:{authenticated:true,authUser:{id:OWNER},user:{id:OWNER,email:'qa@example.test',name:'QA'},csrfToken:'synthetic'}}));
 await page.route('**/api/user-library**',route=>{
  if(route.request().method()!=='GET')writes.push(route.request().postDataJSON());
  return route.fulfill({json:{ok:true,version:1,user:{id:OWNER},prescriptions:items.map(payload=>({clientId:payload.id,payload,rowVersion:1,clientUpdatedAt:payload.updatedAt})),prescriptionVersions:items.map(p=>({clientId:p.id,rowVersion:1,deleted:false})),favorites:[],entityNotes:[],noteVersions:[],drugs:[],tombstones:{prescriptions:[],favorites:[],entityNotes:[],drugs:[]}}});
 });
 await page.goto(baseURL+'/recetat.html');await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');return writes;
}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
for(const width of [320,390,760,1440]){
 test('personal library filters, sorting and secondary actions at '+width+'px',async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));const writes=await setup(page,SAVED);
  await page.locator('#rxTabBtnLibrary').click();await expect(page.locator('.rx-saved-card')).toHaveCount(3);
  await expect(page.locator('.rx-saved-card').first()).toHaveAttribute('data-saved-id','new');
  await expect(page.locator('#rxChapterNav [data-rx-chapter]')).toHaveCount(2);
  await expect(page.locator('[data-delete-saved="new"]')).toBeHidden();
  await page.locator('#rxSavedSort').selectOption('oldest');await expect(page.locator('.rx-saved-card').first()).toHaveAttribute('data-saved-id','old');
  await page.locator('#rxSavedSort').selectOption('title');await expect(page.locator('.rx-saved-card h3')).toHaveText(['Alfa QA','Beta QA','Gama QA']);
  await page.locator('#rxSavedSearch').fill('gama bar');await expect(page.locator('.rx-saved-card')).toHaveCount(1);await expect(page.locator('.rx-saved-card')).toHaveAttribute('data-saved-id','middle');
  await page.locator('#rxLibraryReset').click();await expect(page.locator('.rx-saved-card')).toHaveCount(3);
  await page.locator('[data-rx-chapter="respiratore"]').click();await expect(page.locator('.rx-saved-card')).toHaveCount(2);await expect(page.locator('#rxFolderSelect')).toHaveValue('respiratore');
  await page.locator('#rxFolderSelect').selectOption('pediatri');await expect(page.locator('.rx-saved-empty')).toContainText('Nuk u gjet');await expect(page.locator('[data-rx-chapter="pediatri"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-rx-reset-library]').click();await expect(page.locator('.rx-saved-card')).toHaveCount(3);await expect(page.locator('#rxFolderSelect')).toHaveValue('all');
  const menu=page.locator('[data-saved-id="old"] .rx-saved-more');await menu.locator('summary').click();await expect(menu.locator('[data-duplicate-saved]')).toBeVisible();await menu.locator('[data-duplicate-saved]').focus();await page.keyboard.press('Escape');await expect(menu).not.toHaveAttribute('open','');await expect(menu.locator('summary')).toBeFocused();
  await noOverflow(page);await page.screenshot({path:testInfo.outputPath('recetat-library-'+width+'.png'),fullPage:true});
  await page.locator('[data-open-saved="old"]').click();await expect(page.locator('#rxTabCompose')).toBeVisible();await expect(page.locator('#rxDiagnosis')).toHaveValue('Alfa QA');await expect(page.locator('#rxClinicalReview input')).not.toBeChecked();await expect(page.locator('#rxSave')).toBeDisabled();
  expect(writes.flatMap(write=>write.prescriptions||[])).toEqual([]);expect(writes.flatMap(write=>write.tombstones?.prescriptions||[])).toEqual([]);expect(errors).toEqual([]);
 });
 test('composer gives the next action without bypassing review at '+width+'px',async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await setup(page,[],[{key:'qa-drug',substance:'Paracetamol',tradeName:'QA product',strength:'500 mg',form:'Tablet',route:'PO',allowedRoutes:['PO']}]);
  await page.locator('#rxTabBtnCompose').click();await expect(page.locator('.rx-order-card')).toHaveCount(1);await expect(page.locator('#rxContextPanel')).not.toHaveAttribute('open','');
  await expect(page.locator('#rxNextHint')).toContainText('Plotëso Paracetamol');await page.locator('#rxNextAction').click();await expect(page.locator('[data-order-field="doseInstruction"]')).toBeFocused();
  for(const [field,value]of Object.entries({doseInstruction:'1 tabletë',frequency:'Sipas udhëzimit QA',duration:'Për provë',dispense:'1 kuti'}))await page.locator('[data-order-field="'+field+'"]').fill(value);
  await expect(page.locator('#rxPreview')).toContainText('Paracetamol');await expect(page.locator('#rxNextHint')).toContainText('konfirmo skemën');await expect(page.locator('#rxSave')).toBeDisabled();
  await page.locator('#rxNextAction').click();await expect(page.locator('#rxDosageReview input')).toBeFocused();await page.locator('#rxDosageReview input').check();await expect(page.locator('#rxNextHint')).toContainText('konfirmo kontrollin');
  await page.locator('#rxNextAction').click();await expect(page.locator('#rxClinicalReview input')).toBeFocused();await page.locator('#rxClinicalReview input').check();await expect(page.locator('#rxSave')).toBeEnabled();await expect(page.locator('#rxNextTitle')).toHaveText('Gati për ruajtje');
  await page.locator('[data-order-field="dispense"]').dispatchEvent('change');await expect(page.locator('#rxSave')).toBeEnabled();
  await noOverflow(page);await page.screenshot({path:testInfo.outputPath('recetat-compose-ready-'+width+'.png')});
  await page.locator('[data-order-field="doseInstruction"]').fill('');await expect(page.locator('#rxSave')).toBeDisabled();await expect(page.locator('#rxNextHint')).toContainText('doza');
  await page.locator('#rxContextPanel > summary').click();await page.locator('#rxPediatricToggle').click();await expect(page.locator('#rxStatus')).toContainText('grupmosha nuk ndryshohet');await expect(page.locator('#rxContextBrief')).toContainText('Të rritur');
  await page.locator('#rxNew').click();await page.locator('#rxPediatricToggle').click();await expect(page.locator('#rxPatientAge')).toBeVisible();await expect(page.locator('#rxContextBrief')).toContainText('Pediatrike');
  await noOverflow(page);await page.screenshot({path:testInfo.outputPath('recetat-compose-'+width+'.png'),fullPage:true});
 });
}
test('empty library leads to the existing draft, preserving its text',async({page})=>{
 await setup(page);await page.locator('#rxTabBtnCompose').click();await page.locator('#rxFreeTextPanel > summary').click();await page.locator('#rxComposer').fill('QA physician draft');await page.locator('#rxTabBtnLibrary').click();await expect(page.locator('.rx-saved-empty')).toContainText('Recetat e tua ruhen këtu');await page.locator('[data-rx-show-compose]').click();await expect(page.locator('#rxTabCompose')).toBeVisible();await expect(page.locator('#rxComposer')).toHaveValue('QA physician draft');
});

const QA_DRUG={key:'qa-paracetamol',substance:'Paracetamol',tradeName:'QA product',strength:'500 mg',form:'Tablet',route:'PO',allowedRoutes:['PO']};
const QA_COMPLETE={...QA_DRUG,doseInstruction:'1 tabletë',frequency:'çdo 12 orë',duration:'7 ditë',dispense:'1 kuti'};
async function compose(page,selection=[]){await setup(page,[],selection);await page.locator('#rxTabBtnCompose').click();}
async function picker(page){await page.locator('#rxAddDrugButton').click();await expect(page.locator('#rxDrugSearch')).toBeFocused();}
async function answerSearch(page,drug=QA_DRUG){await page.route('**/api/drug-search?**',route=>route.fulfill({json:{ok:true,results:[drug]}}));}

test('inline search closes results with Escape and keeps the medicine input available',async({page})=>{
 await compose(page);await answerSearch(page);await picker(page);await expect(page.locator('#rxDrugPopover')).toHaveAttribute('role','search');
 await page.locator('#rxDrugSearch').fill('para');await expect(page.locator('[data-drug-result]')).toHaveCount(1);await page.keyboard.press('Escape');
 await expect(page.locator('#rxDrugResults')).toBeHidden();await expect(page.locator('#rxDrugSearch')).toBeVisible();await expect(page.locator('#rxDrugSearch')).toBeFocused();await expect(page.locator('#rxAddDrugButton')).toHaveAttribute('aria-expanded','false');
});

test('typing immediately removes selectable results before the next search debounce',async({page})=>{
 await compose(page);await answerSearch(page);await picker(page);await page.locator('#rxDrugSearch').fill('para');await expect(page.locator('[data-drug-result]')).toHaveCount(1);
 await page.locator('#rxDrugSearch').fill('p');await page.locator('#rxDrugSearch').press('Enter');await expect(page.locator('[data-drug-result]')).toHaveCount(0);await expect(page.locator('.rx-order-card')).toHaveCount(0);
 await expect(page.locator('#rxDrugResults')).toContainText('2 shkronja');
});

test('a slow previous response cannot overwrite a cached current search',async({page})=>{
 await compose(page);let release,started=false,finished=false;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/drug-search?**',async route=>{const q=new URL(route.request().url()).searchParams.get('q');if(q==='slow'){started=true;await gate;await route.fulfill({json:{results:[{...QA_DRUG,substance:'Old QA'}]}}).catch(()=>{});finished=true;}else await route.fulfill({json:{results:[QA_DRUG]}});});
 await picker(page);await page.locator('#rxDrugSearch').fill('para');await expect(page.locator('[data-drug-result]')).toHaveCount(1);
 await page.locator('#rxDrugSearch').fill('slow');await expect.poll(()=>started).toBe(true);
 await page.locator('#rxDrugSearch').fill('para');await expect(page.locator('[data-drug-result]')).toContainText('Paracetamol');release();await expect.poll(()=>finished).toBe(true);await expect(page.locator('#rxDrugResults')).not.toContainText('Old QA');
});

test('malformed search responses expose retry instead of pretending no medicine exists',async({page})=>{
 await compose(page);let calls=0;await page.route('**/api/drug-search?**',route=>++calls===1?route.fulfill({status:200,contentType:'text/html',body:'<html>proxy error</html>'}):route.fulfill({json:{results:[QA_DRUG]}}));
 await picker(page);await page.locator('#rxDrugSearch').fill('para');await expect(page.locator('[data-search-retry]')).toBeVisible();await page.locator('[data-search-retry]').click();await expect(page.locator('[data-drug-result]')).toHaveCount(1);
});

test('a repeated medicine choice preserves the existing clinician-entered dose',async({page})=>{
 await compose(page,[QA_COMPLETE]);await answerSearch(page);await picker(page);await page.locator('#rxDrugSearch').fill('para');await page.locator('[data-drug-result]').click();
 await expect(page.locator('.rx-order-card')).toHaveCount(1);await expect(page.locator('[data-order-field="doseInstruction"]')).toHaveValue('1 tabletë');await expect(page.locator('#rxStatus')).toContainText('tashmë');
});

test('starting a new prescription rejects a late medicine-detail response',async({page})=>{
 await compose(page);let release,started=false,finished=false;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/drug-search?**',async route=>{if(new URL(route.request().url()).searchParams.get('view')==='registry-detail'){started=true;await gate;await route.fulfill({json:{row:{...QA_DRUG,id:'late'}}}).catch(()=>{});finished=true;}else await route.fulfill({json:{results:[{...QA_DRUG,id:'late'}]}});});
 await picker(page);await page.locator('#rxDrugSearch').fill('para');await page.locator('[data-drug-result]').click();await expect.poll(()=>started).toBe(true);await page.locator('#rxNew').click();release();await expect.poll(()=>finished).toBe(true);await expect(page.locator('.rx-order-card')).toHaveCount(0);await expect(page.locator('#rxComposer')).toHaveValue('');
});

test('automatic patient instructions clear with the dose and manual overrides can be reset',async({page})=>{
 await compose(page,[QA_COMPLETE]);const card=page.locator('.rx-order-card');await expect(card.locator('[data-order-signature-preview]')).toContainText('1 tabletë');
 await card.locator('[data-order-field="doseInstruction"]').fill('');await expect(card.locator('[data-order-signature-preview]')).not.toContainText('1 tabletë');await expect(page.locator('#rxSave')).toBeDisabled();
 await card.locator('[data-order-field="doseInstruction"]').fill('2 tableta');await card.locator('.rx-signature-editor > summary').click();await card.locator('[data-order-field="signatura"]').fill('Udhëzim manual QA.');
 await expect(card.locator('[data-order-signature-preview]')).toHaveText('Udhëzim manual QA.');await card.locator('[data-auto-signature]').click();await expect(card.locator('[data-order-signature-preview]')).toContainText('2 tableta');await expect(card.locator('[data-auto-signature]')).toBeHidden();
});

test('a reopened structured prescription edits the same text that is previewed and saved',async({page})=>{
 const saved={...prescription('structured','QA diagnosis','te-tjera','2026-10-23T10:00:00Z','Paracetamol'),composerOrigin:'structured',selectedDrugs:[{...QA_COMPLETE,dosageStatus:'requires-review',regimenId:'qa-regimen'}]};
 await setup(page,[saved]);await page.locator('#rxTabBtnLibrary').click();await page.locator('[data-open-saved="structured"]').click();await page.locator('[data-order-field="doseInstruction"]').fill('2 tableta');await expect(page.locator('#rxPreview')).toContainText('2 tableta');await expect(page.locator('#rxComposer')).toHaveValue(/2 tableta/);await expect(page.locator('#rxSave')).toBeDisabled();
 await page.locator('#rxDosageReview input').check();await page.locator('#rxClinicalReview input').check();await page.locator('#rxSave').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('regjistriBarnave_protokollet_v1')).find(p=>p.id==='structured')?.sourceText)).toContain('2 tableta');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('regjistriBarnave_protokollet_v1')).find(p=>p.id==='structured'));expect(stored.composerOrigin).toBe('structured');
});

test('manual source text is preserved until explicit conversion and remains recoverable',async({page})=>{
 const saved={...prescription('manual','QA manual','te-tjera','2026-10-23T10:00:00Z','Paracetamol'),selectedDrugs:[QA_COMPLETE]};
 await setup(page,[saved]);await page.locator('#rxTabBtnLibrary').click();await page.locator('[data-open-saved="manual"]').click();await expect(page.locator('#rxComposer')).toHaveValue(saved.sourceText);await expect(page.locator('[data-order-field="doseInstruction"]')).toBeDisabled();
 await page.locator('#rxUseStructured').click();await page.locator('[data-order-field="doseInstruction"]').fill('2 tableta');await expect(page.locator('#rxPreview')).toContainText('2 tableta');await page.locator('#rxRestoreManual').click();await expect(page.locator('#rxComposer')).toHaveValue(saved.sourceText);await expect(page.locator('[data-order-field="doseInstruction"]')).toBeDisabled();await expect(page.locator('#rxSave')).toBeDisabled();
});

test('a late AI response cannot replace a newer manual edit',async({page})=>{
 await compose(page);await page.locator('#rxFreeTextPanel > summary').click();await page.locator('#rxComposer').fill('Rp:\nTab. Bar QA 10 mg\nSasia: 1 kuti\nS: Udhëzim fillestar.');
 let release,started=false,finished=false;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/gemini-prescription',async route=>{started=true;await gate;await route.fulfill({json:{aiUsed:true,generatedCount:0,data:{title:'Old AI QA',diagnosis:'',sections:[{type:'single',medications:[{name:'Old AI QA',form:'Tab.',dose:'10 mg',quantity:'1 kuti',individualSignature:'Udhëzim i vjetër.'}]}],notes:[],missing:[]}}}).catch(()=>{});finished=true;});
 await page.locator('.rx-writing-tools > summary').click();await page.locator('#rxGenerate').click();await expect.poll(()=>started).toBe(true);await page.locator('#rxComposer').fill('Rp:\nTab. New QA 20 mg\nSasia: 2 kuti\nS: Udhëzim i ri.');await expect(page.locator('#rxPreview')).toContainText('New QA');release();await expect.poll(()=>finished).toBe(true);await expect(page.locator('#rxGenerate')).toBeEnabled();await expect(page.locator('#rxPreview')).not.toContainText('Old AI QA');await expect(page.locator('#rxComposer')).toHaveValue(/New QA/);
});

for(const width of [320,390,760,1440])test('compact medicine cards preserve edits and guide review at '+width+'px',async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));await compose(page,[QA_COMPLETE,{...QA_COMPLETE,key:'qa-second',substance:'QA bar i dytë'}]);
 await expect(page.locator('.rx-order-body:visible')).toHaveCount(1);await expect(page.locator('.rx-order-card').first().locator('[data-order-summary]')).toContainText('1 tabletë');await page.locator('.rx-order-card').first().locator('[data-toggle-order]').click();await expect(page.locator('.rx-order-body:visible')).toHaveCount(1);
 await page.locator('.rx-order-card').first().locator('[data-order-field="doseInstruction"]').fill('2 tableta');await page.locator('.rx-order-card').last().locator('[data-toggle-order]').click();await page.locator('.rx-order-card').first().locator('[data-toggle-order]').click();await expect(page.locator('.rx-order-card').first().locator('[data-order-field="doseInstruction"]')).toHaveValue('2 tableta');
 await page.locator('#rxReviewPrescription').dispatchEvent('click');await expect(page.locator('#rxReviewPanel')).toBeFocused();await expect(page.locator('#rxSave')).toBeDisabled();await noOverflow(page);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:testInfo.outputPath('builder-'+width+'.png'),fullPage:true});expect(errors).toEqual([]);
 await picker(page);await noOverflow(page);await page.screenshot({path:testInfo.outputPath('picker-'+width+'.png')});await page.keyboard.press('Escape');
});

test('manual toolbar edits switch the current source without losing authored text',async({page})=>{
 await compose(page,[QA_COMPLETE]);await page.locator('#rxFreeTextPanel > summary').click();await page.locator('[data-rx-command="other"]').click();
 await expect(page.locator('#rxComposer')).toHaveValue(/Tjetër:/);await expect(page.locator('[data-order-field="doseInstruction"]')).toBeDisabled();await expect(page.locator('#rxComposerMode')).toBeVisible();
});

test('accepted AI wording stays identical in preview and saved text and expires after a dose edit',async({page})=>{
 await compose(page,[QA_COMPLETE]);await page.route('**/api/gemini-prescription',route=>route.fulfill({json:{aiUsed:true,generatedCount:1,data:{title:'QA',diagnosis:'',sections:[{type:'single',medications:[{name:'Paracetamol',form:'Tab.',dose:'500 mg',quantity:'1 kuti',individualSignature:'Formulim sintetik QA.',signatureGenerated:true}]}],notes:[],missing:[]}}}));
 await page.locator('.rx-writing-tools > summary').click();await page.locator('#rxGenerate').click();await expect(page.locator('#rxGeneratedReview')).toBeVisible();await expect(page.locator('#rxPreview')).toContainText('Formulim sintetik QA.');await expect(page.locator('#rxComposer')).toHaveValue(/Formulim sintetik QA\./);await expect(page.locator('#rxSave')).toBeDisabled();
 await page.locator('[data-order-field="doseInstruction"]').fill('2 tableta');await expect(page.locator('#rxPreview')).toContainText('2 tableta');await expect(page.locator('#rxComposer')).not.toHaveValue(/Formulim sintetik QA\./);await expect(page.locator('#rxSave')).toBeDisabled();
});

test('inline search remains scrollable in a short viewport',async({page},info)=>{
 await page.setViewportSize({width:568,height:320});await setup(page);await page.locator('#rxTabBtnCompose').click();await answerSearch(page);await picker(page);await page.locator('#rxDrugSearch').fill('para');
 await expect(page.locator('[data-drug-result]')).toBeVisible();await noOverflow(page);await page.locator('[data-drug-result]').click();await expect(page.locator('.rx-order-card')).toHaveCount(1);await page.screenshot({path:info.outputPath('landscape-inline.png'),fullPage:true});
});

async function chooseProduct(page,drug,query='produkt'){
 await answerSearch(page,drug);await picker(page);await page.locator('#rxDrugSearch').fill(query);await page.locator('[data-drug-result]').click();
}
test('product-first builder resolves each pharmaceutical form without a global route step',async({page},info)=>{
 await page.setViewportSize({width:1440,height:1000});await compose(page);
 await expect(page.locator('#rxDrugSearch')).toBeVisible();await expect(page.locator('#rxClinicalContext [data-context-category]')).toHaveCount(0);await expect(page.locator('#rxRouteSegments')).toHaveCount(0);await expect(page.locator('.rx-preview-card')).toBeHidden();
 for(const [key,form,route] of [['oral','Tab.','PO'],['eye','Pika për sy','OPH'],['patch','Transdermal patch','TD']]){
  await chooseProduct(page,{key,substance:'QA '+key,tradeName:'QA '+key,strength:'QA',form},key+' QA');
  const card=page.locator('[data-order-key="'+key+'"]');await expect(card.locator('[data-order-field="route"]')).toHaveValue(route);await expect(card.locator('.rx-order-route')).toBeHidden();await expect(page.locator('#rxDosageChooser')).toBeHidden();
 }
 await expect(page.locator('.rx-order-card')).toHaveCount(3);await noOverflow(page);await page.screenshot({path:info.outputPath('automatic-product-routes.png'),fullPage:true});
});
test('Bromhexine injectable adds immediately with only IM or IV and does not set another product route',async({page},info)=>{
 await page.setViewportSize({width:1094,height:917});await compose(page);
 const product={key:'bromhexine-exact',substance:'Bromhexine',tradeName:'Bromhexine Sopharma',strength:'2 mg/ml',form:'Solution for injection'};
 await chooseProduct(page,product,'bromhexine');const card=page.locator('[data-order-key="bromhexine-exact"]');
 await expect(card).toBeVisible();await expect(card.locator('[data-order-field="route"]')).toHaveValue('');expect(await card.locator('[data-order-field="route"] option').evaluateAll(nodes=>nodes.map(n=>n.value))).toEqual(['','IM','IV']);
 await card.locator('[data-order-field="route"]').selectOption('IV');await expect(card.locator('.rx-order-identity')).toContainText('Rruga: IV');
 await chooseProduct(page,{key:'second-injection',substance:'Synthetic QA',tradeName:'Synthetic QA',form:'Injection',allowedRoutes:['IM','IV']},'second');
 await expect(page.locator('[data-order-key="second-injection"] [data-order-field="route"]')).toHaveValue('');await expect(card.locator('[data-order-field="route"]')).toHaveValue('IV');await expect(page.locator('#rxDosageChooser')).toBeHidden();await noOverflow(page);await page.screenshot({path:info.outputPath('bromhexine-compact.png'),fullPage:true});
});
test('slow registry metadata preserves dose typing, caret and additional-instruction disclosure',async({page})=>{
 await compose(page);let release,started=false,finished=false;const gate=new Promise(resolve=>{release=resolve;});
 const drug={...QA_DRUG,id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'};
 await page.route('**/api/drug-search?**',async route=>{if(new URL(route.request().url()).searchParams.get('view')==='registry-detail'){started=true;await gate;await route.fulfill({json:{row:{...drug,approvedPopulation:'Të rritur'}}});finished=true;}else await route.fulfill({json:{results:[drug]}});});
 await picker(page);await page.locator('#rxDrugSearch').fill('para');await page.locator('[data-drug-result]').click();await expect.poll(()=>started).toBe(true);await expect(page.locator('.rx-order-card')).toHaveCount(1);
 await page.locator('.rx-signature-editor > summary').click();const dose=page.locator('[data-order-field="doseInstruction"]');await dose.fill('2 tableta QA');await dose.evaluate(node=>node.setSelectionRange(2,2));release();await expect.poll(()=>finished).toBe(true);
 await expect(dose).toHaveValue('2 tableta QA');await expect(dose).toBeFocused();await expect(page.locator('.rx-signature-editor')).toHaveAttribute('open','');expect(await dose.evaluate(n=>n.selectionStart)).toBe(2);
});
test('verified regimens are optional and use separate product routes before explicit confirmation',async({page})=>{
 await compose(page);const requests=[];
 const oral={...QA_DRUG,id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',atc:'N02BE01'};
 const topical={key:'qa-topical',id:'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',substance:'QA topical',tradeName:'QA topical',strength:'1%',form:'Cream',atc:'D01AA01'};
 await page.route('**/api/prescription-dosage-context**',route=>{const url=new URL(route.request().url());requests.push([url.searchParams.get('id'),url.searchParams.get('route')]);const drug=url.searchParams.get('id')===topical.id?topical:oral;return route.fulfill({json:{ok:true,adult:[{regimenId:'qa-'+drug.key,substance:drug.substance,atc:drug.atc,form:drug.form,referenceStrength:drug.strength,population:'Të rritur',route:url.searchParams.get('route'),status:'VERIFIKUAR',indication:'Synthetic QA',frequency:'QA frequency',duration:'QA duration',fixedDoseMg:100,sourceUrl:'https://example.test/source'}],pediatric:[]}});});
 await chooseProduct(page,oral,'paracetamol');await expect(page.locator('[data-review-regimen]')).toHaveCount(1);await expect(page.locator('#rxDosageChooser')).toBeHidden();await expect(page.locator('[data-order-field="doseInstruction"]')).toHaveValue('');
 await page.locator('[data-review-regimen]').click();await page.keyboard.press('Escape');await expect(page.locator('.rx-order-card')).toHaveCount(1);await expect(page.locator('[data-order-field="doseInstruction"]')).toHaveValue('');
 await chooseProduct(page,topical,'topical');await expect(page.locator('[data-review-regimen]')).toHaveCount(2);expect(requests).toContainEqual([oral.id,'PO']);expect(requests).toContainEqual([topical.id,'TOP']);
 await page.locator('[data-order-key="qa-topical"] [data-review-regimen]').click();await page.locator('#rxDosageApply').click();await expect(page.locator('.rx-order-card')).toHaveCount(2);await expect(page.locator('[data-order-key="qa-topical"] [data-order-field="doseInstruction"]')).toHaveValue('100 mg');await expect(page.locator('[data-order-key="qa-topical"] [data-order-field="route"]')).toHaveValue('TOP');await expect(page.locator('#rxSave')).toBeDisabled();
});

test('authoritative registry route replaces a broad search fallback without losing entered fields',async({page})=>{
 await compose(page);const drug={...QA_DRUG,id:'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee',key:'qa-detail',form:'Injection',route:'',allowedRoutes:['IV','IM','SC','ID']};
 await page.route('**/api/drug-search?**',route=>new URL(route.request().url()).searchParams.get('view')==='registry-detail'?route.fulfill({json:{row:{...drug,sourceFields:[{label:'Rrugët e lejuara',value:'IM'}]}}}):route.fulfill({json:{results:[drug]}}));
 await picker(page);await page.locator('#rxDrugSearch').fill('detail');await page.locator('[data-drug-result]').click();const select=page.locator('[data-order-field="route"]');await expect(select).toHaveValue('IM');await expect(page.locator('.rx-order-route')).toBeHidden();expect(await select.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value))).toEqual(['','IM']);
});
test('changing pediatric weight invalidates an applied calculation and reloads the exact product context',async({page})=>{
 await compose(page);await page.locator('#rxPediatricToggle').click();await page.locator('#rxPatientAge').fill('4');await page.locator('#rxPatientWeight').fill('18');
 const drug={...QA_DRUG,id:'dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee',atc:'N02BE01'};const weights=[];
 await page.route('**/api/prescription-dosage-context**',route=>{weights.push(new URL(route.request().url()).searchParams.get('weightKg'));return route.fulfill({json:{ok:true,adult:[],pediatric:[{regimenId:'qa-child',substance:drug.substance,atc:drug.atc,form:drug.form,referenceStrength:drug.strength,population:'Fëmijë',route:'PO',status:'VERIFIKUAR',indication:'Synthetic QA only',frequency:'Synthetic QA frequency',duration:'Synthetic QA duration',fixedDoseMg:100}]}});});
 await chooseProduct(page,drug,'para');await page.locator('[data-review-regimen]').click();await page.locator('#rxDosageApply').click();await expect(page.locator('[data-order-field="doseInstruction"]')).toHaveValue('100 mg');
 await page.locator('#rxPatientWeight').fill('20');await expect(page.locator('[data-order-field="doseInstruction"]')).toHaveValue('');await expect(page.locator('[data-order-field="frequency"]')).toHaveValue('');await expect(page.locator('#rxComposer')).not.toHaveValue(/100 mg/);await expect(page.locator('#rxSave')).toBeDisabled();await expect.poll(()=>weights.includes('20')).toBe(true);await expect(page.locator('[data-order-field="route"]')).toHaveValue('PO');
});
test('a late regimen response cannot override a changed route and a route edit clears the applied regimen',async({page})=>{
 await compose(page);const drug={key:'qa-multi',id:'eeeeeeee-bbbb-4ccc-8ddd-eeeeeeeeeeee',substance:'Synthetic QA',tradeName:'Synthetic QA',atc:'J01AA01',strength:'100 mg',form:'Injection',allowedRoutes:['IV','IM']};let release,started=false,finished=false;const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/prescription-dosage-context**',async request=>{const route=new URL(request.request().url()).searchParams.get('route');if(route==='IV'){started=true;await gate;}await request.fulfill({json:{ok:true,adult:[{regimenId:'qa-'+route,substance:drug.substance,atc:drug.atc,form:drug.form,referenceStrength:drug.strength,population:'Të rritur',route,status:'VERIFIKUAR',indication:'Synthetic QA '+route,frequency:'QA '+route,duration:'QA',fixedDoseMg:100}],pediatric:[]}});if(route==='IV')finished=true;});
 await chooseProduct(page,drug,'multi');const select=page.locator('[data-order-field="route"]');await select.selectOption('IV');await expect.poll(()=>started).toBe(true);await select.selectOption('IM');await expect(page.locator('[data-review-regimen]')).toBeVisible();release();await expect.poll(()=>finished).toBe(true);
 await page.locator('[data-review-regimen]').click();await expect(page.locator('#rxDosageChoice')).toHaveValue('qa-IM');await page.locator('#rxDosageApply').click();await expect(page.locator('[data-order-field="frequency"]')).toHaveValue('QA IM');await select.selectOption('IV');await expect(page.locator('[data-order-field="doseInstruction"]')).toHaveValue('');await expect(page.locator('[data-order-field="frequency"]')).toHaveValue('');await expect(page.locator('#rxComposer')).not.toHaveValue(/QA IM/);
});
