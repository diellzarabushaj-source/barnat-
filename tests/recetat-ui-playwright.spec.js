'use strict';

const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let server;
let baseURL;

// Synthetic layout fixtures only: no live accounts, CMS content or clinical doses.
const LONG_TITLE = 'SEPSIS — REANIMIMI FILLESTAR DHE VAZOPRESORËT — TITULL I GJATË DEMONSTRUES PËR KONTROLLIN E LEXUESHMËRISË NË EKRANE TË VOGLA';
const LONG_ITEM_TITLE = 'SHËNIM I BURIMIT — TITULL DEMONSTRUES I GJATË PËR VLERËSIMIN E MBËSHTJELLJES SË TEKSTIT PA FSHEHUR INFORMACION';
const CHAPTERS = [
  {number:5, title:'Sëmundjet infektive — kapitull demonstrues', count:2},
  {number:6, title:'Kapitulli i dytë demonstrues', count:1},
];
const GUIDES = [
  {
    _id:'qa-guide-long', chapterNumber:5, lessonNumber:1, title:LONG_TITLE,
    reviewStatus:'source-imported', sourceDocument:'UI test fixture', version:'qa',
    logicBlocks:[
      {order:1, relation:'start', items:[{
        order:1, kind:'source-note', title:LONG_ITEM_TITLE,
        sig:'Tekst demonstrues vetëm për testimin e paraqitjes. Nuk është udhëzim klinik.',
        note:'Shënim demonstrues me shkronja shqipe: ë, ç, Ë, Ç.',
      }]},
      {order:2, relation:'conditional', condition:'Kusht demonstrues vetëm për provën e ndërfaqes.', items:[{
        order:1, kind:'active-substance', genericName:'Bar demonstrues QA',
        sig:'Pa dozë klinike; përdoret vetëm nga prova automatike e ndërfaqes.',
      }]},
    ],
  },
  {_id:'qa-guide-two', chapterNumber:5, lessonNumber:2, title:'Mësimi i dytë demonstrues', logicBlocks:[]},
  {_id:'qa-guide-other-chapter', chapterNumber:6, lessonNumber:1, title:'Rezultat demonstrues në kapitull tjetër', logicBlocks:[]},
];

const mime = file => ({
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml',
  '.woff2':'font/woff2',
  '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json',
}[path.extname(file).toLowerCase()] || 'application/octet-stream');

// Fresh context and local storage for every test; never reuse a user's browser.
test.use({storageState:{cookies:[], origins:[]}, serviceWorkers:'block'});

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = payload => {
      res.writeHead(200, {'content-type':'application/json', 'cache-control':'no-store'});
      res.end(JSON.stringify(payload));
    };
    if (url.pathname === '/api/auth') {
      return json({authenticated:true, user:{id:'qa-doctor', email:'qa@example.test', name:'QA Doctor'}});
    }
    if (url.pathname === '/api/user-library') {
      return json({ok:true, items:[], prescriptions:[], favorites:[], notes:{}, drugs:[]});
    }
    // The actual source-guide runtime endpoint, with deterministic local data.
    if (url.pathname === '/api/medical-hub' && url.searchParams.get('_route') === 'prescription-library') {
      const chapter = Number(url.searchParams.get('chapter')) || 5;
      return json({ok:true, chapters:CHAPTERS, chapter, items:GUIDES.filter(guide => guide.chapterNumber === chapter)});
    }
    if (url.pathname === '/api/medical-hub' && url.searchParams.get('_route') === 'prescription-search') {
      return json({ok:true, results:[GUIDES[2]]});
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ok:true, items:[], adult:[], pediatric:[], cards:[]});
    }

    const relative = url.pathname === '/' ? '/recetat.html' : url.pathname;
    const file = path.resolve(ROOT, `.${relative}`);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {'content-type':mime(file), 'cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    // The app seeds a starter prescription for new users; keep this test-only
    // library empty so the draft handoff can prove it never creates a save.
    localStorage.setItem('medindex_prescription_starter_seed_v1', '1');
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === baseURL ? route.continue() : route.abort('blockedbyclient');
  });
});

async function openWorkspace(page, width = 1440, height = 1000) {
  await page.setViewportSize({width, height});
  await page.goto(`${baseURL}/recetat.html`, {waitUntil:'domcontentloaded'});
  await expect(page.locator('#appShell')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-source-guide-id="qa-guide-long"]')).toBeVisible();
  await expect(page.locator('#rxSourceChapterSelect')).toBeEnabled();
  await expect(page.locator('#rxSourceLessonSelect')).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

async function expectLoadedInter(page) {
  const loaded = await page.evaluate(async () => {
    const faces = await document.fonts.load('300 32px Inter', 'Recetat ëç');
    return faces.some(face => face.family.replace(/["']/g, '') === 'Inter' && face.status === 'loaded');
  });
  expect(loaded, 'The local Inter font must load, not merely appear in the fallback CSS stack').toBe(true);
  await expect(page.locator('.rx-page-heading h1')).toHaveCSS('font-family', /Inter/);
}

async function expectNoDocumentOverflow(page) {
  const geometry = await page.evaluate(() => ({
    viewport:document.documentElement.clientWidth,
    document:document.documentElement.scrollWidth,
    body:document.body.scrollWidth,
  }));
  expect(geometry.document, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.body, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport + 1);
}

async function expectReadableSource(page, controlHeight) {
  for (const selector of ['#rxSourceChapterSelect', '#rxSourceLessonSelect']) {
    const geometry = await page.locator(selector).evaluate(el => ({
      height:el.getBoundingClientRect().height,
      fontSize:parseFloat(getComputedStyle(el).fontSize),
    }));
    expect(geometry.height, selector).toBeGreaterThanOrEqual(controlHeight);
    expect(geometry.fontSize, selector).toBeGreaterThanOrEqual(13);
  }
  const selectors = [
    '.rx-source-heading-copy > p',
    '#rxSourceSearch', '.rx-source-nav-copy strong',
    '.rx-source-sig p', '.rx-source-note',
    '.rx-source-connector > p', '.rx-source-use', '.rx-source-find-drug',
  ];
  for (const selector of selectors) {
    const samples = await page.locator(selector).evaluateAll(elements => elements.map(el => ({
      size:parseFloat(getComputedStyle(el).fontSize), text:el.textContent.trim(),
    })));
    expect(samples.length, `Fixture must exercise ${selector}`).toBeGreaterThan(0);
    for (const sample of samples) expect(sample.size, `${selector}: ${sample.text}`).toBeGreaterThanOrEqual(13);
  }
}

async function expectUnclippedText(locator, text) {
  await expect(locator).toHaveText(text);
  const geometry = await locator.evaluate(el => {
    const style = getComputedStyle(el);
    return {
      clientWidth:el.clientWidth, scrollWidth:el.scrollWidth,
      clientHeight:el.clientHeight, scrollHeight:el.scrollHeight,
      whiteSpace:style.whiteSpace,
    };
  });
  expect(geometry.whiteSpace).not.toBe('nowrap');
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
}

async function expectVisibleFocus(locator) {
  await expect(locator).toBeFocused();
  const visible = await locator.evaluate(el => {
    const style = getComputedStyle(el);
    return el.matches(':focus-visible') && (
      (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2) ||
      (style.boxShadow !== 'none' && !style.boxShadow.startsWith('rgba(0, 0, 0, 0)'))
    );
  });
  expect(visible, 'Keyboard focus must have a visible outline or focus ring').toBe(true);
}

test('desktop workspace: loaded Stripe typography, readable source and mini-sidebar', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await expectLoadedInter(page);
  await expect(page.locator('.rx-page-heading h1')).toHaveCSS('font-size', '32px');
  await expect(page.locator('.rx-page-heading h1')).toHaveCSS('font-weight', '300');
  await expectReadableSource(page, 40);
  await expectUnclippedText(page.locator('.rx-source-guide-head h3'), LONG_TITLE);
  await expectUnclippedText(page.locator('.rx-source-nav-copy strong').first(), LONG_TITLE);
  await expectUnclippedText(page.locator('#rxSourceActiveTitle'), LONG_TITLE);
  await expectUnclippedText(page.locator('.rx-source-item-title h4').first(), LONG_ITEM_TITLE);
  await expectNoDocumentOverflow(page);
  await page.screenshot({path:testInfo.outputPath('desktop-top.png')});
  await page.locator('#rxPrescriptionLibrary').evaluate(el => window.scrollTo(0, el.offsetTop - 76));
  await page.screenshot({path:testInfo.outputPath('desktop-source.png')});

  await page.locator('#sidebarCollapse').click();
  await expect(page.locator('html')).toHaveClass(/drx-sidebar-collapsed/);
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('#sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(76);
  await expectNoDocumentOverflow(page);
});

test('mobile workspace: readable typography, touch sizing and search sheet', async ({ page }, testInfo) => {
  await openWorkspace(page, 390, 844);
  await expectLoadedInter(page);
  await expect(page.locator('#sidebarCollapse')).toBeHidden();
  await expect(page.locator('.rx-page-heading h1')).toHaveCSS('font-size', '26px');
  await expect(page.locator('.rx-page-heading h1')).toHaveCSS('font-weight', '300');
  await expectReadableSource(page, 44);
  await expectUnclippedText(page.locator('.rx-source-guide-head h3'), LONG_TITLE);
  await expectUnclippedText(page.locator('.rx-source-nav-copy strong').first(), LONG_TITLE);
  await expectUnclippedText(page.locator('.rx-source-item-title h4').first(), LONG_ITEM_TITLE);
  await expectNoDocumentOverflow(page);
  await page.screenshot({path:testInfo.outputPath('mobile-top.png')});
  await page.locator('.rx-source-guide-head').evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 76));
  await page.screenshot({path:testInfo.outputPath('mobile-source.png')});
  for (const selector of ['#rxNew', '.rx-source-use', '.rx-source-find-drug']) {
    expect(await page.locator(selector).evaluate(el => el.getBoundingClientRect().height), selector).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#rxAddDrugButton').click();
  await expect(page.locator('#rxDrugPopover')).toBeVisible();
  await expect(page.locator('#rxDrugSearch')).toHaveCSS('font-size', '16px');
  await expectNoDocumentOverflow(page);
});

for (const width of [1280, 1024, 768, 320]) {
  test(`source workspace stays within the viewport at ${width}px`, async ({ page }) => {
    await openWorkspace(page, width, 1000);
    await expectNoDocumentOverflow(page);
    await expectUnclippedText(page.locator('.rx-source-guide-head h3'), LONG_TITLE);
    await expectUnclippedText(page.locator('.rx-source-item-title h4').first(), LONG_ITEM_TITLE);
  });
}

test('source navigation: keyboard focus, chapter/lesson selection and global search', async ({ page }) => {
  await openWorkspace(page);
  await page.locator('#rxSourceChapterSelect').focus();
  await page.keyboard.press('Tab');
  await expectVisibleFocus(page.locator('#rxSourceLessonSelect'));

  await page.locator('.rx-source-nav-item').first().focus();
  await page.keyboard.press('ArrowDown');
  await expectVisibleFocus(page.locator('[data-rx-source-select="qa-guide-two"]'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#rxSourceLessonSelect')).toHaveValue('qa-guide-two');
  await expect(page.locator('.rx-source-guide-head h3')).toHaveText(GUIDES[1].title);

  await page.locator('#rxSourceLessonSelect').selectOption('qa-guide-long');
  await expect(page.locator('.rx-source-guide-head h3')).toHaveText(LONG_TITLE);
  await page.locator('#rxSourceChapterSelect').selectOption('6');
  await expect(page.locator('[data-source-guide-id="qa-guide-other-chapter"]')).toBeVisible();
  await page.locator('#rxSourceChapterSelect').selectOption('5');
  await expect(page.locator('[data-source-guide-id="qa-guide-long"]')).toBeVisible();

  await page.locator('.rx-source-nav-item').first().focus();
  await page.keyboard.press('/');
  await expect(page.locator('#rxSourceSearch')).toBeFocused();
  await page.locator('#rxSourceSearch').fill('demonstrues');
  await page.locator('[data-rx-source-search-result="qa-guide-other-chapter"]').click();
  await expect(page.locator('#rxSourceChapterSelect')).toHaveValue('6');
  await expect(page.locator('#rxSourceLessonSelect')).toHaveValue('qa-guide-other-chapter');
  await expect(page.locator('.rx-source-guide-head h3')).toHaveText(GUIDES[2].title);
  await page.locator('#rxSourceClearSearch').click();
  await expect(page.locator('#rxSourceSearch')).toHaveValue('');
  await expect(page.locator('#rxSourceSearch')).toBeFocused();
});

test('source handoff remains a local draft, without saving a prescription', async ({ page }) => {
  await openWorkspace(page);
  await page.locator('[data-rx-source-use="qa-guide-long"]').click();
  await expect(page.locator('#rxDiagnosis')).toHaveValue(LONG_TITLE);
  await expect(page.locator('#rxComposer')).toHaveValue(/Tekst demonstrues vetëm për testimin/);
  await expect(page.locator('#rxSavedCount')).toHaveText('0');
});
