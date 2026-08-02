const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-visual';
fs.mkdirSync(OUTPUT, { recursive:true });

const source = {
  type:'google-sheet', status:'live', visibility:'public-link',
  loadedAt:'2026-08-02T09:00:00.000Z', revision:'phase10live1234567890', csvBytes:4106422,
};
const meta = {
  version:'ICD-10-WHO 2019',
  sourceSpreadsheetId:'1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0',
  counts:{ chapter:22, block:274, category:2050, subcategory:10196, total:12542 },
  quality:{ missingTranslations:5240, machineDraftTranslations:6445, standardizedTranslations:857, verifiedTranslations:0, translationCoverage:58.22, publicationReady:false },
  source,
  search:{
    version:'sq-clinical-search-v3', engine:'clinical-ranking-v3',
    supports:['code', 'normalized-code', 'sq-title', 'en-title', 'sq-synonym', 'typo', 'wildcard', 'hierarchy-groups', 'breadcrumbs'],
    diagnosticDecision:false,
  },
};

const block = {
  code:'I10-I15', level:'block', chapter:'IX', block:'I10-I15', parentCode:'IX',
  englishTitle:'Hypertensive diseases', albanianDraft:'Sëmundjet hipertensive', displayTitle:'Sëmundjet hipertensive',
  translationStatus:'standardized', sourceUrl:'https://icd.who.int/browse10/2019/en#/I10-I15', childCount:1,
  breadcrumb:[{ code:'IX', level:'chapter', title:'Sëmundjet e sistemit të qarkullimit' }],
};
const hypertension = {
  code:'I10', level:'category', chapter:'IX', block:'I10-I15', parentCode:'I10-I15',
  englishTitle:'Essential (primary) hypertension', albanianDraft:'Hipertensioni esencial (primar)',
  displayTitle:'Hipertensioni esencial (primar)', translationStatus:'standardized',
  sourceUrl:'https://icd.who.int/browse10/2019/en#/I10', childCount:0,
  breadcrumb:[
    { code:'IX', level:'chapter', title:'Sëmundjet e sistemit të qarkullimit' },
    { code:'I10-I15', level:'block', title:'Sëmundjet hipertensive' },
  ],
};
const choleraCategory = {
  code:'A00', level:'category', chapter:'I', block:'A00-A09', parentCode:'A00-A09',
  englishTitle:'Cholera', albanianDraft:'Kolera', displayTitle:'Kolera', translationStatus:'machine-draft',
  sourceUrl:'https://icd.who.int/browse10/2019/en#/A00', childCount:2,
  breadcrumb:[
    { code:'I', level:'chapter', title:'Sëmundje të caktuara infektive dhe parazitare' },
    { code:'A00-A09', level:'block', title:'Sëmundjet infektive të zorrëve' },
  ],
};
const choleraSubcategory = {
  code:'A00.1', level:'subcategory', chapter:'I', block:'A00-A09', parentCode:'A00',
  englishTitle:'Cholera due to Vibrio cholerae 01, biovar eltor',
  albanianDraft:'Kolera për shkak të Vibrio cholerae 01, biovar eltor',
  displayTitle:'Kolera për shkak të Vibrio cholerae 01, biovar eltor', translationStatus:'machine-draft',
  sourceUrl:'https://icd.who.int/browse10/2019/en#/A00.1', childCount:0,
  breadcrumb:[
    { code:'I', level:'chapter', title:'Sëmundje të caktuara infektive dhe parazitare' },
    { code:'A00-A09', level:'block', title:'Sëmundjet infektive të zorrëve' },
    { code:'A00', level:'category', title:'Kolera' },
  ],
};

function suggestionData(query) {
  const normalized = query.toLowerCase();
  const safetyNote = 'Sugjerimet ndihmojnë kërkimin dhe kodimin; nuk vendosin diagnozë.';
  if (normalized === 'a001' || normalized === 'a00 1') {
    return {
      meta, query, interpretedAs:'A00.1', interpretationType:'code-normalized', normalizedCode:'A00.1',
      rows:[
        { ...choleraSubcategory, searchMatch:{ type:'code-normalized', field:'code', score:1293, matchedTerm:'A00.1', normalizedCode:'A00.1', label:'Kodi i normalizuar', group:'exact', groupLabel:'Përputhje e saktë' } },
        { ...choleraCategory, searchMatch:{ type:'hierarchy-parent', field:'hierarchy', score:1233, matchedTerm:'Kolera', label:'Kategori më e gjerë', group:'broader', groupLabel:'Kategori më të gjera' } },
      ],
      groups:[{ id:'exact', label:'Përputhje e saktë', count:1 }, { id:'broader', label:'Kategori më të gjera', count:1 }],
      total:2, safetyNote,
    };
  }
  if (normalized.includes('asnje-kod')) {
    return { meta, query, interpretedAs:'', interpretationType:'', normalizedCode:'', rows:[], groups:[], total:0, safetyNote };
  }
  const fuzzy = normalized.includes('hipertensjon');
  const exactCode = normalized === 'i10';
  const match = exactCode
    ? { type:'code-exact', field:'code', score:1200, matchedTerm:'I10', label:'Kodi i saktë', group:'exact', groupLabel:'Përputhje e saktë' }
    : fuzzy
      ? { type:'fuzzy-sq', field:'sq', score:562, matchedTerm:'hipertensioni', label:'Gabim shkrimi i korrigjuar', group:'suggested', groupLabel:'Diagnoza të sugjeruara' }
      : { type:'synonym-sq', field:'en', score:1010, matchedTerm:'tension i larte', expandedTerm:'hypertension', label:'Sinonim shqip', group:'suggested', groupLabel:'Diagnoza të sugjeruara' };
  const rows = [
    { ...hypertension, searchMatch:match },
    { ...block, searchMatch:{ type:'hierarchy-parent', field:'hierarchy', score:930, matchedTerm:block.displayTitle, label:'Kategori më e gjerë', group:'broader', groupLabel:'Kategori më të gjera' } },
  ];
  return {
    meta, query, interpretedAs:exactCode || fuzzy ? '' : 'hypertension', interpretationType:exactCode || fuzzy ? '' : 'clinical-synonym', normalizedCode:'', rows,
    groups:[{ id:match.group, label:match.groupLabel, count:1 }, { id:'broader', label:'Kategori më të gjera', count:1 }],
    total:2, safetyNote,
  };
}

function suggestionResponse(query) {
  return {
    status:200,
    contentType:'application/json; charset=utf-8',
    body:JSON.stringify({ ok:true, data:suggestionData(query) }),
    headers:{ 'X-MedIndex-Search-Version':'sq-clinical-search-v3', 'X-MedIndex-Search-Engine':'clinical-ranking-v3' },
  };
}

async function safeFulfill(route, response) {
  try {
    await route.fulfill(response);
  } catch (error) {
    if (!/aborted|already handled|intercept|closed/i.test(String(error?.message || error))) throw error;
  }
}

async function installAdvancedRoute(page, delayForQuery = () => 0, observed = []) {
  await page.route('**/api/icd**', route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/icd') return route.continue();
    const view = url.searchParams.get('view') || 'table';
    if (view === 'meta' && url.searchParams.get('advanced') !== '1') {
      return safeFulfill(route, {
        status:200,
        contentType:'application/json; charset=utf-8',
        body:JSON.stringify({ ok:true, data:{ meta } }),
      });
    }
    if (url.searchParams.get('advanced') !== '1' || view !== 'suggest') return route.continue();

    const query = url.searchParams.get('q') || '';
    observed.push({ query, controller:url.searchParams.get('controller') || 'tree-controller' });
    const delay = Number(delayForQuery(query) || 0);
    const fulfill = () => safeFulfill(route, suggestionResponse(query));
    if (delay > 0) {
      setTimeout(() => { void fulfill(); }, delay);
      return undefined;
    }
    return fulfill();
  });
}

async function installBrowserRaceFetch(page) {
  const first = suggestionData('tension i lartë');
  const second = suggestionData('A001');
  await page.addInitScript(({ firstPayload, secondPayload }) => {
    const nativeFetch = window.fetch.bind(window);
    window.__medindexRaceQueries = [];
    window.fetch = async function medIndexRaceFetch(input, init) {
      const url = new URL(typeof input === 'string' ? input : input?.url, location.origin);
      if (
        url.pathname === '/api/icd'
        && url.searchParams.get('view') === 'suggest'
        && url.searchParams.get('advanced') === '1'
      ) {
        const query = url.searchParams.get('q') || '';
        window.__medindexRaceQueries.push(query);
        const isSecond = query === 'A001';
        await new Promise(resolve => setTimeout(resolve, isSecond ? 30 : 500));
        return new Response(JSON.stringify({ ok:true, data:isSecond ? secondPayload : firstPayload }), {
          status:200,
          headers:{
            'Content-Type':'application/json; charset=utf-8',
            'X-MedIndex-Search-Version':'sq-clinical-search-v3',
            'X-MedIndex-Search-Engine':'clinical-ranking-v3',
          },
        });
      }
      return nativeFetch(input, init);
    };
  }, { firstPayload:first, secondPayload:second });
}

async function openTree(page) {
  await page.goto(`${BASE}/icd.html`, { waitUntil:'domcontentloaded' });
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-icd-tree', 'ready');
  await expect(html).toHaveAttribute('data-mi-icd-search', 'sq-clinical-search-v3');
  await expect(html).toHaveAttribute('data-mi-icd-search-engine', 'clinical-ranking-v3');
  await expect(html).toHaveAttribute('data-mi-icd-race-guard', 'icd-race-guard-v4');
}

test('advanced Albanian ICD suggestions are grouped, explained and reveal the code in the tree', async ({ page }) => {
  await installAdvancedRoute(page);
  await openTree(page);
  const search = page.locator('#icdSearch');
  await expect(page.locator('#icdSourceStatus')).toContainText('Burimi: live');
  await search.fill('tension i lartë');
  await expect(page.locator('#icdSuggestions')).toBeVisible();
  await expect(page.locator('.icd-suggestion-interpretation')).toContainText('hypertension');
  await expect(page.locator('[data-suggestion-group="suggested"] .icd-suggestion-group-title')).toContainText('Diagnoza të sugjeruara');
  await expect(page.locator('[data-suggestion-group="broader"] .icd-suggestion-group-title')).toContainText('Kategori më të gjera');
  await expect(page.locator('[data-code="I10"] .icd-suggestion-match')).toHaveText('Sinonim shqip');
  await expect(page.locator('[data-code="I10"] .icd-suggestion-path')).toContainText('Sëmundjet hipertensive');
  await expect(page.locator('.icd-suggestion-safety')).toContainText('nuk vendosin diagnozë');
  await page.screenshot({ path:path.join(OUTPUT, 'advanced-tree-search-desktop.png'), fullPage:true });
  await search.press('ArrowDown');
  const selected = page.locator('#icdSuggestions [role="option"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  await expect(search).toHaveAttribute('aria-activedescendant', await selected.getAttribute('id'));
  await search.press('Enter');
  await expect(page).toHaveURL(/code=I10/);
  await expect(page.locator('[data-icd-tree-node="I10"] .icd-tree-row')).toHaveClass(/is-selected/);
});

test('the newest query wins when an older suggestion response finishes later', async ({ page }) => {
  await installBrowserRaceFetch(page);
  await openTree(page);
  const search = page.locator('#icdSearch');
  const requestCount = query => page.evaluate(value => (
    window.__medindexRaceQueries || []
  ).filter(item => item === value).length, query);

  await search.fill('tension i lartë');
  await expect.poll(() => requestCount('tension i lartë')).toBeGreaterThan(0);
  await search.fill('A001');
  await expect.poll(() => requestCount('A001')).toBeGreaterThan(0);
  await expect(page.locator('[data-code="A00.1"]')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator('[data-code="A00.1"]')).toBeVisible();
  await expect(page.locator('[data-code="I10"]')).toHaveCount(0);
  await expect(search).toHaveValue('A001');
  await expect(page.locator('#icdSuggestions')).toHaveAttribute('aria-busy', 'false');
});

test('compact ICD code is normalized, explained and opened in its hierarchy', async ({ page }) => {
  await installAdvancedRoute(page);
  await openTree(page);
  const search = page.locator('#icdSearch');
  await search.fill('A001');
  await expect(page.locator('#icdSuggestions')).toBeVisible();
  await expect(page.locator('.icd-suggestion-interpretation')).toContainText('Kodi u normalizua si');
  await expect(page.locator('.icd-suggestion-interpretation')).toContainText('A00.1');
  await expect(page.locator('[data-code="A00.1"] .icd-suggestion-match')).toHaveText('Kodi i normalizuar');
  await expect(page.locator('[data-code="A00.1"] .icd-suggestion-path')).toContainText('Sëmundjet infektive të zorrëve');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page).toHaveURL(/code=A00\.1/);
  await expect(page.locator('[data-icd-tree-node="A00.1"] .icd-tree-row')).toHaveClass(/is-selected/);
});

test('typo correction remains readable and inside the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await installAdvancedRoute(page);
  await openTree(page);
  const search = page.locator('#icdSearch');
  await search.fill('hipertensjon');
  const suggestions = page.locator('#icdSuggestions');
  await expect(suggestions).toBeVisible();
  await expect(page.locator('[data-code="I10"] .icd-suggestion-match')).toHaveText('Gabim shkrimi i korrigjuar');
  const report = await suggestions.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth };
  });
  expect(report.left).toBeGreaterThanOrEqual(-1);
  expect(report.right).toBeLessThanOrEqual(report.viewport + 1);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.viewport + 1);
  await page.screenshot({ path:path.join(OUTPUT, 'advanced-tree-search-mobile.png'), fullPage:true });
});

test('empty clinical search stays visible, helpful and inside the phone viewport', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await installAdvancedRoute(page);
  await openTree(page);
  await page.locator('#icdSearch').fill('asnje-kod-test');
  const suggestions = page.locator('#icdSuggestions');
  await expect(suggestions).toBeVisible();
  await expect(page.locator('.icd-suggestion-empty')).toContainText('Nuk u gjet asnjë kod ICD-10');
  await expect(page.locator('.icd-suggestion-empty')).toContainText('kodin me ose pa pikë');
  await expect(page.locator('.icd-suggestion-safety')).toContainText('nuk vendosin diagnozë');
  const report = await suggestions.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth };
  });
  expect(report.left).toBeGreaterThanOrEqual(-1);
  expect(report.right).toBeLessThanOrEqual(report.viewport + 1);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.viewport + 1);
  await page.screenshot({ path:path.join(OUTPUT, 'advanced-tree-search-empty-mobile.png'), fullPage:true });
});
