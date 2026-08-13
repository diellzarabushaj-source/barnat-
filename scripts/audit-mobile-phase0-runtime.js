'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { webkit, chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PHASE0_PORT || 4175);
const BASE = `http://127.0.0.1:${PORT}`;
const MOBILE_SEARCH_DELAY_MS = Number(process.env.PHASE0_MOBILE_SEARCH_DELAY_MS || 5600);
const SKIP_BUILD = process.env.PHASE0_SKIP_BUILD === '1';
const EXPECT_CURRENT_RACE = process.argv.includes('--expect-current-race');
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
        handoffs:[],
        registryReady:[],
      };
      window.__MEDINDEX_PHASE0_PROBE = probe;
      const stamp = () => Math.round((performance.now() - startedAt) * 10) / 10;
      window.addEventListener('medindex:full-registry-started', event => {
        probe.fullRegistryStarts.push({ atMs:stamp(), reason:String(event.detail?.reason || '') });
      });
      window.addEventListener('medindex:mobile-lite-ready', event => {
        probe.mobileLiteReady.push({ atMs:stamp(), detail:event.detail || null });
      });
      window.addEventListener('medindex:request-full-registry', event => {
        probe.handoffs.push({ atMs:stamp(), reason:String(event.detail?.reason || '') });
      });
      window.addEventListener('medindex:registry-ready', event => {
        probe.registryReady.push({ atMs:stamp(), detail:event.detail || null });
      });
    });

    await installDelayedDrugSearchRoute(page);
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'), null, { timeout:10000 });
    await page.waitForFunction(() => Boolean(document.documentElement.dataset.registryMobileLite), null, { timeout:5000 });

    // The current loader grace is 5 s. The diagnostic response intentionally arrives after it.
    await page.waitForTimeout(MOBILE_SEARCH_DELAY_MS + 2600);

    const state = await page.evaluate(() => {
      const html = document.documentElement;
      const firstCard = document.querySelector('#tbody .mobile-lite-card');
      return {
        probe:window.__MEDINDEX_PHASE0_PROBE,
        datasets:{
          registryMobileLite:html.dataset.registryMobileLite || '',
          registryMobileLiteReady:html.dataset.registryMobileLiteReady || '',
          registryMobileLiteState:html.dataset.registryMobileLiteState || '',
          registryRuntimeMode:html.dataset.registryRuntimeMode || '',
          registryRuntimeReason:html.dataset.registryRuntimeReason || '',
        },
        mobileLiteActive:window.MEDINDEX_MOBILE_LITE_ACTIVE === true,
        mobileLiteState:window.MEDINDEX_MOBILE_LITE?.getState?.() || null,
        fullRuntimeVersion:window.MEDINDEX_APP_VERSION || '',
        geometry:{
          mobileLiteCards:document.querySelectorAll('#tbody .mobile-lite-card').length,
          tableRows:document.querySelectorAll('#tbody > tr').length,
          firstCardText:firstCard?.textContent?.replace(/\s+/g, ' ').trim() || '',
          firstRowClass:document.querySelector('#tbody > tr')?.className || '',
        },
      };
    });

    const firstFullStart = state.probe?.fullRegistryStarts?.[0] || null;
    const firstLiteReady = state.probe?.mobileLiteReady?.[0] || null;
    const requestedFullRegistry = requests.some(item => item.path.startsWith('/api/registry'));
    const timeoutStart = state.probe?.fullRegistryStarts?.some(item => item.reason === 'mobile-lite-timeout') || false;
    const overlappingOwners = Boolean(
      timeoutStart
      && firstLiteReady
      && firstFullStart
      && firstFullStart.atMs < firstLiteReady.atMs
      && state.mobileLiteActive
    );

    const report = {
      generatedAt:new Date().toISOString(),
      browser:BROWSER_NAME === 'chromium' ? 'chromium' : 'webkit',
      viewport:{ width:390, height:844 },
      delayedRegistryPageMs:MOBILE_SEARCH_DELAY_MS,
      requestedFullRegistry,
      overlappingOwners,
      requests:requests.filter(item => /\/api\/(?:drug-search|registry)/.test(item.path)),
      state,
    };

    console.log(`\nPHASE0_RUNTIME_REPORT ${JSON.stringify(report, null, 2)}\n`);

    if (EXPECT_CURRENT_RACE) {
      assert.equal(timeoutStart, true, 'Expected the current 5 s mobile-lite timeout takeover to be observable.');
      assert.equal(requestedFullRegistry, true, 'Expected the full registry data path to be requested after timeout takeover.');
      assert.equal(overlappingOwners, true, 'Expected mobile-lite to become ready after the full runtime had already started.');
    }

    if (ASSERT_SINGLE_OWNER) {
      assert.equal(timeoutStart, false, 'Mobile-lite lost list ownership to the full runtime timeout path.');
      assert.equal(requestedFullRegistry, false, 'The full registry data path was requested during normal delayed mobile startup.');
      assert.equal(overlappingOwners, false, 'Both mobile-lite and full registry became active during the same mobile startup.');
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
