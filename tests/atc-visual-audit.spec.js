const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/atc-visual';
fs.mkdirSync(OUTPUT, { recursive:true });

test.use({ serviceWorkers:'block' });
test.describe.configure({ mode:'serial' });

async function mockAtc(page) {
  await page.route('**/api/auth*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.pathname !== '/api/auth' || url.search) return route.continue();
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ authenticated:true, user:{ name:'Dr. Test User', email:'test@example.test' } }) });
  });
  await page.route('**/api/atc-counts', async route => {
    await route.fulfill({
      status:200,
      contentType:'application/json',
      headers:{ 'X-MedIndex-Data-Source':'supabase-bounded-atc' },
      body:JSON.stringify({
        ok:true, total:4003, classifiedTotal:3920, unclassifiedTotal:83,
        groupCounts:{ A:760,B:280,C:690,D:210,G:190,H:120,J:560,L:130,M:260,N:410,P:30,R:250,S:150,V:80 },
        counts:{ A10:165,C09:188,J01:390,N02:126,N03:84,R03:110,S01:95 }
      })
    });
  });
}

async function openClassification(page, viewport) {
  await page.setViewportSize(viewport);
  await mockAtc(page);
  await page.goto(`${BASE}/klasifikimi.html#N02`, { waitUntil:'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-drx-app', 'classification-v2');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('[data-group-code="N"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-category-card="N02"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-subdivision-code="N02A"]')).toBeVisible();
  await expect(page.locator('#metricClassified')).toHaveText('3,920');
  await expect(page.locator('#metricUnclassified')).toHaveText('83');
}

async function assertNoDocumentOverflow(page, label) {
  const g = await page.evaluate(() => ({ body:document.body.scrollWidth, html:document.documentElement.scrollWidth, viewport:innerWidth }));
  expect(g.body, `${label}: body overflow`).toBeLessThanOrEqual(g.viewport + 2);
  expect(g.html, `${label}: html overflow`).toBeLessThanOrEqual(g.viewport + 2);
}

for (const profile of [
  { name:'desktop', width:1440, height:1000 },
  { name:'tablet', width:820, height:1180 },
  { name:'mobile', width:390, height:844 },
]) {
  test(`${profile.name} ATC classification v2 visual audit`, async ({ page }) => {
    await openClassification(page, profile);
    await assertNoDocumentOverflow(page, profile.name);

    await expect(page.locator('#groupList [data-group-code]')).toHaveCount(14);
    await expect(page.locator('#categoryPanelTitle')).toContainText('Sistemi nervor');
    await expect(page.locator('[data-category-card="N02"] .category-count')).toHaveText('126');
    await expect(page.locator('[data-category-card="N02"] a[href="/index.html?atc=N02"]')).toBeVisible();
    await expect(page.locator('[data-subdivision-code="N02A"].subdivision-parent')).toBeVisible();
    await expect(page.locator('[data-subdivision-code="N02AA"].subdivision-child')).toBeVisible();
    await expect(page.locator('#atcPathItems [data-path-code="N"]')).toBeVisible();
    await expect(page.locator('#atcPathItems [data-path-code="N02"]')).toHaveClass(/is-current/);
    await expect(page.locator('#atcPathRegistry')).toHaveAttribute('href', '/index.html?atc=N02');

    await page.locator('#atcSearch').fill('dhimbje');
    await expect(page.locator('[data-search-code="N02"]')).toBeVisible();
    await expect(page.locator('[data-search-code="N02"] .search-result-meta')).toContainText('126 barna');
    await page.locator('#atcSearch').press('ArrowDown');
    await expect(page.locator('[data-search-code="N02"]')).toBeFocused();
    await page.locator('#atcSearch').focus();
    await page.locator('#atcSearch').fill('diabet');
    await expect(page.locator('#searchResultsView')).toBeVisible();
    await expect(page.locator('[data-search-code="A10"]')).toBeVisible();
    await page.locator('[data-search-code="A10"]').click();
    await expect(page).toHaveURL(/#A10$/);
    await expect(page.locator('[data-category-card="A10"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-subdivision-code="A10A"]')).toBeVisible();

    if (profile.width < 940) {
      const mobileRail = await page.locator('#groupList').evaluate(node => ({
        display:getComputedStyle(node).display,
        overflowX:getComputedStyle(node).overflowX,
        scrollWidth:node.scrollWidth,
        clientWidth:node.clientWidth,
      }));
      expect(mobileRail.display).toBe('flex');
      expect(['auto','scroll']).toContain(mobileRail.overflowX);
      expect(mobileRail.scrollWidth).toBeGreaterThan(mobileRail.clientWidth);

      await page.locator('#menuButton').click();
      await expect(page.locator('#sidebar')).toHaveClass(/is-open/);
      await expect(page.locator('#sidebarBackdrop')).toBeVisible();
      await page.locator('#sidebarClose').click();
    }

    await page.screenshot({ path:path.join(OUTPUT, `${profile.name}-classification-v2.png`), fullPage:true });
  });
}
