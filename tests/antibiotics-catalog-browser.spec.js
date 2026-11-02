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
  await expect(page.locator('.abx-catalog-item')).toHaveCount(1);
  await expect(page.locator('.abx-catalog-name')).toHaveText('Amoxicillin');
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
  await page.locator('#abxCatalogOnlySelected').check();
  await expect(page.locator('.abx-catalog-item')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
test('mobile expanded detail and empty results fit at 320 px',async({page})=>{
 await page.setViewportSize({width:320,height:880});await page.goto(url+'/antibiotiket.html');
 await page.locator('#abxCatalogSearch').fill('Vancomycin');await page.getByRole('button',{name:'Shiko detajet'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#abxCatalogSearch').fill('no-such-antibiotic');await expect(page.getByText('Nuk u gjetën rezultate',{exact:true})).toBeVisible();
 await page.locator('[data-reset]').click();await expect(page.locator('.abx-catalog-item')).toHaveCount(135);
});
