'use strict';
const {test,expect}=require('@playwright/test');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {phase5AuthenticatedSession}=require('./phase5-browser-fixture');
const root=path.resolve(__dirname,'..');
const product={id:'11111111-1111-4111-8111-111111111111',registryNumber:42,tradeName:'PARACETAMOL NOTE TEST',activeSubstance:'Paracetamol',strength:'500 mg',form:'Tabletë',atc:'N02BE01'};
const original='  Shënim me hapësira\nDhe shkronjën ë.  ';
const ownerA={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'a@example.test',name:'Test Doctor'};
const ownerB={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',email:'b@example.test',name:'Other Doctor'};
let server,baseURL;
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/' ? '/index.html' : pathname));
    if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  baseURL=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));});

function library(){
  const db={owner:{...ownerA},content:original,version:1,deleted:false,writes:[],loseReply:false,holdReply:null};
  const receipts=new Map();
  db.snapshot=()=>{
    const row={entityType:'product',entityKey:product.id,rowVersion:db.version,payload:{...product,drugId:product.id}};
    return {ok:true,user:{...db.owner},favorites:[],prescriptions:[],drugs:[],entityNotes:db.deleted ? [] : [{...row,content:db.content}],tombstones:{entityNotes:db.deleted ? [{...row,deletedAt:'2026-10-10T00:00:00Z'}] : []},noteVersions:[{...row,deleted:db.deleted}]};
  };
  db.respond=async route=>{
    if(route.request().method()==='GET') return route.fulfill({json:db.snapshot()});
    const body=route.request().postDataJSON();
    const row=body.entityNotes?.[0] || body.tombstones?.entityNotes?.[0];
    db.writes.push(body);
    if(body.libraryOwner!==db.owner.id) return route.fulfill({status:409,json:{code:'LIBRARY_OWNER_CHANGED',error:'Llogaria ka ndryshuar.'}});
    if(body.noteOwner!==db.owner.id) return route.fulfill({status:409,json:{code:'NOTE_OWNER_CHANGED',error:'Llogaria ka ndryshuar.'}});
    const receipt=receipts.get(row.operationId);
    if(receipt){
      expect(body).toEqual(receipt.body);
      return route.fulfill({json:{...db.snapshot(),noteOperations:[receipt.ack]}});
    }
    if(row.expectedVersion!==db.version || (row.restore && !db.deleted)) return route.fulfill({status:409,json:{code:'NOTE_VERSION_CONFLICT',error:'Versioni i shënimit ka ndryshuar.',conflicts:[{entityType:row.entityType,entityKey:row.entityKey,rowVersion:db.version,deleted:db.deleted}]}});
    expect(row.operationId).toMatch(/^[a-f0-9-]{36}$/);
    db.content=body.entityNotes ? row.content : ''; db.deleted=!body.entityNotes; db.version++;
    const ack={entityType:row.entityType,entityKey:row.entityKey,operationId:row.operationId,rowVersion:db.version,deleted:db.deleted};
    receipts.set(row.operationId,{body,ack});
    const response={...db.snapshot(),noteOperations:[ack]};
    if(db.loseReply){db.loseReply=false;return route.fulfill({status:503,json:{error:'Përgjigjja u ndërpre pas ruajtjes.'}});}
    if(db.holdReply) await db.holdReply;
    await route.fulfill({json:response}).catch(()=>{});
  };
  return db;
}
async function install(page,db){
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/user-library') return db.respond(route);
    let payload={ok:true,items:[],adult:[],pediatric:[],cards:[],forms:[],exists:false};
    if(url.pathname==='/api/auth') payload=url.searchParams.get('scope')==='ui-preferences'
      ? {ok:true,userId:db.owner.id,registryColumns:Object.keys(require('../registry-column-model').fields)}
      : phase5AuthenticatedSession({user:{...db.owner},authUser:{id:db.owner.id}});
    if(url.pathname==='/api/drug-search') payload=url.searchParams.get('view')==='registry-detail' ? {ok:true,row:product} : {ok:true,rows:[product],pagination:{page:1,pageSize:50,total:1,totalPages:1}};
    await route.fulfill({json:payload});
  });
}
async function editor(page){
  await page.goto(`${baseURL}/index.html`);
  await page.locator(`[data-row-menu-key="${product.id}"] summary`).click();
  await page.locator(`[data-row-note="${product.id}"]`).click();
  await expect(page.locator('#registryNoteText')).toHaveValue(original);
}
async function currentVersion(page){return page.evaluate(key=>window.DRxPhase9Personal.noteBase('product',key).rowVersion,product.id);}

for(const width of [390,1440]){
  test(`Two editors preserve the draft through two conflicts at ${width}px`,async({page,context})=>{
    await page.setViewportSize({width,height:900});
    const db=library(),other=await context.newPage();
    await other.setViewportSize({width,height:900});
    await install(page,db); await install(other,db);
    await editor(page); await editor(other);
    const draft='  Drafti lokal\nMbaje të plotë me ë.  ';
    await page.locator('#registryNoteText').fill(draft);
    await other.locator('#registryNoteText').fill('Versioni nga pajisja tjetër');
    await other.locator('[data-note-save]').click();
    await expect(other.locator('#registryNoteDialog')).toBeHidden();
    await page.locator('[data-note-save]').click();
    await expect(page.locator('#registryNoteConflict')).toBeVisible();
    await expect(page.locator('#registryNoteText')).toHaveValue(draft);
    await expect(page.locator('[data-note-save]')).toBeDisabled();
    await page.locator('[data-note-conflict-action]').click();
    await expect(page.locator('#registryNoteLatestText')).toHaveText('Versioni nga pajisja tjetër');
    expect(db.writes).toHaveLength(2);
    const third='Version i tretë '+ 'a'.repeat(1300);
    await other.evaluate(async({key,content})=>{await window.DRxPhase9Personal.load({force:true});await window.DRxPhase9Personal.saveNote('product',key,content);},{key:product.id,content:third});
    await page.locator('[data-note-conflict-action]').click();
    await expect(page.locator('[data-note-conflict-action]')).toHaveText('Lexo versionin e fundit');
    await expect(page.locator('#registryNoteText')).toHaveValue(draft);
    expect(db.content).toBe(third);
    await page.locator('[data-note-conflict-action]').click();
    await expect(page.locator('#registryNoteLatestText')).toHaveText(third);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const contrast=await page.locator('#registryNoteConflict').evaluate(node=>{
      const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
      const luminance=value=>rgb(value).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const style=getComputedStyle(node),a=luminance(style.color),b=luminance(style.backgroundColor);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    if(width===390) expect((await page.locator('[data-note-conflict-action]').boundingBox()).height).toBeGreaterThanOrEqual(44);
    if(process.env.NATIVE_NOTE_OUTPUT){
      fs.mkdirSync(process.env.NATIVE_NOTE_OUTPUT,{recursive:true});
      await page.screenshot({path:path.join(process.env.NATIVE_NOTE_OUTPUT,`note-conflict-${test.info().project.name}-${width}.png`)});
    }
    await page.locator('[data-note-conflict-action]').click();
    await expect(page.locator('#registryNoteDialog')).toBeHidden();
    expect(db.content).toBe(draft);
    expect(db.version).toBe(4);
    await other.close();
  });

  test(`Undo rejects delete/edit/delete ABA at ${width}px`,async({page,context})=>{
    await page.setViewportSize({width,height:900});
    const db=library(),other=await context.newPage();
    await install(page,db);await install(other,db);
    await editor(page);await editor(other);
    await page.locator('[data-note-delete]').click();
    await expect(page.locator('#registryNoteUndo button')).toBeVisible();
    await other.evaluate(async key=>{
      const api=window.DRxPhase9Personal;await api.load({force:true});
      await api.saveNote('product',key,'Shënimi i ri nga pajisja tjetër');
      await api.deleteNote('product',key);
    },product.id);
    expect(db.deleted).toBe(true);expect(db.version).toBe(4);
    await page.locator('#registryNoteUndo button').click();
    await expect(page.locator('#registryNoteUndo')).toContainText('nuk e mbishkruan');
    await expect(page.locator('#registryNoteUndo button')).toBeDisabled();
    expect(db.deleted).toBe(true);expect(db.version).toBe(4);
    expect(db.writes.at(-1).entityNotes[0]).toMatchObject({expectedVersion:2,restore:true,content:original});
    await other.close();
  });

  test(`Uncertain note response retries the same operation at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    const db=library();await install(page,db);await editor(page);
    const draft='  Teksti i pandryshuar\nPas ndërprerjes.  ';
    await page.locator('#registryNoteText').fill(draft);
    db.loseReply=true;await page.locator('[data-note-save]').click();
    await expect(page.locator('#toast')).toContainText('Përgjigjja u ndërpre');
    await expect(page.locator('#registryNoteText')).toHaveValue(draft);
    await expect(page.locator('[data-note-save]')).toBeEnabled();
    await page.locator('[data-note-save]').click();
    await expect(page.locator('#registryNoteDialog')).toBeHidden();
    expect(db.writes).toHaveLength(2);expect(db.writes[1]).toEqual(db.writes[0]);
    expect(db.version).toBe(2);expect(db.content).toBe(draft);
  });

  test(`Late response after account switch cannot display an old draft at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    const db=library();await install(page,db);await editor(page);
    await page.locator('#registryNoteText').fill('Private draft from A');
    let release;db.holdReply=new Promise(resolve=>{release=resolve;});
    await page.locator('[data-note-save]').click();
    await expect.poll(()=>db.writes.length).toBe(1);
    expect(await page.locator('#registryNoteText').evaluate(node=>node.readOnly)).toBe(true);
    db.owner={...ownerB};db.version=0;db.content='';db.deleted=true;
    await page.evaluate(owner=>window.dispatchEvent(new CustomEvent('medindex:auth-ready',{detail:{user:owner,authUser:{id:owner.id}}})),ownerB);
    await expect(page.locator('#registryNoteDialog')).toBeHidden();
    await expect(page.locator('#registryNoteText')).toHaveValue('');
    release();
    await expect.poll(()=>page.evaluate(()=>window.DRxPhase9Personal.state().user?.id)).toBe(ownerB.id);
    expect(await currentVersion(page)).toBe(0);
    expect(db.writes).toHaveLength(1);expect(db.content).toBe('');
  });

  test(`Pediatric note draft keeps its opening base across a refresh at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});
    const db=library();await install(page,db);
    // Mount the remaining calculator client on its preserved pilot markup.
    // The historical combined script remains untouched; use only its chrome
    // bootstrap here and the current standalone calculator writer below it.
    for(const [file,type] of [['dozologjia.html','text/html'],['dozologjia-v2.js','application/javascript'],['dozologjia-v2.css','text/css']]){
      let body=fs.readFileSync(path.join(root,'docs/archive/dozologjia-before-v27',file+'.txt'),'utf8').replace(/\r\n/g,'\n');
      if(file==='dozologjia-v2.js'){
        const second=body.indexOf('\n(() => {',body.indexOf('\n(() => {')+1);
        expect(second).toBeGreaterThan(0);
        body=body.slice(0,second)+'\n'+fs.readFileSync(path.join(root,'pediatric-calculator-client.js'),'utf8');
      }
      await page.route('**/'+file+'*',route=>route.fulfill({contentType:type,body}));
    }
    const dosageProduct={drugId:product.id,registryNumber:42,name:product.tradeName,pdid:'PD-42',substance:'Paracetamol',substanceConceptId:'22222222-2222-4222-8222-222222222222',substanceCanonicalName:'Paracetamol',clinicalVariantId:'33333333-3333-4333-8333-333333333333',variantStatus:'BOUND',populationKey:'ADULT_AND_PEDIATRIC',populationStatus:'VERIFIED',strength:'500 mg',form:'Tabletë',atcCode:'N02BE01',readiness:'CALCULATOR_READY',calculable:true,useStatus:'PEDIATRIC_AND_ADULT',requires:{weight:true,age:true},regimen:{indication:'Indikacion test',route:'oral',basis:'kg/ditë',dosesPerDay:4},source:{url:'https://example.test/source',verificationStatus:'verified'},phase9Context:{identityStatus:'VERIFIED',v3Published:true}};
    await page.route('**/api/dosage/search**',route=>route.fulfill({json:{ok:true,results:[dosageProduct],facets:{all:1,ready:1,text:0,blocked:0}}}));
    await page.route('**/api/dosage/product/**',route=>route.fulfill({json:{ok:true,product:dosageProduct}}));
    await page.goto(`${baseURL}/dozologjia.html`);
    await page.locator('#dosageSearch').fill('para');
    await page.locator(`[data-drug-id="${product.id}"]`).click();
    await page.getByRole('tab',{name:'Shënime'}).click();
    const area=page.locator('[data-phase9-note-entity="product"]');
    await expect(area).toHaveValue(original);
    const draft='  Drafti pediatrik\nI pandryshuar.  ';
    await area.fill(draft);
    db.content='Version i ri nga pajisja tjetër';db.version++;
    await page.evaluate(()=>window.DRxPhase9Personal.load({force:true}));
    await expect(area).toHaveValue(draft);
    await page.locator('[data-action="save-phase9-note"][data-entity-type="product"]').click();
    await expect(page.locator('[data-action="resolve-phase9-note"][data-entity-type="product"]')).toHaveText('Lexo versionin e fundit');
    await expect(area).toHaveValue(draft);
    expect(db.writes[0].entityNotes[0].expectedVersion).toBe(1);
    await page.locator('[data-action="resolve-phase9-note"][data-entity-type="product"]').click();
    await expect(page.locator('.phase9-note-latest pre')).toHaveText(db.content);
    await expect(area).toHaveValue(draft);
    await page.locator('[data-action="resolve-phase9-note"][data-entity-type="product"]').click();
    await expect(page.locator('[data-action="resolve-phase9-note"][data-entity-type="product"]')).toHaveCount(0);
    expect(db.content).toBe(draft);expect(db.version).toBe(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
