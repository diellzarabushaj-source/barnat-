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
 await page.locator('#abxCatalogSearch').fill('Vancomycin');await page.getByRole('button',{name:'Shiko detajet'}).click();
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
 await expect(page.getByRole('region',{name:'Kalkulatori për Phenoxymethylpenicillin'})).toBeVisible();
 await page.locator('#abxCatalogIndication').selectOption({label:'Infeksion nga Helicobacter pylori'});
 await expect(panel).toContainText('Mungon renditje burimore');
 await expect(panel.locator('.abx-choice-tier')).toHaveCount(0);
});

test('individual calculators preserve separate drafts and never enable unapproved dosing',async({page})=>{
 await page.goto(url+'/antibiotiket.html');
 await expect(page.locator('.abx-catalog-item input').first()).toBeEnabled();
 await page.locator('#abxCatalogSearch').fill('Amoxicillin');
 const amox=page.locator('[data-antibiotic-id="ABX-631701ffbd23"]');
 await amox.getByRole('button',{name:'Shiko detajet'}).click();
 await amox.locator('[data-dose-condition]').selectOption({label:'Infeksion nga Helicobacter pylori'});
 let calc=amox.locator('[data-calculator]');
 await calc.locator('[data-calc-field="age"]').fill('8');
 await calc.locator('[data-calc-field="weight"]').fill('25');
 await calc.locator('[data-calc-field="productId"]').selectOption({index:1});
 await expect(calc.getByRole('button',{name:'Llogarit dozën'})).toBeDisabled();
 await expect(calc).toContainText('Llogaritja nuk është miratuar klinikisht');
 await page.locator('#abxCatalogSearch').fill('Clarithromycin');
 const clari=page.locator('[data-antibiotic-id="ABX-a92902b63e9f"]');
 await clari.getByRole('button',{name:'Shiko detajet'}).click();
 await expect(clari.locator('[data-calc-field="weight"]')).toHaveValue('');
 await page.locator('#abxCatalogSearch').fill('Amoxicillin');
 await expect(amox.locator('[data-calc-field="weight"]')).toHaveValue('25');
 await page.reload();await page.locator('#abxCatalogSearch').fill('Amoxicillin');
 await amox.getByRole('button',{name:'Shiko detajet'}).click();
 await expect(amox.locator('[data-calc-field="weight"]')).toHaveValue('');
});

test('choice groups and individual calculator fit 320 px and keep pediatric context separate',async({page})=>{
 await page.setViewportSize({width:320,height:880});await page.goto(url+'/antibiotiket.html');
 await page.locator('#abxFilterToggle').click();
 await page.locator('#abxCatalogIndication').selectOption({label:'Otit media akut'});
 const panel=page.getByRole('region',{name:'Renditja sipas indikacionit'});
 await expect(panel).toContainText('1 muaj–17 vjeç');
 await panel.locator('.is-first [data-choice-open]').click();
 const calc=page.getByRole('region',{name:'Kalkulatori për Amoxicillin',exact:true});
 await calc.locator('[data-calc-field="productId"]').selectOption({index:1});
 await expect(calc.getByRole('button',{name:'Llogarit dozën'})).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#abxCatalogPopulation').selectOption({label:'Të rritur'});
 await expect(panel).toContainText('Mungon renditje burimore');
});
