const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';
const VIEWPORTS = {
  phone:{ width:390, height:844 },
  tablet:{ width:820, height:1180 },
  laptop13:{ width:1366, height:768 },
  desktopLarge:{ width:1920, height:1080 },
};

async function installPerfProbe(page) {
  await page.addInitScript(() => {
    const state = {
      cls:0,
      shifts:[],
      events:[],
      longTasks:[],
      resetAt:performance.now(),
    };
    window.__miPhase5Metrics = state;
    window.__miPhase5Reset = () => {
      state.cls = 0;
      state.shifts.length = 0;
      state.events.length = 0;
      state.longTasks.length = 0;
      state.resetAt = performance.now();
    };
    try {
      const clsObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          state.cls += entry.value || 0;
          state.shifts.push(entry.value || 0);
        }
      });
      clsObserver.observe({ type:'layout-shift', buffered:true });
    } catch {}
    try {
      const eventObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 16) state.events.push({ name:entry.name, duration:entry.duration });
        }
      });
      eventObserver.observe({ type:'event', buffered:true, durationThreshold:16 });
    } catch {}
    try {
      const longTaskObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration || 0);
      });
      longTaskObserver.observe({ type:'longtask', buffered:true });
    } catch {}
  });
}

async function openReady(page, path = '/index.html') {
  await page.goto(`${BASE}${path}`, { waitUntil:'domcontentloaded' });
  await expect.poll(
    () => page.evaluate(() => document.documentElement.classList.contains('auth-ready')),
    { timeout:12000, message:`${path}: auth shell not ready` }
  ).toBe(true);
  await expect(page.locator('.mi-app-shell')).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mi-p5-touch-target').trim()),
    { timeout:5000 }
  ).toBe('44px');
}

async function waitRegistry(page) {
  await expect.poll(
    () => page.locator('#tbody > tr').count(),
    { timeout:20000, message:'registry rows did not render' }
  ).toBeGreaterThan(0);
  await expect(page.locator('#search')).toBeVisible();
}

async function documentGeometry(page) {
  return page.evaluate(() => ({
    width:innerWidth,
    height:innerHeight,
    htmlScrollWidth:document.documentElement.scrollWidth,
    bodyScrollWidth:document.body.scrollWidth,
    mainWidth:document.querySelector('.mi-main')?.getBoundingClientRect().width || 0,
  }));
}

async function metrics(page) {
  return page.evaluate(() => {
    const state = window.__miPhase5Metrics || { cls:0, events:[], longTasks:[], shifts:[] };
    return {
      cls:state.cls,
      maxEvent:Math.max(0, ...state.events.map(item => item.duration || 0)),
      maxLongTask:Math.max(0, ...state.longTasks),
      eventCount:state.events.length,
      longTaskCount:state.longTasks.length,
      shiftCount:state.shifts.length,
      elapsed:performance.now() - (state.resetAt || performance.now()),
    };
  });
}

async function resetMetrics(page) {
  await page.evaluate(() => window.__miPhase5Reset?.());
}

async function expectTouchTarget(locator, minimum = 44) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(minimum - .5);
  expect(box.height).toBeGreaterThanOrEqual(minimum - .5);
}

async function measuredAction(page, label, action) {
  const started = Date.now();
  await action();
  const duration = Date.now() - started;
  console.log(`PHASE5_ACTION ${label} ${duration}ms`);
  expect(duration, `${label} interaction wall time`).toBeLessThanOrEqual(900);
  return duration;
}

test.describe('Phase 5 responsive interaction contract', () => {
  test.use({ serviceWorkers:'allow' });

  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`${name} has stable geometry and fast primary interactions`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await installPerfProbe(page);
      await openReady(page);
      await waitRegistry(page);

      const geometry = await documentGeometry(page);
      expect(geometry.htmlScrollWidth, `${name}: html overflow`).toBeLessThanOrEqual(geometry.width + 1);
      expect(geometry.bodyScrollWidth, `${name}: body overflow`).toBeLessThanOrEqual(geometry.width + 1);
      expect(geometry.mainWidth, `${name}: main width`).toBeLessThanOrEqual(geometry.width + 1);

      await resetMetrics(page);

      if (viewport.width < 1024) {
        await expectTouchTarget(page.locator('[data-mi-sidebar-toggle]').first());
        await expectTouchTarget(page.locator('[data-mi-mobile-search]').first());
        await expectTouchTarget(page.locator('.mi-topbar [data-mi-theme-toggle]').first());
      }

      await measuredAction(page, `${name}: keyboard search`, async () => {
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
        await expect(page.locator('#search')).toBeFocused();
      });
      await page.locator('#search').fill('paracetamol');
      await expect(page.locator('#tbody > tr')).not.toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('#search')).toHaveValue('');

      const themeButton = page.locator('.mi-topbar [data-mi-theme-toggle]').first();
      const oldTheme = await page.locator('html').getAttribute('data-theme');
      await measuredAction(page, `${name}: theme toggle`, async () => {
        await themeButton.click();
        await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe(oldTheme);
      });

      const after = await metrics(page);
      console.log(`PHASE5_METRICS ${name} ${JSON.stringify(after)}`);
      expect(after.cls, `${name}: post-ready CLS`).toBeLessThanOrEqual(.02);
      expect(after.maxEvent, `${name}: max Event Timing duration`).toBeLessThanOrEqual(350);
      expect(after.maxLongTask, `${name}: max long task`).toBeLessThanOrEqual(500);
    });
  }

  test('13-inch laptop keeps one bounded horizontal table scroller and keyboard access', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.laptop13);
    await installPerfProbe(page);
    await openReady(page);
    await waitRegistry(page);

    const wrap = page.locator('.table-wrap');
    await expect(wrap).toBeVisible();
    const before = await wrap.evaluate(node => ({
      clientWidth:node.clientWidth,
      scrollWidth:node.scrollWidth,
      scrollLeft:node.scrollLeft,
      overflowX:getComputedStyle(node).overflowX,
      overscroll:getComputedStyle(node).overscrollBehaviorX,
      tabindex:node.getAttribute('tabindex'),
    }));
    expect(before.overflowX).toBe('auto');
    expect(before.overscroll).toBe('contain');
    if (before.scrollWidth > before.clientWidth + 2) {
      expect(before.tabindex).toBe('0');
      await wrap.focus();
      await expect(wrap).toBeFocused();
      await wrap.evaluate(node => { node.scrollLeft = Math.max(80, Math.round((node.scrollWidth - node.clientWidth) / 2)); });
      await expect.poll(() => wrap.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
      const pageOverflow = await documentGeometry(page);
      expect(pageOverflow.htmlScrollWidth).toBeLessThanOrEqual(pageOverflow.width + 1);
      expect(pageOverflow.bodyScrollWidth).toBeLessThanOrEqual(pageOverflow.width + 1);
    }

    await page.locator('#search').focus();
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => ({
      tag:document.activeElement?.tagName || '',
      id:document.activeElement?.id || '',
      role:document.activeElement?.getAttribute?.('role') || '',
    }));
    expect(active.tag).not.toBe('BODY');
  });

  test('dark mode does not change registry geometry', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktopLarge);
    await installPerfProbe(page);
    await openReady(page);
    await waitRegistry(page);

    const measure = () => page.evaluate(() => {
      const table = document.querySelector('.table-wrap')?.getBoundingClientRect();
      const toolbar = document.querySelector('.toolbar')?.getBoundingClientRect();
      return {
        tableWidth:table?.width || 0,
        toolbarWidth:toolbar?.width || 0,
        bodyWidth:document.body.scrollWidth,
      };
    });
    const light = await measure();
    await resetMetrics(page);
    await page.locator('.mi-topbar [data-mi-theme-toggle]').first().click();
    const dark = await measure();
    expect(Math.abs(light.tableWidth - dark.tableWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(light.toolbarWidth - dark.toolbarWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(light.bodyWidth - dark.bodyWidth)).toBeLessThanOrEqual(1);
    const result = await metrics(page);
    expect(result.cls).toBeLessThanOrEqual(.01);
  });
});

test.describe('Phase 5 constrained-network contract', () => {
  test.use({ serviceWorkers:'block', viewport:VIEWPORTS.laptop13 });

  test('slow connection keeps the shell usable and avoids document overflow', async ({ page, context }) => {
    await installPerfProbe(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline:false,
      latency:180,
      downloadThroughput:187500,
      uploadThroughput:93750,
      connectionType:'cellular3g',
    });

    const started = Date.now();
    await openReady(page);
    const readyMs = Date.now() - started;
    console.log(`PHASE5_LOW_BANDWIDTH_READY ${readyMs}ms`);
    expect(readyMs).toBeLessThanOrEqual(18000);

    const geometry = await documentGeometry(page);
    expect(geometry.htmlScrollWidth).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.width + 1);

    const primary = page.locator('.mi-primary-action').first();
    await expect(primary).toBeVisible();
    await primary.focus();
    await expect(primary).toBeFocused();

    await cdp.send('Network.emulateNetworkConditions', {
      offline:false,
      latency:0,
      downloadThroughput:-1,
      uploadThroughput:-1,
      connectionType:'none',
    });
  });
});
