'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TABLET_GEOMETRY_PORT || 4179);
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.env.TABLET_GEOMETRY_SKIP_BUILD === '1';
const WIDTHS = [768, 820, 1024];

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
      reject(new Error(`Tablet fixture server did not start. ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      process.stdout.write(`[tablet-server] ${chunk}`);
      if (!ready && /Registry performance server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(`[tablet-server] ${chunk}`);
    });
    child.once('exit', code => {
      if (ready) return;
      clearTimeout(timeout);
      reject(new Error(`Tablet fixture server exited early (${code}). ${stderr}`));
    });
  });
}

function rows() {
  return Array.from({ length:50 }, (_, index) => {
    const serial = String(index + 1).padStart(12, '0');
    return {
      id:`00000000-0000-4000-8000-${serial}`,
      registryNumber:index + 1,
      approvedPopulation:index % 3 === 0 ? 'Pediatric and adult both' : 'Adult only',
      pdid:String(92000 + index),
      tradeName:index === 1 ? 'VERY LONG TABLET REGISTRY MEDICINE NAME' : `TABLET DRUG ${index + 1}`,
      activeSubstance:index === 1 ? 'Long active substance for tablet wrapping verification' : `Substance ${index + 1}`,
      atc:index % 2 === 0 ? 'A06AB02' : 'N02BE01',
      drugClass:'Tablet geometry fixture',
      use:'responsive registry verification',
      strength:index % 2 === 0 ? '5 mg' : '500 mg',
      form:index % 2 === 0 ? 'Gastro-resistant tablet' : 'Film coated tablet',
      productStatus:'Gjenerik',
      retailPrice:'2.50',
    };
  });
}

async function waitUntil(predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function installApiRoute(page, requestUrls) {
  await page.route('**/api/drug-search**', async route => {
    const url = new URL(route.request().url());
    requestUrls.push(url.toString());
    const view = url.searchParams.get('view') || '';
    if (view === 'registry-page') {
      const items = rows();
      const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 50));
      const includeTotal = url.searchParams.get('includeTotal') === '1';
      await route.fulfill({
        status:200,
        contentType:'application/json; charset=utf-8',
        body:JSON.stringify({
          ok:true,
          rows:items.slice(0, pageSize),
          pagination:{
            page:1,
            pageSize,
            hasPrevious:false,
            hasNext:false,
            total:includeTotal ? items.length : null,
            totalPages:includeTotal ? 1 : null,
          },
        }),
      });
      return;
    }
    if (view === 'registry-detail') {
      const item = rows().find(row => row.id === url.searchParams.get('id')) || rows()[0];
      await route.fulfill({ status:200, contentType:'application/json; charset=utf-8', body:JSON.stringify({ ok:true, row:item }) });
      return;
    }
    await route.continue();
  });
}

async function auditWidth(browser, width) {
  const context = await browser.newContext({
    viewport:{ width, height:900 },
    serviceWorkers:'block',
    hasTouch:true,
  });
  try {
    const page = await context.newPage();
    const requestUrls = [];
    await installApiRoute(page, requestUrls);
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody > tr[data-desktop-lite-row]').nth(9).waitFor({ state:'attached', timeout:10000 });
    await waitUntil(
      async () => (await page.locator('html').getAttribute('data-registry-desktop-lite-state')) === 'ready',
      `${width}px desktop-lite ready state`,
    );

    await page.locator('#search').fill('para');
    await waitUntil(
      () => requestUrls.some(value => new URL(value).searchParams.get('q') === 'para'),
      `${width}px settled search request`,
    );
    await waitUntil(
      async () => (await page.locator('#dataTable').getAttribute('aria-busy')) !== 'true',
      `${width}px settled table idle state`,
    );

    const result = await page.evaluate(() => {
      const rect = node => {
        if (!node) return null;
        const value = node.getBoundingClientRect();
        return { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height };
      };
      const style = node => {
        if (!node) return null;
        const value = getComputedStyle(node);
        return { display:value.display, overflowX:value.overflowX, overflowY:value.overflowY, position:value.position };
      };
      const visible = node => Boolean(node && getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
      const controls = ['search', 'statusFilter', 'pageSize', 'countBadge', 'pagination']
        .map(id => {
          const node = document.getElementById(id);
          return { id, visible:visible(node), rect:rect(node) };
        });
      const registry = document.getElementById('registryContent');
      const table = document.getElementById('dataTable');
      const rows = [...document.querySelectorAll('#tbody > tr[data-desktop-lite-row]')];
      const mobileCards = document.querySelectorAll('#tbody .mobile-lite-card').length;
      return {
        viewport:{ width:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth },
        bodyScrollWidth:document.body?.scrollWidth || 0,
        registry:rect(registry),
        registryStyle:style(registry),
        registryClientWidth:registry?.clientWidth || 0,
        registryScrollWidth:registry?.scrollWidth || 0,
        table:rect(table),
        tableClientWidth:table?.clientWidth || 0,
        tableScrollWidth:table?.scrollWidth || 0,
        controls,
        rowCount:rows.length,
        mobileCards,
        desktopLiteState:document.documentElement.dataset.registryDesktopLiteState || '',
        runtimeMode:document.documentElement.dataset.registryRuntimeMode || '',
        desktopLiteActive:window.MEDINDEX_DESKTOP_LITE_ACTIVE === true,
        mobileLiteActive:window.MEDINDEX_MOBILE_LITE_ACTIVE === true,
        fullRuntimeLoaded:Boolean(document.querySelector('script[data-medindex-app-performance]')),
        ariaBusy:table?.getAttribute('aria-busy') || '',
      };
    });

    const viewportWidth = result.viewport.width;
    const clippedControls = result.controls.filter(control => control.visible && control.rect && (
      control.rect.left < -1 || control.rect.right > viewportWidth + 1
    ));
    const controlledTableOverflow = result.registryScrollWidth <= result.registryClientWidth + 1
      || ['auto', 'scroll'].includes(result.registryStyle?.overflowX);
    const searchRequests = requestUrls
      .map(value => new URL(value))
      .filter(url => url.searchParams.get('view') === 'registry-page' && url.searchParams.get('q') === 'para');

    const report = {
      width,
      ...result,
      pageHorizontalOverflow:Math.max(result.viewport.scrollWidth, result.bodyScrollWidth) > viewportWidth + 1,
      clippedControlIds:clippedControls.map(control => control.id),
      controlledTableOverflow,
      searchRequestCount:searchRequests.length,
      searchRequestedExactTotal:searchRequests.some(url => url.searchParams.get('includeTotal') === '1'),
    };

    console.log(`\nTABLET_REGISTRY_GEOMETRY_WIDTH_REPORT ${JSON.stringify(report, null, 2)}\n`);

    assert.equal(report.pageHorizontalOverflow, false, `${width}px: page-level horizontal overflow detected.`);
    assert.equal(report.desktopLiteActive, true, `${width}px: tablet must stay on desktop-lite registry ownership.`);
    assert.equal(report.mobileLiteActive, false, `${width}px: phone renderer must not own a tablet viewport.`);
    assert.equal(report.fullRuntimeLoaded, false, `${width}px: normal tablet registry use must not wake the full runtime.`);
    assert.equal(report.mobileCards, 0, `${width}px: tablet must render the desktop table, not phone cards.`);
    assert.ok(report.rowCount > 0 && report.rowCount <= 50, `${width}px: tablet rows must remain bounded to one lightweight server page.`);
    assert.deepEqual(report.clippedControlIds, [], `${width}px: controls escaped the viewport: ${report.clippedControlIds.join(', ')}`);
    assert.equal(report.controlledTableOverflow, true, `${width}px: wide table overflow is not owned by the registry scroll container.`);
    assert.ok(report.registry && report.registry.left >= -1 && report.registry.right <= viewportWidth + 1, `${width}px: registry container escaped the viewport.`);
    assert.ok(report.searchRequestCount >= 1, `${width}px: tablet search did not issue a lightweight registry-page request.`);
    assert.equal(report.searchRequestedExactTotal, false, `${width}px: non-empty tablet search regressed to exact-count work.`);
    assert.notEqual(report.ariaBusy, 'true', `${width}px: tablet table remained falsely busy after settled search.`);
    return report;
  } finally {
    await context.close();
  }
}

(async () => {
  runBuild();
  const server = await startServer();
  const browser = await webkit.launch({ headless:true });
  try {
    const reports = [];
    for (const width of WIDTHS) reports.push(await auditWidth(browser, width));
    console.log(`\nTABLET_REGISTRY_GEOMETRY_REPORT ${JSON.stringify({ generatedAt:new Date().toISOString(), reports }, null, 2)}\n`);
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Tablet registry geometry audit failed:', error);
  process.exitCode = 1;
});
