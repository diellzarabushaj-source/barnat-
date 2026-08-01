const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4174';
const ROW_COUNT = 4006;

function expectBoundedMetric(value, maximum, label) {
  expect(Number.isFinite(value), `${label} must be finite`).toBe(true);
  expect(value, `${label} exceeded ${maximum} ms`).toBeLessThanOrEqual(maximum);
}

test.describe('registry main-thread performance', () => {
  test.use({
    serviceWorkers:'block',
    viewport:{ width:1440, height:900 },
    actionTimeout:10000,
    navigationTimeout:30000,
  });

  test('4006 rows stay interactive on a slow registry and large dosage payload', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

    await page.addInitScript(() => {
      const state = {
        startedAt:performance.now(),
        lastTick:performance.now(),
        maxGap:0,
        gaps:[],
        longTasks:[],
      };
      window.__medindexPerfProbe = state;
      setInterval(() => {
        const now = performance.now();
        const gap = now - state.lastTick;
        state.lastTick = now;
        state.maxGap = Math.max(state.maxGap, gap);
        if (gap > 100) state.gaps.push(gap);
      }, 50);
      try {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
        });
        observer.observe({ type:'longtask', buffered:true });
      } catch {}
      window.__resetMedIndexPerfProbe = () => {
        state.startedAt = performance.now();
        state.lastTick = performance.now();
        state.maxGap = 0;
        state.gaps.length = 0;
        state.longTasks.length = 0;
      };
    });

    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
    await page.evaluate(() => window.__resetMedIndexPerfProbe?.());
    await expect.poll(
      () => page.evaluate(() => document.documentElement.classList.contains('auth-ready')),
      { timeout:10000, message:'authenticated shell did not become ready' }
    ).toBe(true);
    await expect(page.locator('.mi-app-shell')).toBeVisible();

    const themeButton = page.locator('.mi-topbar [data-mi-theme-toggle]').first();
    await expect(themeButton).toBeVisible();
    const originalTheme = await page.locator('html').getAttribute('data-theme');
    const interactionStarted = Date.now();
    await themeButton.click();
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe(originalTheme);
    const interactionLatency = Date.now() - interactionStarted;
    expectBoundedMetric(interactionLatency, 1200, 'shell interaction latency while registry is loading');

    await expect.poll(
      () => page.evaluate(expected => Array.isArray(window.MEDINDEX_REGISTRY_ROWS)
        && window.MEDINDEX_REGISTRY_ROWS.length === expected, ROW_COUNT),
      { timeout:30000, message:'all registry rows did not load' }
    ).toBe(true);
    await expect.poll(
      () => page.evaluate(() => window.MEDINDEX_APP_VERSION === 'clinical-audit-v5-performance-runtime'),
      { timeout:10000, message:'performance runtime did not become active' }
    ).toBe(true);
    await expect(page.locator('#countBadge')).toContainText('4006');
    await expect(page.locator('#tbody > tr')).toHaveCount(50);

    const registryMetrics = await page.evaluate(() => {
      const state = window.__medindexPerfProbe;
      return {
        maxGap:state.maxGap,
        maxLongTask:Math.max(0, ...state.longTasks),
        gapCount:state.gaps.length,
        elapsed:performance.now() - state.startedAt,
      };
    });
    console.log(`REGISTRY_MAIN_THREAD_METRICS ${JSON.stringify(registryMetrics)}`);
    expectBoundedMetric(registryMetrics.maxGap, 1800, 'maximum event-loop gap during registry startup');
    expectBoundedMetric(registryMetrics.maxLongTask, 1800, 'maximum long task during registry startup');

    const bodyState = await page.evaluate(() => ({
      bodyInert:Boolean(document.body.inert),
      htmlInert:Boolean(document.documentElement.inert),
      pointerEvents:getComputedStyle(document.body).pointerEvents,
      overflow:getComputedStyle(document.body).overflow,
      loadingClasses:[...document.documentElement.classList].filter(value => /loading/i.test(value)),
    }));
    expect(bodyState.bodyInert).toBe(false);
    expect(bodyState.htmlInert).toBe(false);
    expect(bodyState.pointerEvents).not.toBe('none');
    expect(bodyState.loadingClasses).toEqual([]);

    await page.locator('#search').fill('STRESS DRUG 3999');
    await expect(page.locator('#tbody > tr')).toHaveCount(1);
    await expect(page.locator('#tbody')).toContainText('STRESS DRUG 3999');

    await page.evaluate(() => window.__resetMedIndexPerfProbe?.());
    await expect.poll(
      () => page.evaluate(() => window.MedIndexRegistryDosageLoader?.loaded?.() === true),
      { timeout:15000, message:'dosage loader did not finish after registry readiness' }
    ).toBe(true);
    await expect.poll(
      () => page.evaluate(() => window.MedIndexRegistryDosage?.clinicalStatus?.() || 'pending'),
      { timeout:30000, message:'dosage clinical integration did not become ready' }
    ).toBe('ready');
    await page.locator('#search').fill('');
    await expect(page.locator('#tbody > tr')).toHaveCount(50);
    await expect(page.locator('#headerRow [data-registry-dosage-column]')).toHaveCount(2);

    const tableShape = await page.evaluate(() => {
      const headerKeys = [...document.querySelectorAll('#headerRow > th')]
        .map(cell => cell.dataset.registryColumnKey)
        .filter(Boolean);
      const rows = [...document.querySelectorAll('#tbody > tr')].filter(row => !row.querySelector('.empty-state'));
      const mismatches = rows.filter(row => {
        const keys = [...row.children].map(cell => cell.dataset.registryColumnKey).filter(Boolean);
        return keys.length !== headerKeys.length || keys.some((key, index) => key !== headerKeys[index]);
      }).length;
      return {
        headerKeys,
        rowCount:rows.length,
        mismatches,
        colgroups:document.querySelectorAll('#dataTable > colgroup').length,
        audit:window.MEDINDEX_REGISTRY_TABLE_AUDIT || null,
      };
    });
    expect(tableShape.rowCount).toBe(50);
    expect(tableShape.mismatches).toBe(0);
    expect(tableShape.colgroups).toBe(1);
    expect(tableShape.audit?.stable).toBe(true);

    const dosageMetrics = await page.evaluate(() => {
      const state = window.__medindexPerfProbe;
      return {
        maxGap:state.maxGap,
        maxLongTask:Math.max(0, ...state.longTasks),
        gapCount:state.gaps.length,
        elapsed:performance.now() - state.startedAt,
      };
    });
    console.log(`DOSAGE_MAIN_THREAD_METRICS ${JSON.stringify(dosageMetrics)}`);
    expectBoundedMetric(dosageMetrics.maxGap, 1800, 'maximum event-loop gap during dosage enrichment');
    expectBoundedMetric(dosageMetrics.maxLongTask, 1800, 'maximum long task during dosage enrichment');

    const dosageShape = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#tbody > tr')].filter(row => !row.querySelector('.empty-state'));
      return {
        rowCount:rows.length,
        minimumCells:Math.min(...rows.map(row => row.querySelectorAll('[data-registry-dosage-column]').length)),
        maximumCells:Math.max(...rows.map(row => row.querySelectorAll('[data-registry-dosage-column]').length)),
      };
    });
    expect(dosageShape.rowCount).toBe(50);
    expect(dosageShape.minimumCells).toBe(2);
    expect(dosageShape.maximumCells).toBe(2);

    const idleMutationCount = await page.evaluate(() => new Promise(resolve => {
      const target = document.getElementById('tbody');
      let count = 0;
      const observer = new MutationObserver(records => { count += records.length; });
      observer.observe(target, { childList:true, subtree:true, characterData:true });
      setTimeout(() => {
        observer.disconnect();
        resolve(count);
      }, 1500);
    }));
    expect(idleMutationCount, 'dosage integration entered a DOM mutation feedback loop').toBeLessThanOrEqual(8);

    const allowedErrors = pageErrors.filter(message => !/service worker|offline runtime/i.test(message));
    expect(allowedErrors).toEqual([]);
  });
});
