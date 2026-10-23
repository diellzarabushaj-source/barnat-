'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.resolve(__dirname,'..'),OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let server,baseURL;
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/medical-hub'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(require('./recetat-source-browser-fixture')(url)));}
  if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({ok:true,items:[],adult:[],pediatric:[],cards:[]}));}
  const file=path.resolve(ROOT,'.'+url.pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(404);return res.end();}
  try{res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>new Promise(resolve=>server.close(resolve)));
const SAMPLE='Rp:\n\n1. Tab. Preparati A 10 mg\n\nDoza: 1 tabletë\nRruga: PO\nShpeshtësia: Sipas udhëzimit të mjekut\nKohëzgjatja: Sipas planit individual\nSasia: 1 kuti\nS. Shembull vetëm për kontrollin e pamjes.\n\nOSE\n\n2. Sol. Preparati B 5 mg/5 mL\nDoza: 5 mL\nS. Udhëzimi i dytë, pa ndryshime.\n\nDHE\n\n3. Hapi mbështetës\nS. Teksti ruhet i plotë: ë, ç, μg, ≥, < > &.';
async function openComposer(page){
 await page.addInitScript(owner=>{
  localStorage.setItem('medindex_prescription_starter_seed_v1','1');localStorage.setItem('regjistriBarnave_protokollet_v1','[]');localStorage.setItem('medindex_user_library_meta_v1',JSON.stringify({owner}));
  const open=window.open.bind(window);window.open=(...args)=>{const popup=open(...args);if(popup){popup.print=()=>{};popup.focus=()=>{};}return popup;};
 },OWNER);
 await page.route('**/api/auth**',route=>route.fulfill({json:{authenticated:true,authUser:{id:OWNER},user:{id:OWNER,email:'qa@example.test',name:'QA'},csrfToken:'synthetic'}}));
 await page.route('**/api/user-library**',route=>route.fulfill({json:{ok:true,version:1,user:{id:OWNER},prescriptions:[],prescriptionVersions:[],favorites:[],entityNotes:[],noteVersions:[],drugs:[],tombstones:{prescriptions:[],favorites:[],entityNotes:[],drugs:[]}}}));
 await page.goto(baseURL+'/recetat.html#ndertimi');await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false');
}
async function prepare(page,input=SAMPLE){
 await page.locator('#rxDiagnosis').fill('SHEMBULL PËR PAMJEN - jo recetë për pacient');
 await page.locator('#rxFreeTextPanel > summary').click();await page.locator('#rxComposer').fill(input);await page.locator('#rxFormatLocal').click();
 await expect(page.locator('#rxPreview .rx-canonical-preview')).toContainText('Rp:');
 const review=page.locator('#rxClinicalReview input');await expect(review).toBeVisible();await review.check();await expect(page.locator('#rxPrint')).toBeEnabled();
}
async function popupFor(page){const pending=page.waitForEvent('popup');await page.locator('#rxPrint').click();const popup=await pending;await expect(popup.locator('.prescription-content')).toBeVisible();return popup;}
function lines(value){return value.replace(/\r/g,'').split('\n').filter(line=>line.trim()).map(line=>line.trim());}

test('PDF view preserves every canonical line and diagnosis; compact A4 is readable',async({page,browserName},info)=>{
 await openComposer(page);await expect(page.locator('#rxPrint')).toBeDisabled();await prepare(page);
 const canonical=await page.locator('#rxPreview .rx-canonical-preview').textContent();const popup=await popupFor(page);
 await expect(popup.locator('.document-head h1')).toHaveText('Recetë');await expect(popup.locator('.diagnosis-group.primary')).toContainText('SHEMBULL PËR PAMJEN');
 await expect(popup.locator('.document-meta time')).toHaveText(/^\d{2}\.\d{2}\.\d{4}$/);
 expect(lines(await popup.locator('.prescription-content').textContent())).toEqual(lines(canonical));
 await expect(popup.locator('.rx-connector')).toHaveText(['OSE','DHE']);await expect(popup.locator('.document-meta img')).toHaveJSProperty('complete',true);
 await expect(popup.locator('.prescription-content script')).toHaveCount(0);expect(await popup.evaluate(()=>window.opener===null)).toBe(true);
 await expect(popup.getByRole('button',{name:'Ruaj PDF / Printo'})).toBeVisible();
 await popup.emulateMedia({media:'print'});await expect(popup.locator('.print-tools')).toBeHidden();
 expect(await popup.locator('body').evaluate(node=>node.scrollHeight)).toBeLessThan(870);
 await popup.screenshot({path:info.outputPath('recete-a4.png'),fullPage:true});
 if(browserName==='chromium')await popup.pdf({path:info.outputPath('recete-a4.pdf'),preferCSSPageSize:true,printBackground:true});
 await popup.close();await expect(page.locator('#rxClinicalReview input')).toBeChecked();await expect(page.locator('#rxPrint')).toBeEnabled();
});

test('long prescriptions paginate without losing the final instruction',async({page,browserName},info)=>{
 await openComposer(page);
 const long='Rp:\n'+Array.from({length:24},(_,i)=>`${i+1}. Preparati QA ${i+1} 10 mg\nDoza: Udhëzim i plotë për provën e faqosjes\nRruga: PO\nS. ${'Udhëzim sintetik i gjatë që duhet të mbetet i plotë. '.repeat(4)}FUND-${i+1}`).join('\n\nDHE\n\n');
 await prepare(page,long);const canonical=await page.locator('#rxPreview .rx-canonical-preview').textContent();const popup=await popupFor(page);
 expect(lines(await popup.locator('.prescription-content').textContent())).toEqual(lines(canonical));await expect(popup.locator('.prescription-content')).toContainText('FUND-24');
 await popup.emulateMedia({media:'print'});if(browserName==='chromium')await popup.pdf({path:info.outputPath('recete-shume-faqe.pdf'),preferCSSPageSize:true,printBackground:true});
 await popup.close();
});

test('print preview fits a phone and leaves literal HTML as text',async({page})=>{
 await page.setViewportSize({width:390,height:844});await openComposer(page);await prepare(page,'Rp:\n1. Preparati QA\nS. <img src=x onerror=alert(1)> & tekst literal.\n'+('Fjalëshumëegjatë'.repeat(30)));
 const popup=await popupFor(page);await popup.setViewportSize({width:390,height:844});
 await expect(popup.locator('.prescription-content img')).toHaveCount(0);await expect(popup.locator('.prescription-content')).toContainText('<img src=x onerror=alert(1)>');
 expect(await popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(popup.getByRole('button',{name:'Ruaj PDF / Printo'})).toBeVisible();await popup.close();
});

test('standalone safe print keeps parity with the shipped renderer',async()=>{
 const standalone=fs.readFileSync(path.join(ROOT,'recetat-safe-print.js'),'utf8');const shipped=fs.readFileSync(path.join(ROOT,'recetat-v2.js'),'utf8');
 const start='  function appendDiagnosisSection(targetDocument, model) {';const end='  function install() {\n    ensureDocumentAssets();';
 const block=source=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 expect(block(standalone)).toBe(block(shipped));
});
