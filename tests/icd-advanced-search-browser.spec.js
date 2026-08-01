const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-visual';
fs.mkdirSync(OUTPUT, { recursive:true });

const meta = {
  version:'ICD-10-WHO 2019',
  sourceSpreadsheetId:'1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0',
  counts:{ chapter:22, block:274, category:2050, subcategory:10196, total:12542 },
  quality:{ missingTranslations:5240, machineDraftTranslations:7302, verifiedTranslations:0, translationCoverage:58.22, publicationReady:false },
  search:{ version:'sq-clinical-search-v1', supports:['code', 'sq-title', 'en-title', 'sq-synonym', 'typo', 'wildcard', 'hierarchy-groups'], diagnosticDecision:false },
};

const block = {
  code:'I10-I15', level:'block', chapter:'IX', block:'I10-I15', parentCode:'IX',
  englishTitle:'Hypertensive diseases', albanianDraft:'Sëmundjet hipertensive',
  displayTitle:'Sëmundjet hipertensive', translationStatus:'machine-draft',
  sourceUrl:'https://icd.who.int/browse10/2019/en#/I10-I15', childCount:1,
};

const hypertension = {
  code:'I10', level:'category', chapter:'IX', block:'I10-I15', parentCode:'I10-I15',
  englishTitle:'Essential (primary) hypertension', albanianDraft:'Hipertensioni esencial (primar)',
  displayTitle:'Hipertensioni esencial (primar)', translationStatus:'machine-draft',
  sourceUrl:'https://icd.who.int/browse10/2019/en#/I10', childCount:0,
};

function suggestionData(query) {
  const normalized = query.toLowerCase();
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
    meta,
    query,
    interpretedAs:exactCode || fuzzy ? '' : 'hypertension',
    rows,
    groups:[
      { id:match.group, label:match.groupLabel, count:1 },
      { id:'broader', label:'Kategori më të gjera', count:1 },
    ],
    total:2,
    safetyNote:'Sugjerimet ndihmojnë kërkimin dhe kodimin; nuk vendosin diagnozë.',
  };
}

function tableData(query) {
  return {
    meta,
    query,
    page:1,
    pageSize:50,
    total:1,
    totalPages:1,
    rows:[{ ...hypertension, searchMatch:{ type:'synonym-sq', field:'en', score:1010, matchedTerm:query, expandedTerm:'hypertension', label:'Sinonim shqip' } }],
    context:null,
    ancestors:[],
  };
}

async function installAdvancedRoute(page) {
  await page.route('**/api/icd-advanced-search**', async route => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('q') || '';
    const view = url.searchParams.get('view') || 'table';
    const data = view === 'suggest' ? suggestionData(query) : tableData(query);
    await route.fulfill({
      status:200,
      contentType:'application/json; charset=utf-8',
      body:JSON.stringify({ ok:true, data }),
      headers:{ 'X-MedIndex-Search-Version':'sq-clinical-search-v1' },
    });
  });
}

test('advanced Albanian ICD suggestions are grouped, explained and keyboard accessible', async ({ page }) => {
  await installAdvancedRoute(page);
  await page.goto(`${BASE}/icd.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await page.waitForFunction(() => document.documentElement.dataset.miIcdSearch === 'sq-clinical-search-v1');

  const search = page.locator('#icdSearch');
  await search.fill('tension i lartë');
  await expect(page.locator('#icdSuggestions')).toBeVisible();
  await expect(page.locator('.icd-suggestion-interpretation')).toContainText('hypertension');
  await expect(page.locator('[data-suggestion-group="suggested"] .icd-suggestion-group-title')).toContainText('Diagnoza të sugjeruara');
  await expect(page.locator('[data-suggestion-group="broader"] .icd-suggestion-group-title')).toContainText('Kategori më të gjera');
  await expect(page.locator('[data-code="I10"] .icd-suggestion-match')).toHaveText('Sinonim shqip');
  await expect(page.locator('.icd-suggestion-safety')).toContainText('nuk vendosin diagnozë');

  await search.press('ArrowDown');
  await expect(page.locator('#icdSuggestions [role="option"][aria-selected="true"]')).toHaveCount(1);
  await search.press('Enter');
  await expect(page).toHaveURL(/parent=I10/);

  await page.screenshot({ path:path.join(OUTPUT, 'advanced-search-desktop.png'), fullPage:true });
});

test('typo correction remains readable and inside the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await installAdvancedRoute(page);
  await page.goto(`${BASE}/icd.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));

  const search = page.locator('#icdSearch');
  await search.fill('hipertensjon');
  const suggestions = page.locator('#icdSuggestions');
  await expect(suggestions).toBeVisible();
  await expect(page.locator('[data-code="I10"] .icd-suggestion-match')).toHaveText('Gabim shkrimi i korrigjuar');

  const report = await suggestions.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {
      left:rect.left,
      right:rect.right,
      width:rect.width,
      viewport:innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
    };
  });
  expect(report.left).toBeGreaterThanOrEqual(-1);
  expect(report.right).toBeLessThanOrEqual(report.viewport + 1);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.viewport + 1);

  await page.screenshot({ path:path.join(OUTPUT, 'advanced-search-mobile.png'), fullPage:true });
});
