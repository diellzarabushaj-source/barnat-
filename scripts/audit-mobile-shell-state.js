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

async function shellGeometryState(page) {
  return page.evaluate(() => {
    const rect = node => {
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return {
        top:Math.round(value.top * 10) / 10,
        right:Math.round(value.right * 10) / 10,
        bottom:Math.round(value.bottom * 10) / 10,
        left:Math.round(value.left * 10) / 10,
        width:Math.round(value.width * 10) / 10,
        height:Math.round(value.height * 10) / 10,
      };
    };
    const styleDisplay = node => node ? getComputedStyle(node).display : '';
    const topbar = document.querySelector('.mi-topbar');
    const nav = document.getElementById('miRegistryBottomNav');
    const heading = document.querySelector('.mi-page-heading');
    const breadcrumb = document.querySelector('.mi-breadcrumb');
    const subtitle = document.querySelector('.mi-page-heading p');
    const headingBadge = document.querySelector('.mi-heading-badge');
    const registrySearch = document.getElementById('search');
    const registryToolbar = registrySearch?.closest('.registry-filter-panel-unified,.toolbar') || null;
    const filterBar = document.querySelector('.mi-registry-mobile-filter-bar');
    const controls = [...document.querySelectorAll('.mi-topbar .mi-sidebar-toggle,.mi-topbar-actions .mi-icon-button,.mi-topbar-actions .mi-primary-action')];
    const navItems = [...(nav?.querySelectorAll('a,button') || [])];
    const primaryLabel = document.querySelector('.mi-topbar .mi-primary-action span');
    const brandLabel = document.querySelector('.mi-topbar .mi-mobile-brand strong');
    const cards = [...document.querySelectorAll('#tbody .mobile-lite-card')];
    const firstCard = cards[0] || null;
    const lastCard = cards.at(-1) || null;
    return {
      viewport:{ width:innerWidth, height:innerHeight },
      topbar:rect(topbar),
      nav:rect(nav),
      heading:rect(heading),
      headingBadge:rect(headingBadge),
      search:rect(registrySearch),
      toolbar:rect(registryToolbar),
      filterBar:rect(filterBar),
      firstCard:rect(firstCard),
      firstCardTop:firstCard ? Math.round(firstCard.getBoundingClientRect().top * 10) / 10 : null,
      navBottomGap:nav ? Math.round((innerHeight - nav.getBoundingClientRect().bottom) * 10) / 10 : null,
      controlBoxes:controls.map(rect),
      navItemBoxes:navItems.map(rect),
      primaryLabelDisplay:styleDisplay(primaryLabel),
      brandLabelDisplay:styleDisplay(brandLabel),
      breadcrumbDisplay:styleDisplay(breadcrumb),
      subtitleDisplay:styleDisplay(subtitle),
      headingBadgeDisplay:styleDisplay(headingBadge),
      lastCard:rect(lastCard),
      lastCardCovered:Boolean(lastCard && nav && lastCard.getBoundingClientRect().bottom > nav.getBoundingClientRect().top - 4),
      horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
}

function assertCompactShellGeometry(state, label, { lastCardVisible = false } = {}) {
  assert.ok(state.topbar, `${label}: topbar is missing.`);
  assert.ok(state.nav, `${label}: bottom navigation is missing.`);
  assert.ok(state.topbar.height >= 56 && state.topbar.height <= 62, `${label}: topbar must remain compact (56–62px without a simulated notch), got ${state.topbar.height}px.`);
  assert.ok(state.nav.height >= 56 && state.nav.height <= 62, `${label}: bottom navigation must remain compact (56–62px), got ${state.nav.height}px.`);
  assert.ok(state.navBottomGap >= 4 && state.navBottomGap <= 10, `${label}: browser-mode quick nav must stay close to the visual viewport bottom, gap=${state.navBottomGap}px.`);
  assert.equal(state.primaryLabelDisplay, 'none', `${label}: “Recetë e re” text must collapse to the + icon on phone.`);
  assert.ok(state.brandLabelDisplay === '' || state.brandLabelDisplay === 'none', `${label}: phone topbar must not expose the MedIndex wordmark.`);
  assert.ok(state.controlBoxes.length >= 4, `${label}: expected compact menu/search/theme/add controls.`);
  state.controlBoxes.forEach((box, index) => {
    assert.ok(box.width >= 43 && box.height >= 43, `${label}: topbar control ${index + 1} fell below the 44px touch target.`);
    assert.ok(box.width <= 46 && box.height <= 46, `${label}: topbar control ${index + 1} became oversized.`);
  });
  assert.equal(state.navItemBoxes.length, 5, `${label}: bottom navigation must keep five primary actions.`);
  state.navItemBoxes.forEach((box, index) => {
    assert.ok(box.height >= 44, `${label}: bottom nav item ${index + 1} fell below the 44px touch target.`);
    assert.ok(box.height <= 52, `${label}: bottom nav item ${index + 1} became too tall.`);
  });
  assert.equal(state.horizontalOverflow, false, `${label}: shell geometry introduced horizontal overflow.`);
  if (lastCardVisible) assert.equal(state.lastCardCovered, false, `${label}: bottom navigation covers the final medicine card.`);
}

function assertCompactRegistryDensity(state, label) {
  assert.ok(state.heading, `${label}: page heading is missing.`);
  assert.ok(state.search, `${label}: registry search is missing.`);
  assert.ok(state.toolbar, `${label}: registry search toolbar is missing.`);
  assert.ok(state.filterBar, `${label}: compact filter bar is missing.`);
  assert.equal(state.breadcrumbDisplay, 'none', `${label}: breadcrumb wastes vertical space on phone.`);
  assert.equal(state.subtitleDisplay, 'none', `${label}: page subtitle must collapse on phone.`);
  assert.ok(state.heading.height <= 36, `${label}: phone heading is too tall (${state.heading.height}px).`);
  assert.ok(state.search.height >= 43 && state.search.height <= 46, `${label}: phone registry search must stay near the 44px touch target, got ${state.search.height}px.`);
  assert.ok(state.toolbar.height <= 94, `${label}: mobile search/count toolbar is too tall (${state.toolbar.height}px).`);
  assert.ok(state.filterBar.height >= 43 && state.filterBar.height <= 48, `${label}: compact filter bar must remain one touch row, got ${state.filterBar.height}px.`);
  assert.ok(state.firstCardTop != null && state.firstCardTop <= 250, `${label}: first medicine starts too low (${state.firstCardTop}px), wasting the phone viewport.`);
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

    // Keep the audit compatible with production CSP. WebKit can reject
    // page.waitForFunction because it relies on an eval-like execution path.
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-card').nth(9).waitFor({ state:'attached', timeout:10000 });
    await page.locator('#miRegistryBottomNav').waitFor({ state:'attached', timeout:10000 });

    const report = {
      geometry:null,
      geometryAtEnd:null,
      smallPhoneGeometry:null,
      initial:null,
      sidebar:null,
      afterSidebar:null,
      filters:null,
      afterFilters:null,
      detail:null,
      afterDetail:null,
      globalSearch:null,
      afterGlobalSearch:null,
      keyboard:null,
      afterKeyboard:null,
    };

    report.geometry = await shellGeometryState(page);
    assertCompactShellGeometry(report.geometry, 'initial geometry');
    assertCompactRegistryDensity(report.geometry, 'initial density');

    report.initial = await navState(page);
    assertIdleState(report.initial, 'initial');

    await page.locator('.mi-main').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.waitForTimeout(80);
    report.geometryAtEnd = await shellGeometryState(page);
    assertCompactShellGeometry(report.geometryAtEnd, 'end-of-list geometry', { lastCardVisible:true });
    await page.locator('.mi-main').evaluate(node => { node.scrollTop = 0; });
    await page.waitForTimeout(50);

    await page.locator('[data-mi-registry-nav="more"]').click();
    await page.locator('body.mi-sidebar-open').waitFor({ state:'attached', timeout:5000 });
    await page.waitForTimeout(30);
    report.sidebar = await navState(page);
    assertOpenSurfaceState(report.sidebar, 'sidebar');
    assert.equal(report.sidebar.sidebarModal, 'true', 'sidebar: mobile sidebar must be modal while open.');
    assert.equal(report.sidebar.sidebarHidden, 'false', 'sidebar: open sidebar must not be aria-hidden.');
    assert.equal(report.sidebar.workspaceInert, true, 'sidebar: workspace must be inert while drawer is open.');

    await page.locator('[data-mi-sidebar-close]').click();
    await page.locator('body.mi-sidebar-open').waitFor({ state:'detached', timeout:5000 });
    await page.waitForTimeout(220);
    report.afterSidebar = await navState(page);
    assertIdleState(report.afterSidebar, 'after sidebar');

    await page.locator('[data-mi-phase3-filter-open]').click();
    await page.locator('body.mi-registry-filter-open').waitFor({ state:'attached', timeout:5000 });
    await page.waitForTimeout(30);
    report.filters = await navState(page);
    assertOpenSurfaceState(report.filters, 'filters');
    await page.locator('[data-mi-phase3-filter-close]').last().click();
    await page.locator('body.mi-registry-filter-open').waitFor({ state:'detached', timeout:5000 });
    await page.waitForTimeout(220);
    report.afterFilters = await navState(page);
    assertIdleState(report.afterFilters, 'after filters');

    await page.locator('#tbody .mobile-lite-more').first().click();
    await page.locator('body.mobile-lite-detail-open').waitFor({ state:'attached', timeout:5000 });
    await page.waitForTimeout(30);
    report.detail = await navState(page);
    assertOpenSurfaceState(report.detail, 'detail');
    await page.locator('#mobileLiteDrugDetail [data-mobile-lite-close]').last().click();
    await page.locator('body.mobile-lite-detail-open').waitFor({ state:'detached', timeout:5000 });
    await page.waitForTimeout(220);
    report.afterDetail = await navState(page);
    assertIdleState(report.afterDetail, 'after detail');

    await page.locator('[data-mi-mobile-search]').click();
    await page.locator('body.mi-mobile-search-open').waitFor({ state:'attached', timeout:5000 });
    await page.waitForTimeout(30);
    report.globalSearch = await navState(page);
    assertOpenSurfaceState(report.globalSearch, 'global search');
    await page.keyboard.press('Escape');
    await page.locator('body.mi-mobile-search-open').waitFor({ state:'detached', timeout:5000 });
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

    await page.setViewportSize({ width:320, height:700 });
    await page.waitForTimeout(120);
    report.smallPhoneGeometry = await shellGeometryState(page);
    assertCompactShellGeometry(report.smallPhoneGeometry, '320px phone geometry');
    assertCompactRegistryDensity(report.smallPhoneGeometry, '320px phone density');
    assert.equal(report.smallPhoneGeometry.headingBadgeDisplay, 'none', '320px phone should hide the secondary heading badge to protect one-line density.');

    assert.equal(apiRequests.some(pathname => pathname.startsWith('/api/registry')), false, 'Phase 4 shell states must not request /api/registry.');

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