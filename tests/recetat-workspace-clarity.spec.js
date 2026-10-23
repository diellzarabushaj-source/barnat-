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
