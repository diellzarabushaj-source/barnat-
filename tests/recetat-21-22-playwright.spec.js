'use strict';

const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
// Fault injection must reach Playwright routes; service-worker recovery has its
// own integration suite and otherwise serves requests outside these routes.
test.use({serviceWorkers:'block'});
let server;
let baseURL;

const mime = file => ({
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml',
  '.woff2':'font/woff2',
  '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json',
}[path.extname(file).toLowerCase()] || 'application/octet-stream');

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/medical-hub') {
      const fixture = require('./recetat-source-browser-fixture.js')(url);
      if (fixture) {
        res.writeHead(200, {'content-type':'application/json'});
        return res.end(JSON.stringify(fixture));
      }
    }
    if (url.pathname === '/api/auth') {
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify({
        authenticated:true,
        user:{id:'qa-doctor',email:'qa@example.test',name:'QA Doctor'}
      }));
    }
    if (url.pathname === '/api/user-library') {
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify({
        ok:true,items:[],prescriptions:[],favorites:[],notes:{},drugs:[]
      }));
    }
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify({ok:true,items:[],adult:[],pediatric:[],cards:[]}));
    }

    const relative = url.pathname === '/' ? '/recetat.html' : url.pathname;
    const file = path.normalize(path.join(ROOT, relative.replace(/^\//,'')));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }

    res.writeHead(200, {'content-type':mime(file),'cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
});


async function openChapter(page,baseURL,keys){
 const docs=require('./fixtures/prescription-clinical-plan-21-22').filter(g=>keys.includes(g.chapterNumber+'.'+g.orderInChapter));
 const first=docs[0].chapterNumber;
 await page.route('**/api/medical-hub?**',async route=>{
  const url=new URL(route.request().url()),payload=require('./recetat-source-browser-fixture')(url,docs);
  if(payload?.items&&!url.searchParams.get('chapter')){payload.chapter=first;payload.items=docs.filter(g=>g.chapterNumber===first);}
  await route.fulfill({json:payload});
 });
 await page.goto(baseURL+'/recetat.html',{waitUntil:'domcontentloaded'});return docs;
}
for(const width of [320,390,1440]){
 test('pregnancy alternatives and combined PID stay distinct at '+width+'px',async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  const docs=await openChapter(page,baseURL,['21.7','21.17','21.22']);
  const article=page.locator('.is-clinical-plan');await expect(article).toContainText('Cistit');
  await expect(article.locator('.rx-source-information-body')).toBeHidden();
  const use=article.locator('[data-rx-source-use]');await expect(use).toBeDisabled();
  await article.locator('[data-rx-clinical-option]').first().check();await article.locator('[data-rx-clinical-confirmation]').check();await expect(use).toBeEnabled();
  const pid=docs.find(g=>g.orderInChapter===17);await page.locator('#rxSourceLessonSelect').selectOption(pid._id);
  await expect(article).toContainText('Ceftriaxone');await expect(article).toContainText('Doxycycline');await expect(article).toContainText('Metronidazole');
  await expect(use).toBeDisabled();await article.locator('[data-rx-clinical-confirmation]').check();await expect(use).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const box=await article.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);
  await page.screenshot({path:testInfo.outputPath('chapter-21-viewport-'+width+'.png')});
  await article.screenshot({path:testInfo.outputPath('chapter-21-combined-'+width+'.png')});
  await use.click();const draft=await page.locator('#rxComposer').inputValue();
  expect(draft).toMatch(/Ceftriaxone[\s\S]*Intramuskular[\s\S]*EDHE[\s\S]*Doxycycline[\s\S]*14 ditë[\s\S]*EDHE[\s\S]*Metronidazole/);
  expect(draft.split('\nKujdes:')[0]).not.toMatch(/Ciprofloxacin|Clindamycin/);
 });
 test('pediatric individual therapy and confirmed skin route at '+width+'px',async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  const docs=await openChapter(page,baseURL,['22.39','22.87']);
  const article=page.locator('.is-clinical-plan');await expect(article).toContainText('7,5 mg/kg');
  await expect(article).toContainText('30 mg/kg');await expect(article.locator('.rx-source-information-body')).toBeHidden();
  await expect(article.locator('[data-rx-source-custom]')).toBeEnabled();
  const skin=docs.find(g=>g.orderInChapter===87);await page.locator('#rxSourceLessonSelect').selectOption(skin._id);
  await expect(article).toContainText('Permethrin');await expect(article).toContainText('Në lëkurë');
  const use=article.locator('[data-rx-source-use]');await expect(use).toBeDisabled();await article.locator('[data-rx-clinical-confirmation]').check();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await article.screenshot({path:testInfo.outputPath('chapter-22-skin-'+width+'.png')});
  await use.click();await expect(page.locator('#rxComposer')).toHaveValue(/Permethrin[\s\S]*5%[\s\S]*Në lëkurë[\s\S]*8–14 orësh/);
 });
}
