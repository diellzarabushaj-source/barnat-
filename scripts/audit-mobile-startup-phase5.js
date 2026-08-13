'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MOBILE_STARTUP_PORT || 4179);
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.env.MOBILE_STARTUP_SKIP_BUILD === '1';

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
      reject(new Error(`Mobile startup fixture server did not start. ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      process.stdout.write(`[mobile-startup-server] ${chunk}`);
      if (!ready && /Registry performance server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(`[mobile-startup-server] ${chunk}`);
    });
    child.once('exit', code => {
      if (ready) return;
      clearTimeout(timeout);
      reject(new Error(`Mobile startup fixture server exited early (${code}). ${stderr}`));
    });
  });
}

function rows() {
  return Array.from({ length:25 }, (_, index) => ({
    id:`startup-${index + 1}`,
    registryNumber:String(index + 1),
    pdid:String(94000 + index),
    tradeName:index === 0 ? 'DULCOLAX' : `STARTUP DRUG ${index + 1}`,
    activeSubstance:index === 0 ? 'Bisacodyl' : `Substance ${index + 1}`,
    atc:index === 0 ? 'A06AB02' : 'N02BE01',
    strength:index === 0 ? '5 mg' : '500 mg',
    form:index === 0 ? 'Gastro-resistant tablet' : 'Tablet',
    productStatus:'Gjenerik',
  }));
}

async function installApi(page) {
  await page.route('**/api/drug-search**', async route => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get('view') || '';
    if (view === 'registry-page') {
      const items = rows();
      await route.fulfill({
        status:200,
        contentType:'application/json; charset=utf-8',
        headers:{ 'Cache-Control':'private, max-age=30, stale-while-revalidate=120' },
        body:JSON.stringify({
          ok:true,
          rows:items,
          pagination:{ page:1, pageSize:25, hasNext:false, total:items.length, totalPages:1 },
        }),
      });
      return;
    }
    if (view === 'registry-detail') {
      const item = rows()[0];
      await route.fulfill({
        status:200,
        contentType:'application/json; charset=utf-8',
        body:JSON.stringify({ ok:true, row:{ ...item, drugClass:'Startup audit fixture', use:'Startup audit', packaging:'20 tablets' } }),
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
    body:JSON.stringify({ ok:true, counts:{ A06A:1, N02B:24 } }),
  }));
}

function relevantAsset(pathname) {
  return /\.(?:js|css)$/.test(pathname)
    || /classification-data|atc-shared|atc-sidebar|atc-global-search/.test(pathname);
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
    const navigationStartedAt = Date.now();
    const assetRequests = [];
    const apiRequests = [];

    page.on('request', request => {
      const url = new URL(request.url());
      const elapsed = Date.now() - navigationStartedAt;
      if (relevantAsset(url.pathname)) assetRequests.push({ path:url.pathname, atMs:elapsed });
      if (url.pathname.startsWith('/api/')) apiRequests.push({ path:`${url.pathname}${url.search}`, atMs:elapsed });
    });

    await page.addInitScript(() => {
      const probe = {
        startedAt:performance.now(),
        lastTick:performance.now(),
        maxGap:0,
        gaps:[],
        events:[],
      };
      window.__medindexMobileStartupProbe = probe;
      const mark = name => probe.events.push({ name, at:Math.round(performance.now() * 10) / 10 });
      window.addEventListener('DOMContentLoaded', () => mark('dom-content-loaded'), { once:true });
      window.addEventListener('medindex:tailadmin-ready', () => mark('shell-ready'), { once:true });
      window.addEventListener('medindex:mobile-lite-ready', () => mark('mobile-lite-ready'), { once:true });
      setInterval(() => {
        const now = performance.now();
        const gap = now - probe.lastTick;
        probe.lastTick = now;
        probe.maxGap = Math.max(probe.maxGap, gap);
        if (gap > 100) probe.gaps.push(Math.round(gap * 10) / 10);
      }, 50);
    });

    await installApi(page);
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-card').nth(9).waitFor({ state:'attached', timeout:10000 });
    const firstCardsReadyAt = Date.now() - navigationStartedAt;

    const beforeFirstCards = assetRequests.filter(item => item.atMs <= firstCardsReadyAt);
    const beforePaths = new Set(beforeFirstCards.map(item => item.path));
    const forbiddenStartupAssets = [
      '/atc-sidebar.js',
      '/atc-global-search.js',
      '/classification-data.js',
      '/atc-shared.js',
      '/atc-sidebar.css',
      '/atc-global-search.css',
    ];
    forbiddenStartupAssets.forEach(asset => {
      assert.equal(beforePaths.has(asset), false, `phone startup loaded deferred ATC asset before first medicines: ${asset}`);
    });
    assert.equal(apiRequests.some(item => item.path.startsWith('/api/atc-counts')), false, 'phone startup requested ATC counts before sidebar intent');
    assert.equal(apiRequests.some(item => item.path.startsWith('/api/registry')), false, 'phone startup requested the full registry payload');
    assert.equal(assetRequests.some(item => item.path === '/data/registry-data.js'), false, 'phone startup requested embedded full registry data');

    const startupProbe = await page.evaluate(() => ({ ...window.__medindexMobileStartupProbe }));
    assert.ok(startupProbe.maxGap < 2500, `phone startup event-loop gap became catastrophic (${startupProbe.maxGap}ms)`);

    const navIntentAt = Date.now() - navigationStartedAt;
    await page.locator('[data-mi-registry-nav="more"]').dispatchEvent('pointerdown');
    await page.locator('script[data-medindex-atc-sidebar]').waitFor({ state:'attached', timeout:5000 });
    await page.waitForTimeout(80);
    assert.ok(assetRequests.some(item => item.path === '/atc-sidebar.js' && item.atMs >= navIntentAt), 'ATC sidebar did not load after explicit phone navigation intent');

    const searchIntentAt = Date.now() - navigationStartedAt;
    await page.locator('[data-mi-mobile-search]').dispatchEvent('pointerdown');
    await page.locator('script[data-medindex-atc-global-search]').waitFor({ state:'attached', timeout:5000 });
    await page.waitForTimeout(80);
    assert.ok(assetRequests.some(item => item.path === '/atc-global-search.js' && item.atMs >= searchIntentAt), 'ATC global search did not load after explicit phone search intent');

    const resources = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => /\.(?:js|css)(?:\?|$)/.test(entry.name))
      .map(entry => ({
        path:new URL(entry.name).pathname,
        startTime:Math.round(entry.startTime * 10) / 10,
        duration:Math.round(entry.duration * 10) / 10,
        transferSize:Number(entry.transferSize || 0),
        encodedBodySize:Number(entry.encodedBodySize || 0),
      })));

    const report = {
      generatedAt:new Date().toISOString(),
      firstCardsReadyAtMs:firstCardsReadyAt,
      startupProbe,
      startupAssetCount:beforeFirstCards.length,
      startupAssets:beforeFirstCards,
      apiRequests,
      resources,
      intentDeferred:{
        atcNavigationLoaded:assetRequests.some(item => item.path === '/atc-sidebar.js'),
        atcSearchLoaded:assetRequests.some(item => item.path === '/atc-global-search.js'),
      },
    };
    console.log(`\nMOBILE_STARTUP_PHASE5_REPORT ${JSON.stringify(report, null, 2)}\n`);

    await context.close();
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Mobile Phase 5 startup audit failed:', error);
  process.exitCode = 1;
});