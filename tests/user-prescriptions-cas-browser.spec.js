'use strict';
const {test,expect}=require('@playwright/test');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
let server,baseURL;
test.use({serviceWorkers:'block'});
const OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RX='regjistriBarnave_protokollet_v1';
const stamp='2026-10-10T11:00:00.000Z';
const initial={id:'rx-browser',name:'Recetë sintetike',chapterKey:'te-tjera',indication:'Test UI',patientName:'Pacient sintetik',
 sourceText:'  Rp.\nTab. Paracetamol 500 mg\nSasia: Scat. No I\nS: Nga 1 tabletë çdo 8 orë sipas nevojës.\n  ',
 sections:[{type:'single',title:'Trajtimi',medications:[{name:'Paracetamol',form:'Tab.',dose:'500 mg',quantity:'Scat. No I',individualSignature:'Nga 1 tabletë çdo 8 orë sipas nevojës.'}]}],
 selectedDrugs:[],notes:[],missing:[],createdAt:stamp,updatedAt:stamp,formatVersion:4,custom:{exact:'  retained metadata\n '}};
const clone=value=>JSON.parse(JSON.stringify(value));
test.beforeAll(async()=>{
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(ROOT,'.'+url.pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(404);return res.end();}
  const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webmanifest':'application/manifest+json'};
  try{const body=fs.readFileSync(file);res.writeHead(200,{'content-type':mime[path.extname(file)] || 'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));});
for(const width of [320,390,760,1440])test(`Prescription editor preserves drafts and offers latest/rebase/Undo at ${width}px`,async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width,height:width===760 ? 430 : 900});
 const store={payload:clone(initial),rowVersion:1,deleted:false,receipts:new Map()},requests=[],errors=[],control={loseReply:false};
 const snapshot=()=>({ok:true,version:1,user:{id:OWNER,email:'qa@example.test',name:'QA'},
  prescriptions:store.deleted ? [] : [{clientId:initial.id,payload:clone(store.payload),rowVersion:store.rowVersion,clientUpdatedAt:stamp}],
  prescriptionVersions:[{clientId:initial.id,rowVersion:store.rowVersion,deleted:store.deleted}],prescriptionChapters:[{slug:'te-tjera',title:'Të tjera',sortOrder:100}],
  favorites:[],entityNotes:[],noteVersions:[],drugs:[],tombstones:{prescriptions:store.deleted ? [{clientId:initial.id,rowVersion:store.rowVersion,deletedAt:stamp}] : [],favorites:[],entityNotes:[],drugs:[]},generatedAt:stamp});
 await page.addInitScript(({key,payload,owner})=>{localStorage.setItem(key,JSON.stringify([payload]));localStorage.setItem('medindex_prescription_starter_seed_v1','1');localStorage.setItem('medindex_user_library_meta_v1',JSON.stringify({owner}));},{key:RX,payload:initial,owner:OWNER});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/auth**',route=>route.fulfill({json:{authenticated:true,authUser:{id:OWNER},user:{id:OWNER,email:'qa@example.test',name:'QA'},csrfToken:'synthetic'}}));
 await page.route('**/api/user-library**',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:snapshot()});
  const body=route.request().postDataJSON();requests.push(body);
  if(body.libraryOwner!==OWNER)return route.fulfill({status:409,json:{code:'LIBRARY_OWNER_CHANGED'}});
  const writes=[...(body.prescriptions || []),...(body.tombstones?.prescriptions || [])];
  const conflicts=writes.filter(write=>!store.receipts.has(write.operationId) && (write.expectedVersion!==store.rowVersion || (!write.payload && write.restore)
    || (write.payload && store.deleted && !write.restore))).map(write=>({clientId:write.clientId,rowVersion:store.rowVersion,deleted:store.deleted}));
  if(conflicts.length)return route.fulfill({status:409,json:{code:'PRESCRIPTION_VERSION_CONFLICT',conflicts,snapshot:snapshot()}});
  const operations=writes.map(write=>{const receipt=store.receipts.get(write.operationId);if(receipt)return receipt;
    store.payload=write.payload ? clone(write.payload) : null;store.deleted=!write.payload;store.rowVersion++;
    const ack={operationId:write.operationId,clientId:write.clientId,rowVersion:store.rowVersion,deleted:store.deleted};store.receipts.set(write.operationId,ack);return ack;});
  if(control.loseReply && writes.length){control.loseReply=false;return route.abort('failed');}
  return route.fulfill({json:{...snapshot(),noteOperations:[],prescriptionOperations:operations}});
 });
 await page.route('**/api/medical-hub**',route=>route.fulfill({json:{ok:true,lessons:[],items:[]}}));
 await page.route('**/api/profile-photo**',route=>route.fulfill({json:{ok:true,photo:null}}));
 await page.route('**/api/dosage**',route=>route.fulfill({json:{ok:true,adult:[],pediatric:[],cards:[]}}));
 await page.goto(baseURL+'/recetat.html');await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
 await page.locator('#rxTabBtnLibrary').click();await expect(page.locator('[data-open-saved="rx-browser"]')).toBeVisible();
 await page.locator('[data-open-saved="rx-browser"]').click();await page.locator('#rxTabBtnCompose').click();
 await expect(page.locator('#rxComposer')).toHaveValue(initial.sourceText);
 store.payload={...clone(initial),sourceText:'Versioni i fundit nga pajisja tjetër'};store.rowVersion=2;
 await page.locator('#rxClinicalReview input').check();await page.locator('#rxSave').click();
 await expect(page.locator('#rxPrescriptionConflicts')).toBeVisible();
 await expect(page.locator('#rxComposer')).toHaveValue(initial.sourceText);
 await page.locator('[data-compare-prescription="rx-browser"]').click();await expect(page.locator('#rxPrescriptionConflict')).toBeVisible();await expect(page.locator('#rxPrescriptionConflictClose')).toBeFocused();
 await expect(page.locator('#rxPrescriptionLocalVersion')).toContainText(initial.sourceText.trim());await expect(page.locator('#rxPrescriptionRemoteVersion')).toContainText(store.payload.sourceText);
 const geometry=await page.locator('#rxPrescriptionConflict [role="dialog"]').evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth};});
 expect(geometry.x).toBeGreaterThanOrEqual(0);expect(geometry.right).toBeLessThanOrEqual(width+1);expect(geometry.overflow).toBeLessThanOrEqual(width+1);
 for(const id of ['rxPrescriptionConflictClose','rxPrescriptionUseLatest','rxPrescriptionKeepDraft']){await page.locator('#'+id).scrollIntoViewIfNeeded();const size=await page.locator('#'+id).boundingBox();expect(size.height).toBeGreaterThanOrEqual(44);expect(size.x).toBeGreaterThanOrEqual(0);expect(size.x+size.width).toBeLessThanOrEqual(width+1);}
 const contrasts=await page.locator('#rxPrescriptionConflict').evaluate(root=>{
  const rgb=value=>value.match(/[\d.]+/g).map(Number),luminance=color=>{const linear=rgb(color).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];};
  return [...root.querySelectorAll('button,pre')].map(node=>{const style=getComputedStyle(node);let parent=node,bg=style.backgroundColor;
   while((bg==='transparent' || rgb(bg)[3]===0) && parent.parentElement){parent=parent.parentElement;bg=getComputedStyle(parent).backgroundColor;}
   const fg=luminance(style.color),back=luminance(bg);return {id:node.id,ratio:(Math.max(fg,back)+.05)/(Math.min(fg,back)+.05)};});
 });for(const color of contrasts)expect(color.ratio,color.id+' text contrast').toBeGreaterThanOrEqual(4.5);
 await page.keyboard.press('Escape');await expect(page.locator('#rxPrescriptionConflict')).toBeHidden();await expect(page.locator('[data-compare-prescription="rx-browser"]')).toBeFocused();
 await page.locator('[data-compare-prescription="rx-browser"]').click();await page.screenshot({path:test.info().outputPath(`prescription-conflict-${width}.png`)});
 await page.locator('#rxPrescriptionKeepDraft').click();await expect(page.locator('#rxPrescriptionConflict')).toBeHidden();await expect.poll(()=>store.rowVersion).toBe(3);expect(store.payload.sourceText).toBe(initial.sourceText);expect(store.payload.custom).toEqual(initial.custom);
 await expect.poll(()=>page.evaluate(()=>window.MedIndexUserLibrary.diagnostics().pendingPrescriptions)).toBe(0);
 const first=requests.flatMap(body=>body.prescriptions || []);expect(first[0].expectedVersion).toBe(1);expect(first.at(-1).expectedVersion).toBe(2);expect(first.at(-1).operationId).not.toBe(first[0].operationId);
 store.payload={...clone(store.payload),sourceText:'Latest accepted version'};store.rowVersion=4;
 await page.locator('#rxClinicalReview input').check();await page.locator('#rxSave').click();await expect(page.locator('#rxPrescriptionConflicts')).toBeVisible();
 if(!await page.locator('#rxPrescriptionConflict').isVisible())await page.locator('[data-compare-prescription="rx-browser"]').click();
 await page.locator('#rxPrescriptionUseLatest').click();
 await expect(page.locator('#rxComposer')).toHaveValue('Latest accepted version');await expect(page.locator('#rxPrescriptionConflicts')).toBeHidden();
 await page.locator('#rxTabBtnLibrary').click();await page.locator('[data-delete-saved="rx-browser"]').click();await expect(page.locator('#rxUndoDelete')).toBeVisible();await expect.poll(()=>store.deleted).toBe(true);await page.locator('#rxUndoDeleteButton').click();await expect.poll(()=>store.deleted).toBe(false);expect(store.payload.sourceText).toBe('Latest accepted version');expect(store.payload.custom).toEqual(initial.custom);
 await expect.poll(()=>page.evaluate(()=>window.MedIndexUserLibrary.diagnostics().pendingPrescriptions)).toBe(0);
 await page.locator('[data-open-saved="rx-browser"]').click();await page.locator('#rxTabBtnCompose').click();
 if(!await page.locator('#rxFreeTextPanel').evaluate(node=>node.open))await page.locator('#rxFreeTextPanel > summary').click();
 const lostSource=initial.sourceText.replace('500 mg','650 mg');await page.locator('#rxComposer').fill(lostSource);
 await expect(page.locator('#rxPreview')).toContainText('650 mg');await page.locator('#rxClinicalReview input').check();
 const beforeLost=store.rowVersion;control.loseReply=true;await page.locator('#rxSave').click();await expect.poll(()=>store.rowVersion).toBe(beforeLost+1);
 await expect.poll(()=>page.evaluate(()=>window.MedIndexUserLibrary.diagnostics().syncInFlight)).toBe(false);await expect(page.locator('#rxLibraryState')).toHaveText('Lokale');
 const frozen=await page.evaluate(()=>window.MedIndexUserLibrary.meta().libraryEnvelope.body);expect(frozen.prescriptions[0].payload.sourceText).toBe(lostSource);
 expect(await page.evaluate(()=>window.MedIndexUserLibrary.syncNow())).toBe(true);expect(requests.at(-1)).toEqual(frozen);expect(store.rowVersion).toBe(beforeLost+1);
 await expect(page.locator('#rxLibraryState')).toHaveText('Sinkronizuar');expect(store.payload.sourceText).toBe(lostSource);expect(store.payload.custom).toEqual(initial.custom);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
