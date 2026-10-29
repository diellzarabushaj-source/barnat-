const {test,expect}=require('@playwright/test');
const {rows,row}=require('./antibiotic-market-fixture');
const {buildCatalog}=require('../lib/antibiotic-market-catalog');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {phase5AuthenticatedSession}=require('./phase5-browser-fixture');
const ROOT=path.resolve(__dirname,'..');let server,baseURL;
const catalog=buildCatalog([...rows,
  row('cephalexin-tablet500','Cephalexin','J01DB01','500 mg','Tablet'),
  row('amox-tablet500','Amoxicillin','J01CA04','500 mg','Tablet'),
  row('clav4-liquid','Amoxicillin; Clavulanic acid','J01CR02','(125 mg+31.25 mg)/5 ml','Powder for oral suspension'),
  row('clav4-tab','Amoxicillin; Clavulanic acid','J01CR02','500 mg+125 mg','Tablet'),
  row('clav7-tab','Amoxicillin; Clavulanic acid','J01CR02','875 mg+125 mg','Tablet'),
  row('fluclox-cap','Flucloxacillin','J01CF05','500 mg','Capsule'),
  row('penv-liquid','Phenoxymethylpenicillin','J01CE02','125 mg/5 ml','Oral suspension'),
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
  await expect(page.locator('#ageSelect')).toHaveValue('5y');
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
test('Confirmed suggestion resets on new weight; manual real age takes priority',async({page})=>{
  await open(page,'aom','','7.25');
  await expect(page.locator('#ageSelect')).toHaveValue('6m');
  await page.locator('#ageConfirmation input').check();
  await expect(card(page,'amox-aom')).toContainText('125 mg/dozë');
  await page.locator('#weightInput').fill('9.75');
  await expect(page.locator('#ageSelect')).toHaveValue('1y');
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await page.locator('#ageSelect').selectOption('5y');
  await page.locator('#weightInput').fill('60');
  await expect(page.locator('#ageSelect')).toHaveValue('5y');
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
test('Adult-only product works at 18+ and is blocked at 17',async({page})=>{
  await open(page,'gas','adult','70');
  let c=card(page,'amoxicillin-gas');
  await choose(c,'tablet','1000 mg');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
  await expect(c.locator('.abx-rx-line')).toContainText('1 tabletë PO 1 herë/ditë × 10 ditë');
  await page.locator('#ageSelect').selectOption('17y');c=card(page,'amoxicillin-gas');
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
  await open(page,'gas','3y','12');const c=card(page,'amoxicillin-gas');
  await choose(c,'capsule','500 mg');
  await expect(c.locator('.abx-market-single')).toContainText('nuk përputhet');
  await expect(c.locator('.abx-rx-copy')).toBeDisabled();
  await choose(c,'oral-liquid','250 mg/5 ml');
  await expect(c.locator('.abx-rx-line')).toContainText('12 mL PO 1 herë/ditë × 10 ditë');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
});
test('Co-amoxiclav binds the source ratio and prints both components',async({page})=>{
  await open(page,'aom','adult','70');const c=card(page,'amoxclav-aom');
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
  await open(page,'aom','6m','8');const c=card(page,'amoxclav-aom');
  await choose(c,'oral-liquid','(125 mg+31.25 mg)/5 ml');
  await expect(c.locator('.abx-rx-line')).toContainText('2 mL PO 3 herë/ditë × 5 ditë');
  await expect(c.locator('.abx-rx-dose')).toContainText('50/12,5 mg');
  await page.locator('#weightInput').fill('');
  await expect(card(page,'amoxclav-aom')).toContainText('peshën reale');
  await expect(card(page,'amoxclav-aom').locator('.abx-rx-copy')).toHaveCount(0);
});
test('Product route and small body weight are enforced',async({page})=>{
  await open(page,'aom','adult','24.9');
  await expect(card(page,'amoxclav-aom')).toContainText('25 kg');
  await page.locator('#weightInput').fill('25');
  await expect(card(page,'amoxclav-aom').locator('.abx-option-head')).toBeVisible();
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
  await page.locator('#ageSelect').selectOption('adult');await page.locator('#weightInput').fill('70');
  await page.locator('#orbitalRedFlagsInput').check();
  await expect(page.locator('#recommendationList .abx-option')).toHaveCount(0);
  await expect(page.locator('#recommendationList')).toContainText('STOP');
});
test('Benzathine penicillin retains the 27kg boundary and whole matched syringe',async({page})=>{
  await open(page,'gas','6y','20');await page.locator('#hospitalModule>summary').click();
  let c=card(page,'H002');await c.locator('.abx-prep summary').click();await c.locator('.abx-prep-confirm input').check();
  await expect(c.locator('.abx-prep-output')).toContainText('600000 IU · 1 shiringë e plotë');
  await page.locator('#weightInput').fill('27');await expect(card(page,'H002')).toHaveCount(0);
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
  await open(page,'gas','3y','15');const c=card(page,'amoxicillin-gas');
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

test('Central range box rounds only to a representable in-range dose',async({page})=>{
  await open(page,'lymphadenitis','10y','30');const c=card(page,'cephalexin-lymph');
  await c.locator('.abx-rx summary').click();
  await choose(c,'tablet','500 mg');
  await expect(c.locator('.abx-dose-window')).toContainText('510 mg');
  await expect(c.locator('.abx-dose-window')).toContainText('750 mg');
  await c.locator('.abx-split-confirm input').check();
  await c.getByRole('spinbutton',{name:'Doza e synuar për përshtatje'}).fill('600');
  await c.getByRole('button',{name:'Përshtat me produktin'}).click();
  await expect(c.locator('.abx-dose-selected')).toHaveText('750 mg');
  await c.locator('.abx-rx-shared select').selectOption('7');
  await expect(c.locator('.abx-rx-line')).toContainText('1½ tableta PO');
  await expect(c.locator('.abx-rx-dose')).toContainText('750 mg/dozë');
  await expect(c.locator('.abx-rx-copy')).toBeEnabled();
});
