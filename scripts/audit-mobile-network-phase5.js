'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MOBILE_NETWORK_PORT || 4178);
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.env.MOBILE_NETWORK_SKIP_BUILD === '1';

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
      reject(new Error(`Mobile network fixture server did not start. ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      process.stdout.write(`[mobile-network-server] ${chunk}`);
      if (!ready && /Registry performance server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(`[mobile-network-server] ${chunk}`);
    });
    child.once('exit', code => {
      if (ready) return;
      clearTimeout(timeout);
      reject(new Error(`Mobile network fixture server exited early (${code}). ${stderr}`));
    });
  });
}

function fixtureRows(query = '') {
  const needle = String(query || '').toUpperCase();
  const rows = Array.from({ length:26 }, (_, index) => ({
    id:`network-${index + 1}`,
    registryNumber:String(index + 1),
    pdid:String(93000 + index),
    tradeName:index === 0 ? 'BISACODYL TEST' : `NETWORK DRUG ${index + 1}`,
    activeSubstance:index === 0 ? 'Bisacodyl' : `Substance ${index + 1}`,
    atc:index === 0 ? 'A06AB02' : 'N02BE01',
    strength:index === 0 ? '5 mg' : '500 mg',
    form:index === 0 ? 'Gastro-resistant tablet' : 'Tablet',
    productStatus:'Gjenerik',
  }));
  return needle.length >= 2
    ? rows.filter(row => `${row.tradeName} ${row.activeSubstance} ${row.atc}`.toUpperCase().includes(needle))
    : rows;
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
    const requests = [];
    const fullRegistryRequests = [];

    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/registry' || url.pathname === '/data/registry-data.js') {
        fullRegistryRequests.push(`${url.pathname}${url.search}`);
      }
    });

    await page.route('**/api/drug-search**', async route => {
      const url = new URL(route.request().url());
      const view = url.searchParams.get('view') || '';
      const snapshot = {
        view,
        q:url.searchParams.get('q') || '',
        includeTotal:url.searchParams.get('includeTotal') || '',
        page:Number(url.searchParams.get('page') || 1),
        pageSize:Number(url.searchParams.get('pageSize') || 25),
        at:Date.now(),
      };
      requests.push(snapshot);

      if (view === 'registry-page') {
        const all = fixtureRows(snapshot.q);
        const start = (snapshot.page - 1) * snapshot.pageSize;
        const pageRows = all.slice(start, start + snapshot.pageSize);
        const total = snapshot.includeTotal === '1' ? all.length : null;
        const hasNext = Number.isFinite(total)
          ? snapshot.page * snapshot.pageSize < total
          : all.length > start + snapshot.pageSize;
        await route.fulfill({
          status:200,
          contentType:'application/json; charset=utf-8',
          headers:{ 'Cache-Control':'private, max-age=30, stale-while-revalidate=120' },
          body:JSON.stringify({
            ok:true,
            rows:pageRows,
            pagination:{
              page:snapshot.page,
              pageSize:snapshot.pageSize,
              total,
              totalPages:Number.isFinite(total) ? Math.max(1, Math.ceil(total / snapshot.pageSize)) : null,
              hasNext,
            },
          }),
        });
        return;
      }

      if (view === 'registry-detail') {
        const row = fixtureRows()[0];
        await route.fulfill({
          status:200,
          contentType:'application/json; charset=utf-8',
          headers:{ 'Cache-Control':'private, max-age=60, stale-while-revalidate=300' },
          body:JSON.stringify({ ok:true, row:{ ...row, drugClass:'Audit fixture', use:'Audit use', packaging:'20 tablets' } }),
        });
        return;
      }

      await route.fulfill({ status:200, contentType:'application/json; charset=utf-8', body:JSON.stringify({ ok:true, results:[] }) });
    });

    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-card').first().waitFor({ state:'attached', timeout:10000 });

    const pageRequests = () => requests.filter(item => item.view === 'registry-page');
    assert.equal(pageRequests().length, 1, 'initial mobile boot must issue one bounded registry-page request');
    assert.equal(pageRequests()[0].includeTotal, '1', 'initial mobile boot may request the exact total once');
    assert.equal(pageRequests()[0].pageSize, 25, 'initial mobile boot must stay bounded to 25 rows');
    assert.equal(await page.locator('#tbody .mobile-lite-card').count(), 25, 'initial DOM must render only the bounded first page');

    const search = page.locator('#search');
    await search.fill('B');
    await page.waitForTimeout(360);
    assert.equal(pageRequests().length, 1, 'one-character search must not refetch the unfiltered registry');

    await search.fill('BI');
    await page.waitForTimeout(360);
    assert.equal(pageRequests().length, 2, 'two-character search must issue exactly one bounded request');
    assert.equal(pageRequests()[1].q, 'BI', 'server-side search query was not forwarded');
    assert.equal(pageRequests()[1].includeTotal, '', 'typing search must skip exact count queries');
    assert.equal(pageRequests()[1].pageSize, 25, 'search results must remain bounded to 25 rows');

    await search.fill('BIS');
    await page.waitForTimeout(360);
    assert.equal(pageRequests().length, 3, 'next debounced search must issue one additional bounded request');
    assert.equal(pageRequests()[2].q, 'BIS', 'latest debounced search term was not used');
    assert.equal(pageRequests()[2].includeTotal, '', 'continued typing must keep exact counts disabled');

    await search.fill('');
    await page.waitForTimeout(360);
    assert.equal(pageRequests().length, 4, 'clearing search must restore the default registry page once');
    assert.equal(pageRequests()[3].q, '', 'clearing search must remove q from the request');
    assert.equal(pageRequests()[3].includeTotal, '1', 'clearing search may restore the exact total once');

    await page.locator('#tbody .mobile-lite-more').first().click();
    await page.locator('body.mobile-lite-detail-open').waitFor({ state:'attached', timeout:5000 });
    const detailRequests = requests.filter(item => item.view === 'registry-detail');
    assert.equal(detailRequests.length, 1, 'opening one medicine must issue one targeted detail request');

    assert.equal(requests.some(item => item.view === ''), false, 'mobile registry audit unexpectedly used the legacy generic drug-search path');
    assert.equal(requests.some(item => item.pageSize > 50), false, 'mobile registry requested more than the hard page-size ceiling');
    assert.deepEqual(fullRegistryRequests, [], 'normal mobile boot/search/detail flow woke the full registry payload');

    console.log(`\nMOBILE_NETWORK_PHASE5_REPORT ${JSON.stringify({ generatedAt:new Date().toISOString(), requests, fullRegistryRequests }, null, 2)}\n`);
    await context.close();
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Mobile Phase 5 network audit failed:', error);
  process.exitCode = 1;
});
