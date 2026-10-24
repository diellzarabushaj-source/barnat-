'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.resolve(__dirname,'..'),OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const loaded=require('../lib/icd-hierarchy-snapshot').load(),dataset=loaded.data;
const Base=require('../lib/icd-api-base')._test,Advanced=require('../lib/icd-advanced-handler')._test,Memory=require('../lib/icd-query-memory');
let server,baseURL;
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{
 server=http.createServer((req,res)=>{
  const file=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(404);return res.end();}
  try{const bytes=fs.readFileSync(file);res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>new Promise(resolve=>server.close(resolve)));

async function setup(page,admin=false,rotateCsrf=false,resolveResult=null){
 const mutations=[],records=[{expression:'shtypja nalt',normalized:'shtypja nalt',code:'I10',kind:'alias',scope:'global',verification:'verified',node:Advanced.compactNode(Memory.codeNode(dataset,'I10'),dataset)}];let reads=0,authReads=0,csrfReads=0,csrfRejected=false;
 await page.addInitScript(owner=>{
  localStorage.setItem('medindex_prescription_starter_seed_v1','1');localStorage.setItem('regjistriBarnave_protokollet_v1','[]');localStorage.setItem('medindex_user_library_meta_v1',JSON.stringify({owner}));
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__qaCopied=value;}}});
 },OWNER);
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),json=async body=>route.fulfill({json:body});
  if(url.pathname==='/api/auth'){authReads++;if(url.searchParams.get('csrf')==='icd-memory')csrfReads++;return json({authenticated:true,authUser:{id:OWNER},user:{id:OWNER,email:'qa@example.test',name:'QA',role:admin?'admin':'doctor'},csrfToken:'synthetic-'+authReads});}
  if(url.searchParams.has('icdMemory')){
   if(route.request().method()==='POST'){
    if(rotateCsrf&&!csrfRejected){csrfRejected=true;return route.fulfill({status:403,json:{ok:false,code:'ICD_CSRF_EXPIRED'}});}
    const body=route.request().postDataJSON();mutations.push(body);
    if(body.action==='remember')records.push({expression:body.expression,normalized:Memory.normalize(body.expression),code:body.code,kind:'alias',scope:'personal',verification:'personal',node:Advanced.compactNode(Memory.codeNode(dataset,body.code),dataset)});
    if(body.action==='resolve')return json(resolveResult?await resolveResult(body):{ok:true,aiUsed:true,rows:[{...Advanced.compactNode(Memory.codeNode(dataset,'R07.4'),dataset),memoryVerification:'pending'}],ambiguous:true,clarification:'Zgjidh kuptimin e saktë; propozimi pret verifikim.'});
    return json({ok:true,data:{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',status:body.status||'personal'}});
   }
   reads++;
   if(url.searchParams.get('action')==='review')return json({ok:true,rows:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',expression:'<img src=x onerror=alert(1)>',code:'R07.4',kind:'alias',source:'ai'}]});
   return json({ok:true,classification:Memory.VERSION,isAdmin:admin,rows:records});
  }
  if(url.pathname==='/api/icd'){
   const query=Object.fromEntries(url.searchParams),view=query.view;
   let data=view==='suggest'?Advanced.suggestionPayload(dataset,query,loaded):view==='seed'?Advanced.seedPayload(dataset,loaded):view==='hot'?Advanced.hotPayload(dataset,loaded):view==='guidance'?Advanced.guidancePayload(dataset,query,loaded):view==='guidance-list'?Advanced.guidanceListPayload(dataset,loaded):Base.fullViewPayload(dataset,query,loaded);
   if(view==='suggest'&&!Memory.strongResult(data)){
    const allowed=new Set(Advanced.candidatesFor(dataset,query).map(node=>node.code));const hits=Memory.matchAliases(records,query.q,dataset,allowed);
    if(hits.length)data={...data,rows:hits.map(node=>Advanced.compactNode(node,dataset))};
   }
   return json({ok:true,data});
  }
  if(url.pathname==='/api/user-library')return json({ok:true,version:1,user:{id:OWNER},prescriptions:[],prescriptionVersions:[],favorites:[],entityNotes:[],noteVersions:[],drugs:[],tombstones:{prescriptions:[],favorites:[],entityNotes:[],drugs:[]}});
  return json({ok:true,items:[],adult:[],pediatric:[],cards:[]});
 });
 await page.goto(baseURL+'/icd.html');await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
 return {mutations,records,reads:()=>reads,csrfReads:()=>csrfReads};
}

for(const width of [390,1440]){
 test('known ICD, Latin and dialect stay immediate with no AI calls at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:900});const api=await setup(page);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#icdSearch').fill('pom dhemb gjoksi');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','R07.4');
  await expect(page.locator('.icd-suggestion-row').first()).toContainText('Simptomë / shenjë');await expect(page.locator('.icd-suggestion-row.is-differential')).not.toHaveCount(0);
  await page.locator('#icdSearch').fill('I10');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','I10');
  const latin=Advanced.compactNode(Memory.codeNode(dataset,'I10'),dataset).latinTitle;
  await expect(page.locator('.icd-suggestion-row').first().locator('.icd-suggestion-titleline strong')).toHaveText(latin);
  await page.locator('#icdSearch').fill('shtypja nalt');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','I10');await expect(page.locator('.icd-suggestion-row').first()).toContainText('Shprehje e verifikuar');
  expect(api.mutations).toEqual([]);expect(api.reads()).toBe(1,'One terminology bootstrap, not one lookup per keystroke');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath('icd-memory-'+width+'.png'),fullPage:true});
  await page.screenshot({path:info.outputPath('icd-memory-viewport-'+width+'.png')});
 });
}

for(const width of [320,390,430]){
 test('phone search, filters, selected diagnosis and return stay within reach at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:844});const api=await setup(page);
  await expect(page.locator('#icdFilterPanel')).not.toHaveAttribute('open','');
  await expect(page.locator('#icdFilterChapter')).toBeHidden();
  await expect(page.locator('#icdChapterBrowser')).not.toHaveAttribute('open','');
  await page.locator('#icdSearch').fill('I10');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','I10');
  const firstRow=page.locator('.icd-suggestion-row').first();
  await expect(firstRow).toBeVisible();
  await expect.poll(async()=> (await firstRow.boundingBox())?.y??Infinity).toBeLessThan(360);
  const firstResult=await firstRow.boundingBox();
  fs.writeFileSync(info.outputPath('phone-metrics-'+width+'.json'),JSON.stringify({width,height:844,firstResultTop:firstResult.y,firstResultHeight:firstResult.height,search:await page.locator('#icdSearch').boundingBox()},null,2));
  expect(await page.locator('#icdSuggestions').evaluate(node=>getComputedStyle(node).maxHeight)).toBe('none','Phone results use the page scroll, not a second scrolling box');
  await page.screenshot({path:info.outputPath('phone-search-'+width+'.png')});
  await page.setViewportSize({width,height:500});await expect(page.locator('#icdSearch')).toBeFocused();
  expect((await page.locator('.icd-suggestion-row').first().boundingBox()).y).toBeLessThan(360);
  await page.locator('.icd-suggestion-row').first().click();await expect(page.locator('#icdCopyDiagnosis')).toBeVisible();await expect(page.locator('#icdSearch')).not.toBeFocused();
  await expect.poll(async()=>{const r=await page.locator('#nodeHero').boundingBox();return r.y>=0&&r.y<190;}).toBe(true);
  expect((await page.locator('#icdCopyDiagnosis').boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.setViewportSize({width,height:844});await page.screenshot({path:info.outputPath('phone-diagnosis-'+width+'.png')});
  await page.locator('#icdBackToSearch').click();await expect(page.locator('#icdSearch')).toBeFocused();
  await page.locator('#icdFilterPanel>summary').click();await page.locator('#icdFilterChapter').selectOption('I');
  await expect(page.locator('#icdFilterCount')).toHaveText('1');await page.locator('#icdFilterPanel>summary').click();
  await page.locator('#icdFilterClearCompact').click();await expect(page.locator('#icdFilterCount')).toBeHidden();
  await page.locator('#icdChapterBrowser>summary').click();await page.locator('#chapterList [data-chapter="IX"]').click();
  await expect(page.locator('#icdChapterBrowser')).not.toHaveAttribute('open','');await expect(page.locator('#nodeHero')).toContainText('qarkullimit');
  expect(api.mutations).toEqual([]);
 });
}

test('active filters constrain remembered aliases and warm search survives offline',async({page,context})=>{
 const api=await setup(page);
 await expect(page.locator('#icdFilterChapter option')).not.toHaveCount(1);
 await page.locator('#icdFilterChapter').selectOption('I');
 await page.locator('#icdSearch').fill('shtypja nalt');
 await expect(page.locator('.icd-suggestion-row[data-code="I10"]')).toHaveCount(0);
 await page.locator('#icdFilterReset').click();
 await page.locator('#icdSearch').fill('pom dhemb gjoksi');
 await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','R07.4');
 await context.setOffline(true);
 await page.locator('#icdSearch').fill('I10');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','I10');
 await page.locator('#icdSearch').fill('pom dhemb gjoksi');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','R07.4');
 expect(api.mutations).toEqual([]);
});

for(const width of [390,1440]){
 test('inline Gemini search requires consent and explains empty results at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:844});let complete;
  const api=await setup(page,false,false,()=>new Promise(resolve=>{complete=resolve;}));
  const button=page.locator('#icdUnderstandTerm');await expect(button).toBeVisible();await expect(button).toBeDisabled();
  await page.locator('#icdSearch').fill('pom ne majte');await button.click();
  await expect(page.locator('#icdAiConsent')).toBeVisible();expect(api.mutations).toHaveLength(0);
  await page.locator('#icdTermOnly').check();await page.locator('#icdSearch').press('Control+Enter');
  await expect(button).toHaveAttribute('aria-busy','true');await expect(page.locator('#icdMemoryStatus')).toContainText('Duke kërkuar me Gemini');
  await expect.poll(()=>api.mutations.filter(row=>row.action==='resolve').length).toBe(1);
  complete({ok:true,aiUsed:true,ambiguous:true,rows:[],clarification:'Zgjidh konceptin'});
  await expect(page.locator('#icdMemoryStatus')).toContainText('Shkruaj më qartë');await expect(page.locator('#icdMemoryStatus')).toContainText('Gemini');
  await expect(button).not.toHaveAttribute('aria-busy','true');await expect(page.locator('#icdMemoryTools')).not.toHaveAttribute('open','');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('inline-gemini-'+width+'.png')});
  await page.locator('#icdSearch').fill('I10');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','I10');
  await expect(page.locator('#icdMemoryStatus')).toBeEmpty();await expect(page.locator('#icdTermOnly')).not.toBeChecked();
  await page.locator('#icdSearchClear').click();await expect(button).toBeDisabled();expect(api.mutations).toHaveLength(1);
 });
}

test('a late Gemini response cannot replace a newer normal search',async({page})=>{
 await page.setViewportSize({width:390,height:844});let complete;
 const api=await setup(page,false,false,()=>new Promise(resolve=>{complete=resolve;}));
 await page.locator('#icdSearch').fill('pom ne majte');await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdUnderstandTerm').click();
 await expect.poll(()=>api.mutations.length).toBe(1);
 await page.locator('#icdSearch').fill('I10');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','I10');
 complete({ok:true,aiUsed:true,ambiguous:true,rows:[]});await expect(page.locator('#icdUnderstandTerm')).not.toHaveAttribute('aria-busy','true');
 await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','I10');await expect(page.locator('#icdMemoryStatus')).toBeEmpty();
});

test('rotated CSRF renews automatically without duplicate writes',async({page})=>{
 const api=await setup(page,false,true);
 await page.locator('#icdSearch').fill('pom ne majte');await page.locator('#icdMemoryTools>summary').click();
 await page.locator('#icdMemoryCode').fill('R07.4');await page.locator('#icdTermOnly').check();await page.locator('#icdRememberTerm').click();
 await expect(page.locator('#icdMemoryStatus')).toContainText('vetëm në fjalorin tënd');expect(api.mutations).toHaveLength(1);expect(api.csrfReads()).toBe(2);
});

test('explicit personal mapping survives reload and AI proposals remain unverified',async({page})=>{
 const api=await setup(page);await page.locator('#icdSearch').fill('pom ne majte');await page.locator('#icdMemoryTools>summary').click();
 await page.locator('#icdMemoryCode').fill('R07.4');await page.locator('#icdRememberTerm').click();expect(api.mutations).toHaveLength(0);
 await page.locator('#icdTermOnly').check();await page.locator('#icdRememberTerm').click();await expect(page.locator('#icdMemoryStatus')).toContainText('vetëm në fjalorin tënd');
 expect(api.mutations[0]).toMatchObject({action:'remember',termOnly:true,globalProposal:false,code:'R07.4'});
 await page.reload();await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');await page.locator('#icdSearch').fill('pom ne majte');await expect(page.locator('.icd-suggestion-row').first()).toContainText('Preferencë personale');
 await page.locator('#icdSearch').fill('pom ne majte djathte');await page.locator('#icdMemoryTools>summary').click();await page.locator('#icdTermOnly').check();await page.locator('#icdUnderstandTerm').click();
 await expect(page.locator('#icdMemoryStatus')).toContainText('pret verifikim');await expect(page.locator('.icd-suggestion-row').first()).toContainText('i paverifikuar');await expect(page.locator('.icd-suggestion-row.is-active')).toHaveCount(0);
 expect(api.mutations.some(body=>body.action==='review')).toBe(false);
});

test('review is separate, explicit and escapes proposal text',async({page})=>{
 const api=await setup(page,true);await expect(page.locator('#icdMemoryReview')).not.toHaveAttribute('hidden','');await page.locator('#icdMemoryReview>summary').click();await page.locator('#icdLoadTermReview').click();
 await expect(page.locator('.icd-term-review-row strong')).toContainText('<img');await expect(page.locator('#icdTermReviewList img')).toHaveCount(0);expect(api.mutations).toHaveLength(0);
 await page.locator('.icd-term-review-row input').fill('https://example.test/clinical-source');await page.locator('[data-term-decision="verified"]').click();await expect(page.locator('.icd-term-review-row')).toHaveCount(0);
 expect(api.mutations[0]).toMatchObject({action:'review',status:'verified',evidenceUrl:'https://example.test/clinical-source'});
});

test('keyboard, copying and the existing prescription context stay functional',async({page})=>{
 await setup(page);await page.locator('#icdSearch').fill('I10');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','I10');await page.locator('#icdSearch').press('ArrowDown');await page.locator('#icdSearch').press('ArrowUp');await page.locator('#icdSearch').press('Enter');
 await expect(page.locator('#icdCopyDiagnosis')).toBeVisible();await page.locator('#icdCopyDiagnosis').click();expect(await page.evaluate(()=>window.__qaCopied)).toContain('I10');
 await expect(page.locator('a[href="/index.html#favorites"]')).toHaveCount(1);
 await page.locator('#icdUseInPrescription').click();await expect(page).toHaveURL(/recetat\.html#ndertimi/);await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
 await expect(page.locator('#rxDiagnosis')).toHaveValue(/I10|Hipertension/);await expect(page.locator('#rxSave')).toBeDisabled();
});
