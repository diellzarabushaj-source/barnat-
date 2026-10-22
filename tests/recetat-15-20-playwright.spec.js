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

for(const width of [320,390,1440]){
 test('chapters 16–17 preserve combined acne therapy and confirmed rectal concentration at '+width+'px',async({page},testInfo)=>{
  const docs=require('./fixtures/prescription-clinical-plan-16-20').filter(g=>['16.3','17.7'].includes(g.chapterNumber+'.'+g.orderInChapter));
  await page.route('**/api/medical-hub?**',async route=>{
   const url=new URL(route.request().url()),payload=require('./recetat-source-browser-fixture')(url,docs);
   if(payload?.items&&!url.searchParams.get('chapter')){payload.chapter=16;payload.items=docs.filter(g=>g.chapterNumber===16);}
   await route.fulfill({json:payload});
  });
  await page.setViewportSize({width,height:900});await page.goto(baseURL+'/recetat.html',{waitUntil:'domcontentloaded'});
  const article=page.locator('.is-clinical-plan');
  await expect(article).toContainText('Adapalene');await expect(article).toContainText('Doxycycline');
  await expect(article.locator('.rx-source-information-body')).toBeHidden();
  await page.locator('#rxSourceChapterSelect').selectOption('17');await expect(article).toContainText('Glyceryl trinitrate');
  const use=article.locator('[data-rx-source-use]');await expect(use).toBeDisabled();
  await article.locator('[data-rx-clinical-confirmation]').check();await expect(use).toBeEnabled();
  await expect(article).toContainText('4 mg/g (0,4%)');await expect(article).toContainText('2,5 cm');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await article.screenshot({path:testInfo.outputPath('chapters-16-17-'+width+'.png')});
  await use.click();await expect(page.locator('#rxComposer')).toHaveValue(/Glyceryl trinitrate[\s\S]*0,4%[\s\S]*12 orë[\s\S]*8 javë/);
 });
 test('chapters 18–20 distinguish eye ear nasal routes and conservative sciatica at '+width+'px',async({page},testInfo)=>{
  const docs=require('./fixtures/prescription-clinical-plan-16-20').filter(g=>['18.4','19.8','19.18','20.7'].includes(g.chapterNumber+'.'+g.orderInChapter));
  await page.route('**/api/medical-hub?**',async route=>{
   const url=new URL(route.request().url()),payload=require('./recetat-source-browser-fixture')(url,docs);
   if(payload?.items&&!url.searchParams.get('chapter')){payload.chapter=18;payload.items=docs.filter(g=>g.chapterNumber===18);}
   await route.fulfill({json:payload});
  });
  await page.setViewportSize({width,height:900});await page.goto(baseURL+'/recetat.html',{waitUntil:'domcontentloaded'});
  const article=page.locator('.is-clinical-plan');
  await expect(article).toContainText('Moxifloxacin');await expect(article).toContainText('3 herë në ditë');await expect(article).toContainText('Në sy');
  await page.locator('#rxSourceChapterSelect').selectOption('19');await expect(article).toContainText('Mometasone');
  await expect(article).toContainText('200 mikrogramë/ditë');await expect(article).toContainText('Në hundë');
  const ear=docs.find(g=>g.orderInChapter===18);await page.locator('#rxSourceLessonSelect').selectOption(ear._id);
  await expect(article).toContainText('Ciprofloxacin');await expect(article).toContainText('4 pika');await expect(article).toContainText('Në vesh');
  await expect(article.locator('[data-rx-source-use]')).toBeDisabled();await article.locator('[data-rx-clinical-confirmation]').check();
  await page.locator('#rxSourceChapterSelect').selectOption('20');await expect(article).toContainText('Shiatik');
  await expect(article.locator('.rx-source-information-body')).toBeHidden();
  await expect(article.locator('[data-rx-source-use]')).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await article.screenshot({path:testInfo.outputPath('chapters-18-20-'+width+'.png')});
  await article.locator('[data-rx-source-use]').click();
  const draft=await page.locator('#rxComposer').inputValue();expect(draft).toMatch(/aktivitet/i);expect(draft).not.toMatch(/^\d+\. (Pregabalin|Gabapentin|Prednisolone|Diazepam)/m);
 });
}
