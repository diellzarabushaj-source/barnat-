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
 row('erythro','Erythromycin','J01FA01','250 mg/5 ml','Oral suspension'),
 row('cipro','Ciprofloxacin','J01MA02','500 mg','Tablet'),
 row('fosfo','Fosfomycin trometamol','J01XX01','3 g','Granules for oral solution'),
 row('clav-tab','Amoxicillin; Clavulanic acid','J01CR02','(500 mg+125 mg)','Film coated tablet'),
 row('amox-tab','Amoxicillin','J01CA04','500 mg','Tablet'),
 row('amox-half','Amoxicillin','J01CA04','1000 mg','Tablet'),
 row('amox-second','Amoxicillin','J01CA04','250 mg/5 ml','Powder for oral suspension'),
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

// Exercise the real, published NICE page rather than the legacy adapter harness.
// Every exposed infection, allergy, clinical choice and eligible fixture product
// is operated with DOM events in both browser engines; no protocol state is injected.
const allInfections=['aom','gas','pneumonia','sinusitis','uti-cystitis','uti-pyelo','impetigo','cellulitis','wound-cut','abscess','preseptal','bite','lymphadenitis'];
for(const id of allInfections)for(const adult of [false,true])test(`Deep audit: ${id}, ${adult?'adult':'child'}, every allergy and antibiotic option`,async({page})=>{
 test.setTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await open(page,id,adult?'adult':'5y',adult?'70':'20');
 if(id==='uti-cystitis'&&adult)await page.locator('#utiSexSelect').selectOption('female');
 const allergies=await page.locator('#allergySelect option').evaluateAll(nodes=>nodes.map(n=>n.value));expect(allergies).toHaveLength(7);
 let operated=0;
 for(const allergy of allergies){
  await page.locator('#allergySelect').selectOption(allergy);
  if(await page.locator('#utiAlternativeInput').isVisible())await page.locator('#utiAlternativeInput').check();
  const chooser=page.locator('#antibioticSelect');
  if(!await chooser.count()){expect((await page.locator('#recommendationList').innerText()||await page.locator('#eligibilityMessage').innerText()).trim()).toBeTruthy();continue;}
  const ids=await chooser.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
  for(const value of ids){
   await page.locator('#antibioticSelect').selectOption(value);operated++;
   const card=page.locator('.abx-option:visible');await expect(card).toHaveCount(1);await expect(card).toHaveAttribute('data-regimen-id',value);
   if(await card.getAttribute('data-clinical-blocked')==='true'){await expect(card).not.toBeEmpty();await expect(card.locator('.abx-market')).toHaveCount(0);await expect(page.locator('#caseNext')).toBeDisabled();}
   else await expect(card.locator('.abx-option-source')).toContainText('NICE');
  }
  if(['a4','a5'].includes(allergy))await expect(page.locator('.abx-option')).toHaveCount(0);
 }
 expect(errors).toEqual([]);await test.info().attach('operated-options',{body:JSON.stringify({id,adult,allergies:allergies.length,antibiotics:operated}),contentType:'application/json'});
});

test('Deep audit: all clinical select choices and urgent stops can be reversed safely',async({page})=>{
 for(const [id,selector,choices]of [['aom','#aomRiskSelect',['routine','benefit','high','urgent']],['pneumonia','#guide-severity',['nonsevere','moderate','other']],['sinusitis','#guide-course',['initial','failure','high']],['impetigo','#guide-extent',['local','wide']],['cellulitis','#guide-purulence',['none','pus']],['bite','#guide-purpose',['none','proph','treat']]]){
  await open(page,id);for(const value of choices){await page.locator(selector).selectOption(value);expect(await page.locator('#recommendationList').innerText()||await page.locator('#eligibilityMessage').innerText()).toBeTruthy();}
  if(await page.locator('#guideUrgentInput').isVisible()){await page.locator('#guideUrgentInput').check();await expect(page.locator('.abx-rx-copy')).toHaveCount(0);await expect(page.locator('#caseNext')).toBeDisabled();await page.locator('#guideUrgentInput').uncheck();}
 }
 await open(page,'aom');await page.locator('#aomFailureInput').check();await expect(page.locator('#antibioticSelect')).toContainText('clavulanate');await page.locator('#aomFailureInput').uncheck();await expect(page.locator('#antibioticSelect')).toContainText('Amoxicillin');
 await open(page,'gas');await page.locator('#gasOptions summary').click();for(const schedule of ['bid','qds']){await page.locator('#gasScheduleSelect').selectOption(schedule);await expect(page.locator('.abx-option:visible .abx-option-meta')).toContainText(schedule==='bid'?'2 herë/ditë':'4 herë/ditë');}
});

test('Culture and fluoroquinolone confirmations cannot transfer across antibiotic switches',async({page})=>{
 await open(page,'uti-pyelo','adult','70');await page.locator('#antibioticSelect').selectOption('amoxclav-pyelo');await page.locator('#cultureSusceptibleInput').check();await expect(page.locator('.abx-option:visible')).not.toHaveAttribute('data-clinical-blocked','true');
 await page.locator('#antibioticSelect').selectOption('cephalexin-pyelo-nice');await page.locator('#antibioticSelect').selectOption('amoxclav-pyelo');await expect(page.locator('#cultureSusceptibleInput')).not.toBeChecked();await expect(page.locator('.abx-option:visible')).toHaveAttribute('data-clinical-blocked','true');
 await expect(page.locator('#cultureSusceptibleInput')).toBeFocused();
 await page.locator('#cultureSusceptibleInput').check();await page.locator('#allergySelect').selectOption('a0');await expect(page.locator('#cultureSusceptibleInput')).not.toBeChecked();
 await page.locator('#antibioticSelect').selectOption('cipro-pyelo-nice');await page.locator('#utiFluoroInput').check();await page.locator('#antibioticSelect').selectOption('cephalexin-pyelo-nice');await page.locator('#antibioticSelect').selectOption('cipro-pyelo-nice');await expect(page.locator('#utiFluoroInput')).not.toBeChecked();await expect(page.locator('.abx-option:visible')).toHaveAttribute('data-clinical-blocked','true');
});

test('Weight review stop stays visible and cannot be collapsed as ready',async({page})=>{
 await open(page,'uti-cystitis','11y','45');await page.locator('#utiEgfrInput').fill('90');const c=page.locator('.abx-option:visible');await expect(c).toHaveCount(1);await expect(c).toContainText('mbi 40 kg');await expect(c).toHaveAttribute('data-clinical-blocked','true');await expect(c.locator('.abx-market')).toHaveCount(0);await expect(page.locator('#caseNext')).toBeDisabled();
});

test('A new case clears remembered product and half-tablet consent; case edit restores focus',async({page})=>{
 await open(page,'aom');const c=page.locator('.abx-option:visible');await choose(c,'oral-liquid','250 mg/5 ml');await expect(c.locator('.abx-rx-copy')).toBeEnabled();await page.locator('#caseNext').click();await expect(page.locator('#caseSummary')).toBeVisible();await page.locator('#caseEdit').click();await expect(page.locator('#weightInput')).toBeFocused();
 await choose(c,'tablet','1000 mg');await c.locator('.abx-split-confirm input').check();await expect(c.locator('.abx-rx-copy')).toBeEnabled();
 await page.getByRole('button',{name:'Pastro rastin',exact:true}).click();await expect(page.locator('#weightInput')).toBeFocused();await page.locator('#weightInput').fill('20');await page.locator('#ageSelect').selectOption('5y');await expect(page.locator('.abx-option:visible').getByRole('combobox',{name:/^Forma ·/})).toHaveValue('');await expect(page.locator('.abx-option:visible .abx-rx-copy')).toBeDisabled();
 await choose(c,'tablet','1000 mg');await expect(c.locator('.abx-split-confirm input')).not.toBeChecked();await expect(c.locator('.abx-rx-copy')).toBeDisabled();
});

for(const width of [320,390,1440])test(`Deep audit: form, strength, every product and all disclosures at ${width}px`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:900});let products=0;
 for(const [id,allergy]of [['aom','none'],['gas','none'],['aom','a1'],['bite','none'],['uti-pyelo','none'],['impetigo','none'],['uti-cystitis','none']]){
  await open(page,id);await page.locator('#allergySelect').selectOption(allergy);if(id==='uti-cystitis')await page.locator('#utiEgfrInput').fill('90');
  const card=page.locator('.abx-option:visible');const form=card.getByRole('combobox',{name:/^Forma ·/});await expect(form).toBeVisible();
  const forms=await form.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean));
  for(const f of forms){await form.selectOption(f);const strength=card.getByRole('combobox',{name:/^Fortësia/});const strengths=await strength.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean));
   for(const s of strengths){await strength.selectOption(s);const details=card.locator('.abx-market-product');if(await details.getAttribute('open')===null)await details.locator('summary').click();const select=card.getByRole('combobox',{name:/^Produkti ·/});const ids=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean));
    for(const product of ids){await select.selectOption(product);products++;await expect(card.locator('.abx-market-info')).not.toHaveAttribute('data-tone','blocked');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
   }
  }
  const disclosures=await card.locator('details').all();for(const detail of disclosures)if(await detail.locator(':scope > summary').isVisible()&&await detail.getAttribute('open')===null)await detail.locator(':scope > summary').click();for(const detail of disclosures.reverse())if(await detail.locator(':scope > summary').isVisible()&&await detail.getAttribute('open')!==null)await detail.locator(':scope > summary').click();
  await page.locator('.abx-provenance>summary').click();await page.locator('.abx-provenance>summary').click();
 }
 expect(products).toBeGreaterThan(10);await test.info().attach('product-options',{body:JSON.stringify({width,products}),contentType:'application/json'});if(await page.locator('#caseNext').isEnabled())await page.locator('#caseNext').click();await page.screenshot({path:test.info().outputPath('deep-product-'+width+'.png'),fullPage:true});
});

test('Catalog failure and retry never leave a stale enabled prescription',async({page})=>{
 await page.route('**/api/dosage?view=antibiotic-market',r=>r.fulfill({status:503,json:{error:'temporarily unavailable'}}));await open(page,'aom');await expect(page.locator('.abx-option:visible .abx-market')).toContainText('Produktet nuk u ngarkuan');await expect(page.locator('.abx-option:visible .abx-rx-copy')).toBeDisabled();
 await page.route('**/api/dosage?view=antibiotic-market',r=>r.fulfill({json:catalog}));await page.locator('.abx-option:visible').getByRole('button',{name:'Provo përsëri'}).click();await choose(page.locator('.abx-option:visible'),'oral-liquid','250 mg/5 ml');await expect(page.locator('.abx-option:visible .abx-rx-copy')).toBeEnabled();
});

test('UTI: every patient profile, renal boundary, term, escalation and frequency control',async({page})=>{
 await open(page,'uti-cystitis','adult','70');await page.locator('#utiSexSelect').selectOption('female');await page.locator('#utiEgfrInput').fill('45');await expect(page.locator('.abx-option:visible')).not.toHaveAttribute('data-clinical-blocked','true');
 for(const egfr of ['44','0','']){await page.locator('#utiEgfrInput').fill(egfr);await expect(page.locator('.abx-option:visible')).toHaveAttribute('data-clinical-blocked','true');await expect(page.locator('#caseNext')).toBeDisabled();}
 await page.locator('#utiEgfrInput').fill('90');await page.locator('#utiSexSelect').selectOption('male');await expect(page.locator('.abx-option:visible .abx-duration')).toHaveText('7 ditë');await page.locator('#utiSexSelect').selectOption('female');await expect(page.locator('.abx-option:visible .abx-duration')).toHaveText('3 ditë');
 await page.locator('#pregnancyInput').check();await page.locator('#utiAtTermInput').check();await expect(page.locator('.abx-option:visible')).toHaveAttribute('data-clinical-blocked','true');await page.locator('#utiAtTermInput').uncheck();await expect(page.locator('.abx-option:visible')).not.toHaveAttribute('data-clinical-blocked','true');
 await page.locator('#utiUpperInput').check();await expect(page.locator('.abx-option')).toHaveCount(0);await page.locator('#utiUpperInput').uncheck();await page.locator('#utiUrgentInput').check();await expect(page.locator('.abx-option')).toHaveCount(0);await page.locator('#utiUrgentInput').uncheck();
 await page.locator('#pregnancyInput').uncheck();await page.locator('#utiAlternativeInput').check();await page.locator('#antibioticSelect').selectOption('fosfo-cystitis-nice');const fosfo=page.locator('.abx-option:visible');await expect(fosfo.locator('.abx-duration')).toHaveText('1 ditë');
 await open(page,'uti-pyelo','adult','70');for(const times of ['3','2']){await page.locator('#utiCephSelect').selectOption(times);await expect(page.locator('.abx-option:visible .abx-option-meta')).toContainText(times+' herë/ditë');}
});

test('Pregnancy and allergy: all nine NICE infections retain only suitable source regimens',async({page})=>{
 for(const id of ['aom','gas','pneumonia','sinusitis','uti-cystitis','uti-pyelo','impetigo','cellulitis','bite']){
  await open(page,id,id==='aom'?'17y':'adult','60');await page.locator('#pregnancyInput').check();if(id==='uti-cystitis')await page.locator('#utiEgfrInput').fill('90');
  for(const allergy of ['none','a1','a3']){await page.locator('#allergySelect').selectOption(allergy);await expect(page.locator('#antibioticSelect option')).not.toContainText(['Clarithromycin','Ciprofloxacin']);
   for(const card of await page.locator('.abx-option').all())if(await card.getAttribute('data-clinical-blocked')!=='true')await expect(card.locator('.abx-option-source')).toContainText('NICE');
  }
 }
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
