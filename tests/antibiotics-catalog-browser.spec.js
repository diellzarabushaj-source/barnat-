'use strict';
const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {phase5AuthenticatedSession} = require('./phase5-browser-fixture');

const ROOT = path.resolve(__dirname, '..');
let server;
let url;
test.use({serviceWorkers:'block'});

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(ROOT, '.' + pathname);
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end(); }
    try {
      const body = fs.readFileSync(file);
      const mime = ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, {'Content-Type':mime}); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(async ({page}) => {
  await page.route('**/api/auth*', route => route.fulfill({json:phase5AuthenticatedSession()}));
});

test('Antibiotikët header cannot be covered by an oversized capsule icon at desktop or 320px',async({page})=>{
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  await page.goto(url+'/antibiotiket.html');
  const icon=page.locator('.abx-heading-symbol');
  await expect(icon).toBeVisible();
  await expect(icon).toHaveText('Rx');
  await expect(icon.locator('svg')).toHaveCount(0);
  const rect=await icon.boundingBox();
  expect(rect).toBeTruthy();
  expect(rect.width).toBeLessThanOrEqual(36);
  expect(rect.height).toBeLessThanOrEqual(36);
  const heading=await page.locator('.abx-catalog-heading').boundingBox();
  const search=await page.locator('#abxCatalogSearch').boundingBox();
  expect(heading.height).toBeLessThan(330);
  expect(search.width).toBeGreaterThan(90);
  expect(search.y).toBeGreaterThan(heading.y);
  expect(search.y).toBeLessThan(650);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('Catalog desktop: all substances in a vertical list, filters above, no NICE calculator', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto(url + '/antibiotiket.html');
  await expect(page.locator('#abxCatalogCount')).toContainText('135 nga 135');
  await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
  await expect(page.locator('table, #indicationPicker, #weightInput')).toHaveCount(0);
  const top = await page.locator('.abx-catalog-controls').boundingBox();
  const first = await page.locator('.abx-catalog-item').first().boundingBox();
  expect(top.y + top.height).toBeLessThan(first.y);
  await page.locator('#abxCatalogSearch').fill('ALMACIN');
  // Substring search also correctly finds CO-ALMACIN combination products.
  await expect(page.locator('.abx-catalog-item')).toHaveCount(2);
  await expect(page.locator('.abx-catalog-name')).toHaveText(['Amoxicillin','Amoxicillin + Clavulanic acid']);
  await expect(page.locator('.abx-search-hit').first()).toContainText('ALMACIN');
});

for (const width of [320,390,1440]) test(`Catalog mobile/desktop ${width}px: selection persists and list fits screen`, async ({page}) => {
  await page.setViewportSize({width,height:880});
  await page.goto(url + '/antibiotiket.html');
  const first = page.locator('.abx-catalog-item').first();
  const name = await first.locator('.abx-catalog-name').innerText();
  await first.locator('input[type=checkbox]').check();
  await page.locator('#abxCatalogOnlySelected').check();
  await expect(page.locator('.abx-catalog-item')).toHaveCount(1);
  await expect(page.locator('.abx-catalog-name')).toHaveText(name);
  await page.reload();
  await expect(page.locator('.abx-catalog-item input').first()).toBeEnabled();
  await page.locator('#abxCatalogOnlySelected').check();
  await expect(page.locator('.abx-catalog-item')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width <= 720) await page.locator('#abxFilterToggle').click();
  await page.locator('#abxCatalogReset').click();
  await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
});

test('Mayo clinical notes, AKPPM products and blocked calculations stay visible in expanded list details', async ({page}) => {
  await page.goto(url + '/antibiotiket.html?indication=aom');
  await expect(page.locator('#indicationPicker')).toHaveCount(0);
  await page.locator('#abxCatalogSearch').fill('Amoxicillin');
  await page.locator('.abx-catalog-item').filter({has:page.locator('.abx-catalog-name', {hasText:'Amoxicillin'})}).first().getByRole('button',{name:'Shiko detajet'}).click();
  const details = page.locator('.abx-catalog-detail').first();
  await expect(details.getByText('Dozimi sipas Mayo Clinic', {exact:false})).toBeVisible();
  await expect(details.getByText('Produktet në AKPPM', {exact:false})).toBeVisible();
  if(await details.locator('[data-dose-condition]').count())await details.locator('[data-dose-condition]').selectOption({label:'Infeksion nga Helicobacter pylori'});
  await expect(details.getByText('Doza referencë',{exact:false}).first()).toBeVisible();
  await details.getByText('Kufizimet dhe kontrolli',{exact:false}).first().click();
  await expect(details.getByText('Kalkulatori: JO.',{exact:false}).first()).toBeVisible();
  await expect(details.locator('a[href*="mayoclinic.org"]').last()).toHaveAttribute('rel','noopener noreferrer');
});

test('two parent groups cascade to subgroups; form and population filters reset',async({page})=>{
 await page.goto(url+'/antibiotiket.html');
 await page.locator('#abxCatalogGroup').selectOption({label:'Beta-Laktamët'});
 const names=await page.locator('#abxCatalogSubgroup option').allTextContents();expect(names).not.toContain('Makrolidët');
 await page.locator('#abxCatalogSubgroup').selectOption({label:'Penicilinat'});
 await page.locator('#abxCatalogForm').selectOption({label:'Tabletë'});
 await page.locator('#abxCatalogRoute').selectOption({label:'PO'});
 expect(await page.locator('.abx-catalog-item').count()).toBeGreaterThan(0);
 await page.locator('#abxCatalogPopulation').selectOption({label:'Të rritur'});
 await page.locator('#abxCatalogReset').click();
 await expect(page.locator('#abxCatalogForm')).toHaveValue('');await expect(page.locator('#abxCatalogPopulation')).toHaveValue('');await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
});
test('personal selections are isolated between authenticated accounts',async({page})=>{
 await page.goto(url+'/antibiotiket.html');await page.locator('.abx-catalog-item input').first().check();
 await page.unroute('**/api/auth*');await page.route('**/api/auth*',route=>route.fulfill({json:phase5AuthenticatedSession({user:{email:'another@medindex.local'}})}));
 await page.reload();await page.locator('#abxCatalogOnlySelected').check();await expect(page.locator('.abx-catalog-item')).toHaveCount(0);
});
test('saved selections load when authentication finishes before the catalog script',async({page})=>{
 // Use a real displayed ID rather than relying on source row order.
 require('../antibiotiket-catalog-data');
 const selectedId=globalThis.DRX_ANTIBIOTIC_CATALOG.antibiotics[0].id;
 await page.addInitScript(id=>localStorage.setItem('drx.antibiotics.selected.v2:test%40medindex.local',JSON.stringify([id])),selectedId);
 await page.route('**/antibiotiket-catalog.js*',async route=>{
  await page.waitForFunction(()=>Boolean(window.DRX_ANTIBIOTIC_AUTH_READY));
  await page.evaluate(()=>window.DRX_ANTIBIOTIC_AUTH_READY);
  await route.continue();
 });
 await page.goto(url+'/antibiotiket.html');
 await expect(page.locator('input[data-id="'+selectedId+'"]')).toBeChecked();
 await expect(page.locator('input[data-id="'+selectedId+'"]')).toBeEnabled();
 await page.locator('#abxCatalogOnlySelected').check();
 await expect(page.locator('.abx-catalog-item')).toHaveCount(1);
});
test('mobile expanded detail and empty results fit at 320 px',async({page})=>{
 await page.setViewportSize({width:320,height:880});await page.goto(url+'/antibiotiket.html');
 await page.locator('#abxCatalogSearch').fill('Vancomycin');await page.getByRole('button',{name:'Shiko detajet'}).first().click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#abxCatalogSearch').fill('no-such-antibiotic');await expect(page.getByText('Nuk u gjetën rezultate',{exact:true})).toBeVisible();
 await page.locator('[data-reset]').click();await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
});

test('indication choices keep explicit first, second and conditional alternatives with the exact source',async({page})=>{
 await page.goto(url+'/antibiotiket.html');
 await page.locator('#abxCatalogIndication').selectOption({label:'Sinusit akut bakterial'});
 await page.locator('[data-choice-profile]').selectOption('sinus-adult');
 const panel=page.getByRole('region',{name:'Renditja sipas indikacionit'});
 await expect(panel.getByRole('heading',{name:'Zgjedhja e parë'})).toBeVisible();
 await expect(panel.getByRole('heading',{name:'Zgjedhja e dytë'})).toBeVisible();
 await expect(panel.getByRole('heading',{name:'Alternativa'})).toBeVisible();
 await expect(panel.locator('.is-first')).toContainText('Phenoxymethylpenicillin');
 await expect(panel.locator('.is-second')).toContainText('2–3 ditësh');
 await expect(panel.locator('a[href*="guidance/ng79/chapter/Recommendations"]')).toBeVisible();
 await panel.locator('.is-first [data-choice-open]').first().click();
 await expect(page.getByRole('region',{name:'Dozimi për Phenoxymethylpenicillin'})).toBeVisible();
 await page.locator('#abxCatalogIndication').selectOption({label:'Infeksion nga Helicobacter pylori'});
 await expect(panel).toContainText('Mungon renditje burimore');
 await expect(panel.locator('.abx-choice-tier')).toHaveCount(0);
});

test('reference product choices stay separate and unapproved workspaces never ask for patient data',async({page})=>{
 await page.goto(url+'/antibiotiket.html');await page.locator('#abxCatalogSearch').fill('Amoxicillin');
 const amox=page.locator('[data-antibiotic-id="ABX-631701ffbd23"]');await amox.getByRole('button',{name:'Shiko detajet'}).click();
 await amox.locator('[data-dose-condition]').selectOption({label:'Infeksion nga Helicobacter pylori'});let calc=amox.locator('[data-calculator]');
 await calc.locator('.abx-dose-reference > summary').click();await calc.locator('[data-calc-field="productId"]').selectOption({index:1});const chosen=await calc.locator('[data-calc-field="productId"]').inputValue();
 await expect(calc.locator('input, [data-calculate]')).toHaveCount(0);await expect(calc.locator('.abx-dose-reference')).toHaveAttribute('open','');
 await page.locator('#abxCatalogSearch').fill('Clarithromycin');const clari=page.locator('[data-antibiotic-id="ABX-a92902b63e9f"]');await clari.getByRole('button',{name:'Shiko detajet'}).click();await expect(clari.locator('[data-calculator] input')).toHaveCount(0);
 await page.locator('#abxCatalogSearch').fill('Amoxicillin');await expect(amox.locator('[data-calc-field="productId"]')).toHaveValue(chosen);
 await page.reload();await page.locator('#abxCatalogSearch').fill('Amoxicillin');await amox.getByRole('button',{name:'Shiko detajet'}).click();await amox.locator('[data-dose-condition]').selectOption({label:'Infeksion nga Helicobacter pylori'});await expect(amox.locator('[data-calc-field="productId"]')).toHaveValue('');
});

test('choice groups and individual calculator fit 320 px and keep pediatric context separate',async({page})=>{
 await page.setViewportSize({width:320,height:880});await page.goto(url+'/antibiotiket.html');
 await page.locator('#abxFilterToggle').click();
 await page.locator('#abxCatalogIndication').selectOption({label:'Otit media akut'});
 const panel=page.getByRole('region',{name:'Renditja sipas indikacionit'});
 await expect(panel).toContainText('1 muaj–17 vjeç');
 await panel.locator('.is-first [data-choice-open]').click();
 const calc=page.getByRole('region',{name:'Dozimi për Amoxicillin',exact:true});
 await calc.locator('.abx-dose-reference > summary').click();await calc.locator('[data-calc-field="productId"]').selectOption({index:1});
 await expect(calc.locator('input, [data-calculate]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#abxCatalogPopulation').selectOption({label:'Të rritur'});
 await expect(panel).toContainText('Mungon renditje burimore');
});

test('urinary choices show unavailable monotherapies without promoting cotrimoxazole',async({page})=>{
 await page.goto(url+'/antibiotiket.html');
 await expect(page.locator('#abxCatalogIndication optgroup[label="Me renditje sipas burimit"] option')).toHaveCount(10);
 await page.locator('#abxCatalogIndication').selectOption({label:'Cistit akut i pakomplikuar'});
 const panel=page.getByRole('region',{name:'Renditja sipas indikacionit'});
 await expect(panel).toContainText('Gra ≥16 vjeç');
 await expect(panel.locator('.is-first')).toContainText('Nitrofurantoin');
 await expect(panel.locator('.abx-choice-unavailable')).toContainText(['Trimethoprim','Pivmecillinam']);
 await expect(panel.locator('[data-choice-open="ABX-15699217069b"]')).toHaveCount(0);
 await expect(panel).toContainText('eGFR ≥45');
});

test('local skin choices stay separate from nasal products and the local panel omits weight',async({page})=>{
 await page.setViewportSize({width:320,height:880});await page.goto(url+'/antibiotiket.html');await page.locator('#abxFilterToggle').click();
 await page.locator('#abxCatalogIndication').selectOption({label:'Impetigo'});await page.locator('[data-choice-profile]').selectOption('impetigo-adult-local');
 const panel=page.getByRole('region',{name:'Renditja sipas indikacionit'});
 await panel.locator('.is-alternative [data-choice-open="ABX-d7685aa3e0f9"]').click();
 const calc=page.locator('[data-calculator="ABX-d7685aa3e0f9"]');await expect(calc).toContainText('Në përgatitje');await expect(calc.locator('[data-calc-field="weight"]')).toHaveCount(0);
 await expect(calc.locator('[data-calculate]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('[data-choice-profile]').selectOption('impetigo-adult-oral');await expect(panel.locator('.is-first')).toContainText('Flucloxacillin');await expect(panel.locator('.is-first')).toContainText('Pa produkt të përputhshëm');await expect(panel.locator('.is-first [data-choice-open]')).toHaveCount(0);
});

for(const width of [320,1440])test(`Amikacin has a compact reference card without an empty blocked calculator at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:880});await page.goto(url+'/antibiotiket.html');if(width===320)await page.locator('#abxFilterToggle').click();
 await page.locator('#abxCatalogSearch').fill('Amikacin');await page.locator('#abxCatalogIndication').selectOption({label:'Infeksione urinare'});await page.getByRole('button',{name:'Shiko detajet'}).click();
 const card=page.getByRole('region',{name:'Dozimi për Amikacin',exact:true});await expect(card).toBeVisible();await expect(card.locator('input, [data-calculate], .abx-calculator-status')).toHaveCount(0);
 expect((await card.boundingBox()).height).toBeLessThan(240);expect(await card.locator('.abx-dose-reference').getAttribute('open')).toBeNull();
 await card.locator('.abx-dose-reference > summary').click();await card.locator('[data-calc-field="productId"]').selectOption({index:1});await expect(card.locator('input, [data-calculate]')).toHaveCount(0);
 await card.getByText('Verifikimi',{exact:true}).click();await expect(card).toContainText('Llogaritja nuk është miratuar klinikisht');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('one antibiotic keeps source/product selections separate for different indications',async({page})=>{
 await page.goto(url+'/antibiotiket.html');await page.locator('#abxCatalogSearch').fill('Amoxicillin');const item=page.locator('[data-antibiotic-id="ABX-631701ffbd23"]');await item.locator('[data-detail]').click();
 await item.locator('[data-dose-condition]').selectOption({label:'Infeksion nga Helicobacter pylori'});await item.locator('.abx-dose-reference > summary').click();await item.locator('[data-calc-field="productId"]').selectOption({index:1});const chosen=await item.locator('[data-calc-field="productId"]').inputValue();
 await item.locator('[data-dose-condition]').selectOption({label:'Otit media akut'});await expect(item.locator('[data-calc-field="productId"]')).toHaveValue('');
 await item.locator('[data-dose-condition]').selectOption({label:'Infeksion nga Helicobacter pylori'});await expect(item.locator('[data-calc-field="productId"]')).toHaveValue(chosen);await expect(item.locator('[data-calc-result]')).toHaveCount(0);
});

test('Ceftazidime uses the selected product SmPC and requires renal review without leaking it to CEFIN',async({page})=>{
 await page.setViewportSize({width:390,height:880});await page.goto(url+'/antibiotiket.html');await page.locator('#abxFilterToggle').click();await page.locator('#abxCatalogSearch').fill('Ceftazidime');await page.locator('#abxCatalogIndication').selectOption({label:'Infeksione urinare të komplikuara'});await page.locator('[data-antibiotic-id="ABX-7f2058bb1770"]').getByRole('button',{name:'Shiko detajet'}).click();
 const calc=page.locator('[data-calculator="ABX-7f2058bb1770"]');await calc.locator('.abx-dose-reference > summary').click();await calc.locator('[data-calc-field="productId"]').selectOption('PRD-a6635e18e00533');await calc.locator('.abx-calculator-source summary').click();
 await expect(calc.locator('a[href*="cima.aemps.es/cima/dochtml/ft/83901/"]')).toBeVisible();await expect(calc.locator('.abx-calculator-source')).toContainText('1–2 g/dozë');await expect(calc.locator('input, [data-calculate]')).toHaveCount(0);
 await calc.getByText('Verifikimi',{exact:true}).click();await expect(calc).toContainText('funksionit renal');
 await calc.locator('[data-calc-field="productId"]').selectOption('PRD-3f67ae13e70a80');await expect(calc.locator('.abx-calculator-source')).toHaveCount(0);await expect(calc).toContainText('ende nuk ka skemë numerike');await expect(calc.locator('input, [data-calc-result]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('Smart search: keyboard suggestions and evidence-bound search domains',async({page})=>{
 await page.setViewportSize({width:1280,height:850});
 await page.goto(url+'/antibiotiket.html');
 await expect(page.locator('#abxSmartScopes')).toBeVisible();
 const search=page.locator('#abxCatalogSearch');
 await search.fill('ceftri');
 await expect(page.locator('.abx-catalog-name mark.abx-smart-highlight').first()).toBeVisible();
 await expect(page.locator('#abxSmartSuggestions [data-abx-index]').first()).toBeVisible();
 await search.press('ArrowDown');
 await page.keyboard.press('Enter');
 await expect(search).toHaveValue('Ceftriaxone');
 await page.locator('[data-abx-scope-tab="substance"]').click();
 await expect(page.locator('[data-abx-scope-tab="substance"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.abx-catalog-name').first()).toContainText('Ceftriaxone');
 await page.locator('[data-abx-scope-tab="product"]').click();
 await search.fill('ALMACIN');
 await expect(page.locator('#abxCatalogCount')).toContainText('rezultate');
 await expect(page.locator('.abx-catalog-item')).toHaveCount(2);
 // The suggestion list stays in flow; it must not intercept the scope switch.
 const beforeScope=await page.locator('[data-abx-scope-tab="indication"]').boundingBox();
 const suggestion=await page.locator('#abxSmartSuggestions').boundingBox();
 if(suggestion){
  expect(suggestion.y+suggestion.height).toBeLessThanOrEqual(beforeScope.y+2);
 }
 await page.locator('[data-abx-scope-tab="indication"]').click();
 await expect(page.locator('#abxSmartSuggestions')).toBeHidden();
 await search.fill('Cistit');
 expect(await page.locator('.abx-catalog-item').count()).toBeGreaterThan(0);
 await page.locator('[data-abx-scope-tab="substance"]').click();
 await expect(page.locator('.abx-catalog-item')).toHaveCount(0);
 await page.locator('[data-remove-filter="scope"]').click();
 await expect(page.locator('.abx-catalog-item').first()).toBeVisible();
});
test('Smart mobile: scoped tabs, active filter removal and narrow-screen overflow',async({page})=>{
 await page.setViewportSize({width:320,height:780});
 await page.goto(url+'/antibiotiket.html');
 const scope=page.locator('.abx-smart-scope-switch');
 await expect(scope).toBeVisible();
 await scope.locator('[data-abx-scope-tab="indication"]').click();
 await page.locator('#abxCatalogSearch').fill('Cistit');
 await expect(page.locator('#abxActiveFilterChips [data-remove-filter="scope"]')).toBeVisible();
 await page.locator('#abxActiveFilterChips [data-remove-filter="scope"]').click();
 await expect(page.locator('[data-abx-scope-tab="all"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#abxSmartClear').click();
 await expect(page.locator('#abxCatalogSearch')).toHaveValue('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('Uiverse-inspired quick route filters preserve product-matched route and reset',async({page})=>{
 await page.setViewportSize({width:1280,height:840});
 await page.goto(url+'/antibiotiket.html');
 const rail=page.locator('.abx-shortcuts');
 await expect(rail).toBeVisible();
 await expect(page.locator('.abx-shortcut-pills button').first()).toHaveAttribute('aria-pressed','true');
 const po=page.locator('button[data-shortcut-route="PO"]');
 await expect(po).toBeVisible();
 await po.click();
 await expect(page.locator('#abxCatalogRoute')).toHaveValue('PO');
 await expect(po).toHaveAttribute('aria-pressed','true');
 const count=await page.locator('.abx-catalog-item').count();
 expect(count).toBeGreaterThan(0);
 expect(count).toBeLessThan(135);
 await page.locator('button[data-shortcut-route=""]').click();
 await expect(page.locator('#abxCatalogRoute')).toHaveValue('');
 await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
});
test('Compact density is accessible, persistent and clinically neutral',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(url+'/antibiotiket.html');
 const button=page.locator('.abx-density-button');
 await expect(button).toBeVisible();
 await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
 const before=await page.locator('.abx-catalog-item').first().boundingBox();
 await button.click();
 await expect(page.locator('#antibioticsCatalog')).toHaveAttribute('data-density','compact');
 await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
 const after=await page.locator('.abx-catalog-item').first().boundingBox();
 expect(after.height).toBeLessThan(before.height);
 await page.reload();
 await expect(page.locator('#antibioticsCatalog')).toHaveAttribute('data-density','compact');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Search scopes and quick routes support keyboard navigation',async({page})=>{
 await page.setViewportSize({width:320,height:800});
 await page.goto(url+'/antibiotiket.html');
 const all=page.locator('[data-abx-scope-tab="all"]');
 await all.focus();
 await all.press('ArrowRight');
 await expect(page.locator('[data-abx-scope-tab="substance"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('button[data-shortcut-route=""]').focus();
 await page.keyboard.press('ArrowRight');
 await expect(page.locator('button[data-shortcut-route="PO"]')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('Long list offers an accessible return to search without hiding clinical content',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:820});
 await page.goto(url+'/antibiotiket.html');
 const back=page.locator('.abx-back-to-search');
 await expect(back).toBeHidden();
 await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 await expect(back).toBeVisible();
 const rect=await back.boundingBox();
 expect(rect.width).toBeLessThan(210);
 expect(rect.x+rect.width).toBeLessThanOrEqual(390);
 await back.click();
 await expect.poll(()=>page.evaluate(()=>Math.abs(document.querySelector('#abxCatalogSearch').getBoundingClientRect().top)<innerHeight)).toBe(true);
 await expect(page.locator('#abxCatalogSearch')).toBeVisible();
 await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
});
test('Desktop search shortcut hint matches the current platform',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto(url+'/antibiotiket.html');
 const key=await page.locator('.abx-smart-shortcut').innerText();
 const platform=await page.evaluate(()=>navigator.platform||'');
 expect(key).toBe(/Mac|iPhone|iPad/.test(platform)?'⌘ K':'Ctrl K');
});


test('Minimal V8 search hides discovery examples after typing, keeping filters and results',async({page})=>{
 await page.setViewportSize({width:1280,height:850});
 await page.goto(url+'/antibiotiket.html');
 const samples=page.locator('#abxSmartQuick');
 await expect(samples).toBeVisible();
 await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
 await page.locator('#abxCatalogSearch').fill('ceftri');
 await expect(page.locator('#antibioticsCatalog')).toHaveClass(/abx-has-query/);
 await expect(samples).toBeHidden();
 await expect(page.locator('#abxSmartScopes')).toBeVisible();
 await expect(page.locator('.abx-catalog-item').first()).toBeVisible();
 await page.locator('#abxSmartClear').click();
 await expect(page.locator('#antibioticsCatalog')).not.toHaveClass(/abx-has-query/);
 await expect(samples).toBeVisible();
 await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
});
test('Minimal V8 phone keeps search and route filters visible without extra example row',async({page})=>{
 for(const width of [320,390]){
  await page.setViewportSize({width,height:800});
  await page.goto(url+'/antibiotiket.html');
  await expect(page.locator('#abxCatalogSearch')).toBeVisible();
  await expect(page.locator('#abxSmartQuick')).toBeHidden();
  await expect(page.locator('#abxSmartScopes')).toBeVisible();
  await expect(page.locator('.abx-shortcuts')).toBeVisible();
  await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
