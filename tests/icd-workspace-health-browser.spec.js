const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/icd-visual';
fs.mkdirSync(OUTPUT, { recursive:true });

const source = {
  type:'google-sheet',
  status:'live',
  visibility:'public-link',
  loadedAt:'2026-08-02T11:45:00.000Z',
  revision:'workspacehealth1234567890',
  csvBytes:4106422,
};

async function installMetaRoute(page, controls = {}) {
  controls.requests = 0;
  controls.failuresRemaining = Number(controls.failuresRemaining || 0);
  await page.route('**/api/icd**', async route => {
    const url = new URL(route.request().url());
    if (
      url.pathname !== '/api/icd'
      || (url.searchParams.get('view') || 'table') !== 'meta'
      || url.searchParams.get('advanced') === '1'
    ) return route.continue();

    controls.requests += 1;
    if (controls.failuresRemaining > 0) {
      controls.failuresRemaining -= 1;
      return route.fulfill({
        status:503,
        contentType:'application/json; charset=utf-8',
        body:JSON.stringify({ ok:false, data:null, error:'temporary source failure' }),
      });
    }
    return route.fulfill({
      status:200,
      contentType:'application/json; charset=utf-8',
      body:JSON.stringify({
        ok:true,
        data:{
          meta:{
            version:'ICD-10-WHO 2019',
            counts:{ chapter:22, block:274, category:2050, subcategory:10196, total:12542 },
            source,
          },
        },
      }),
      headers:{
        'X-MedIndex-ICD-Source-State':'live',
        'X-MedIndex-ICD-Revision':source.revision,
      },
    });
  });
}

async function openWorkspace(page) {
  await page.goto(`${BASE}/icd.html`, { waitUntil:'domcontentloaded' });
  const html = page.locator('html');
  await expect(html).toHaveClass(/auth-ready/);
  await expect(html).toHaveAttribute('data-mi-icd-tree', 'ready');
  await expect(html).toHaveAttribute('data-mi-icd-search', 'sq-clinical-search-v3');
  await expect(page.locator('#icdSourceHealth')).toHaveAttribute('data-state', 'live');
}

test('workspace source health preserves live metadata and cached context offline', async ({ page, context }) => {
  await page.setViewportSize({ width:390, height:844 });
  const controls = {};
  await installMetaRoute(page, controls);
  await openWorkspace(page);

  const health = page.locator('#icdSourceHealth');
  const badge = page.locator('#icdSourceStatus');
  const detail = page.locator('#icdSourceHealthDetail');
  await expect(badge).toHaveText('Burimi: live');
  await expect(detail).toContainText('Revizioni workspacehealth1234567890');

  const geometry = await health.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {
      left:rect.left,
      right:rect.right,
      viewport:innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(health).toHaveAttribute('data-state', 'offline');
  await expect(badge).toHaveText('Burimi: pa rrjet');
  await expect(detail).toContainText('cache lokal');
  await expect(page.locator('#icdTree')).toHaveAttribute('aria-busy', 'false');
  await page.screenshot({ path:path.join(OUTPUT, 'icd-workspace-health-offline-mobile.png'), fullPage:true });

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(health).toHaveAttribute('data-state', 'live');
  await expect(badge).toHaveText('Burimi: live');
  expect(controls.requests).toBeGreaterThanOrEqual(2);
});

test('manual source refresh performs one bounded retry and keeps the tree usable', async ({ page }) => {
  const controls = {};
  await installMetaRoute(page, controls);
  await openWorkspace(page);

  const health = page.locator('#icdSourceHealth');
  const refresh = page.locator('#icdSourceHealthRefresh');
  const initialRequests = controls.requests;
  controls.failuresRemaining = 1;

  await page.evaluate(() => {
    window.__icdWorkspaceRetryEvents = [];
    window.addEventListener('medindex:icd-workspace-source-health', event => {
      if (event.detail?.state === 'retrying') window.__icdWorkspaceRetryEvents.push(event.detail);
    });
  });
  await refresh.click();
  await expect(health).toHaveAttribute('data-state', 'live', { timeout:8000 });
  await expect(refresh).toBeEnabled();
  await expect(page.locator('#icdTree')).toHaveAttribute('aria-busy', 'false');

  expect(controls.requests - initialRequests).toBe(2);
  const retryEvents = await page.evaluate(() => window.__icdWorkspaceRetryEvents || []);
  expect(retryEvents).toHaveLength(1);
  expect(retryEvents[0].status).toBe(503);
});
