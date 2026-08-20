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

async function installPerfProbe(page) {
  await page.addInitScript(() => {
    const state = {
      lastTick:performance.now(),
      maxGap:0,
      gaps:[],
      longTasks:[],
      resizeEvents:0,
      scrollEvents:0,
    };
    window.__medindexMobileInteractionProbe = state;
    window.__resetMobileInteractionProbe = () => {
      state.lastTick = performance.now();
      state.maxGap = 0;
      state.gaps.length = 0;
      state.longTasks.length = 0;
      state.resizeEvents = 0;
      state.scrollEvents = 0;
    };
    setInterval(() => {
      const now = performance.now();
      const gap = now - state.lastTick;
      state.lastTick = now;
      state.maxGap = Math.max(state.maxGap, gap);
      if (gap > 80) state.gaps.push(Math.round(gap * 10) / 10);
    }, 50);
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) state.longTasks.push(entry.duration || 0);
      });
      observer.observe({ type:'longtask', buffered:true });
    } catch {}
    window.addEventListener('resize', () => { state.resizeEvents += 1; }, { passive:true });
    window.addEventListener('scroll', () => { state.scrollEvents += 1; }, { passive:true, capture:true });
  });
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

    await installPerfProbe(page);
    await installApi(page, requestLog);

    const navigationStarted = Date.now();
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-card').first().waitFor({ state:'visible', timeout:10000 });
    const firstCardsReadyMs = elapsed(navigationStarted);

    assert.equal(requestLog.filter(item => item.view === 'registry-page').length, 1, 'Initial phone startup made duplicate registry-page requests.');
    assert.equal(requestLog.some(item => item.view === 'registry-detail'), false, 'Phone startup fetched medicine detail before user intent.');

    await page.evaluate(() => window.__resetMobileInteractionProbe?.());

    const search = page.locator('#search');
    const searchRequestBefore = requestLog.filter(item => item.view === 'registry-page').length;
    const typingStarted = Date.now();
    await search.fill('INTERACTION TARGET 30');
    const typingDispatchMs = elapsed(typingStarted);
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.q === 'INTERACTION TARGET 30', 1);
    await page.locator('#tbody .mobile-lite-card').filter({ hasText:'INTERACTION TARGET 30' }).waitFor({ state:'visible', timeout:3000 });
    assert.match(await page.locator('#tbody').innerText(), /INTERACTION TARGET 30/);
    const searchSettleMs = elapsed(typingStarted);
    const searchRequestAfter = requestLog.filter(item => item.view === 'registry-page').length;
    assert.equal(searchRequestAfter - searchRequestBefore, 1, 'One settled search term should produce exactly one registry-page request.');

    const clearStarted = Date.now();
    await search.fill('');
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.q === '' && item.includeTotal === '1', 2);
    await page.locator('#pagination .mobile-lite-page-label').waitFor({ state:'visible', timeout:3000 });
    const clearSearchSettleMs = elapsed(clearStarted);

    const statusBefore = requestLog.filter(item => item.view === 'registry-page').length;
    const statusStarted = Date.now();
    // The compact phone UI owns the visible filter sheet; this audit targets
    // the underlying lightweight status interaction and its request budget.
    await page.locator('#statusFilter').selectOption('Origjinator', { force:true });
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.status === 'Origjinator', 1);
    await page.locator('#countBadge').filter({ hasText:'15 barna' }).waitFor({ state:'visible', timeout:3000 });
    assert.match(await page.locator('#countBadge').innerText(), /15 barna/);
    const statusSettleMs = elapsed(statusStarted);
    const statusAfter = requestLog.filter(item => item.view === 'registry-page').length;
    assert.equal(statusAfter - statusBefore, 1, 'Status change should produce exactly one registry-page request.');

    await page.locator('#statusFilter').selectOption('', { force:true });
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.status === '' && item.includeTotal === '1', 3);
    await page.locator('#countBadge').filter({ hasText:'75 barna' }).waitFor({ state:'visible', timeout:3000 });
    await page.locator('#pagination [data-mobile-lite-page="next"]').waitFor({ state:'visible' });

    const paginationBefore = requestLog.filter(item => item.view === 'registry-page').length;
    const paginationStarted = Date.now();
    await page.locator('#pagination [data-mobile-lite-page="next"]').click();
    await waitForRequestCount(requestLog, item => item.view === 'registry-page' && item.page === 2, 1);
    await page.locator('#pagination .mobile-lite-page-label').filter({ hasText:'Faqja 2' }).waitFor({ state:'visible', timeout:3000 });
    assert.match(await page.locator('#pagination .mobile-lite-page-label').innerText(), /Faqja 2/);
    const paginationSettleMs = elapsed(paginationStarted);
    const paginationAfter = requestLog.filter(item => item.view === 'registry-page').length;
    assert.equal(paginationAfter - paginationBefore, 1, 'Pagination should produce exactly one registry-page request.');

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

    const resizeStarted = Date.now();
    await page.setViewportSize({ width:430, height:844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.setViewportSize({ width:375, height:812 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const resizeSequenceMs = elapsed(resizeStarted);
    const overflow = await page.evaluate(() => ({
      width:innerWidth,
      html:document.documentElement.scrollWidth,
      body:document.body.scrollWidth,
    }));
    assert.ok(overflow.html <= overflow.width + 1, `Resize introduced documentElement overflow (${overflow.html} > ${overflow.width}).`);
    assert.ok(overflow.body <= overflow.width + 1, `Resize introduced body overflow (${overflow.body} > ${overflow.width}).`);

    const probe = await page.evaluate(() => ({ ...window.__medindexMobileInteractionProbe }));
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

    assert.ok(typingDispatchMs <= 180, `Search typing dispatch is sluggish (${typingDispatchMs}ms).`);
    assert.ok(searchSettleMs <= 750, `Debounced search did not repaint quickly enough (${searchSettleMs}ms).`);
    assert.ok(clearSearchSettleMs <= 750, `Clearing search did not repaint quickly enough (${clearSearchSettleMs}ms).`);
    assert.ok(statusSettleMs <= 500, `Status filter did not repaint quickly enough (${statusSettleMs}ms).`);
    assert.ok(paginationSettleMs <= 500, `Pagination did not repaint quickly enough (${paginationSettleMs}ms).`);
    assert.ok(detailLoadingVisibleMs <= 220, `“Më shumë” did not show immediate loading feedback (${detailLoadingVisibleMs}ms).`);
    assert.ok(detailSettleMs <= DETAIL_DELAY_MS + 450, `Medicine detail added excessive client latency (${detailSettleMs}ms).`);
    assert.ok(detailCloseMs <= 250, `Medicine detail did not close responsively (${detailCloseMs}ms).`);
    assert.ok(scrollSequenceMs <= 500, `Eight-frame mobile scroll sequence was sluggish (${scrollSequenceMs}ms).`);
    assert.ok(resizeSequenceMs <= 650, `Two mobile resize passes were sluggish (${resizeSequenceMs}ms).`);
    assert.ok(probe.maxGap <= 220, `Mobile interactions produced an excessive event-loop gap (${probe.maxGap}ms).`);
    assert.ok(Math.max(0, ...probe.longTasks) <= 220, `Mobile interactions produced an excessive long task (${Math.max(0, ...probe.longTasks)}ms).`);
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
