'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MOBILE_INTERACTION_PORT || 4183);
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.env.MOBILE_INTERACTION_SKIP_BUILD === '1';
const PAGE_DELAY_MS = Number(process.env.MOBILE_INTERACTION_PAGE_DELAY_MS || 40);
const DETAIL_DELAY_MS = Number(process.env.MOBILE_INTERACTION_DETAIL_DELAY_MS || 120);

function runBuild() {
  if (SKIP_BUILD) return;
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(command, ['run', 'build:runtime'], {
    cwd:ROOT,
    stdio:'inherit',
    env:process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`build:runtime failed with exit code ${result.status}.`);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'registry-performance-server.js')], {
      cwd:ROOT,
      env:{ ...process.env, PERFORMANCE_PORT:String(PORT) },
      stdio:['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    let stderr = '';
    const timeout = setTimeout(() => {
      if (ready) return;
      child.kill('SIGTERM');
      reject(new Error(`Mobile interaction fixture server did not start. ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      process.stdout.write(`[mobile-interaction-server] ${chunk}`);
      if (!ready && /Registry performance server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(`[mobile-interaction-server] ${chunk}`);
    });
    child.once('exit', code => {
      if (ready) return;
      clearTimeout(timeout);
      reject(new Error(`Mobile interaction fixture server exited early (${code}). ${stderr}`));
    });
  });
}

const FIXTURE_ROWS = Array.from({ length:75 }, (_, index) => {
  const number = index + 1;
  return {
    id:`interaction-${number}`,
    registryNumber:String(number),
    pdid:String(97000 + number),
    tradeName:number === 30 ? 'INTERACTION TARGET 30' : `INTERACTION DRUG ${String(number).padStart(2, '0')}`,
    activeSubstance:number === 30 ? 'Paracetamol' : `Substance ${number}`,
    atc:number === 30 ? 'N02BE01' : `A${String((number % 90) + 10).padStart(2, '0')}AA01`,
    strength:`${(number % 9) + 1}00 mg`,
    form:number % 3 === 0 ? 'Capsule' : 'Tablet',
    productStatus:number % 5 === 0 ? 'Origjinator' : 'Gjenerik',
    drugClass:`Interaction class ${number % 7}`,
    use:`Interaction indication ${number}`,
    packaging:`${10 + (number % 20)} tablets`,
    manufacturer:`Manufacturer ${number % 5}`,
    marketingAuthorizationHolder:`MAH ${number % 4}`,
    retailPrice:`${(1 + number / 100).toFixed(2)} €`,
    validity:'31.12.2026',
  };
});

function clean(value) {
  return String(value ?? '').trim().toLowerCase();
}

function filterRows(url) {
  const q = clean(url.searchParams.get('q'));
  const status = clean(url.searchParams.get('status'));
  let rows = FIXTURE_ROWS;
  if (status) rows = rows.filter(row => clean(row.productStatus) === status);
  if (q) {
    rows = rows.filter(row => [row.tradeName, row.activeSubstance, row.atc, row.form]
      .some(value => clean(value).includes(q)));
  }
  return rows;
}

async function installApi(page, requestLog) {
  await page.route('**/api/drug-search**', async route => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get('view') || '';
    requestLog.push({
      view,
      page:Number(url.searchParams.get('page') || 0),
      pageSize:Number(url.searchParams.get('pageSize') || 0),
      q:url.searchParams.get('q') || '',
      status:url.searchParams.get('status') || '',
      includeTotal:url.searchParams.get('includeTotal') || '',
      at:Date.now(),
    });

    if (view === 'registry-page') {
      const filtered = filterRows(url);
      const pageNumber = Math.max(1, Number(url.searchParams.get('page') || 1));
      const pageSize = Math.max(1, Math.min(50, Number(url.searchParams.get('pageSize') || 25)));
      const start = (pageNumber - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      const includeTotal = url.searchParams.get('includeTotal') === '1';
      const pagination = {
        page:pageNumber,
        pageSize,
        hasNext:start + pageSize < filtered.length,
      };
      if (includeTotal) {
        pagination.total = filtered.length;
        pagination.totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      }
      await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS));
      await route.fulfill({
        status:200,
        contentType:'application/json; charset=utf-8',
        headers:{ 'Cache-Control':'private, max-age=30, stale-while-revalidate=120' },
        body:JSON.stringify({ ok:true, rows:items, pagination }),
      });
      return;
    }

    if (view === 'registry-detail') {
      const id = url.searchParams.get('id') || '';
      const row = FIXTURE_ROWS.find(item => item.id === id) || null;
      await new Promise(resolve => setTimeout(resolve, DETAIL_DELAY_MS));
      await route.fulfill({
        status:row ? 200 : 404,
        contentType:'application/json; charset=utf-8',
        body:JSON.stringify(row ? { ok:true, row } : { ok:false, error:'not-found' }),
      });
      return;
    }

    await route.fulfill({
      status:200,
      contentType:'application/json; charset=utf-8',
      body:JSON.stringify({ ok:true, results:[] }),
    });
  });

  await page.route('**/api/atc-counts**', route => route.fulfill({
    status:200,
    contentType:'application/json; charset=utf-8',
    body:JSON.stringify({ ok:true, counts:{} }),
  }));
}

const PROBE_INTERVAL_MS = 50;

async function installPerfProbe(page, intervalMs) {
  await page.addInitScript(interval => {
    const state = {
      lastTick:performance.now(),
      maxGap:0,
      gaps:[],
      // Every tick that overran its schedule, timestamped, so a gap can be
      // attributed to the interaction that produced it instead of being read as
      // one anonymous number for the whole run.
      timeline:[],
      marks:[],
      longTasks:[],
      longTaskApiSupported:false,
      resizeEvents:0,
      scrollEvents:0,
    };
    window.__medindexMobileInteractionProbe = state;
    window.__resetMobileInteractionProbe = () => {
      state.lastTick = performance.now();
      state.maxGap = 0;
      state.gaps.length = 0;
      state.timeline.length = 0;
      state.marks.length = 0;
      state.longTasks.length = 0;
      state.resizeEvents = 0;
      state.scrollEvents = 0;
    };
    window.__markMobileInteractionPhase = label => {
      state.marks.push({ label:String(label), at:performance.now() });
    };
    setInterval(() => {
      const now = performance.now();
      const gap = now - state.lastTick;
      state.lastTick = now;
      state.maxGap = Math.max(state.maxGap, gap);
      if (gap > interval + 10) state.timeline.push({ at:now, gap:Math.round(gap * 10) / 10 });
      if (gap > 80) state.gaps.push(Math.round(gap * 10) / 10);
    }, interval);
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration || 0);
      });
      observer.observe({ type:'longtask', buffered:true });
      // WebKit does not implement the Long Tasks API. Recording whether the
      // observer was actually accepted keeps an empty list from being mistaken
      // for a clean main thread.
      state.longTaskApiSupported = (PerformanceObserver.supportedEntryTypes || []).includes('longtask');
    } catch {}
    window.addEventListener('resize', () => { state.resizeEvents += 1; }, { passive:true });
    window.addEventListener('scroll', () => { state.scrollEvents += 1; }, { passive:true, capture:true });
  }, intervalMs);
}

// The longest the page's own code held the main thread inside a phase. A tick
// that fires `intervalMs` late was never blocked; anything beyond that is time
// the event loop could not run, which is what a user feels as jank.
function blockingWithin(probe, startLabel, endLabel, intervalMs) {
  const start = probe.marks.find(mark => mark.label === startLabel);
  const end = probe.marks.find(mark => mark.label === endLabel);
  if (!start || !end) return null;
  const inside = probe.timeline.filter(tick => tick.at > start.at && tick.at <= end.at + intervalMs);
  return Math.max(0, Math.round(Math.max(0, ...inside.map(tick => tick.gap - intervalMs))));
}

function elapsed(startedAt) {
  return Date.now() - startedAt;
}

async function waitForRequestCount(requestLog, predicate, minimum, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const count = requestLog.filter(predicate).length;
    if (count >= minimum) return count;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for request count >= ${minimum}.`);
}

(async () => {
  runBuild();
  const server = await startServer();
  const browser = await webkit.launch({ headless:true });
  try {
    const context = await browser.newContext({
      viewport:{ width:390, height:844 },
      serviceWorkers:'block',
      isMobile:true,
      hasTouch:true,
    });
    const page = await context.newPage();
    const requestLog = [];
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

    await installPerfProbe(page, PROBE_INTERVAL_MS);
    await installApi(page, requestLog);

    const navigationStarted = Date.now();
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-card').first().waitFor({ state:'visible', timeout:10000 });
    const firstCardsReadyMs = elapsed(navigationStarted);

    // Rows and counts are separate reads: the page request carries rows only,
    // and the exact total follows in its own one-row request so the register can
    // paint without it. Request budgets below are counted per kind, otherwise a
    // count landing a few milliseconds earlier or later reads as a duplicate.
    const registryPageRequests = () => requestLog.filter(item => item.view === 'registry-page');
    const rowRequests = () => registryPageRequests().filter(item => item.includeTotal !== '1');
    const countRequests = () => registryPageRequests().filter(item => item.includeTotal === '1');

    assert.equal(rowRequests().length, 1, 'Initial phone startup made duplicate registry-page requests.');
    assert.equal(requestLog.some(item => item.view === 'registry-detail'), false, 'Phone startup fetched medicine detail before user intent.');

    await page.evaluate(() => window.__resetMobileInteractionProbe?.());

    const search = page.locator('#search');
    const searchRowsBefore = rowRequests().length;
    const searchCountsBefore = countRequests().length;
    // `typingDispatchMs` is wall-clock around a single inspector-protocol call.
    // `fill` is one round trip that sets the value and dispatches one input
    // event; almost all of that number is the driver, not the page, which is why
    // it drifts past a 180ms budget on a loaded runner while the app is
    // unchanged. It is kept, reported, and guarded only against an outright hang.
    //
    // `typingBlockingMs` is what a doctor actually feels: the longest the page's
    // own input handlers held the main thread. That is the responsiveness gate.
    await page.evaluate(() => window.__markMobileInteractionPhase?.('typing:start'));
    const typingStarted = Date.now();
    await search.fill('INTERACTION TARGET 30');
    const typingDispatchMs = elapsed(typingStarted);
    await page.evaluate(() => window.__markMobileInteractionPhase?.('typing:end'));
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.q === 'INTERACTION TARGET 30', 1);
    await page.locator('#tbody .mobile-lite-card').filter({ hasText:'INTERACTION TARGET 30' }).waitFor({ state:'visible', timeout:3000 });
    assert.match(await page.locator('#tbody').innerText(), /INTERACTION TARGET 30/);
    const searchSettleMs = elapsed(typingStarted);
    assert.equal(rowRequests().length - searchRowsBefore, 1, 'One settled search term should produce exactly one registry-page request.');
    assert.equal(countRequests().length - searchCountsBefore, 0, 'A search term must not be counted exactly while the doctor is still typing.');

    const clearStarted = Date.now();
    await search.fill('');
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.q === '' && item.includeTotal === '1', 2);
    await page.locator('#pagination [data-mobile-lite-page-number="1"][aria-current="page"]').waitFor({ state:'visible', timeout:3000 });
    const clearSearchSettleMs = elapsed(clearStarted);

    const statusRowsBefore = rowRequests().length;
    const statusCountsBefore = countRequests().length;
    const statusStarted = Date.now();
    // The compact phone UI owns the visible filter sheet; this audit targets
    // the underlying lightweight status interaction and its request budget.
    await page.locator('#statusFilter').selectOption('Origjinator', { force:true });
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.status === 'Origjinator', 1);
    await page.locator('#countBadge').filter({ hasText:'15 barna' }).waitFor({ state:'visible', timeout:3000 });
    assert.match(await page.locator('#countBadge').innerText(), /15 barna/);
    const statusSettleMs = elapsed(statusStarted);
    assert.equal(rowRequests().length - statusRowsBefore, 1, 'Status change should produce exactly one registry-page request.');
    assert.equal(countRequests().length - statusCountsBefore, 1, 'A settled status filter may be counted exactly once.');

    await page.locator('#statusFilter').selectOption('', { force:true });
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.status === '' && item.includeTotal === '1', 3);
    await page.locator('#countBadge').filter({ hasText:'75 barna' }).waitFor({ state:'visible', timeout:3000 });
    await page.locator('#pagination [data-mobile-lite-page="next"]').waitFor({ state:'visible' });

    const paginationRowsBefore = rowRequests().length;
    const paginationCountsBefore = countRequests().length;
    const paginationStarted = Date.now();
    await page.locator('#pagination [data-mobile-lite-page="next"]').click();
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.page === 2, 1);
    await page.locator('#pagination [data-mobile-lite-page-number="2"][aria-current="page"]').waitFor({ state:'visible', timeout:3000 });
    assert.equal(await page.locator('#pagination [data-mobile-lite-page-number="2"][aria-current="page"]').innerText(), '2');
    const paginationSettleMs = elapsed(paginationStarted);
    assert.equal(rowRequests().length - paginationRowsBefore, 1, 'Pagination should produce exactly one registry-page request.');
    assert.equal(countRequests().length - paginationCountsBefore, 0, 'Turning a page must reuse the count already known.');

    const more = page.locator('#tbody .mobile-lite-more').first();
    const detailBefore = requestLog.filter(item => item.view === 'registry-detail').length;
    const detailStarted = Date.now();
    // Measure application feedback from event dispatch, not Playwright's
    // actionability/scroll bookkeeping (physical taps are covered separately).
    await more.dispatchEvent('click');
    await page.locator('#mobileLiteDrugDetail').waitFor({ state:'visible', timeout:1000 });
    await page.locator('#mobileLiteDrugDetail .mobile-lite-detail-loading').waitFor({ state:'visible', timeout:1000 });
    const detailLoadingVisibleMs = elapsed(detailStarted);
    await waitForRequestCount(requestLog, item => item.view === 'registry-detail', detailBefore + 1);
    await page.locator('#mobileLiteDrugDetail .mobile-lite-detail-hero').waitFor({ state:'visible', timeout:3000 });
    const detailSettleMs = elapsed(detailStarted);
    const detailAfter = requestLog.filter(item => item.view === 'registry-detail').length;
    assert.equal(detailAfter - detailBefore, 1, 'Opening one medicine detail should produce exactly one detail request.');

    const closeButton = page.locator('#mobileLiteDrugDetail .mobile-lite-detail-head [data-mobile-lite-close]');
    const closeStarted = Date.now();
    await closeButton.dispatchEvent('click');
    await page.locator('#mobileLiteDrugDetail').waitFor({ state:'hidden', timeout:1000 });
    await page.waitForTimeout(40);
    const detailCloseMs = elapsed(closeStarted);
    assert.equal(await more.getAttribute('aria-expanded'), 'false', 'Detail trigger aria-expanded did not reset on close.');

    // The 40ms above is a settle, not a guarantee. Focus restoration runs in a
    // task the runner schedules, and on a loaded runner that task can land after
    // the settle expires — failing a page that does restore focus. Wait for the
    // condition instead, bounded, so this still fails a page that never restores
    // it. What is asserted does not change; only the racing does.
    const moreHandle = await more.elementHandle();
    await page.waitForFunction(node => document.activeElement === node, moreHandle, { timeout:1500 })
      .catch(() => {});
    assert.equal(await more.evaluate(node => document.activeElement === node), true, 'Focus was not restored to the “Më shumë” trigger after close.');

    const main = page.locator('.mi-main');
    const scrollStarted = Date.now();
    await main.evaluate(async node => {
      const limit = Math.max(0, node.scrollHeight - node.clientHeight);
      for (let step = 1; step <= 8; step += 1) {
        node.scrollTop = Math.round(limit * (step / 8));
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
      }
    });
    const scrollSequenceMs = elapsed(scrollStarted);

    // Two numbers come out of the resize sequence and they answer different
    // questions.
    //
    // `resizeSequenceMs` is wall-clock time across four inspector-protocol round
    // trips plus WebKit's own viewport pipeline. A phone pays none of that, so it
    // is reported and guarded only against an outright hang.
    //
    // `resizeBlockingMs` is what a user actually feels: the longest the page's own
    // resize handlers held the main thread. That is the responsiveness gate, and
    // it is far tighter than the wall clock it replaces — 650ms of protocol time
    // could hide hundreds of milliseconds of real jank.
    await page.evaluate(() => window.__markMobileInteractionPhase?.('resize:start'));
    const resizeStarted = Date.now();
    await page.setViewportSize({ width:430, height:844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.setViewportSize({ width:375, height:812 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const resizeSequenceMs = elapsed(resizeStarted);
    await page.evaluate(() => window.__markMobileInteractionPhase?.('resize:end'));
    const overflow = await page.evaluate(() => ({
      width:innerWidth,
      html:document.documentElement.scrollWidth,
      body:document.body.scrollWidth,
    }));
    assert.ok(overflow.html <= overflow.width + 1, `Resize introduced documentElement overflow (${overflow.html} > ${overflow.width}).`);
    assert.ok(overflow.body <= overflow.width + 1, `Resize introduced body overflow (${overflow.body} > ${overflow.width}).`);

    const probe = await page.evaluate(() => ({ ...window.__medindexMobileInteractionProbe }));
    const resizeBlockingMs = blockingWithin(probe, 'resize:start', 'resize:end', PROBE_INTERVAL_MS);
    const typingBlockingMs = blockingWithin(probe, 'typing:start', 'typing:end', PROBE_INTERVAL_MS);
    const registryRequests = requestLog.filter(item => item.view === 'registry-page');
    const detailRequests = requestLog.filter(item => item.view === 'registry-detail');

    const report = {
      generatedAt:new Date().toISOString(),
      firstCardsReadyMs,
      typingDispatchMs,
      searchSettleMs,
      clearSearchSettleMs,
      statusSettleMs,
      paginationSettleMs,
      detailLoadingVisibleMs,
      detailSettleMs,
      detailCloseMs,
      scrollSequenceMs,
      resizeSequenceMs,
      resizeBlockingMs,
      typingBlockingMs,
      probeIntervalMs:PROBE_INTERVAL_MS,
      pageDelayMs:PAGE_DELAY_MS,
      detailDelayMs:DETAIL_DELAY_MS,
      registryRequestCount:registryRequests.length,
      detailRequestCount:detailRequests.length,
      fullRegistryRequestCount:0,
      probe,
      requestLog,
      overflow,
      pageErrors,
    };
    console.log(`\nMOBILE_INTERACTION_PERF_REPORT ${JSON.stringify(report, null, 2)}\n`);

    assert.notEqual(typingBlockingMs, null, 'The typing phase markers did not reach the page, so typing blocking was never measured.');
    assert.ok(typingBlockingMs <= 150, `Search typing handlers blocked the main thread for ${typingBlockingMs}ms.`);
    assert.ok(typingDispatchMs <= 2500, `Typing into the search box never completed (${typingDispatchMs}ms) — this guard catches a hang, not sluggishness.`);
    assert.ok(searchSettleMs <= 750, `Debounced search did not repaint quickly enough (${searchSettleMs}ms).`);
    assert.ok(clearSearchSettleMs <= 750, `Clearing search did not repaint quickly enough (${clearSearchSettleMs}ms).`);
    assert.ok(statusSettleMs <= 500, `Status filter did not repaint quickly enough (${statusSettleMs}ms).`);
    assert.ok(paginationSettleMs <= 500, `Pagination did not repaint quickly enough (${paginationSettleMs}ms).`);
    assert.ok(detailLoadingVisibleMs <= 220, `“Më shumë” did not show immediate loading feedback (${detailLoadingVisibleMs}ms).`);
    assert.ok(detailSettleMs <= DETAIL_DELAY_MS + 450, `Medicine detail added excessive client latency (${detailSettleMs}ms).`);
    assert.ok(detailCloseMs <= 250, `Medicine detail did not close responsively (${detailCloseMs}ms).`);
    assert.ok(scrollSequenceMs <= 500, `Eight-frame mobile scroll sequence was sluggish (${scrollSequenceMs}ms).`);
    assert.equal(probe.resizeEvents, 2, `Two viewport changes must produce two resize events, not a storm (${probe.resizeEvents}).`);
    assert.notEqual(resizeBlockingMs, null, 'The resize phase markers did not reach the page, so resize blocking was never measured.');
    // Tighter than the 220ms whole-run event-loop budget, and well inside it:
    // the observed cost of the two resize passes is ~90ms of blocking, so this
    // catches a regression without turning runner variance into a failure.
    assert.ok(resizeBlockingMs <= 150, `Mobile resize handlers blocked the main thread for ${resizeBlockingMs}ms.`);
    assert.ok(resizeSequenceMs <= 2500, `Two mobile resize passes never completed (${resizeSequenceMs}ms) — this guard catches a hang, not sluggishness.`);
    assert.ok(probe.maxGap <= 220, `Mobile interactions produced an excessive event-loop gap (${probe.maxGap}ms).`);
    // WebKit has no Long Tasks API, so an empty list there proves nothing and
    // must not be read as a pass.
    if (probe.longTaskApiSupported) {
      assert.ok(Math.max(0, ...probe.longTasks) <= 220, `Mobile interactions produced an excessive long task (${Math.max(0, ...probe.longTasks)}ms).`);
    }
    assert.deepEqual(pageErrors, [], `Mobile interaction audit saw runtime errors: ${JSON.stringify(pageErrors)}`);

    await context.close();
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Mobile interaction performance audit failed:', error);
  process.exitCode = 1;
});
