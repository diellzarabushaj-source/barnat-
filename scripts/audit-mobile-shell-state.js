'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MOBILE_SHELL_PORT || 4177);
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.env.MOBILE_SHELL_SKIP_BUILD === '1';

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
      reject(new Error(`Mobile shell fixture server did not start. ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      process.stdout.write(`[mobile-shell-server] ${chunk}`);
      if (!ready && /Registry performance server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(`[mobile-shell-server] ${chunk}`);
    });
    child.once('exit', code => {
      if (ready) return;
      clearTimeout(timeout);
      reject(new Error(`Mobile shell fixture server exited early (${code}). ${stderr}`));
    });
  });
}

function rows() {
  return Array.from({ length:25 }, (_, index) => ({
    id:`shell-${index + 1}`,
    registryNumber:String(index + 1),
    pdid:String(92000 + index),
    tradeName:index === 0 ? 'DULCOLAX' : `SHELL DRUG ${index + 1}`,
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
        body:JSON.stringify({
          ok:true,
          rows:items,
          pagination:{ page:1, pageSize:25, hasNext:false, total:items.length, totalPages:1 },
        }),
      });
      return;
    }
    if (view === 'registry-detail') {
      const item = rows().find(row => row.id === url.searchParams.get('id')) || rows()[0];
      await route.fulfill({
        status:200,
        contentType:'application/json; charset=utf-8',
        body:JSON.stringify({
          ok:true,
          row:{
            ...item,
            drugClass:'Shell diagnostic fixture',
            use:'Mobile shell state regression audit',
            packaging:'20 tablets',
          },
        }),
      });
      return;
    }
    await route.continue();
  });
}

async function navState(page) {
  return page.evaluate(() => {
    const nav = document.getElementById('miRegistryBottomNav');
    const style = nav ? getComputedStyle(nav) : null;
    return {
      exists:Boolean(nav),
      inert:Boolean(nav?.inert),
      blocked:nav?.dataset.miRegistryNavBlocked || '',
      visibility:style?.visibility || '',
      opacity:style?.opacity || '',
      transform:style?.transform || '',
      bodyClass:document.body.className,
      sidebarModal:document.getElementById('miSidebar')?.getAttribute('aria-modal') || '',
      sidebarHidden:document.getElementById('miSidebar')?.getAttribute('aria-hidden') || '',
      workspaceInert:Boolean(document.querySelector('.mi-workspace')?.inert),
      fullRuntimeLoaded:Boolean(document.querySelector('script[data-medindex-app-performance]')),
      horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
}

function assertOpenSurfaceState(state, label) {
  assert.equal(state.exists, true, `${label}: bottom navigation disappeared instead of being state-coordinated.`);
  assert.equal(state.inert, true, `${label}: bottom navigation remained focusable behind a modal surface.`);
  assert.equal(state.blocked, 'true', `${label}: navigation blocked marker is missing.`);
  assert.equal(state.visibility, 'hidden', `${label}: bottom navigation remained visible behind a modal surface.`);
  assert.ok(Number(state.opacity) <= 0.01, `${label}: bottom navigation remained opaque behind a modal surface.`);
  assert.equal(state.fullRuntimeLoaded, false, `${label}: normal mobile UI state woke the full registry runtime.`);
  assert.equal(state.horizontalOverflow, false, `${label}: mobile shell introduced horizontal overflow.`);
}

function assertIdleState(state, label) {
  assert.equal(state.exists, true, `${label}: bottom navigation is missing.`);
  assert.equal(state.inert, false, `${label}: bottom navigation did not become interactive again.`);
  assert.equal(state.blocked, 'false', `${label}: navigation blocked marker did not reset.`);
  assert.equal(state.visibility, 'visible', `${label}: bottom navigation did not become visible again.`);
  assert.ok(Number(state.opacity) >= 0.99, `${label}: bottom navigation did not restore opacity.`);
  assert.equal(state.fullRuntimeLoaded, false, `${label}: normal mobile UI state woke the full registry runtime.`);
  assert.equal(state.horizontalOverflow, false, `${label}: mobile shell introduced horizontal overflow.`);
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
    const apiRequests = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) apiRequests.push(`${url.pathname}${url.search}`);
    });
    await installApi(page);
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'), null, { timeout:10000 });
    await page.waitForFunction(() => document.querySelectorAll('#tbody .mobile-lite-card').length >= 10, null, { timeout:10000 });
    await page.waitForFunction(() => Boolean(document.getElementById('miRegistryBottomNav')), null, { timeout:10000 });

    const report = { initial:null, sidebar:null, afterSidebar:null, filters:null, afterFilters:null, detail:null, afterDetail:null, globalSearch:null, afterGlobalSearch:null, keyboard:null, afterKeyboard:null };

    report.initial = await navState(page);
    assertIdleState(report.initial, 'initial');

    await page.locator('[data-mi-registry-nav="more"]').click();
    await page.waitForFunction(() => document.body.classList.contains('mi-sidebar-open'));
    await page.waitForTimeout(30);
    report.sidebar = await navState(page);
    assertOpenSurfaceState(report.sidebar, 'sidebar');
    assert.equal(report.sidebar.sidebarModal, 'true', 'sidebar: mobile sidebar must be modal while open.');
    assert.equal(report.sidebar.sidebarHidden, 'false', 'sidebar: open sidebar must not be aria-hidden.');
    assert.equal(report.sidebar.workspaceInert, true, 'sidebar: workspace must be inert while drawer is open.');

    await page.locator('[data-mi-sidebar-close]').click();
    await page.waitForFunction(() => !document.body.classList.contains('mi-sidebar-open'));
    await page.waitForTimeout(220);
    report.afterSidebar = await navState(page);
    assertIdleState(report.afterSidebar, 'after sidebar');

    await page.locator('[data-mi-phase3-filter-open]').click();
    await page.waitForFunction(() => document.body.classList.contains('mi-registry-filter-open'));
    await page.waitForTimeout(30);
    report.filters = await navState(page);
    assertOpenSurfaceState(report.filters, 'filters');
    await page.locator('[data-mi-phase3-filter-close]').last().click();
    await page.waitForFunction(() => !document.body.classList.contains('mi-registry-filter-open'));
    await page.waitForTimeout(220);
    report.afterFilters = await navState(page);
    assertIdleState(report.afterFilters, 'after filters');

    await page.locator('#tbody .mobile-lite-more').first().click();
    await page.waitForFunction(() => document.body.classList.contains('mobile-lite-detail-open'));
    await page.waitForTimeout(30);
    report.detail = await navState(page);
    assertOpenSurfaceState(report.detail, 'detail');
    await page.locator('#mobileLiteDrugDetail [data-mobile-lite-close]').last().click();
    await page.waitForFunction(() => !document.body.classList.contains('mobile-lite-detail-open'));
    await page.waitForTimeout(220);
    report.afterDetail = await navState(page);
    assertIdleState(report.afterDetail, 'after detail');

    await page.locator('[data-mi-mobile-search]').click();
    await page.waitForFunction(() => document.body.classList.contains('mi-mobile-search-open'));
    await page.waitForTimeout(30);
    report.globalSearch = await navState(page);
    assertOpenSurfaceState(report.globalSearch, 'global search');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('mi-mobile-search-open'));
    await page.waitForTimeout(220);
    report.afterGlobalSearch = await navState(page);
    assertIdleState(report.afterGlobalSearch, 'after global search');

    await page.evaluate(() => {
      document.documentElement.dataset.miKeyboardOpen = 'true';
      window.MedIndexRegistryMobilePhase3?.syncNavigation?.();
    });
    await page.waitForTimeout(30);
    report.keyboard = await navState(page);
    assertOpenSurfaceState(report.keyboard, 'keyboard');
    await page.evaluate(() => {
      document.documentElement.dataset.miKeyboardOpen = 'false';
      window.MedIndexRegistryMobilePhase3?.syncNavigation?.();
    });
    await page.waitForTimeout(220);
    report.afterKeyboard = await navState(page);
    assertIdleState(report.afterKeyboard, 'after keyboard');

    assert.equal(apiRequests.some(pathname => pathname.startsWith('/api/registry')), false, 'Phase 3 shell states must not request /api/registry.');

    console.log(`\nMOBILE_SHELL_STATE_REPORT ${JSON.stringify({ generatedAt:new Date().toISOString(), apiRequests, report }, null, 2)}\n`);
    await context.close();
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Mobile shell state audit failed:', error);
  process.exitCode = 1;
});
