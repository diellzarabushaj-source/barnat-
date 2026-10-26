'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.resolve(__dirname,'..'),OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const loaded=require('../lib/icd-hierarchy-snapshot').load(),dataset=loaded.data;
const Base=require('../lib/icd-api-base')._test,Advanced=require('../lib/icd-advanced-handler')._test,Memory=require('../lib/icd-query-memory');
const Description=require('../lib/icd-description-search');
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
    if(body.action==='interpret')return json(resolveResult?await resolveResult(body):{ok:true,aiUsed:true,rows:[{...Advanced.compactNode(Memory.codeNode(dataset,'R07.4'),dataset),aiDescription:{kind:'symptom',reason:'Kodi i simptomës; vlerëso shkakun.'}}],ambiguous:true,descriptionAnalysis:{clarification:'Ku lokalizohet dhimbja?'},clarification:'Sugjerime nga përshkrimi · kërkon vlerësim klinik.'});
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

for(const width of [390,1440]){
 test('named diagnosis ranking keeps the main term first locally, remotely and offline at '+width,async({page,context},info)=>{
  await page.setViewportSize({width,height:900});const api=await setup(page);
  await expect.poll(()=>page.evaluate(()=>Boolean(JSON.parse(localStorage.getItem('medindex.icd.category-seed.v1')||'null')?.rows?.some(n=>n.code==='J02')))).toBe(true);
  let release,remotePending=false,offline=false,suggestRequests=0;
  await page.route('**/api/icd?**',async route=>{
   const url=new URL(route.request().url());if(url.searchParams.get('view')!=='suggest')return route.fallback();
   if(offline)return route.abort('internetdisconnected');
   suggestRequests++;remotePending=true;await new Promise(resolve=>{release=resolve;});
   return route.fulfill({json:{ok:true,data:Advanced.suggestionPayload(dataset,Object.fromEntries(url.searchParams),loaded)}});
  });
  await page.locator('#icdSearch').fill('faringitis acu');await expect.poll(()=>remotePending).toBe(true);
  await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','J02');
  release();await expect(page.locator('.icd-suggestion-row[data-code="J02.9"]')).toBeVisible();
  await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','J02');
  await expect(page.locator('.icd-suggestion-head')).not.toContainText('Duke rafinuar');
  remotePending=false;await page.locator('#icdSearch').fill('laringitis acu');await expect.poll(()=>remotePending).toBe(true);
  await expect(page.locator('.icd-suggestion-head')).toContainText('Duke rafinuar');
  const releaseOther=release;await page.locator('#icdSearch').fill('faringitis acu');
  await expect(page.locator('#icdStatusText')).toContainText('për «faringitis acu»');
  await expect(page.locator('.icd-suggestion-head')).not.toContainText('Duke rafinuar');
  await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','J02');
  expect(suggestRequests).toBe(2,'Returning to a completed lookup reuses it without another remote request');releaseOther();
  expect(api.mutations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('pharyngitis-ranking-'+width+'.png')});
  offline=true;await context.setOffline(true);
  for(const [q,code] of [['faringitis acuta','J02'],['laringitis acu','J04'],['sinusitis acu','J01'],['hipertensoin','I10'],['pneumonia','J18']]){
   await page.locator('#icdSearch').fill(q);await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code',code);
  }
  expect(api.mutations).toEqual([]);
 });
}

test('cached older HTML still loads the shared search matcher before interaction',async({page})=>{
 await page.route('**/icd.html',async route=>{await route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(ROOT,'icd.html'),'utf8').replace(/<script src="\/icd-search-lexical\.js[^>]*><\/script>/,'')});});
 await setup(page);await page.locator('#icdSearch').fill('faringitis acu');await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','J02');
});

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
  await expect(button).toHaveAttribute('aria-busy','true');await expect(page.locator('#icdMemoryStatus')).toContainText('Duke kërkuar me AI');
  await expect.poll(()=>api.mutations.filter(row=>row.action==='interpret').length).toBe(1);
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

for(const width of [390,1440]){
 test('Groq reserve is consented, accurately labeled and never auto-selects at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:844});let calls=0;
  const api=await setup(page,false,false,body=>{
   expect(body.groqFallback).toBe(true);calls++;
   return {ok:true,provider:'groq',cached:calls>1,...Description.validate({clarification:'A ka shenja të tjera?',candidates:[{code:'R04.2',titleEn:'Haematemesis',kind:'symptom',reason:'Mismatched concept'},{code:'K31.6',titleEn:'Gastritis',kind:'differential',reason:'Mismatched concept'},{code:'K92.0',titleEn:'Haematemesis',kind:'symptom',reason:'Të vjella me gjak; shkaku kërkon vlerësim.'}]},dataset)};
  });
  await page.locator('#icdSearch').fill('vjellje me gjak');await page.locator('#icdUnderstandTerm').click();
  await expect(page.locator('#icdAiConsent')).toContainText('Gemini');await expect(page.locator('#icdAiConsent')).toContainText('Groq');expect(api.mutations).toHaveLength(0);
  await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
  await expect(page.locator('#icdMemoryStatus')).toContainText('Groq');await expect(page.locator('.icd-suggestion-row')).toHaveCount(1);await expect(page.locator('.icd-suggestion-row.is-active')).toHaveCount(0);
  await expect(page.locator('.icd-suggestion-row')).toHaveAttribute('data-code','K92.0');await expect(page.locator('.icd-suggestion-row')).toContainText('Simptomë / shenjë');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('groq-reserve-'+width+'.png')});
  await page.locator('#icdUnderstandTerm').click();await expect(page.locator('#icdMemoryStatus')).toContainText('Memoria · Groq');expect(calls).toBe(2);
 });
}

for(const width of [390,1440]){
 test('blood origin stays explicit for saliva, stool and vomiting at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:900});let generated=0;
  const api=await setup(page,false,false,async body=>({ok:true,...(body.expression.includes('mishrat')?Description.validate({candidates:[{code:'K92.0',titleEn:'Haematemesis',kind:'symptom',reason:'Invented vomiting'}]},dataset,body.expression):await Description.interpret({dataset,query:body.expression,actor:OWNER,generate:async()=>{generated++;throw Error('Reviewed short phrases must not call a provider');}}))}));
  async function search(query){await page.locator('#icdSearch').fill(query);await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();await expect(page.locator('#icdUnderstandTerm')).not.toHaveAttribute('aria-busy','true');}
  await search('pershtyme me gjak');
  await expect(page.locator('.icd-suggestion-row')).toHaveCount(1);await expect(page.locator('.icd-suggestion-row')).toHaveAttribute('data-code','R04.2');await expect(page.locator('.icd-description-analysis')).toContainText('mishrat');
  await expect(page.locator('.icd-suggestion-row')).toContainText('Konfirmo burimin');await expect(page.locator('.icd-suggestion-row')).not.toContainText('Sugjerim AI');await expect(page.locator('.icd-suggestion-row.is-active')).toHaveCount(0);
  await expect(page.locator('#icdMemoryStatus')).toContainText('Kërkimi ICD');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('saliva-context-'+width+'.png')});
  await search('gjakderdhje ne feces');
  await expect(page.locator('.icd-suggestion-row')).toHaveCount(2);await expect(page.locator('.icd-suggestion-row[data-code="K62.5"]')).toContainText('freskët');await expect(page.locator('.icd-suggestion-row[data-code="K92.1"]')).toContainText('nëse');
  await expect(page.locator('.icd-description-analysis')).toContainText('okult');await expect(page.locator('.icd-suggestion-row.is-active')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('stool-context-'+width+'.png')});
  await search('vjellje me gjak');await expect(page.locator('.icd-suggestion-row')).toHaveCount(1);await expect(page.locator('.icd-suggestion-row')).toHaveAttribute('data-code','K92.0');expect(generated).toBe(0);
  await search('gjak nga mishrat e dhembeve');await expect(page.locator('.icd-suggestion-row')).toHaveCount(0);await expect(page.locator('.icd-description-analysis')).toBeVisible();await expect(page.locator('.icd-description-analysis')).toContainText('mishrat');await expect(page.locator('#icdMemoryStatus')).toContainText('mishrat');expect(api.mutations).toHaveLength(4);
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

for(const width of [390,1440]){
 test('Gemini interprets a regional description with canonical suggestions and a clarification at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:900});let generated=0;const before=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='synthetic';Description.cache.clear();
  const question='Dhimbja është në bark apo në mes? A ka shenja urinare?';
  try{
   const api=await setup(page,false,false,async body=>({ok:true,...await Description.interpret({dataset,query:body.expression,actor:OWNER,generate:async options=>{generated++;expect(JSON.parse(options.prompt).anonymousDescription).toBe(body.expression);return {data:{clarification:question,candidates:[{code:'R10.4',titleEn:'Other and unspecified abdominal pain',evidence:body.expression,kind:'symptom',reason:'Kodi i simptomës abdominale; shkaku nuk përcaktohet vetëm nga vendndodhja.'},{code:'N23',titleEn:'Unspecified renal colic',evidence:body.expression,kind:'differential',reason:'Mundësi për vlerësim vetëm nëse ka tablo klinike të kolikës renale.'},{code:'R10.9',titleEn:'Invalid extension',kind:'symptom',reason:'Invalid WHO extension'}]}};}})}));
   await page.locator('#icdSearch').fill('dhimbje ne regjionin retroperitoneal');expect(api.mutations).toEqual([]);
   await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
   await expect(page.locator('.icd-description-analysis')).toContainText('pranishme tani');
   await expect(page.locator('.icd-suggestion-row')).toHaveCount(1);await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','R10.4');
   await expect(page.locator('.icd-suggestion-row[data-code="N23"]')).toHaveCount(0);await expect(page.locator('.icd-suggestion-row[data-code="R10.4"]')).toContainText('Nga përshkrimi');
   await expect(page.locator('.icd-suggestion-row.is-active')).toHaveCount(0);
   await expect(page.locator('#icdMemoryStatus')).toContainText('Gemini');expect(generated).toBe(1);expect(api.mutations).toHaveLength(1);expect(api.mutations[0].action).toBe('interpret');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await page.screenshot({path:info.outputPath('description-gemini-'+width+'.png')});
   await page.locator('.icd-suggestion-row[data-code="R10.4"]').click();await expect(page.locator('#nodeHero')).toContainText('R10.4');
  }finally{Description.cache.clear();if(before===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=before;}
 });
}

for(const width of [390,1440]){
 test('general description evidence rejects changed meaning across clinical systems at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  const cases=[
   {query:'kollë pa temperaturë',bad:'R50.9',evidence:'temperaturë',codes:['R05']},
   {query:'babai ka diabet tip 2, tani dhimbje koke',bad:'E11',evidence:'diabet tip 2',codes:['R51']},
   {query:'dhimbje veshi prej dje',bad:'R07.0',evidence:'dhimbje veshi',codes:['H92.0']},
   {query:'kollë dhe temperaturë prej dy ditësh',bad:'J18.9',evidence:'kollë dhe temperaturë',codes:['R05','R50','J18.9']},
   {query:'pa kollë dhe pa temperaturë',bad:'R05',evidence:'kollë',codes:[]},
  ];
  const api=await setup(page,false,false,body=>{
   const current=cases.find(c=>c.query===body.expression),node=Memory.codeNode(dataset,current.bad);
   return {ok:true,provider:'groq',...Description.validate({candidates:[{code:current.bad,titleEn:node.englishTitle,evidence:current.evidence,kind:'differential',reason:'DIAGNOZË E KONFIRMUAR 100%'}]},dataset,body.expression)};
  });
  for(const current of cases){
   await page.locator('#icdSearch').fill(current.query);await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
   await expect(page.locator('.icd-description-analysis')).toBeVisible();
   await expect(page.locator('.icd-suggestion-row')).toHaveCount(current.codes.length);
   expect(await page.locator('.icd-suggestion-row').evaluateAll(nodes=>nodes.map(n=>n.dataset.code))).toEqual(current.codes);
   await expect(page.locator('.icd-suggestion-row.is-active')).toHaveCount(0);
   await expect(page.locator('#icdSuggestions')).not.toContainText('DIAGNOZË E KONFIRMUAR');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   if(current.bad==='J18.9')await page.screenshot({path:info.outputPath('general-evidence-'+width+'.png')});
  }
  expect(api.mutations).toHaveLength(cases.length);expect(api.mutations.every(body=>body.action==='interpret')).toBe(true);
 });
}

for(const width of [390,1440]){
 test('answering a clarification refines the same search and clearing resets it at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:900});const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='synthetic';Description.cache.clear();
  const query='dhimbje nyjesh prej dy ditësh',question='A ka enjtje ose skuqje në nyje?',answer='Vetëm dhimbje, pa enjtje dhe pa skuqje.';
  try{
   const api=await setup(page,false,false,async body=>({ok:true,...await Description.interpret({dataset,query:body.expression,actor:OWNER,clarifications:body.clarifications,generate:async()=>({data:{clarification:question,candidates:[{code:'M25.5',titleEn:Memory.codeNode(dataset,'M25.5').englishTitle,evidence:'dhimbje nyjesh',kind:'symptom',reason:'Synthetic'}]}})})}));
   await page.locator('#icdSearch').fill(query);await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
   await expect(page.locator('#icdClarificationQuestion')).toHaveText(question);await expect(page.locator('#icdClarificationSubmit')).toBeDisabled();
   await expect(page.locator('#icdSuggestions #icdClarificationForm')).toHaveCount(0);
   await page.locator('#icdClarificationAnswer').fill(answer);await expect(page.locator('#icdClarificationSubmit')).toBeEnabled();
   if(width===390){expect(await page.locator('#icdClarificationAnswer').evaluate(n=>getComputedStyle(n).fontSize)).toBe('16px');expect((await page.locator('#icdClarificationSubmit').boundingBox()).height).toBeGreaterThanOrEqual(44);}
   await page.locator('#icdClarificationAnswer').press('Control+Enter');
   await expect(page.locator('#icdClarificationCount')).toHaveText('1 sqarim');await expect(page.locator('#icdClarificationAnswer')).toBeEmpty();
   await expect(page.locator('#icdSearch')).toHaveValue(query);await expect(page.locator('.icd-suggestion-row.is-active')).toHaveCount(0);
   expect(api.mutations[1]).toMatchObject({action:'interpret',expression:query,termOnly:true,clarifications:[{question,answer}]});
   await page.locator('#icdClarificationHistory summary').click();await expect(page.locator('#icdClarificationTurns')).toContainText(answer);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   expect(await page.evaluate(text=>Object.values(localStorage).some(value=>value.includes(text)),answer)).toBe(false);
   await page.screenshot({path:info.outputPath('clarification-reply-'+width+'.png')});
   await page.locator('#icdSearchClear').click();await expect(page.locator('#icdClarificationPanel')).toBeHidden();
   await page.locator('#icdSearch').fill('dhimbje koke prej dje');await page.locator('#icdUnderstandTerm').click();await expect(page.locator('#icdTermOnly')).not.toBeChecked();
   expect(api.mutations).toHaveLength(2);
  }finally{Description.cache.clear();if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
 });
}

test('clarification failure preserves the draft and retry never duplicates the answer',async({page})=>{
 let count=0;const question='Ku ndodhet dhimbja?';
 const api=await setup(page,false,false,()=>++count===2?{ok:false,error:'Provo përsëri.'}:{ok:true,aiUsed:true,rows:[],ambiguous:true,descriptionAnalysis:{clarification:question}});
 await page.locator('#icdSearch').fill('dhimbje prej dje');await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
 await expect(page.locator('#icdClarificationQuestion')).toHaveText(question);await page.locator('#icdClarificationAnswer').fill('Në bark.');await page.locator('#icdClarificationSubmit').click();
 await expect(page.locator('#icdMemoryStatus')).toContainText('Provo përsëri');await expect(page.locator('#icdClarificationAnswer')).toHaveValue('Në bark.');
 await page.locator('#icdClarificationSubmit').click();await expect(page.locator('#icdClarificationCount')).toHaveText('1 sqarim');
 expect(api.mutations[1].clarifications).toEqual(api.mutations[2].clarifications);expect(api.mutations[2].clarifications).toHaveLength(1);
});

test('pending clarification can be cancelled and cannot overwrite a different query',async({page})=>{
 let complete;const api=await setup(page,false,false,body=>body.clarifications?new Promise(resolve=>{complete=resolve;}):{ok:true,aiUsed:true,rows:[],ambiguous:true,descriptionAnalysis:{clarification:'Ku ndodhet dhimbja?'}});
 await page.locator('#icdSearch').fill('dhimbje prej dje');await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
 await expect(page.locator('#icdClarificationPanel')).toBeVisible();await page.locator('#icdClarificationAnswer').fill('Në bark.');await page.locator('#icdClarificationSubmit').click();
 await expect.poll(()=>api.mutations.length).toBe(2);await expect(page.locator('#icdClarificationAnswer')).toBeDisabled();await expect(page.locator('#icdClarificationSubmit')).toBeDisabled();
 await page.locator('#icdAiCancel').click();await expect(page.locator('#icdClarificationAnswer')).toBeEnabled();await expect(page.locator('#icdClarificationAnswer')).toHaveValue('Në bark.');
 await page.locator('#icdSearch').fill('I10');await expect(page.locator('#icdClarificationPanel')).toBeHidden();await expect(page.locator('.icd-suggestion-row').first()).toHaveAttribute('data-code','I10');
 complete({ok:true,aiUsed:true,rows:[],ambiguous:true,descriptionAnalysis:{clarification:'Old question'}});await expect(page.locator('#icdMemoryStatus')).toBeEmpty();await expect(page.locator('#icdClarificationPanel')).toBeHidden();
});

test('description clarification and model text stay inert and require an explicit choice',async({page})=>{
 const api=await setup(page,false,false,()=>({ok:true,aiUsed:true,ambiguous:true,descriptionAnalysis:{clarification:'<img src=x onerror=alert(1)>'},rows:[{...Advanced.compactNode(Memory.codeNode(dataset,'N23'),dataset),aiDescription:{kind:'differential',reason:'<svg onload=alert(1)>'}}]}));
 await page.locator('#icdSearch').fill('dhimbje ne regjionin retroperitoneal');await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
 await expect(page.locator('.icd-description-analysis')).toContainText('<img');await expect(page.locator('.icd-description-analysis img')).toHaveCount(0);await expect(page.locator('.icd-symptom-reason svg')).toHaveCount(0);
 await expect(page.locator('.icd-suggestion-row.is-active')).toHaveCount(0);expect(api.mutations).toHaveLength(1);expect(api.mutations[0].action).toBe('interpret');
});

test('phone consent, cancellation and a replacement AI search stay responsive',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const pending=[];
 const api=await setup(page,false,false,()=>new Promise(resolve=>pending.push(resolve)));
 const ai=page.locator('#icdUnderstandTerm'),proceed=page.locator('#icdAiContinue');
 await page.locator('#icdSearch').fill('pom ne majte');await ai.click();
 await expect(proceed).toBeVisible();await expect(proceed).toBeDisabled();
 await page.locator('#icdTermOnly').check();await expect(proceed).toBeEnabled();
 await page.screenshot({path:info.outputPath('gemini-consent-phone.png')});
 await proceed.click();await expect.poll(()=>api.mutations.length).toBe(1);
 await expect(page.locator('#icdAiCancel')).toBeVisible();expect((await page.locator('#icdAiCancel').boundingBox()).height).toBeGreaterThanOrEqual(44);
 await page.locator('#icdAiCancel').click();await expect(ai).toBeEnabled();await expect(ai).toBeFocused();
 await expect(page.locator('#icdMemoryStatus')).toContainText('u ndërpre');await expect(page.locator('#icdAiCancel')).toBeHidden();
 await ai.click();await expect(page.locator('#icdTermOnly')).not.toBeChecked();expect(api.mutations).toHaveLength(1);
 await page.locator('#icdTermOnly').check();await proceed.click();await expect.poll(()=>pending.length).toBe(2);
 pending[0]({ok:true,aiUsed:true,rows:[],ambiguous:true});await expect(ai).toHaveAttribute('aria-busy','true');
 pending[1]({ok:true,aiUsed:true,rows:[],ambiguous:true});await expect(ai).not.toHaveAttribute('aria-busy','true');
 await expect(page.locator('#icdMemoryStatus')).toContainText('Gemini');await expect(page.locator('#icdAiCancel')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('editing and clearing cancel AI without locking the next query',async({page})=>{
 const pending=[];const api=await setup(page,false,false,()=>new Promise(resolve=>pending.push(resolve)));
 await page.locator('#icdSearch').fill('pom ne majte');await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
 await expect.poll(()=>api.mutations.length).toBe(1);
 await page.locator('#icdSearch').fill('pom ne djathte');await expect(page.locator('#icdUnderstandTerm')).toBeEnabled();
 await expect(page.locator('#icdAiCancel')).toBeHidden();await expect(page.locator('#icdTermOnly')).not.toBeChecked();
 await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
 await expect.poll(()=>api.mutations.length).toBe(2);await page.locator('#icdSearchClear').click();
 await expect(page.locator('#icdUnderstandTerm')).toBeDisabled();await expect(page.locator('#icdMemoryStatus')).toBeEmpty();await expect(page.locator('#icdAiCancel')).toBeHidden();
 pending.forEach(resolve=>resolve({ok:true,aiUsed:true,rows:[],ambiguous:true}));
 await expect(page.locator('#icdMemoryStatus')).toBeEmpty();
});

test('AI deadline and offline state explain the next action',async({page,context})=>{
 let complete;const api=await setup(page,false,false,()=>new Promise(resolve=>{complete=resolve;}));
 await page.clock.install();
 await page.locator('#icdSearch').fill('pom ne majte');await page.locator('#icdUnderstandTerm').click();await page.locator('#icdTermOnly').check();await page.locator('#icdAiContinue').click();
 await expect.poll(()=>api.mutations.length).toBe(1);await page.clock.fastForward(56000);
 await expect(page.locator('#icdMemoryStatus')).toContainText('AI po vonon');await expect(page.locator('#icdUnderstandTerm')).toBeEnabled();await expect(page.locator('#icdAiCancel')).toBeHidden();
 complete({ok:true,aiUsed:true,rows:[],ambiguous:true});
 await context.setOffline(true);await page.locator('#icdUnderstandTerm').click();await expect(page.locator('#icdMemoryStatus')).toContainText('kërkon internet');expect(api.mutations).toHaveLength(1);
});

test('rotated CSRF renews automatically without duplicate writes',async({page})=>{
 const api=await setup(page,false,true);
 await page.locator('#icdSearch').fill('pom ne majte');await page.locator('#icdMemoryTools>summary').click();
 await page.locator('#icdMemoryCode').fill('R07.4');await page.locator('#icdTermOnly').check();await page.locator('#icdRememberTerm').click();
 await expect(page.locator('#icdMemoryStatus')).toContainText('vetëm në fjalorin tënd');expect(api.mutations).toHaveLength(1);expect(api.csrfReads()).toBe(2);
});

test('explicit personal mapping survives reload and description suggestions remain unconfirmed',async({page})=>{
 const api=await setup(page);await page.locator('#icdSearch').fill('pom ne majte');await page.locator('#icdMemoryTools>summary').click();
 await page.locator('#icdMemoryCode').fill('R07.4');await page.locator('#icdRememberTerm').click();expect(api.mutations).toHaveLength(0);
 await page.locator('#icdTermOnly').check();await page.locator('#icdRememberTerm').click();await expect(page.locator('#icdMemoryStatus')).toContainText('vetëm në fjalorin tënd');
 expect(api.mutations[0]).toMatchObject({action:'remember',termOnly:true,globalProposal:false,code:'R07.4'});
 await page.reload();await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');await page.locator('#icdSearch').fill('pom ne majte');await expect(page.locator('.icd-suggestion-row').first()).toContainText('Preferencë personale');
 await page.locator('#icdSearch').fill('pom ne majte djathte');await page.locator('#icdMemoryTools>summary').click();await page.locator('#icdTermOnly').check();await page.locator('#icdUnderstandTerm').click();
 await expect(page.locator('#icdMemoryStatus')).toContainText('vlerësim klinik');await expect(page.locator('.icd-suggestion-row').first()).toContainText('Sugjerim AI');await expect(page.locator('.icd-suggestion-row.is-active')).toHaveCount(0);
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
