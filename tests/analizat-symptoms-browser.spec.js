const {test,expect}=require('@playwright/test');
const {data}=require('./lab-symptom-fixture');
const {VERSION}=require('../lib/lab-symptom-guide');
const {phase5AuthenticatedSession}=require('./phase5-browser-fixture');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.resolve(__dirname,'..');let server,baseURL;
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
  await page.route('**/api/icd?dataset=labs**',route=>{
    const revision=new URL(route.request().url()).searchParams.get('revision');
    return route.fulfill({json:{data:revision===VERSION?data:{...data,indications:[],tests:[]}}});
  });
});

for(const width of [320,390,1440])test(`Symptom search, grouped picker and deliberate orders at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  await page.goto(baseURL+'/analizat.html');
  await expect(page.locator('#labIndicationTotal')).toHaveText(String(data.indications.length));
  await page.locator('#labDiseaseTrigger').click();
  await page.locator('#labProfileGroup').selectOption('general');
  await expect(page.locator('#labDiseaseList .lab-disease-option')).toHaveCount(5);
  await page.locator('#labDiseaseSearch').fill('lodhje');
  await expect(page.locator('#labDiseaseList .lab-disease-option')).toHaveCount(1);
  await page.locator('#labDiseasePopover').screenshot({path:info.outputPath('picker-'+width+'.png')});
  const bounds=await page.locator('#labDiseasePopover').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width+1);
  await page.locator('[data-disease-id="symptom-lodhja"]').click();await page.locator('#labPickerDone').click();
  await expect(page.locator('#labDiseasePopover')).toBeHidden();
  await expect(page.locator('#labSelectedTestCount')).toHaveText('1');
  await expect(page.locator('[data-test-id="lab-ref-cbc"] input')).toBeChecked();
  await expect(page.locator('[data-test-id="lab-ref-ferritin"] input')).not.toBeChecked();
  await expect(page.locator('[data-test-id="lab-ref-tsh"] input')).not.toBeChecked();
  await page.locator('#labDiseaseTrigger').click();await page.locator('#labProfileGroup').selectOption('diagnoses');
  await page.locator('#labDiseaseSearch').fill('anemia');await page.locator('[data-disease-id="old-anemia"]').click();
  await page.locator('#labPickerDone').click();
  await expect(page.locator('#labSelectedTestCount')).toHaveText('2');
  await expect(page.locator('[data-test-id="hemoglobin"]')).toHaveCount(0);
  await page.locator('[data-test-id="lab-ref-cbc"] input').uncheck();
  await expect(page.locator('[data-test-id="hemoglobin"] input')).toBeChecked();
  await page.locator('[data-test-id="lab-ref-cbc"] input').check();
  await expect(page.locator('[data-test-id="hemoglobin"]')).toHaveCount(0);
  await page.locator('[data-test-id="lab-ref-tsh"] input').check();
  await expect(page.locator('#labSelectedTestCount')).toHaveText('3');
  await expect(page.locator('#labCopyPlan')).toBeEnabled();
  await page.locator('#labPlan').screenshot({path:info.outputPath('plan-'+width+'.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#labClearPlan').click();await expect(page.locator('#labSelectedTestCount')).toHaveText('0');
  await expect(page.locator('#labClinicalGuide')).toBeHidden();await expect(page.locator('#labCopyPlan')).toBeDisabled();
});

test('Keyboard selection keeps focus after rerender and Escape returns to the trigger',async({page})=>{
  await page.goto(baseURL+'/analizat.html');
  await page.locator('#labDiseaseTrigger').focus();await page.keyboard.press('ArrowDown');
  await expect(page.locator('#labDiseaseSearch')).toBeFocused();
  await page.locator('#labDiseaseSearch').fill('lodhje');await page.keyboard.press('ArrowDown');
  const option=page.locator('[data-disease-id="symptom-lodhja"]');await expect(option).toBeFocused();
  await page.keyboard.press('Enter');await expect(option).toHaveAttribute('aria-selected','true');await expect(option).toBeFocused();
  await page.keyboard.press('Enter');await expect(option).toHaveAttribute('aria-selected','false');await expect(option).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#labDiseasePopover')).toBeHidden();await expect(page.locator('#labDiseaseTrigger')).toBeFocused();
});

test('Typical headache does not silently order blood tests',async({page})=>{
  await page.goto(baseURL+'/analizat.html?dx=simptoma-cefaleja');
  await expect(page.locator('#labClinicalGuide')).toContainText('papritur');
  await expect(page.locator('#labSelectedTestCount')).toHaveText('0');
  await expect(page.locator('#labCopyPlan')).toBeDisabled();
  await page.locator('[data-test-id="existing-crp"] input').check();
  await expect(page.locator('#labSelectedTestCount')).toHaveText('1');
  await page.locator('#labClinicalGuide summary').click();
  await expect(page.locator('#labClinicalGuide details')).toContainText('nuk konfirmojnë diagnozën');
  await expect(page.locator('#labClinicalGuide a').first()).toHaveAttribute('href',/nice\.org\.uk/);
});

test('Every profile renders with its exams and no implicit conditional choices',async({page})=>{
  test.setTimeout(150000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const p of data.indications){
    await page.goto(baseURL+'/analizat.html?dx='+p.slug);
    await expect(page.locator('.lab-clinical-profile-head>strong')).toHaveText(p.title);
    await expect(page.locator('.lab-exam-list li')).toHaveCount(p.exams.length);
    for(const link of p.tests)if(link.tier==='conditional')await expect(page.locator(`[data-test-id="${link.testId}"] input`)).not.toBeChecked();
  }
  expect(errors).toEqual([]);
});

test('An unavailable source cannot produce a fabricated order',async({page})=>{
  await page.route('**/api/icd?dataset=labs**',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.goto(baseURL+'/analizat.html');
  await expect(page.getByText('Analizat nuk u ngarkuan.',{exact:true})).toBeVisible();
  await expect(page.locator('#labCopyPlan')).toBeDisabled();
  await expect(page.locator('#labPlanSections [data-test-id]')).toHaveCount(0);
});

test('Contextual results and additional examinations stay distinct from the laboratory order',async({page})=>{
  await page.setViewportSize({width:320,height:900});
  await page.goto(baseURL+'/analizat.html?dx=embolia-pulmonare');
  await expect(page.locator('.lab-profile-urgent')).toContainText('sinkopa');
  await page.locator('#labClinicalGuide summary').click();
  await expect(page.getByText('Angio-CT pulmonare ose V/Q')).toBeVisible();
  const dDimer=page.locator('[data-test-id="lab-ref-dDimer"]');
  await dDimer.getByText('Si interpretohet rezultati?').click();
  await expect(dDimer.getByText('I ulët / nën prag')).toBeVisible();
  await expect(dDimer.getByText('I lartë / mbi prag')).toBeVisible();
  await expect(dDimer.getByText(/pa konfirmuar trombozën/)).toBeVisible();
  await expect(page.locator('#labCopyPlan')).toBeDisabled();
  await dDimer.getByRole('checkbox').check();
  await expect(dDimer.locator('details')).toHaveAttribute('open','');
  await expect(page.locator('#labCopyPlan')).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('An examination-only profile keeps the lab order empty',async({page})=>{
  await page.goto(baseURL+'/analizat.html?dx=otiti-akut');
  await expect(page.locator('#labPlanStatus')).toContainText('Nuk ka analiza laboratorike rutinë');
  await page.locator('#labClinicalGuide summary').click();
  await expect(page.getByText('Otoskopi',{exact:true})).toBeVisible();
  await expect(page.locator('#labCopyPlan')).toBeDisabled();
});

test('Browse all tests and add a contextual test from the catalog on mobile',async({page})=>{
  await page.setViewportSize({width:320,height:900});
  await page.goto(baseURL+'/analizat.html?view=analiza&dx=simptoma-lodhja');
  const catalog=page.locator('#labCatalog');
  const search=page.getByRole('searchbox',{name:'Kërko analizë'});
  await expect(catalog).toBeVisible();
  await expect(page.locator('#labPlanWorkspace')).toBeHidden();
  await expect(page.locator('#labCatalogStatus')).toHaveText(`24 nga ${data.tests.length} analiza`);
  const more=page.getByRole('button',{name:'Shfaq më shumë'});
  for(let i=24;i<data.tests.length;i+=24) await more.click();
  await expect(catalog.locator('[data-catalog-add]')).toHaveCount(data.tests.length);
  const counts=await catalog.locator('[data-catalog-add]').evaluateAll(buttons=>new Set(buttons.map(button=>button.dataset.catalogAdd)).size);
  expect(counts).toBe(data.tests.length);
  await search.fill('Ferritina');
  await expect(catalog.getByRole('heading',{name:'Ferritina',exact:true})).toBeVisible();
  await page.locator('#labCatalogCategory').selectOption('category-1');
  await expect(page.locator('#labCatalogStatus')).toContainText('Nuk u gjetën rezultate');
  await page.locator('#labCatalogCategory').selectOption('');
  const ferritin=catalog.locator('[data-catalog-add="lab-ref-ferritin"]');
  await ferritin.click();
  await expect(ferritin).toHaveText('Hiq nga plani');
  await expect(ferritin).toHaveAttribute('data-selected','true');
  await catalog.getByRole('button',{name:/Shih planin/}).click();
  await expect(page.locator('[data-test-id="lab-ref-ferritin"] input')).toBeChecked();
  await expect(page.locator('#labSelectedTestCount')).toHaveText('2');
  await page.getByRole('button',{name:'Katalogu i analizave',exact:true}).click();
  await expect(search).toHaveValue('Ferritina');
  await ferritin.click();
  await expect(ferritin).toHaveText('+ Shto në plan');
  await expect(page.locator('#labCatalogPlanCount')).toHaveText('1');
  await page.getByRole('button',{name:'Ekzaminimet shtesë',exact:true}).click();
  await page.getByRole('searchbox',{name:'Kërko ekzaminim ose profil'}).fill('otoskopi');
  await page.getByRole('button',{name:'Katalogu i analizave',exact:true}).click();
  await expect(search).toHaveValue('Ferritina');
  await page.getByRole('button',{name:'Ekzaminimet shtesë',exact:true}).click();
  await expect(page.getByRole('searchbox',{name:'Kërko ekzaminim ose profil'})).toHaveValue('otoskopi');
  await page.getByRole('button',{name:'Pastro filtrat'}).click();
  await expect(page.getByRole('searchbox',{name:'Kërko ekzaminim ose profil'})).toHaveValue('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Search extra examinations and open their clinical context',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await page.goto(baseURL+'/analizat.html');
  await page.getByRole('button',{name:'Ekzaminimet shtesë',exact:true}).click();
  await expect(page.locator('#labCatalogCategory')).toBeHidden();
  const search=page.getByRole('searchbox',{name:'Kërko ekzaminim ose profil'});
  await search.fill('otoskopi otit');
  const otitis=data.indications.find(profile=>profile.slug==='otiti-akut');
  await page.getByLabel('Grupi klinik',{exact:true}).selectOption(otitis.group);
  const row=page.locator('.lab-catalog-exam').filter({has:page.getByRole('heading',{name:'Otoskopi',exact:true})});
  await expect(page.locator('.lab-catalog-exam h3').first()).toHaveText('Otoskopi');
  await expect(row.getByText('Otiti i mesëm akut',{exact:true})).toBeVisible();
  await expect(row).toContainText('efuzionin');
  await expect(page.locator('#labSelectedTestCount')).toHaveText('0');
  await row.getByRole('button',{name:/Shto profilin në plan Otiti/}).click();
  await expect(page.locator('#labClinicalGuide details')).toHaveAttribute('open','');
  await expect(page.locator('#labClinicalGuide').getByText('Otoskopi',{exact:true})).toBeVisible();
  await expect(page.locator('#labSelectedTestCount')).toHaveText('0');
  await expect(page.locator('#labCopyPlan')).toBeDisabled();
  await expect(page).toHaveURL(/dx=otiti-akut/);
});
