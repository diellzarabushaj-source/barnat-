'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { webkit, chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PHASE0_PORT || 4175);
const BASE = `http://127.0.0.1:${PORT}`;
const MOBILE_SEARCH_DELAY_MS = Number(process.env.PHASE0_MOBILE_SEARCH_DELAY_MS || 13000);
const MOBILE_STALL_THRESHOLD_MS = Number(process.env.PHASE0_MOBILE_STALL_THRESHOLD_MS || 12000);
const SKIP_BUILD = process.env.PHASE0_SKIP_BUILD === '1';
const ASSERT_SINGLE_OWNER = process.argv.includes('--assert-single-owner');
const BROWSER_NAME = String(process.env.PHASE0_BROWSER || 'webkit').toLowerCase();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

function startFixtureServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'registry-performance-server.js')], {
      cwd:ROOT,
      env:{ ...process.env, PERFORMANCE_PORT:String(PORT) },
      stdio:['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    let stderr = '';
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`Phase 0 fixture server did not start in time. ${stderr}`));
    }, 10000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      process.stdout.write(`[phase0-server] ${chunk}`);
      if (!settled && /Registry performance server listening/.test(chunk)) {
        settled = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(`[phase0-server] ${chunk}`);
    });
    child.once('exit', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Phase 0 fixture server exited before readiness (${code}). ${stderr}`));
    });
  });
}

function listRows() {
  return Array.from({ length:25 }, (_, index) => {
    const number = index + 1;
    return {
      id:`phase0-${number}`,
      registryNumber:String(number),
      pdid:String(90000 + number),
      tradeName:number === 1 ? 'DULCOLAX' : `PHASE0 DRUG ${number}`,
      activeSubstance:number === 1 ? 'Bisacodyl' : `Substance ${number}`,
      atc:number === 1 ? 'A06AB02' : 'N02BE01',
      strength:number === 1 ? '5 mg' : '500 mg',
      form:number === 1 ? 'Gastro-resistant tablet' : 'Tablet',
      productStatus:'Gjenerik',
    };
  });
}

function detailRow(id) {
  const row = listRows().find(item => item.id === id) || listRows()[0];
  return {
    ...row,
    drugClass:'Synthetic Phase 0 diagnostic fixture',
    use:'Forensic mobile renderer audit only',
    packaging:'20 tablets',
    manufacturer:'MedIndex diagnostic fixture',
    marketingAuthorizationHolder:'MedIndex diagnostic fixture',
    retailPrice:'—',
    validity:'31.12.2026',
  };
}

async function installDelayedDrugSearchRoute(page) {
  await page.route('**/api/drug-search**', async route => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get('view') || '';

    if (view === 'registry-page') {
      await sleep(MOBILE_SEARCH_DELAY_MS);
      const rows = listRows();
      await route.fulfill({
        status:200,
        contentType:'application/json; charset=utf-8',
        body:JSON.stringify({
          ok:true,
          rows,
          pagination:{ page:1, pageSize:25, hasNext:false, total:rows.length, totalPages:1 },
        }),
      });
      return;
    }

    if (view === 'registry-detail') {
      await route.fulfill({
        status:200,
        contentType:'application/json; charset=utf-8',
        body:JSON.stringify({ ok:true, row:detailRow(url.searchParams.get('id')) }),
      });
      return;
    }

    await route.continue();
  });
}

async function runBrowserProbe() {
  const browserType = BROWSER_NAME === 'chromium' ? chromium : webkit;
  const browser = await browserType.launch({ headless:true });
  try {
    const context = await browser.newContext({
      viewport:{ width:390, height:844 },
      serviceWorkers:'block',
      isMobile:true,
      hasTouch:true,
    });
    const page = await context.newPage();
    const requests = [];

    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return;
      requests.push({
        at:Date.now(),
        method:request.method(),
        path:`${url.pathname}${url.search}`,
      });
    });

    page.on('console', message => {
      if (message.type() === 'error') process.stderr.write(`[phase0-browser-console] ${message.text()}\n`);
    });

    await page.addInitScript(() => {
      const startedAt = performance.now();
      const probe = {
        startedAt,
        fullRegistryStarts:[],
        mobileLiteReady:[],
        mobileLiteStalled:[],
        mobileFullRegistryBlocked:[],
        handoffs:[],
        registryReady:[],
        firstPageAuditReady:[],
      };
      window.__MEDINDEX_PHASE0_PROBE = probe;
      const stamp = () => Math.round((performance.now() - startedAt) * 10) / 10;
      const capture = (bucket, event) => bucket.push({ atMs:stamp(), detail:event.detail || null });
      window.addEventListener('medindex:full-registry-started', event => capture(probe.fullRegistryStarts, event));
      window.addEventListener('medindex:mobile-lite-ready', event => capture(probe.mobileLiteReady, event));
      window.addEventListener('medindex:mobile-lite-stalled', event => capture(probe.mobileLiteStalled, event));
      window.addEventListener('medindex:mobile-full-registry-blocked', event => capture(probe.mobileFullRegistryBlocked, event));
      window.addEventListener('medindex:request-full-registry', event => capture(probe.handoffs, event));
      window.addEventListener('medindex:registry-ready', event => capture(probe.registryReady, event));
      window.addEventListener('medindex:first-page-audit-ready', event => capture(probe.firstPageAuditReady, event));
    });

    await installDelayedDrugSearchRoute(page);
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('html[data-registry-mobile-lite]').waitFor({ state:'attached', timeout:5000 });

    // The v9 owner contract intentionally keeps mobile-lite in control even when
    // the bounded list request outlives the 12 s diagnostic stall threshold.
    await page.waitForTimeout(MOBILE_SEARCH_DELAY_MS + 1800);
    await page.locator('#tbody .mobile-lite-card').first().waitFor({ state:'attached', timeout:5000 });

    const state = await page.evaluate(() => {
      const html = document.documentElement;
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
      const describe = node => {
        if (!node) return null;
        const style = getComputedStyle(node);
        return {
          tag:node.tagName,
          id:node.id || '',
          className:typeof node.className === 'string' ? node.className : '',
          display:style.display,
          visibility:style.visibility,
          position:style.position,
          rect:rect(node),
        };
      };
      const firstCard = document.querySelector('#tbody .mobile-lite-card');
      const toolbar = document.querySelector('.toolbar');
      return {
        probe:window.__MEDINDEX_PHASE0_PROBE,
        datasets:{
          registryMobileLite:html.dataset.registryMobileLite || '',
          registryMobileLiteReady:html.dataset.registryMobileLiteReady || '',
          registryMobileLiteState:html.dataset.registryMobileLiteState || '',
          registryRuntimeMode:html.dataset.registryRuntimeMode || '',
          registryRuntimeReason:html.dataset.registryRuntimeReason || '',
          registryRuntimeBlockedReason:html.dataset.registryRuntimeBlockedReason || '',
          registryMobilePhase3:html.dataset.registryMobilePhase3 || '',
          firstPageClinical:html.dataset.firstPageClinical || '',
        },
        mobileLiteActive:window.MEDINDEX_MOBILE_LITE_ACTIVE === true,
        mobileLiteState:window.MEDINDEX_MOBILE_LITE?.getState?.() || null,
        fullRuntimeVersion:window.MEDINDEX_APP_VERSION || '',
        geometry:{
          mobileLiteCards:document.querySelectorAll('#tbody .mobile-lite-card').length,
          tableRows:document.querySelectorAll('#tbody > tr').length,
          firstCard:describe(firstCard),
          firstCardText:firstCard?.textContent?.replace(/\s+/g, ' ').trim() || '',
          firstRowClass:document.querySelector('#tbody > tr')?.className || '',
          toolbar:describe(toolbar),
          toolbarChildren:toolbar ? [...toolbar.children].map(describe) : [],
        },
      };
    });

    const requestedFullRegistry = requests.some(item => item.path.startsWith('/api/registry'));
    const fullStarts = state.probe?.fullRegistryStarts || [];
    const firstFullStart = fullStarts[0] || null;
    const firstLiteReady = state.probe?.mobileLiteReady?.[0] || null;
    const stalledObserved = (state.probe?.mobileLiteStalled || []).length > 0;
    const overlappingOwners = Boolean(firstFullStart && firstLiteReady && firstFullStart.atMs < firstLiteReady.atMs);
    const desktopEnhancerSkipped = state.datasets.firstPageClinical === 'mobile-lite-skipped';
    const mobileToolbarTagged = String(state.geometry.toolbar?.className || '').split(/\s+/).includes('registry-filter-panel-unified');
    const toolbarHeight = Number(state.geometry.toolbar?.rect?.height || 0);
    const layoutWarnings = [];
    if (toolbarHeight > 110) layoutWarnings.push(`mobile toolbar is ${toolbarHeight}px tall`);
    if (!desktopEnhancerSkipped) layoutWarnings.push('desktop first-page enhancer did not expose the mobile-lite skip marker');
    if (!mobileToolbarTagged) layoutWarnings.push('mobile toolbar is missing registry-filter-panel-unified marker');

    const report = {
      generatedAt:new Date().toISOString(),
      browser:BROWSER_NAME === 'chromium' ? 'chromium' : 'webkit',
      viewport:{ width:390, height:844 },
      delayedRegistryPageMs:MOBILE_SEARCH_DELAY_MS,
      mobileStallThresholdMs:MOBILE_STALL_THRESHOLD_MS,
      stalledObserved,
      requestedFullRegistry,
      overlappingOwners,
      desktopEnhancerSkipped,
      mobileToolbarTagged,
      layoutWarnings,
      requests:requests.filter(item => /\/api\/(?:drug-search|registry)/.test(item.path)),
      state,
    };

    console.log(`\nPHASE0_RUNTIME_REPORT ${JSON.stringify(report, null, 2)}\n`);

    if (ASSERT_SINGLE_OWNER) {
      assert.equal(fullStarts.length, 0, 'Full registry runtime started during delayed phone startup.');
      assert.equal(requestedFullRegistry, false, 'The full registry data path was requested during delayed phone startup.');
      assert.equal(overlappingOwners, false, 'Both mobile-lite and full registry became active during the same phone startup.');
      assert.equal(state.mobileLiteActive, true, 'Mobile-lite must remain the active list owner.');
      assert.equal(state.datasets.registryMobileLiteReady, '1', 'Mobile-lite did not reach ready state after the delayed bounded response.');
      assert.equal(state.datasets.registryRuntimeMode, 'mobile-lite', 'Runtime loader did not settle back to mobile-lite mode.');
      assert.equal(desktopEnhancerSkipped, true, 'Desktop first-page enhancer must stay out of the mobile-lite phone DOM.');
      assert.equal(mobileToolbarTagged, true, 'The canonical phone toolbar marker is missing.');
      if (MOBILE_SEARCH_DELAY_MS >= MOBILE_STALL_THRESHOLD_MS + 500) {
        assert.equal(stalledObserved, true, 'Expected the diagnostic stalled event without a full-runtime takeover.');
      }
    }

    await context.close();
    return report;
  } finally {
    await browser.close();
  }
}

(async () => {
  runBuild();
  const server = await startFixtureServer();
  try {
    await runBrowserProbe();
  } finally {
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Phase 0 runtime forensic audit failed:', error);
  process.exitCode = 1;
});