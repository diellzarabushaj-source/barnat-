const {test,expect}=require('@playwright/test');
const {data}=require('./lab-symptom-fixture');
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
  await page.route('**/api/icd?dataset=labs',route=>route.fulfill({json:{data}}));
});

for(const width of [320,390,1440])test(`Symptom search, grouped picker and deliberate orders at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  await page.goto(baseURL+'/analizat.html');
  await expect(page.locator('#labIndicationTotal')).toHaveText('23');
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
  await expect(page.locator('#labClinicalGuide a')).toHaveAttribute('href',/nice\.org\.uk/);
});

test('Every supplied symptom renders with linked tests and no implicit conditional choices',async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const p of data.indications.filter(p=>p.kind==='symptom')){
    await page.goto(baseURL+'/analizat.html?dx='+p.slug);
    await expect(page.locator('.lab-clinical-profile-head>strong')).toHaveText(p.title);
    for(const link of p.tests)if(link.tier==='conditional')await expect(page.locator(`[data-test-id="${link.testId}"] input`)).not.toBeChecked();
  }
  expect(errors).toEqual([]);
});

test('An unavailable source cannot produce a fabricated order',async({page})=>{
  await page.route('**/api/icd?dataset=labs',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.goto(baseURL+'/analizat.html');
  await expect(page.getByText('Analizat nuk u ngarkuan.',{exact:true})).toBeVisible();
  await expect(page.locator('#labCopyPlan')).toBeDisabled();
  await expect(page.locator('#labPlanSections [data-test-id]')).toHaveCount(0);
});
