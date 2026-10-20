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

test('desktop workspace: typography, layout and mini-sidebar', async ({ page }) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${baseURL}/recetat.html`, {waitUntil:'domcontentloaded'});

  await expect(page.locator('#rxWorkspace')).toBeVisible();
  await expect(page.locator('#sidebarCollapse')).toBeVisible();

  const h1 = page.locator('.rx-page-heading h1');
  await expect(h1).toHaveCSS('font-family', /Inter/);
  await expect(h1).toHaveCSS('font-size', '32px');

  await page.locator('#sidebarCollapse').click();
  await expect(page.locator('html')).toHaveClass(/drx-sidebar-collapsed/);
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-pressed','true');

  await expect.poll(() => page.locator('#sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(76);
});

test('mobile workspace: touch sizing and search sheet', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${baseURL}/recetat.html`, {waitUntil:'domcontentloaded'});

  await expect(page.locator('#rxWorkspace')).toBeVisible();
  await expect(page.locator('#sidebarCollapse')).toBeHidden();

  const newHeight = await page.locator('#rxNew').evaluate(el => Math.round(el.getBoundingClientRect().height));
  expect(newHeight).toBeGreaterThanOrEqual(44);

  await page.locator('#rxTabBtnCompose').click();
  await page.locator('#rxAddDrugButton').click();
  await expect(page.locator('#rxDrugPopover')).toBeVisible();
  await expect(page.locator('#rxDrugSearch')).toHaveCSS('font-size','16px');
});

for (const width of [390,1440]) {
  test(`chapters 14–22 preserve note headings and block unapproved references and clinical conflicts at ${width}px`,async({page})=>{
    const items=[
      {_id:'qa-note-header',chapterNumber:14,orderInChapter:1,title:'QA complete note heading',reviewStatus:'verified',logicBlocks:[{relation:'start',selection:'all',items:[{kind:'source-note',title:'PËR QA CONDITION:',sig:'Full QA support instruction.'}],note:'S. Separate QA note.'}]},
      {_id:'qa-iv-route',chapterNumber:14,orderInChapter:2,title:'QA IV route conflict',reviewStatus:'verified',logicBlocks:[{relation:'start',items:[{kind:'active-substance',title:'Inj. Ketorolac 30 mg/mL',sig:'30-60 mg IV, një herë.'}]}]},
      {_id:'qa-mania-indication',chapterNumber:15,orderInChapter:1,title:'QA MANI E RËNDË',reviewStatus:'verified',logicBlocks:[{relation:'start',items:[{kind:'source-note',title:'QA source note',sig:'Ndrysho Lithium në Lamotrigine.'}]}]},
      {_id:'qa-unapproved-reference',chapterNumber:16,orderInChapter:1,title:'QA unapproved source reference',reviewStatus:'source-imported',logicBlocks:[{relation:'start',items:[{kind:'source-note',title:'QA source note',sig:'Full QA reference text.'}]}]},
      {_id:'qa-pregnancy',chapterNumber:21,orderInChapter:1,title:'QA KANDIDIAZË NË SHTATZËNI',reviewStatus:'verified',logicBlocks:[{relation:'start',items:[{kind:'active-substance',title:'Cap. Fluconazole 150 mg',sig:'Dozë e vetme.'}]}]},
      {_id:'qa-pediatric-units',chapterNumber:22,orderInChapter:1,title:'QA neonatal infusion',reviewStatus:'verified',logicBlocks:[{relation:'start',items:[{kind:'active-substance',title:'Dextrose 10%',sig:'Maintenance 6-8 mL/kg/minutë.'}]}]},
    ];
    await page.route('**/api/medical-hub?**',async route=>route.fulfill({json:require('./recetat-source-browser-fixture.js')(new URL(route.request().url()),items)}));
    await page.setViewportSize({width,height:900});
    await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
    await page.locator('#rxSourceChapterSelect').selectOption('14');
    await expect(page.locator('#rxSourceGuideList h4')).toHaveText('PËR QA CONDITION:');
    await expect(page.locator('.rx-source-block-note')).toContainText('Separate QA note.');
    await expect(page.locator('[data-rx-source-use]')).toBeEnabled();
    await page.locator('#rxSourceLessonSelect').selectOption('qa-iv-route');
    await expect(page.locator('.rx-source-clinical-issue')).toContainText('Doza IM nuk përdoret si dozë IV');
    await expect(page.locator('[data-rx-source-use]')).toBeDisabled();
    await expect(page.locator('.rx-source-sig')).toContainText('30-60 mg IV');
    await page.locator('#rxSourceChapterSelect').selectOption('15');
    await expect(page.locator('.rx-source-clinical-issue')).toContainText('Lamotrigine');
    await expect(page.locator('[data-rx-source-use]')).toBeDisabled();
    await expect(page.locator('#rxComposer')).toHaveValue('');
    await page.locator('#rxSourceChapterSelect').selectOption('16');
    await expect(page.locator('.rx-source-clinical-issue')).toContainText('pret rishikim klinik');
    await expect(page.locator('[data-rx-source-use]')).toBeDisabled();
    await expect(page.locator('.rx-source-sig')).toContainText('Full QA reference text.');
    await page.locator('#rxSourceChapterSelect').selectOption('21');
    await expect(page.locator('.rx-source-clinical-issue')).toContainText('shtatzëni');
    await expect(page.locator('[data-rx-source-use]')).toBeDisabled();
    await page.locator('#rxSourceChapterSelect').selectOption('22');
    await expect(page.locator('.rx-source-clinical-issue')).toContainText('GIR');
    await expect(page.locator('.rx-source-sig')).toContainText('6-8 mL/kg/minutë');
    await expect(page.locator('[data-rx-source-use]')).toBeDisabled();
    await expect(page.locator('#rxComposer')).toHaveValue('');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
  test(`source chapters 1–5: readable controls, complete fields and draft handoff at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
    const chapter = page.locator('#rxSourceChapterSelect');
    const lesson = page.locator('#rxSourceLessonSelect');
    await expect(lesson).toBeVisible();
    await expect(page.locator('#rxSourceGuideList h3')).toHaveText('Skema QA 1.1');
    await expect(page.locator('#rxSourcePrevious')).toBeDisabled();
    for (const number of [2,4]) {
      await chapter.selectOption(String(number));
      await expect(page.locator('#rxSourceGuideList')).toContainText('nuk ka receta në burim');
      await expect(page.locator('#rxSourceGuideList')).toContainText('dokumentin burimor');
      await expect(lesson).toBeDisabled();
    }
    for (const number of [3,5]) {
      await chapter.selectOption(String(number));
      await expect(page.locator('#rxSourceGuideList h3')).toHaveText(`Skema QA ${number}.1`);
      await page.getByRole('button',{name:'Skema e ardhshme',exact:true}).click();
      await expect(page.locator('#rxSourceGuideList h3')).toHaveText(`Skema QA ${number}.2`);
      await expect(page.locator('#rxSourceNext')).toBeDisabled();
      await page.getByRole('button',{name:'Skema e mëparshme',exact:true}).click();
      await expect(page.locator('#rxSourceGuideList h3')).toHaveText(`Skema QA ${number}.1`);
    }
    await expect(page.locator('#rxSourceGuideList h4').first()).toHaveText('Inj. QA 40 mg / 60 mg / 80 mg');
    await expect(page.locator('.rx-source-choice-label')).toContainText('Zgjidh vetëm një');
    await expect(page.locator('.rx-source-item.is-source-note')).toContainText('Shënim burimor QA');
    await expect(page.locator('.rx-source-connector.is-conditional')).toHaveCount(1);
    const spacing = await page.locator('.rx-source-item').evaluateAll(elements => {
      const sig=elements[0].querySelector('.rx-source-sig');
      const connector=elements[1].parentElement.previousElementSibling;
      return {connectorHeight:connector.getBoundingClientRect().height,sameLine:Math.abs(sig.querySelector('span').getBoundingClientRect().top-sig.querySelector('p').getBoundingClientRect().top)};
    });
    expect(spacing.connectorHeight).toBeLessThanOrEqual(24);
    expect(spacing.sameLine).toBeLessThanOrEqual(4);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    if (width === 390) {
      expect(await lesson.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      expect(await page.locator('#rxSourceGuideList h3').evaluate(el=>el.getBoundingClientRect().top)).toBeLessThan(850);
    }
    await page.getByRole('button',{name:'Vendose si draft',exact:true}).click();
    await expect(page.locator('#rxTabBtnCompose')).toHaveAttribute('aria-selected','true');
    for (const value of ['Doza: doza QA','Rruga: PO','Shpeshtësia: shpeshtësia QA','Kohëzgjatja: kohëzgjatja QA','Shënim elementi QA','Shënim grupi QA','OSE','≤10,000','Zgjidh vetëm një']) await expect(page.locator('#rxComposer')).toHaveValue(new RegExp(value));
    await expect(page.locator('#rxClinicalReview')).toBeVisible();
    await expect(page.locator('#rxSave')).toBeDisabled();
  });
}

for(const width of [390,1440]) test(`source filters and search scope stay consistent at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#rxSourceGuideList h3')).toBeVisible();
  await page.locator('#rxSourceChapterSelect').selectOption('3');
  await expect(page.locator('#rxSourceGuideList h3')).toHaveText('Skema QA 3.1');
  await page.locator('#rxSourceFilter').selectOption('alternatives');
  await expect(page.locator('#rxSourceResultCount')).toHaveText('2');
  await expect(page.locator('#rxSourceIndexDisclosure')).toHaveAttribute('open','');
  await page.locator('#rxSourceSearchScope').selectOption('chapter');
  await page.locator('#rxSourceSearch').fill('QA');
  await expect(page.locator('#rxSourceGuideNav [role=option]')).toHaveCount(2);
  await expect(page.locator('#rxSourceResultLabel')).toContainText('Kapitulli 3');
  await expect(page.locator('#rxSourceLessonSelect')).toBeDisabled();
  await page.locator('#rxSourceSearchScope').selectOption('all');
  await expect(page.locator('#rxSourceGuideNav [role=option]')).toHaveCount(5);
  await page.locator('#rxSourceGuideNav [role=option]').last().click();
  await expect(page.locator('#rxSourceGuideList h3')).toHaveText('Skema QA 5.2');
  await page.locator('#rxSourceClearSearch').click();
  await expect(page.locator('#rxSourceSearch')).toHaveValue('');
  await expect(page.locator('#rxSourceFilter')).toHaveValue('all');
  await expect(page.locator('#rxSourceSearchScope')).toHaveValue('all');
  await expect(page.locator('#rxSourceIndexDisclosure')).not.toHaveAttribute('open','');
  await expect(page.locator('#rxSourceGuideList h3')).toHaveText('Skema QA 5.2');
  await expect(page.locator('#rxSourceLessonSelect')).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(width===390) for(const selector of ['#rxSourceSearchScope','#rxSourceFilter','.rx-source-find-drug']) {
    expect(await page.locator(selector).first().evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
});

test('source global search recovers from a failed request without false empty results',async({page})=>{
  await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#rxSourceGuideList h3')).toBeVisible();
  let failed = true;
  await page.route('**/api/medical-hub?*',async route=>{
    const url = new URL(route.request().url());
    if (url.searchParams.get('_route') !== 'prescription-search') return route.continue();
    if (failed) return route.fulfill({status:503,json:{ok:false}});
    return route.fulfill({json:require('./recetat-source-browser-fixture.js')(url)});
  });
  await page.locator('#rxSourceSearch').fill('QA');
  await expect(page.locator('#rxSourceGuideList')).toContainText('Kërkimi nuk u krye');
  await expect(page.locator('#rxSourceGuideList')).not.toContainText('Nuk u gjet');
  failed=false;
  await page.locator('#rxSourceRetry').click();
  await expect(page.locator('#rxSourceGuideNav [role=option]')).toHaveCount(5);
  await page.locator('#rxSourceGuideNav [role=option]').last().click();
  await expect(page.locator('#rxSourceGuideList h3')).toHaveText('Skema QA 5.2');
  await page.locator('#rxSourceClearSearch').click();
  await expect(page.locator('#rxSourceGuideList h3')).toHaveText('Skema QA 5.2');
});

test('confirmed source conflicts stay readable and cannot start a prescription draft',async({page})=>{
  await page.route('**/api/medical-hub?*',async route=>{
    const url=new URL(route.request().url());
    const data=require('./recetat-source-browser-fixture.js')(url);
    if (!data || url.searchParams.get('_route') !== 'prescription-library') return route.continue();
    data.chapter=5;
    data.items=[{_id:'qa-conflict',title:'QA source conflict',chapterNumber:5,orderInChapter:1,reviewStatus:'verified',logicBlocks:[{order:1,relation:'start',items:[{kind:'active-substance',title:'Inj. Enoxaparin sodium',genericName:'Enoxaparin sodium',sig:'100 IU/kg (1.5 mg/kg), SC, OD.'}]}]}];
    await route.fulfill({json:data});
  });
  await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#rxSourceClinicalIssue')).toBeVisible();
  await expect(page.locator('#rxSourceClinicalIssue a')).toHaveAttribute('href','https://www.medicines.org.uk/emc/product/4499/smpc');
  await expect(page.locator('[data-rx-source-use]')).toBeDisabled();
  await expect(page.locator('#rxSourceGuideList')).toContainText('100 IU/kg (1.5 mg/kg), SC, OD.');
  await expect(page.locator('#rxSourceGuideList .rx-source-import-badge')).toHaveText('Kërkon rishikim klinik');
  await expect(page.locator('#rxSourceGuideList .rx-source-import-badge')).not.toHaveClass(/is-verified/);
});

for (const width of [320,390,768,1440]) test(`source reader keeps full medicine actions and clinical detail at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
  const guide=page.locator('.rx-source-guide');
  const medicine=guide.locator('.rx-source-item.is-active-substance').first();
  const action=medicine.getByRole('button',{name:'Zgjidh preparatin: Inj. QA 40 mg / 60 mg / 80 mg',exact:true});
  await expect(action.getByText('Zgjidh preparatin',{exact:true})).toBeVisible();
  await expect(medicine.locator('.rx-source-meta')).toHaveText('doza QANga gojashpeshtësia QAkohëzgjatja QA');
  await expect(medicine.locator('.rx-source-sig')).toContainText('Udhëzimi QA');
  await expect(guide.locator('.rx-source-import-badge')).toHaveText('E verifikuar');
  await expect(guide.locator('.rx-source-choice-label')).toBeVisible();
  await expect(guide.locator('.rx-source-connector.is-or')).toContainText('OSE');
  const geometry=await guide.evaluate(el=>{
    const button=el.querySelector('.rx-source-find-drug');
    const label=button.querySelector('span');
    const rect=label.getBoundingClientRect();
    const buttonRect=button.getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,buttonHeight:buttonRect.height,labelWidth:rect.width,labelHeight:rect.height,inside:rect.left>=buttonRect.left && rect.right<=buttonRect.right};
  });
  expect(geometry.overflow).toBe(false);
  expect(geometry.labelWidth).toBeGreaterThan(50);
  expect(geometry.labelHeight).toBeGreaterThan(12);
  expect(geometry.inside).toBe(true);
  if(width<768) expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44);
  await action.press('Enter');
  await expect(page.locator('#rxDrugPopover')).toBeVisible();
  await expect(page.locator('#rxDrugSearch')).toHaveValue('QA 40 mg / 60 mg');
  await expect(page.locator('#rxTabBtnCompose')).toHaveAttribute('aria-selected','true');
  // A second source lookup also opens reliably when the existing picker was open.
  await page.locator('#rxTabBtnSource').click();
  await action.click();
  await expect(page.locator('#rxDrugPopover')).toBeVisible();
  await expect(page.locator('#rxDrugSearch')).toHaveValue('QA 40 mg / 60 mg');
  await page.locator('#rxDiagnosis').click();
  await expect(page.locator('#rxDrugPopover')).toBeHidden();
});

for (const width of [320,1440]) {
  test(`shared step frames keep separate cards and connectors at ${width}px`,async({page},testInfo)=>{
    const step=(order,relation,title,kind='active-substance')=>({order,relation,items:[{title,kind,sig:`Udhëzimi QA ${order}.`}]});
    const guide={_id:'qa-shared-frames',chapterNumber:1,orderInChapter:1,title:'QA grouped prescription',reviewStatus:'verified',logicBlocks:[
      step(1,'start','Shënim QA A','source-note'),
      {...step(2,'or','Shënim QA B','source-note'),condition:'Kushti burimor QA'},
      {...step(3,'and','Alternativa QA A'),selection:'choose-one'},
      step(4,'or','Alternativa QA B'),step(5,'or','Alternativa QA C'),step(6,'or','Alternativa QA D'),
      step(7,'and','Hapi i tretë QA'),step(8,'and','Shënimi i fundit QA','source-note'),
    ]};
    await page.route('**/api/medical-hub?**',async route=>route.fulfill({json:require('./recetat-source-browser-fixture.js')(new URL(route.request().url()),[guide])}));
    await page.setViewportSize({width,height:1000});
    await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
    const groups=page.locator('.rx-source-step-group');
    await expect(groups).toHaveCount(4);
    const colors=[];
    for (const [index,count] of [2,4,1,1].entries()) {
      const group=groups.nth(index);
      await expect(group).toHaveAttribute('aria-label',`Hapi ${index+1}`);
      await expect(group.locator('.rx-source-item')).toHaveCount(count);
      expect(await group.locator('.rx-source-item').evaluateAll(cards=>cards.every(card=>getComputedStyle(card).borderTopStyle!=='none'))).toBe(true);
      colors.push(await group.evaluate(el=>getComputedStyle(el).backgroundColor));
    }
    expect(new Set(colors).size).toBe(4);
    await expect(groups.nth(0).locator('.rx-source-connector.is-or')).toHaveCount(1);
    await expect(groups.nth(1).locator('.rx-source-connector.is-or')).toHaveCount(3);
    await expect(page.locator('.rx-source-flow > .rx-source-connector.is-and')).toHaveCount(3);
    await expect(page.locator('.rx-source-item h4')).toHaveText(guide.logicBlocks.map(block=>block.items[0].title));
    await expect(page.locator('.rx-source-item-number')).toHaveText(['1A','1B','2A','2B','2C','2D','3','4']);
    await expect(groups.first()).toContainText('Kushti burimor QA');
    await expect(groups.nth(1)).toContainText('Zgjidh vetëm një alternativë nga ky grup');
    await expect(page.locator('#rxComposer')).toHaveValue('');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.locator('.rx-source-flow-title').scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath(`step-frames-${width}.png`),fullPage:true});
  });
}

test('step hover and keyboard emphasis distinguish major steps without changing the source',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
  const first=page.locator('.rx-source-item[data-rx-step-tone]').first();
  const second=page.locator('.rx-source-item[data-rx-step-tone="2"]').first();
  await expect(first).toBeVisible();
  const original=await page.locator('.rx-source-flow').textContent();
  const initial=await first.evaluate(el=>getComputedStyle(el).backgroundColor);
  await first.hover();
  await expect.poll(()=>first.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(initial);
  const firstHover=await first.evaluate(el=>getComputedStyle(el).backgroundColor);
  await second.hover();
  await expect.poll(()=>second.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(firstHover);
  // Alternative 1A/1B share a reading group; editorial notes are not steps.
  await expect(page.locator('.rx-source-item[data-rx-step-tone="1"]')).toHaveCount(2);
  await expect(page.locator('.rx-source-item.is-source-note')).not.toHaveAttribute('tabindex','0');
  await page.mouse.move(0,0);
  await page.locator('[data-rx-source-use]').focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await expect.poll(()=>first.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(initial);
  await expect(page.locator('.rx-source-flow')).toHaveText(original);
  await expect(page.locator('#rxComposer')).toHaveValue('');
});

test.describe('touch step emphasis',()=>{
  test.use({hasTouch:true});
  test('tapping a step highlights it and moving to another clears the previous emphasis',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
    const first=page.locator('.rx-source-item[data-rx-step-tone]').first();
    const second=page.locator('.rx-source-item[data-rx-step-tone="2"]').first();
    await expect(first).toBeVisible();
    const original=await first.textContent();
    const initial=await first.evaluate(el=>getComputedStyle(el).backgroundColor);
    await first.locator('h4').tap();
    await expect(first).toBeFocused();
    await expect.poll(()=>first.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(initial);
    await second.locator('h4').tap();
    await expect(second).toBeFocused();
    await expect.poll(()=>first.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(initial);
    await expect(first).toHaveText(original);
    await expect(page.locator('#rxTabBtnSource')).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#rxComposer')).toHaveValue('');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
});

for (const width of [390,1440]) {
  test(`chapters 6–22 preserve full instructions, separate source paragraphs and alternatives at ${width}px`,async({page})=>{
    const items=Array.from({length:17},(_,i)=>({
      _id:`qa-later-${i+6}`,chapterNumber:i+6,orderInChapter:1,title:`Later QA ${i+6}`,reviewStatus:'verified',
      logicBlocks:[
        {_key:'first',order:1,relation:'start',items:[{kind:'active-substance',title:'Tab. QA 10 mg',sig:'Complete QA instruction; ≥30 mL/min; 4 javë.'}],note:'S. Support paragraph one.\n\nS. Support paragraph two.'},
        {_key:'alternative',order:2,relation:'or',sourceConnectorLabel:'OSE',selection:'choose-one',items:[{kind:'active-substance',title:'Inh. Alternative QA',sig:'Separate route QA.'}]},
        {_key:'last',order:3,relation:'conditional',sourceConnectorLabel:'NËSE',condition:'QA condition ≥3',items:[{kind:'procedure',title:'QA last step'}]},
      ],
    }));
    await page.route('**/api/medical-hub?**',async route=>{
      const payload=require('./recetat-source-browser-fixture.js')(new URL(route.request().url()),items);
      await route.fulfill({json:payload});
    });
    await page.setViewportSize({width,height:900});
    await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
    for (const chapter of [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]) {
      await page.locator('#rxSourceChapterSelect').selectOption(String(chapter));
      await expect(page.locator('#rxSourceGuideList h3')).toHaveText(`Later QA ${chapter}`);
      await expect(page.locator('.rx-source-sig').first()).toContainText('≥30 mL/min; 4 javë.');
      await expect(page.locator('.rx-source-block-note')).toHaveCSS('white-space','pre-line');
      await expect(page.locator('.rx-source-block-note')).toContainText('Support paragraph two.');
      await expect(page.locator('.rx-source-connector.is-or')).toHaveCount(1);
      await expect(page.locator('.rx-source-connector.is-conditional')).toContainText('QA condition ≥3');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
    await page.locator('[data-rx-source-use]').click();
    await expect(page.locator('#rxTabBtnCompose')).toHaveAttribute('aria-selected','true');
    const text=await page.locator('#rxComposer').inputValue();
    for(const value of ['≥30 mL/min; 4 javë.','Support paragraph one.','Support paragraph two.','OSE','Separate route QA.','QA condition ≥3'])expect(text).toContain(value);
  });
  test(`a confirmed chapter 6 clinical source conflict stays readable and cannot enter a draft at ${width}px`,async({page})=>{
    const items=[{_id:'qa-unit-conflict',chapterNumber:6,orderInChapter:1,title:'QA concentration conflict',reviewStatus:'verified',logicBlocks:[{order:1,relation:'start',items:[{kind:'active-substance',title:'Inj. Vancomycin',sig:'QA target 15-20 mg/mL.'}]}]}];
    await page.route('**/api/medical-hub?**',async route=>route.fulfill({json:require('./recetat-source-browser-fixture.js')(new URL(route.request().url()),items)}));
    await page.setViewportSize({width,height:900});
    await page.goto(`${baseURL}/recetat.html`,{waitUntil:'domcontentloaded'});
    await page.locator('#rxSourceChapterSelect').selectOption('6');
    await expect(page.locator('.rx-source-clinical-issue')).toContainText('mg/L');
    await expect(page.locator('[data-rx-source-use]')).toBeDisabled();
    await expect(page.locator('.rx-source-sig')).toContainText('QA target 15-20 mg/mL.');
    await expect(page.locator('.rx-source-clinical-issue a')).toHaveAttribute('href','https://www.idsociety.org/practice-guideline/vancomycin/');
    await expect(page.locator('#rxComposer')).toHaveValue('');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
}
