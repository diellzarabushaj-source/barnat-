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

async function waitForRequestCount(requestLog, predicate, minimum, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (requestLog.filter(predicate).length >= minimum) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${minimum} matching registry requests.`);
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

    // Counting is no longer part of fetching rows. A page request asks for rows
    // and nothing else; the exact total follows in a request of its own, one
    // row wide, so the register can paint before the count is known. The two
    // are told apart by that shape rather than by arrival order, because the
    // count is deliberately allowed to land late.
    const pageRequests = () => requests.filter(item => item.view === 'registry-page');
    const rowRequests = () => pageRequests().filter(item => item.includeTotal !== '1');
    const countRequests = () => pageRequests().filter(item => item.includeTotal === '1');
    const isCountRequest = item => item.view === 'registry-page' && item.includeTotal === '1';

    assert.equal(rowRequests().length, 1, 'initial mobile boot must issue one bounded registry-page request');
    assert.equal(rowRequests()[0].includeTotal, '', 'the rows a doctor sees must never wait behind an exact count');
    assert.equal(rowRequests()[0].pageSize, 25, 'initial mobile boot must stay bounded to 25 rows');
    assert.equal(await page.locator('#tbody .mobile-lite-card').count(), 25, 'initial DOM must render only the bounded first page');

    // The count is still fetched — separately, after the rows, and without
    // pulling a second page of the register along with it.
    await waitForRequestCount(requests, isCountRequest, 1);
    assert.equal(countRequests().length, 1, 'the exact total must be asked for exactly once per boot');
    assert.equal(countRequests()[0].pageSize, 1, 'the count request must not fetch rows as well');
    assert.equal(countRequests()[0].q, '', 'the boot count must describe the unfiltered register');
    assert.ok(countRequests()[0].at >= rowRequests()[0].at,
      'the count must follow the rows it annotates, never precede them');

    const search = page.locator('#search');
    await search.fill('B');
    await page.waitForTimeout(360);
    assert.equal(rowRequests().length, 1, 'one-character search must not refetch the unfiltered registry');
    assert.equal(countRequests().length, 1, 'one-character search must not re-count the registry');

    await search.fill('BI');
    await page.waitForTimeout(360);
    assert.equal(rowRequests().length, 2, 'two-character search must issue exactly one bounded request');
    assert.equal(rowRequests()[1].q, 'BI', 'server-side search query was not forwarded');
    assert.equal(rowRequests()[1].pageSize, 25, 'search results must remain bounded to 25 rows');
    assert.equal(countRequests().length, 1, 'typing search must skip exact count queries');

    await search.fill('BIS');
    await page.waitForTimeout(360);
    assert.equal(rowRequests().length, 3, 'next debounced search must issue one additional bounded request');
    assert.equal(rowRequests()[2].q, 'BIS', 'latest debounced search term was not used');
    assert.equal(countRequests().length, 1, 'continued typing must keep exact counts disabled');

    await search.fill('');
    await page.waitForTimeout(360);
    assert.equal(rowRequests().length, 4, 'clearing search must restore the default registry page once');
    assert.equal(rowRequests()[3].q, '', 'clearing search must remove q from the request');
    assert.equal(rowRequests()[3].includeTotal, '', 'restored rows must still paint before any count');

    await waitForRequestCount(requests, isCountRequest, 2);
    assert.equal(countRequests().length, 2, 'clearing search may restore the exact total once');
    assert.equal(countRequests()[1].q, '', 'the restored count must describe the unfiltered register');
    assert.equal(countRequests()[1].pageSize, 1, 'the restored count must not fetch rows as well');

    await page.locator('#tbody .mobile-lite-more').first().click();
    await page.locator('body.mobile-lite-detail-open').waitFor({ state:'attached', timeout:5000 });
    const detailRequests = requests.filter(item => item.view === 'registry-detail');
    assert.equal(detailRequests.length, 1, 'opening one medicine must issue one targeted detail request');

    // A request without a view is the bounded global search behind the
    // suggestion panel — indexed server-side and capped, not the old unbounded
    // registry read. What must not happen is it standing in for the register:
    // rows and counts always come from the bounded registry-page route, and a
    // suggestion is asked for only once the doctor has typed enough to mean
    // something. The full-registry payload staying untouched is asserted below.
    const suggestionRequests = requests.filter(item => item.view === '');
    assert.ok(suggestionRequests.length, 'the bounded global search must still back the suggestion panel');
    assert.deepEqual(
      suggestionRequests.filter(item => item.q.length < 2),
      [],
      'a one-character term must never reach the global search',
    );
    assert.deepEqual(
      suggestionRequests.filter(item => !['BI', 'BIS'].includes(item.q)),
      [],
      'the global search must run only for the terms the doctor actually typed',
    );
    assert.equal(
      suggestionRequests.some(item => item.at < rowRequests()[0].at),
      false,
      'booting the register must not trigger a global search',
    );
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
