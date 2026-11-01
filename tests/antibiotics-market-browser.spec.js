const {test,expect}=require('@playwright/test');
const {rows,row}=require('./antibiotic-market-fixture');
const {buildCatalog}=require('../lib/antibiotic-market-catalog');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {phase5AuthenticatedSession}=require('./phase5-browser-fixture');
const ROOT=path.resolve(__dirname,'..');let server,baseURL;
const ospen1=row('237f3733-de55-486a-9309-a357f87e2daa','Phenoxymethylpenicillin Potassium','J01CE02','1000000 IU','Film coated tablet',{registry_number:2947,trade_name:'OSPEN 1.0 - Filmtabletten',packaging:'Box containing 3 blisters x 10 film coated tablets (30 tablets)'});
const ospen15=row('069016da-1fa5-432b-87c2-ab6a9b558241','Phenoxymethylpenicillin Potassium','J01CE02','1500000 IU','Film coated tablet',{registry_number:2946,trade_name:'OSPEN 1.5 - Filmtabletten',packaging:'Box containing 3 blisters x 10 film coated tablets (30 tablets)'});
const catalog=buildCatalog([...rows,ospen1,ospen15,
  row('cephalexin-tablet500','Cephalexin','J01DB01','500 mg','Tablet'),
  row('cephalexin-cap500','Cephalexin','J01DB01','500 mg','Capsule'),
  row('clarithro-tab500','Clarithromycin','J01FA09','500 mg','Tablet'),
  row('amox-tablet500','Amoxicillin','J01CA04','500 mg','Tablet'),
  row('clav4-liquid','Amoxicillin; Clavulanic acid','J01CR02','(125 mg+31.25 mg)/5 ml','Powder for oral suspension'),
  row('clav4-tab','Amoxicillin; Clavulanic acid','J01CR02','500 mg+125 mg','Tablet'),
  row('clav7-tab','Amoxicillin; Clavulanic acid','J01CR02','875 mg+125 mg','Tablet'),
  row('fluclox-cap','Flucloxacillin','J01CF05','500 mg','Capsule'),
  row('nitro-50','Nitrofurantoin','J01XE01','50 mg','Capsule'),
  row('nitro-100','Nitrofurantoin','J01XE01','100 mg','Tablet'),
  row('nitro-liquid','Nitrofurantoin Macrocrystal','J01XE01','25 mg/5 ml','Oral suspension'),
  row('fosfo-3g','Fosfomycin trometamol','J01XX01','3 g','Granules for oral solution',{packaging:'1 sachet'}),
  row('cefa-1g','Cefalexin','J01DB01','1 g','Film coated tablet'),
  row('cefa-liquid','Cefalexin','J01DB01','250 mg/5 ml','Powder for oral suspension'),
  row('penv-liquid','Phenoxymethylpenicillin','J01CE02','125 mg/5 ml','Oral suspension'),
  row('penv-iu','Phenoxymethylpenicillin','J01CE02','1 MIU','Tablet'),
  row('erythro-tab','Erythromycin','J01FA01','500 mg','Tablet'),
  row('penv-tab','Phenoxymethylpenicillin','J01CE02','500 mg','Tablet'),
]);
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    const file=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(ROOT+path.sep)){res.writeHead(404);return res.end();}
    try{const body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL='http://127.0.0.1:'+server.address().port;
});
test.afterAll(()=>new Promise(resolve=>server.close(resolve)));
test.beforeEach(async({page})=>{
  await page.route('**/api/auth*',route=>route.fulfill({json:phase5AuthenticatedSession()}));
  await page.route('**/api/dosage?view=antibiotic-market',route=>route.fulfill({json:catalog}));
});
const card=(page,id)=>page.locator(`[data-regimen-id="${id}"]`);
async function open(page,indication,age='5y',weight='18'){
  await page.goto(baseURL+'/antibiotiket.html?indication='+indication);
  if(weight)await page.locator('#weightInput').fill(weight);
  if(age)await page.locator('#ageSelect').selectOption(age);
}
async function gasControl(page,id){
  const control=page.locator('#'+id);
  if(!await control.isVisible())await page.locator('#gasOptions > summary').click();
  return control;
}
async function choose(c,form,strength){
  await expect(c.locator('.abx-market select').first()).toBeEnabled();
  await c.locator('.abx-market select').nth(0).selectOption(form);
  await c.locator('.abx-market select').nth(1).selectOption({label:strength});
}
for(const width of [320,390,1440])test(`NICE AOM: real age → product → final prescription at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await open(page,'aom');
  const c=card(page,'amox-aom');
  await expect(c.locator('.abx-option-source')).toHaveText('NICE NG91 · <18');
  await expect(c.locator('.abx-dose-row[data-role="single"]')).toContainText('500 mg/dozë');
  await expect(c.locator('.abx-dose-row[data-role="daily"]')).toContainText('1500 mg/ditë');
  await choose(c,'oral-liquid','250 mg/5 ml');
  await expect(c.locator('.abx-market-single')).toContainText('10 mL');
  await expect(c.locator('.abx-market-schedule')).toHaveText('3 herë/ditëÇdo 8 orë');
  await expect(c.locator('.abx-market-daily')).toContainText('30 mL');
  await expect(c.locator('.abx-rx')).toHaveAttribute('open','');
  await expect(c.locator('.abx-rx-line')).toContainText('10 mL PO 3 herë/ditë × 5 ditë');
  await expect(c.locator('.abx-rx-quantity')).toContainText('150 mL');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await c.locator('.abx-rx-shared select').selectOption('7');
  await expect(c.locator('.abx-rx-quantity')).toContainText('210 mL');
  await page.locator('#weightInput').fill('60');
  await expect(page.locator('#ageSelect')).toHaveValue('16y');
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await page.locator('#ageSelect').selectOption('5y');
  await expect(card(page,'amox-aom').locator('.abx-dose-row[data-role="single"]')).toContainText('500 mg/dozë');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`aom-${width}.png`),fullPage:true});
});
test('Weight suggests age automatically; no numerical prescription until confirmed',async({page})=>{
  await open(page,'aom','','60');
  await expect(page.locator('#ageSelect')).toHaveValue('16y');
  await expect(page.locator('#ageOptional')).toContainText('nga pesha');
  await expect(page.locator('#ageConfirmation')).toBeVisible();
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await expect(page.locator('#eligibilityMessage')).toContainText('moshën reale');
  await page.locator('#ageSelect').selectOption('adult');
  await expect(card(page,'amox-aom')).toContainText('NHS Fife · 18+');
  await expect(card(page,'amox-aom')).toContainText('500 mg/dozë');
});
test('Every infant month auto-fills without changing age options or confirming age',async({page})=>{
  await open(page,'aom','','');
  const {monthlySuggestionBands}=require('../pediatric-weight-age-core');
  for(const b of monthlySuggestionBands().slice(0,12)){
    await page.locator('#weightInput').fill(String((b.minKg+b.maxKg)/2));
    await expect(page.locator('#ageSelect')).toHaveValue(b.months?`${b.months}m`:'newborn');
    await expect(page.locator('#ageSuggestion')).toContainText('Peshë orientuese');
    await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  }
  await expect(page.locator('#ageSelect option')).toHaveCount(31);
});
test('Every new weight replaces even a manually selected age and resets confirmation',async({page})=>{
  await open(page,'aom','','7.25');
  await expect(page.locator('#ageSelect')).toHaveValue('6m');
  await page.locator('#ageConfirmation input').check();
  await expect(card(page,'amox-aom')).toContainText('125 mg/dozë');
  await page.locator('#weightInput').fill('9.75');
  await expect(page.locator('#ageSelect')).toHaveValue('1y');
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await page.locator('#ageSelect').selectOption('5y');
  await page.locator('#weightInput').fill('60');
  await expect(page.locator('#ageSelect')).toHaveValue('16y');
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await page.locator('#ageConfirmation input').check();
  await expect(card(page,'amox-aom')).toContainText('NICE NG91');
});
test('Reloaded inferred age needs confirmation; invalid and low weights clear it',async({page})=>{
  await open(page,'aom','','7.25');
  await page.locator('#ageConfirmation input').check();
  await page.reload();
  await expect(page.locator('#ageSelect')).toHaveValue('6m');
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await page.locator('#weightInput').fill('3.1');
  await expect(page.locator('#ageSelect')).toHaveValue('');
  await page.locator('#weightInput').fill('8.5');
  await expect(page.locator('#ageSelect')).toHaveValue('9m');
  await page.locator('#weightInput').fill('201');
  await expect(page.locator('#ageSelect')).toHaveValue('');
});
test('Reported 56kg case overrides 11 years immediately, including saved state',async({page})=>{
  await open(page,'aom','11y','35');
  await page.locator('#weightInput').fill('56');
  await expect(page.locator('#ageSelect')).toHaveValue('15y');
  await expect(page.locator('#ageOptional')).toContainText('nga pesha');
  await expect(page.locator('#ageConfirmation input')).not.toBeChecked();
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await page.locator('#ageSelect').selectOption('11y');
  await page.reload();
  await expect(page.locator('#ageSelect')).toHaveValue('15y');
  await expect(page.locator('#ageConfirmation')).toBeVisible();
});
test('Displayed reference range contains each automatically assigned weight',async({page})=>{
  await open(page,'aom','','');
  for(const weight of [3.3,7.25,9.75,12.5,18,25,33.5,42.5,47.5,52.5,56,58,60]){
    await page.locator('#weightInput').fill(String(weight));
    const hint=await page.locator('#ageSuggestion').innerText();
    const match=/≈([\d,]+)–([\d,]+)/.exec(hint);
    if(match){expect(weight).toBeGreaterThanOrEqual(Number(match[1].replace(',','.')));expect(weight).toBeLessThanOrEqual(Number(match[2].replace(',','.')));}
    else expect(hint).toContain('grupi 16+');
  }
  await page.locator('#ageSelect').selectOption('adult');
  await page.locator('#weightInput').fill('');
  await expect(page.locator('#ageSelect')).toHaveValue('');
  await page.locator('#ageSelect').selectOption('adult');
  await page.locator('#weightInput').fill('201');
  await expect(page.locator('#ageSelect')).toHaveValue('');
});
test('Adult-only product works at 18+ and is blocked at 17',async({page})=>{
  await open(page,'gas','adult','70');await (await gasControl(page,'gasConfirmedInput')).check();
  let c=card(page,'amoxicillin-gas');
  await choose(c,'tablet','1000 mg');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await expect(c.locator('.abx-rx-line')).toContainText('1 tabletë PO 1 herë/ditë × 10 ditë');
  await page.locator('#ageSelect').selectOption('17y');await (await gasControl(page,'gasConfirmedInput')).check();c=card(page,'amoxicillin-gas');
  await expect(c.locator('.abx-market-info')).toContainText('≥18 vjeç');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
});
test('A fixed adult schedule can be prescribed without inventing a reference weight',async({page})=>{
  await open(page,'aom','adult','');const c=card(page,'amox-aom');
  await choose(c,'capsule','500 mg');
  await expect(c.locator('.abx-rx-line')).toContainText('1 kapsulë PO 3 herë/ditë × 5 ditë');
  await expect(c.locator('.abx-rx-quantity')).toContainText('15 kapsula');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
});
test('600 mg cannot turn into a fractional 500mg capsule or rounded 500mg prescription',async({page})=>{
  await open(page,'gas','3y','12');await (await gasControl(page,'gasConfirmedInput')).check();const c=card(page,'amoxicillin-gas');
  await choose(c,'capsule','500 mg');
  await expect(c.locator('.abx-market-single')).toContainText('nuk përputhet');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  await choose(c,'oral-liquid','250 mg/5 ml');
  await expect(c.locator('.abx-rx-line')).toContainText('12 mL PO 1 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
});
test('Co-amoxiclav binds the source ratio and prints both components',async({page})=>{
  await open(page,'aom','adult','70');await page.locator('#aomFailureInput').check();const c=card(page,'amoxclav-aom');
  await choose(c,'oral-liquid','(400 mg+57 mg)/5 ml');
  await expect(c.locator('.abx-market-info')).toContainText('raport 4:1');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  await choose(c,'tablet','875 mg+125 mg');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  await choose(c,'tablet','500 mg+125 mg');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await expect(c.locator('.abx-rx-dose')).toContainText('500/125 mg');
  await expect(c.locator('.abx-rx-dose')).toContainText('1500/375 mg');
  await expect(c.locator('.abx-rx-quantity')).toContainText('15 tableta');
});
test('Infant co-amoxiclav uses actual kg and exact 4:1 concentration',async({page})=>{
  await open(page,'aom','6m','8');await page.locator('#aomFailureInput').check();const c=card(page,'amoxclav-aom');
  await choose(c,'oral-liquid','(125 mg+31.25 mg)/5 ml');
  await expect(c.locator('.abx-rx-line')).toContainText('2 mL PO 3 herë/ditë × 5 ditë');
  await expect(c.locator('.abx-rx-dose')).toContainText('50/12,5 mg');
  await page.locator('#weightInput').fill('');
  await page.locator('#ageSelect').selectOption('6m');
  await page.locator('#aomFailureInput').check();
  await expect(card(page,'amoxclav-aom')).toContainText('peshën reale');
  await expect(card(page,'amoxclav-aom').locator('.abx-rx-copy')).toHaveCount(0);
});
test('Product route and small body weight are enforced',async({page})=>{
  await open(page,'aom','adult','24.9');await page.locator('#aomFailureInput').check();
  await expect(card(page,'amoxclav-aom')).toContainText('25 kg');
  await page.locator('#weightInput').fill('25');await page.locator('#ageSelect').selectOption('adult');await page.locator('#aomFailureInput').check();
  await expect(card(page,'amoxclav-aom').locator('.abx-option-head')).toBeVisible();
  await page.locator('#aomFailureInput').uncheck();
  const c=card(page,'amox-aom');await choose(c,'vial-powder','1 g');
  await expect(c.locator('.abx-market-info')).toContainText('Formë jo orale');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
});
test('Source duration switches at the twelfth birthday for nonsevere CAP',async({page})=>{
  await open(page,'pneumonia','11y','35');
  await expect(card(page,'amox-pna').locator('.abx-duration')).toHaveText('3 ditë');
  await page.locator('#ageSelect').selectOption('12y');
  await expect(card(page,'amox-pna').locator('.abx-duration')).toHaveText('5 ditë');
  await page.locator('#atypicalInput').check();
  await expect(card(page,'amox-pna')).toBeVisible();
  await expect(card(page,'clarithro-pna-atypical')).toContainText('bashkë me trajtimin bazë');
});
test('Penicillin V is restored for adolescents and adults with its own schedule',async({page})=>{
  await open(page,'gas','adult','70');const c=card(page,'penicillin-gas');
  await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-rx-line')).toContainText('1 tabletë PO 4 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-rx-quantity')).toContainText('40 tableta');
});
test('NICE sinusitis uses Penicillin V and removes old 45mg/kg amoxicillin',async({page})=>{
  await open(page,'sinusitis','adult','70');
  await expect(card(page,'penicillin-sinusitis')).toContainText('500 mg/dozë');
  await expect(card(page,'amox-sinusitis')).toHaveCount(0);
  await expect(card(page,'amoxclav-sinusitis').locator('.abx-duration')).toHaveText('5 ditë');
});
test('Urinoculture confirmation belongs to the current context and cannot carry over',async({page})=>{
  await open(page,'uti-pyelo','adult','70');
  await expect(card(page,'amoxclav-pyelo')).toContainText('urinokulturën');
  await page.locator('#cultureSusceptibleInput').check();
  const c=card(page,'amoxclav-pyelo');await choose(c,'tablet','500 mg+125 mg');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await page.locator('#weightInput').fill('71');
  await expect(page.locator('#cultureSusceptibleInput')).not.toBeChecked();
  await expect(card(page,'amoxclav-pyelo').locator('.abx-rx-copy')).toHaveCount(0);
});
test('Pregnancy does not retain a nonpregnant allergy alternative',async({page})=>{
  await open(page,'aom','adult','70');
  await page.locator('input[name="abx-allergy"][value="a2"]').check();
  await expect(card(page,'doxy-aom-adult')).toBeVisible();
  await page.locator('#pregnancyInput').check();
  await expect(card(page,'doxy-aom-adult')).toHaveCount(0);
  await expect(card(page,'erythro-aom-pregnancy')).toBeVisible();
});
test('Flucloxacillin is its own product; cephalosporin allergy requires qualified history',async({page})=>{
  await open(page,'cellulitis','adult','70');
  await page.locator('input[name="abx-allergy"][value="a4"]').check();
  await expect(card(page,'fluclox-cellulitis')).toHaveCount(0);
  await page.locator('#cephAllergyConfirmation input').check();
  const c=card(page,'fluclox-cellulitis');await choose(c,'capsule','500 mg');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await page.locator('#cephAllergyConfirmation input').uncheck();
  await expect(card(page,'fluclox-cellulitis')).toHaveCount(0);
});
test('Newborn and orbital red flags suppress outpatient regimens',async({page})=>{
  await open(page,'aom','newborn','3.3');
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await expect(page.locator('.abx-hosp-card')).toHaveCount(0);
  await page.goto(baseURL+'/antibiotiket.html?indication=preseptal');
  await page.locator('#weightInput').fill('70');await page.locator('#ageSelect').selectOption('adult');
  await page.locator('#orbitalRedFlagsInput').check();
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await expect(page.locator('#recommendationList')).toContainText('STOP');
});
test('Benzathine penicillin retains the 27kg boundary and whole matched syringe',async({page})=>{
  await open(page,'gas','6y','20');await (await gasControl(page,'gasConfirmedInput')).check();await page.locator('#hospitalModule>summary').click();
  let c=card(page,'H002');await c.locator('.abx-prep summary').click();await c.locator('.abx-prep-confirm input').check();
  await expect(c.locator('.abx-prep-output')).toContainText('600000 IU · 1 shiringë e plotë');
  await page.locator('#weightInput').fill('27');await page.locator('#ageSelect').selectOption('6y');await (await gasControl(page,'gasConfirmedInput')).check();await expect(card(page,'H002')).toHaveCount(0);
  c=card(page,'H003');await c.locator('.abx-prep summary').click();await c.locator('.abx-prep-confirm input').check();
  await expect(c.locator('.abx-prep-output')).toContainText('1200000 IU · 1 shiringë e plotë');
});
test('Adult IV penicillins render fixed component doses and adult sources',async({page})=>{
  await open(page,'pneumonia','adult','60');await page.locator('#hospitalModule>summary').click();
  await expect(card(page,'H004')).toContainText('2000 mg ampicillin/dozë');
  await expect(card(page,'H004')).toContainText('q4h');
  await expect(card(page,'H006')).toContainText('2000/1000 mg ampicillin/sulbactam/dozë');
  await expect(card(page,'H006')).toContainText('UCSF');
  await expect(card(page,'H005')).toHaveCount(0);
});
test('Unavailable catalog remains retryable and cannot create a template prescription',async({page})=>{
  let fail=true;
  await page.route('**/api/dosage?view=antibiotic-market',route=>route.fulfill(fail?{status:503,json:{error:'Unavailable'}}:{json:catalog}));
  await open(page,'aom');const c=card(page,'amox-aom');
  await expect(c.locator('.abx-market')).toContainText('nuk u ngarkuan');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  fail=false;await c.getByRole('button',{name:'Provo përsëri'}).click();
  await expect(c.locator('.abx-market select').first()).toBeEnabled();
});
test('Missing new protocol script fails closed instead of running old high-dose defaults',async({page})=>{
  await page.route('**/antibiotiket-penicillin-protocols.js*',route=>route.abort());
  await page.goto(baseURL+'/antibiotiket.html?indication=aom');
  await expect(page.locator('#recommendationList')).toContainText('Protokollet nuk u ngarkuan');
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
});

test('Equal-half confirmation enables 1½ tablets and resets for another product',async({page})=>{
  await open(page,'gas','3y','15');await (await gasControl(page,'gasConfirmedInput')).check();const c=card(page,'amoxicillin-gas');
  await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  await expect(c.locator('.abx-dose-selected')).toHaveText('750 mg');
  await c.locator('.abx-split-confirm input').check();
  await expect(c.locator('.abx-market-single')).toContainText('1½ tabletë');
  await expect(c.locator('.abx-rx-line')).toContainText('1½ tableta PO');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await choose(c,'capsule','500 mg');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-split-confirm input')).not.toBeChecked();
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
});

test('A ranged dose adapts to a whole capsule immediately on product selection',async({page})=>{
  await open(page,'lymphadenitis','8y','25');const c=card(page,'cephalexin-lymph');
  await c.locator('.abx-rx summary').click();
  await choose(c,'capsule','500 mg');
  await expect(c.locator('.abx-dose-selected')).toHaveText('500 mg');
  await expect(c.locator('.abx-practical-panel')).toContainText('Përshtatur automatikisht');
  await c.locator('.abx-rx-shared select').selectOption('7');
  await expect(c.locator('.abx-rx-line')).toContainText('1 kapsulë PO');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
});
test('AOM antibiotic-only workspace opens directly after real age selection',async({page})=>{
  await open(page,'aom');
  await expect(page.locator('#aomPlanChoice')).toHaveCount(0);
  await expect(page.locator('input[name="abx-aom-plan"]')).toHaveCount(0);
  await expect(card(page,'amox-aom')).toBeVisible();
  await expect(page.locator('#aomAdvice')).toContainText('Kur antibiotiku indikohet');
});
test('AOM second-line treatment requires reassessment and does not reuse an allergy first choice',async({page})=>{
  await open(page,'aom','5y','20');
  await expect(card(page,'amoxclav-aom')).toContainText('2–3 ditësh');
  await expect(card(page,'amoxclav-aom').locator('.abx-market')).toHaveCount(0);
  await page.locator('#aomFailureInput').check();
  await expect(card(page,'amox-aom')).toHaveCount(0);
  await expect(card(page,'amoxclav-aom').locator('.abx-market')).toHaveCount(1);
  await page.locator('input[name="abx-allergy"][value="a2"]').check();
  await expect(page.locator('#recommendationList')).toContainText('konsulto mikrobiologun');
  await expect(page.locator('#recommendationList .abx-rx-copy')).toHaveCount(0);
  await expect(page.locator('#hospitalModule')).toBeHidden();
});
test('AOM urgent complications remove an existing prescription and hospital dosing',async({page})=>{
  await open(page,'aom','6y','20');
  await choose(card(page,'amox-aom'),'oral-liquid','250 mg/5 ml');
  await expect(card(page,'amox-aom').locator('.abx-rx-copy')).toBeEnabled();
  await page.locator('#aomRiskSelect').selectOption('urgent');
  await expect(page.locator('#eligibilityMessage')).toContainText('STOP');
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await expect(page.locator('#hospitalModule')).toBeHidden();
});
test('High risk selects immediate assessment and prevents a delayed prescription',async({page})=>{
  await open(page,'aom','5y','20');
  await page.locator('#aomRiskSelect').selectOption('high');
  await expect(page.locator('#aomAdvice')).toContainText('Rrezik i lartë');
  await expect(card(page,'amox-aom')).toBeVisible();
});
test('AOM secondary details stay folded while the dose and prescription stay visible',async({page})=>{
  await open(page,'aom');const c=card(page,'amox-aom');
  await choose(c,'oral-liquid','250 mg/5 ml');
  await expect(c.locator('.abx-market-limits')).not.toHaveAttribute('open','');
  await expect(c.locator('.abx-rx-more')).not.toHaveAttribute('open','');
  await expect(c.locator('.abx-rx-line')).toBeVisible();
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await c.locator('.abx-market-limits>summary').click();
  await expect(c.locator('.abx-market-maximum')).toBeVisible();
});
test('Adult AOM 500mg with 1g tablet displays half in the dose and final recipe',async({page})=>{
  await open(page,'aom','adult','70');const c=card(page,'amox-aom');
  await choose(c,'tablet','1000 mg');await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  await c.locator('.abx-split-confirm input').check();
  await expect(c.locator('.abx-market-single')).toContainText('½ tabletë');
  await expect(c.locator('.abx-rx-line')).toContainText('½ tablete PO');
  await expect(c.locator('.abx-rx-dose')).toContainText('1500 mg');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
});
test('AOM adolescent allergy uses published fixed-mg range without requiring weight',async({page})=>{
  await open(page,'aom','12y','');
  await page.locator('input[name="abx-allergy"][value="a2"]').check();
  const c=card(page,'clarithro-aom-nice');await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-dose-selected')).toHaveText('500 mg');
  await expect(c.locator('.abx-dose-window')).toContainText('250 mg');
  await expect(c.locator('.abx-rx-line')).toContainText('1 tabletë PO 2 herë/ditë');
  await expect(c.locator('.abx-rx-dose')).toContainText('1000 mg');
});
test('AOM treatment decision and failure confirmation do not carry over on reload',async({page})=>{
  await open(page,'aom','5y','20');await page.locator('#aomFailureInput').check();
  await page.reload();
  await expect(page.locator('#aomFailureInput')).not.toBeChecked();
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
});
test('Central range box rounds only to a representable in-range dose',async({page})=>{
  await open(page,'lymphadenitis','10y','30');const c=card(page,'cephalexin-lymph');
  await c.locator('.abx-rx summary').click();
  await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-dose-window')).toContainText('510 mg');
  await expect(c.locator('.abx-dose-window')).toContainText('750 mg');
  await expect(c.locator('.abx-dose-selected')).toHaveText('Zgjidh dozën');
  await c.locator('.abx-split-confirm input').check();
  await expect(c.locator('.abx-dose-selected')).toHaveText('750 mg');
  await expect(c.locator('.abx-practical-panel')).toContainText('Përshtatur automatikisht');
  await c.getByRole('spinbutton',{name:'Doza e synuar për përshtatje'}).fill('600');
  await c.getByRole('spinbutton',{name:'Doza e synuar për përshtatje'}).press('Tab');
  await expect(c.locator('.abx-dose-selected')).toHaveText('750 mg');
  await c.locator('.abx-rx-shared select').selectOption('7');
  await expect(c.locator('.abx-rx-line')).toContainText('1½ tableta PO');
  await expect(c.locator('.abx-rx-dose')).toContainText('750 mg/dozë');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
});

for(const width of [320,390,1440])test(`NICE pharyngitis: simple workspace and equivalent Penicillin V schedules at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await open(page,'gas','adult','');
  await expect(page.locator('body')).toHaveClass(/abx-simple-gas/);
  await expect(page.locator('#aomClinicalPanel')).toBeHidden();
  await expect(page.locator('#gasClinicalPanel')).toBeVisible();
  await expect(page.locator('#aomPlanChoice')).toHaveCount(0);
  let c=card(page,'penicillin-gas');await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-rx-line')).toContainText('1 tabletë PO 4 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-rx-dose')).toContainText('2000 mg');
  await expect(c.locator('.abx-market-limits')).not.toHaveAttribute('open','');
  await (await gasControl(page,'gasScheduleSelect')).selectOption('bid');
  c=card(page,'penicillin-gas');
  await expect(c.locator('.abx-rx-line')).toContainText('2 tableta PO 2 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-rx-dose')).toContainText('2000 mg');
  await expect(c.locator('.abx-rx-quantity')).toContainText('40 tableta');
  await c.locator('.abx-rx-shared select').selectOption('5');
  await expect(c.locator('.abx-rx-quantity')).toContainText('20 tableta');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`pharyngitis-${width}.png`),fullPage:true});
});
test('Pharyngitis Penicillin V 250mg with 500mg tablet requires verified equal halves',async({page})=>{
  await open(page,'gas','6y','20');const c=card(page,'penicillin-gas');
  await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  await c.locator('.abx-split-confirm input').check();
  await expect(c.locator('.abx-rx-line')).toContainText('½ tablete PO 4 herë/ditë');
  await expect(c.locator('.abx-rx-dose')).toContainText('1000 mg');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
});
test('Pharyngitis CDC alternative requires confirmed GAS and switches exact amoxicillin schedules',async({page})=>{
  await open(page,'gas','3y','12');
  await expect(card(page,'amoxicillin-gas')).toHaveCount(0);
  await expect(card(page,'amoxicillin-gas').locator('.abx-market')).toHaveCount(0);
  await expect(page.locator('#hospitalModule')).toBeHidden();
  await (await gasControl(page,'gasConfirmedInput')).check();
  let c=card(page,'amoxicillin-gas');await choose(c,'oral-liquid','250 mg/5 ml');
  await expect(c.locator('.abx-rx-line')).toContainText('12 mL PO 1 herë/ditë × 10 ditë');
  await (await gasControl(page,'gasAmoxScheduleSelect')).selectOption('bid');c=card(page,'amoxicillin-gas');
  await expect(c.locator('.abx-rx-line')).toContainText('6 mL PO 2 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-rx-dose')).toContainText('600 mg');
  await (await gasControl(page,'gasConfirmedInput')).uncheck();
  await expect(card(page,'amoxicillin-gas').locator('.abx-rx-copy')).toHaveCount(0);
  await expect(page.locator('#hospitalModule')).toBeHidden();
});
test('Pharyngitis macrolide range is source-bound for adolescents, adults and pregnancy',async({page})=>{
  await open(page,'gas','12y','');
  await page.locator('input[name="abx-allergy"][value="a2"]').check();
  let c=card(page,'clarithro-gas-nice');await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-dose-window')).toContainText('250 mg');
  await expect(c.locator('.abx-dose-window')).toContainText('500 mg');
  await expect(c.locator('.abx-rx-line')).toContainText('× 5 ditë');
  await c.getByRole('spinbutton',{name:'Doza e synuar për përshtatje'}).fill('250');
  await c.getByRole('spinbutton',{name:'Doza e synuar për përshtatje'}).press('Tab');
  await expect(c.locator('.abx-dose-selected')).toHaveText('500 mg');
  await expect(c.locator('.abx-rx-line')).toContainText('1 tabletë PO 2 herë/ditë');
  await c.locator('.abx-split-confirm input').check();
  await c.getByRole('button',{name:'½ tabletë · 250 mg',exact:true}).click();
  await expect(c.locator('.abx-rx-line')).toContainText('½ tablete PO 2 herë/ditë');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await page.locator('#ageSelect').selectOption('adult');
  await page.locator('#pregnancyInput').check();
  await expect(card(page,'clarithro-gas-nice')).toHaveCount(0);
  await (await gasControl(page,'gasScheduleSelect')).selectOption('bid');
  c=card(page,'erythro-gas-pregnancy');await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-dose-window')).toContainText('500 mg');
  await expect(c.locator('.abx-dose-window')).toContainText('1000 mg');
  await expect(c.locator('.abx-rx-line')).toContainText('2 herë/ditë × 5 ditë');
});
test('Penicillin V in IU is never treated as milligrams outside the verified Ospen pharyngitis scheme',async({page})=>{
  await open(page,'sinusitis','adult','');const c=card(page,'penicillin-sinusitis');
  await choose(c,'tablet','1000000 IU');
  await c.locator('.abx-market-product summary').click();
  await c.locator('.abx-market select').nth(2).selectOption('penv-iu');
  await expect(c.locator('.abx-market-info')).toContainText('IU');
  await expect(c.locator('.abx-market-info')).toContainText('ekuivalenca e verifikuar');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  await expect(c.locator('.abx-market-single')).toHaveCount(0);
});
test('Pharyngitis complications suppress existing outpatient and parenteral prescriptions',async({page})=>{
  await open(page,'gas','adult','70');await (await gasControl(page,'gasConfirmedInput')).check();
  await choose(card(page,'penicillin-gas'),'tablet','500 mg');
  await expect(card(page,'penicillin-gas').locator('.abx-rx-copy')).toBeEnabled();
  await page.locator('#gasUrgentInput').check();
  await expect(page.locator('#eligibilityMessage')).toContainText('STOP');
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await expect(page.locator('#hospitalModule')).toBeHidden();
  await page.reload();
  await expect((await gasControl(page,'gasConfirmedInput'))).not.toBeChecked();
  await expect(page.locator('#gasUrgentInput')).not.toBeChecked();
  await expect(page.locator('#recommendationList .abx-rx-copy')).toHaveCount(0);
});

test('CDC amoxicillin requires actual adult weight and never assumes a maximal dose at low weight',async({page})=>{
  await open(page,'gas','adult','');await (await gasControl(page,'gasConfirmedInput')).check();
  await expect(card(page,'amoxicillin-gas')).toContainText('peshën reale');
  await expect(card(page,'amoxicillin-gas').locator('.abx-market')).toHaveCount(0);
  await page.locator('#weightInput').fill('18');await page.locator('#ageSelect').selectOption('adult');
  await expect((await gasControl(page,'gasConfirmedInput'))).not.toBeChecked();
  await (await gasControl(page,'gasConfirmedInput')).check();
  let c=card(page,'amoxicillin-gas');await choose(c,'oral-liquid','250 mg/5 ml');
  await expect(c.locator('.abx-rx-line')).toContainText('18 mL PO 1 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-rx-dose')).toContainText('900 mg');
  await (await gasControl(page,'gasAmoxScheduleSelect')).selectOption('bid');c=card(page,'amoxicillin-gas');
  await expect(c.locator('.abx-rx-line')).toContainText('9 mL PO 2 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-rx-dose')).toContainText('450 mg/dozë');
});

async function openOspen(page,age='4y',weight='16'){
  await open(page,'gas',age,weight);await (await gasControl(page,'gasConfirmedInput')).check();
  let c=card(page,'penicillin-gas');await choose(c,'tablet','1000000 IU');
  c=card(page,'penicillin-gas');await expect(c).toHaveAttribute('data-native-ospen','true');return c;
}
for(const width of [320,390,1440])test(`Verified Ospen uses its native IU scheme and equal halves for the reported 16kg case at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const c=await openOspen(page);
  await expect(c.locator('.abx-option-source')).toHaveText('SmPC · Ospen');
  await expect(page.locator('#gasScheduleWrap')).toBeHidden();
  await expect(c.locator('.abx-dose-window')).toContainText('400 000 IU');
  await expect(c.locator('.abx-dose-window')).toContainText('800 000 IU');
  await expect(c.locator('.abx-dose-selected')).toHaveText('500 000 IU');
  await expect(c.locator('.abx-rx-line')).toContainText('½ tablete PO 2 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-ospen-daily')).toContainText('1 000 000 IU/ditë');
  await expect(c.locator('.abx-rx-quantity')).toContainText('10 tableta');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await expect(c.locator('.abx-rx')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`ospen-${width}.png`),fullPage:true});
});
test('Ospen never rounds an unavailable four-times-daily tablet dose outside the source range',async({page})=>{
  const c=await openOspen(page);const frequency=c.getByRole('combobox',{name:'Marrjet në ditë · Ospen'});await frequency.focus();await frequency.selectOption('4');
  await expect(frequency).toBeFocused();
  await expect(c.locator('.abx-dose-selected')).toContainText('Pa dozë');
  await expect(c.locator('.abx-rx-copy')).toHaveCount(0);
  await c.getByRole('combobox',{name:'Marrjet në ditë · Ospen'}).selectOption('3');
  await expect(c.locator('.abx-rx-line')).toContainText('½ tablete PO 3 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-ospen-daily')).toContainText('1 500 000 IU/ditë');
});
test('Ospen 1.5 recalculates product halves, while an unrelated IU product stays blocked',async({page})=>{
  const c=await openOspen(page);await choose(c,'tablet','1500000 IU');
  await expect(c.locator('.abx-dose-selected')).toHaveText('750 000 IU');
  await expect(c.locator('.abx-rx-line')).toContainText('OSPEN 1.5');
  await expect(c.locator('.abx-rx-line')).toContainText('½ tablete PO 2 herë/ditë');
  await choose(c,'tablet','1000000 IU');
  await c.locator('.abx-market-product summary').click();
  await c.locator('.abx-market select').nth(2).selectOption('penv-iu');
  await expect(c.locator('.abx-market-info')).toContainText('nuk ka skemë Ospen');
  await expect(c.locator('.abx-rx-copy')).toHaveCount(0);
});
test('Ospen automatically chooses its verified source, requires documented GAS, resets on reload, and preserves NICE',async({page})=>{
  await open(page,'gas','4y','16');let c=card(page,'penicillin-gas');await choose(c,'tablet','1000000 IU');
  await expect(card(page,'penicillin-gas')).toContainText('Konfirmo GAS');
  await expect(page.locator('#gasConfirmedInput')).toBeVisible();
  await expect(page.locator('#gasConfirmedInput')).not.toBeChecked();
  await (await gasControl(page,'gasConfirmedInput')).check();c=card(page,'penicillin-gas');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await page.locator('#gasSourceBack').click();c=card(page,'penicillin-gas');
  await expect(c.locator('.abx-option-source')).toHaveText('NICE NG84');
  await expect(c.locator('.abx-rx')).toBeHidden();
  await expect(c.locator('.abx-market-info')).toContainText('Për skemën NICE zgjidh produkt në mg');
  await choose(c,'tablet','1000000 IU');
  await expect(card(page,'penicillin-gas')).toHaveAttribute('data-native-ospen','true');
  await page.reload();await page.locator('#ageSelect').selectOption('4y');
  await expect(card(page,'penicillin-gas')).not.toHaveAttribute('data-native-ospen','true');
  await expect((await gasControl(page,'gasConfirmedInput'))).not.toBeChecked();
});
test('Ospen copy revalidates the current product and patient, and allergy or urgent status clears the recipe',async({page})=>{
  await page.addInitScript(()=>{window.ospenCopies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.ospenCopies.push(text)}});});
  let c=await openOspen(page);await c.locator('.abx-rx-copy').click();
  expect(await page.evaluate(()=>window.ospenCopies[0])).toContain('500 000 IU/dozë');
  await page.evaluate(()=>{window.oldOspenCopy=document.querySelector('[data-native-ospen=true] .abx-rx-copy');});
  await page.locator('#gasUrgentInput').check();await page.evaluate(()=>window.oldOspenCopy.click());
  expect(await page.evaluate(()=>window.ospenCopies.length)).toBe(1);
  await expect(page.locator('#recommendationList .abx-rx-copy')).toHaveCount(0);
  await page.locator('#gasUrgentInput').uncheck();
  await page.locator('input[name="abx-allergy"][value="a2"]').check();
  await expect(card(page,'penicillin-gas')).toHaveCount(0);
  await expect(page.locator('[data-native-ospen=true]')).toHaveCount(0);
});

test('Adult Ospen supports one and a half tablets within its own routine maximum and clears on new weight',async({page})=>{
  const c=await openOspen(page,'adult','70');
  await c.getByRole('combobox',{name:'Marrjet në ditë · Ospen'}).selectOption('3');
  await c.getByRole('button',{name:'1½ tableta · 1 500 000 IU',exact:true}).click();
  await expect(c.locator('.abx-rx-line')).toContainText('1½ tableta PO 3 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-ospen-daily')).toContainText('4 500 000 IU/ditë');
  await expect(c.locator('.abx-rx-quantity')).toContainText('45 tableta');
  await page.locator('#weightInput').fill('16');
  await expect((await gasControl(page,'gasConfirmedInput'))).not.toBeChecked();
  await expect(page.locator('[data-native-ospen=true] .abx-rx-copy')).toHaveCount(0);
});

for(const width of [320,390,1440])test(`UTI female standard IR nitrofurantoin prescription at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await open(page,'uti-cystitis','adult','70');
 await expect(page.locator('#eligibilityMessage')).toContainText('profilin');
 await page.locator('#utiSexSelect').selectOption('female');
 await expect(card(page,'nitro-cystitis-nice')).toContainText('eGFR');
 await page.locator('#utiEgfrInput').fill('80');const c=card(page,'nitro-cystitis-nice');await choose(c,'capsule','50 mg');
 await expect(c.locator('.abx-rx-line')).toContainText('1 kapsulë PO 4 herë/ditë × 3 ditë');
 await expect(c.locator('.abx-rx-quantity')).toContainText('12 kapsula');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath(`uti-${width}.png`),fullPage:true});
});
test('UTI male duration, renal/upper infection gates and pregnancy at term',async({page})=>{
 await open(page,'uti-cystitis','adult','70');await page.locator('#utiSexSelect').selectOption('male');await page.locator('#utiEgfrInput').fill('45');
 await choose(card(page,'nitro-cystitis-nice'),'capsule','50 mg');await expect(card(page,'nitro-cystitis-nice').locator('.abx-rx-line')).toContainText('× 7 ditë');
 await page.locator('#utiEgfrInput').fill('44');await expect(card(page,'nitro-cystitis-nice').locator('.abx-rx-copy')).toHaveCount(0);
 await page.locator('#utiUpperInput').check();await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
 await page.locator('#utiUpperInput').uncheck();await page.locator('#pregnancyInput').check();await page.locator('#utiEgfrInput').fill('80');await page.locator('#utiAtTermInput').check();
 await expect(card(page,'nitro-cystitis-nice')).toContainText('Shmang');await page.locator('#utiAlternativeInput').check();await expect(card(page,'cephalexin-cystitis-nice')).toContainText('7 ditë');
});
test('UTI pediatric cefalexin age-band liquid and adult pyelo verified halves',async({page})=>{
 await open(page,'uti-cystitis','4y','16');await page.locator('#utiAlternativeInput').check();let c=card(page,'cephalexin-cystitis-nice');await choose(c,'oral-liquid','250 mg/5 ml');
 await expect(c.locator('.abx-rx-line')).toContainText('2,5 mL PO 3 herë/ditë × 3 ditë');
 await page.goto(baseURL+'/antibiotiket.html?indication=uti-pyelo');await page.locator('#ageSelect').selectOption('adult');
 c=card(page,'cephalexin-pyelo-nice');await choose(c,'tablet','1 g');await c.locator('.abx-split-confirm input').check();
 await expect(c.locator('.abx-rx-line')).toContainText('½ tablete PO 2 herë/ditë × 7 ditë');
 await page.locator('#utiCephSelect').selectOption('3');await card(page,'cephalexin-pyelo-nice').locator('.abx-split-confirm input').check();await expect(card(page,'cephalexin-pyelo-nice').locator('.abx-rx-line')).toContainText('3 herë/ditë');
 await page.locator('#utiUrgentInput').check();await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);await expect(page.locator('#hospitalModule')).toBeHidden();
});
test('Fosfomycin single sachet requires second-choice confirmation and is not a male/pregnancy regimen',async({page})=>{
 await open(page,'uti-cystitis','adult','70');await page.locator('#utiSexSelect').selectOption('female');
 await expect(card(page,'fosfo-cystitis-nice')).toContainText('Konfirmo');await page.locator('#utiAlternativeInput').check();
 const c=card(page,'fosfo-cystitis-nice');await choose(c,'oral-granules','3 g');await expect(c.locator('.abx-rx-line')).toContainText('1 qese PO 1 herë/ditë × 1 ditë');
 await page.locator('#utiSexSelect').selectOption('male');await expect(card(page,'fosfo-cystitis-nice')).toHaveCount(0);
});

test('Pyelo ciprofloxacin requires its own suitability decision and is excluded in pregnancy',async({page})=>{
 await open(page,'uti-pyelo','adult','70');await page.locator('#utiAlternativeInput').check();
 await expect(card(page,'cipro-pyelo-nice')).toContainText('Ciprofloxacin: konfirmo');
 await page.locator('#utiFluoroInput').check();await expect(card(page,'cipro-pyelo-nice').locator('.abx-market')).toHaveCount(1);
 await page.locator('#pregnancyInput').check();await expect(card(page,'cipro-pyelo-nice')).toHaveCount(0);
});

for(const width of [320,390,1440])test(`Faringiti i thjeshtë: settings closed, prescription ready, alarm still blocks at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  await open(page,'gas','adult','70');
  await expect(page.locator('#gasOptions')).not.toHaveAttribute('open','');
  await expect(page.locator('#gasScheduleSelect')).toBeHidden();
  await expect(page.locator('#gasConfirmedInput')).toBeHidden();
  await expect(page.locator('#gasUrgentInput')).toBeVisible();
  await expect(page.locator('#gasUrgentInput')).not.toBeChecked();
  await expect(card(page,'penicillin-gas')).toBeVisible();
  await expect(card(page,'amoxicillin-gas')).toHaveCount(0);
  await page.locator('#gasOptions > summary').click();
  await page.locator('#gasConfirmedInput').check();
  await expect(card(page,'amoxicillin-gas')).toBeVisible();
  await page.locator('#gasOptions > summary').click();
  await page.locator('#gasUrgentInput').check();
  await expect(card(page,'penicillin-gas')).toHaveCount(0);
  await expect(page.locator('#eligibilityMessage')).toContainText('referim urgjent');
  await page.locator('#gasUrgentInput').uncheck();
  await expect(card(page,'penicillin-gas')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath(`gas-simple-${width}.png`),fullPage:true});
});


for(const width of [320,390,1440])test('Infection browser: grouped search and explicit selection at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:900});
 await open(page,'aom');
 const picker=page.locator('#indicationPicker');
 if(!await page.locator('#infectionSearch').isVisible())await picker.locator('summary').click();
 await expect(page.locator('#indicationChoice input')).toHaveCount(13);
 await expect(page.locator('#indicationChoice .abx-chip:visible')).toHaveCount(4);
 await expect(page.locator('[data-infection-group="respiratory"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#infectionSearch').fill('urinar');
 await expect(page.locator('#indicationChoice .abx-chip:visible')).toHaveCount(2);
 // Browsing another category never silently changes the actual diagnosis.
 await expect(page.locator('#indicationCurrent')).toHaveText('Otitis media');
 await expect(page.locator('#indicationChoice input:checked')).toHaveValue('aom');
 await page.locator('#indicationChoice input[value="uti-pyelo"]').check();
 await expect(page).toHaveURL(/indication=uti-pyelo/);
 await expect(page.locator('#indicationCurrent')).toHaveText('UTI febrile / Pielonefrit');
 await expect(page.locator('#ageSelect')).toHaveValue('5y');
 await expect(page.locator('#weightInput')).toHaveValue('18');
 if(width<=760){await expect(picker).not.toHaveAttribute('open','');await expect(picker.locator('summary')).toBeFocused();await picker.locator('summary').click();}
 await page.locator('[data-infection-group="all"]').click();
 await expect(page.locator('#indicationChoice .abx-chip:visible')).toHaveCount(13);
 await page.locator('#infectionSearch').fill('no-such-infection');
 await expect(page.locator('.abx-infection-empty')).toBeVisible();
 await expect(page.locator('#indicationChoice input:checked')).toHaveValue('uti-pyelo');
 await page.getByRole('button',{name:'Shfaq të gjitha infeksionet'}).click();
 await expect(page.locator('#infectionSearch')).toBeFocused();
 await expect(page.locator('#indicationChoice .abx-chip:visible')).toHaveCount(13);
 await page.locator('#infectionSearch').fill('lekura');
 await expect(page.locator('#indicationChoice .abx-chip:visible')).toHaveCount(7);
 await page.locator('#infectionSearch').press('Escape');
 await expect(page.locator('#infectionSearch')).toHaveValue('');
 await expect(page.locator('#indicationChoice .abx-chip:visible')).toHaveCount(13);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('infections-'+width+'.png'),fullPage:false});
});

test('Every infection remains reachable with unchanged outpatient safety gates',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await open(page,'preseptal');
 await expect(page.locator('[data-infection-group="skin"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-infection-group="all"]').click();
 const values=await page.locator('#indicationChoice input').evaluateAll(nodes=>nodes.map(node=>node.value));
 expect(new Set(values).size).toBe(13);
 for(const value of values){
  await page.locator('[data-infection-group="all"]').click();
  await page.locator('#indicationChoice input[value="'+value+'"]').check();
  await expect(page).toHaveURL(new RegExp('indication='+value));
  await expect(page.locator('#indicationChoice input:checked')).toHaveValue(value);
 }
 await page.locator('[data-infection-group="all"]').click();
 await page.locator('#indicationChoice input[value="preseptal"]').check();
 await page.locator('#orbitalRedFlagsInput').check();
 await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
 await expect(page.locator('#recommendationList')).toContainText('STOP');
});
