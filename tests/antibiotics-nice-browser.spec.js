const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {row,rows}=require('./antibiotic-market-fixture');
const {buildCatalog}=require('../lib/antibiotic-market-catalog');
const {phase5AuthenticatedSession}=require('./phase5-browser-fixture');
const ROOT=path.resolve(__dirname,'..');let server,url;
const catalog=buildCatalog([...rows,
 row('penv-liquid','Phenoxymethylpenicillin','J01CE02','125 mg/5 ml','Oral suspension'),
 row('penv-tab','Phenoxymethylpenicillin','J01CE02','500 mg','Tablet'),
 row('clav4','Amoxicillin; Clavulanic acid','J01CR02','(125 mg+31.25 mg)/5 ml','Powder for oral suspension'),
 row('fluclox','Flucloxacillin','J01CF05','125 mg/5 ml','Oral solution'),
 row('clarithro','Clarithromycin','J01FA09','125 mg/5 ml','Oral suspension'),
 row('clarithro-tab','Clarithromycin','J01FA09','500 mg','Tablet'),
 row('nitro','Nitrofurantoin','J01XE01','25 mg/5 ml','Oral suspension'),
 row('ospen','Phenoxymethylpenicillin Potassium','J01CE02','1000000 IU','Film coated tablet',{id:'237f3733-de55-486a-9309-a357f87e2daa',registry_number:2947,trade_name:'OSPEN 1.0 - Filmtabletten'})
]);
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{server=http.createServer((req,res)=>{const file=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(ROOT+path.sep)){res.writeHead(404);return res.end();}try{const body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;});
test.afterAll(()=>new Promise(r=>server.close(r)));
test.beforeEach(async({page})=>{await page.route('**/api/auth*',r=>r.fulfill({json:phase5AuthenticatedSession()}));await page.route('**/api/dosage?view=antibiotic-market',r=>r.fulfill({json:catalog}));});
const answers={pneumonia:{severity:'nonsevere'},sinusitis:{course:'initial'},impetigo:{extent:'wide'},cellulitis:{purulence:'none'},bite:{purpose:'proph'}};
async function open(page,id,age='5y',weight='20'){await page.goto(url+'/antibiotiket.html?indication='+id);await page.locator('#weightInput').fill(weight);await page.locator('#ageSelect').selectOption(age);for(const [key,val]of Object.entries(answers[id]||{}))await page.locator('#guide-'+key).selectOption(val);}
async function choose(c,form,strength){await c.getByRole('combobox',{name:/^Forma ·/}).selectOption(form);await c.getByRole('combobox',{name:/^Fortësia/}).selectOption({label:strength});}
for(const width of [320,390,1440])test(`Published NICE manual: nine infection routes, product doses and keyboard search at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 for(const [id,form,strength,days] of [['aom','oral-liquid','250 mg/5 ml',5],['gas','oral-liquid','125 mg/5 ml',10],['pneumonia','oral-liquid','250 mg/5 ml',3],['sinusitis','oral-liquid','125 mg/5 ml',5],['uti-cystitis','oral-liquid','25 mg/5 ml',3],['uti-pyelo','oral-liquid','250 mg/5 ml',7],['impetigo','oral-liquid','125 mg/5 ml',5],['cellulitis','oral-liquid','125 mg/5 ml',5],['bite','oral-liquid','(125 mg+31.25 mg)/5 ml',3]]){
  await open(page,id);if(id==='uti-cystitis')await page.locator('#utiEgfrInput').fill('90');
  const c=page.locator('.abx-option:visible').first();await expect(c.locator('.abx-option-source')).toContainText('NICE');await choose(c,form,strength);
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();await expect(c.locator('.abx-rx-line')).toContainText(`× ${days} ditë`);
  await expect(c.locator('.abx-market-daily')).toBeVisible();await expect(c.locator('.abx-market-limit-line')).toBeVisible();
  await expect(page.locator('#hospitalModule')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.locator('h1').click();await page.keyboard.press('/');await expect(page.locator('#infectionSearch')).toBeFocused();await page.locator('#infectionSearch').fill('anginë');await page.locator('#infectionSearch').press('Enter');
 await expect(page.locator('#indicationCurrent')).toContainText('Faringjit');await expect(page.locator('#guide-throat')).toHaveCount(0);
 await page.screenshot({path:test.info().outputPath('nice-manual-'+width+'.png'),fullPage:true});
});
test('All four scope exclusions and adult AOM remain findable but never prescribe',async({page})=>{for(const id of ['wound-cut','abscess','preseptal','lymphadenitis']){await open(page,id);await expect(page.locator('#eligibilityMessage')).toBeVisible();await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);await expect(page.locator('.abx-rx-copy')).toHaveCount(0);await expect(page.locator('#caseNext')).toBeDisabled();}await open(page,'aom','adult','70');await expect(page.locator('#eligibilityMessage')).toContainText('nën 18 vjeç');});
test('NICE engine missing fails closed; legacy doses and hospital cards cannot leak',async({page})=>{await page.route('**/antibiotiket-nice.js*',r=>r.abort());await page.goto(url+'/antibiotiket.html');await expect(page.locator('#recommendationList')).toContainText('Standardi NICE nuk u ngarkua');await expect(page.locator('.abx-rx-copy')).toHaveCount(0);await expect(page.locator('#hospitalModule')).toBeHidden();});
test('Age auto-fill resets and confirmed under-three-month UTI is referred',async({page})=>{await open(page,'uti-cystitis','2m','5');await expect(page.locator('#eligibilityMessage')).toContainText('≥3 muaj');await page.locator('#weightInput').fill('');await expect(page.locator('#ageSelect')).toHaveValue('');await page.locator('#weightInput').fill('12.5');await expect(page.locator('#ageSelect')).toHaveValue('2y');await expect(page.locator('#ageConfirmation')).toBeVisible();await expect(page.locator('.abx-rx-copy')).toHaveCount(0);});
test('Minimal reference flow has no start/backup/no-antibiotic strategy controls',async({page})=>{for(const id of ['aom','gas']){await open(page,id);await expect(page.locator('#guide-aomStrategy,#guide-throat')).toHaveCount(0);await expect(page.locator('.abx-option:visible')).toHaveCount(1);}});
test('NICE Penicillin V never activates an external Ospen IU regimen or CDC alternative',async({page})=>{await open(page,'sinusitis','adult','70');const c=page.locator('.abx-option:visible');await c.getByRole('combobox',{name:/^Forma ·/}).selectOption('tablet');await expect(c.getByRole('combobox',{name:/^Fortësia/}).locator('option')).not.toContainText(['1000000 IU']);await expect(c.locator('.abx-ospen')).toHaveCount(0);await expect(c.locator('.abx-ospen-activate')).toHaveCount(0);await open(page,'gas');await expect(page.locator('#antibioticSelect option')).not.toContainText(['Amoxicillin']);});
test('Atypical pneumonia is one alternative for children, a distinct addition only for moderate adults',async({page})=>{await open(page,'pneumonia');await page.locator('#atypicalInput').check();await expect(page.locator('.abx-option:visible')).toHaveCount(1);await expect(page.locator('#antibioticSelect')).toContainText('Clarithromycin');await open(page,'pneumonia','adult','70');await page.locator('#guide-severity').selectOption('moderate');await page.locator('#atypicalInput').check();await expect(page.locator('.abx-option:visible')).toHaveCount(2);await expect(page.locator('.abx-regimen-group')).toContainText(['Trajtimi bazë','Shtesë']);await page.locator('#guide-severity').selectOption('other');await expect(page.locator('.abx-rx-copy')).toHaveCount(0);});
test('Co-amoxiclav strengths are filtered before selection: 14:1 and 7:1 cannot enter a 4:1 regimen',async({page})=>{
 await open(page,'bite');const c=page.locator('.abx-option:visible');await c.getByRole('combobox',{name:/^Forma ·/}).selectOption('oral-liquid');
 const strengths=c.getByRole('combobox',{name:/^Fortësia/});const text=await strengths.locator('option').allTextContents();
 expect(text.join(' ')).toContain('125 mg+31.25 mg');expect(text.join(' ')).not.toMatch(/600 mg|400 mg|200 mg\+28/);
 await strengths.selectOption({label:'(125 mg+31.25 mg)/5 ml'});await expect(c.locator('.abx-market-single')).toContainText('5 mL');await expect(c.locator('.abx-rx-line')).toContainText('3 herë/ditë × 3 ditë');
 await page.route('**/api/dosage?view=antibiotic-market',r=>r.fulfill({json:buildCatalog(rows.filter(x=>x.id==='clav-14'))}));await page.reload();
 await page.locator('#ageSelect').selectOption('5y');await page.locator('#guide-purpose').selectOption('proph');
 await expect(page.locator('.abx-option:visible .abx-market')).toContainText('nuk u gjet formë/fortësi e përshtatshme');await expect(page.locator('.abx-option:visible .abx-market select')).toHaveCount(0);await expect(page.locator('.abx-option:visible .abx-rx-copy')).toBeDisabled();
});
