'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MOBILE_DETAIL_PORT || 4182);
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.env.MOBILE_DETAIL_SKIP_BUILD === '1';

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
      reject(new Error(`Mobile detail fixture server did not start. ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      process.stdout.write(`[mobile-detail-server] ${chunk}`);
      if (!ready && /Registry performance server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(`[mobile-detail-server] ${chunk}`);
    });
    child.once('exit', code => {
      if (ready) return;
      clearTimeout(timeout);
      reject(new Error(`Mobile detail fixture server exited early (${code}). ${stderr}`));
    });
  });
}

function rows() {
  return Array.from({ length:25 }, (_, index) => ({
    id:`detail-${index + 1}`,
    registryNumber:String(index + 1),
    pdid:String(93000 + index),
    tradeName:index === 0 ? 'DULCOLAX' : `DETAIL DRUG ${index + 1}`,
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
            drugClass:'Laksativ stimulues',
            use:'Trajtim afatshkurtër i kapsllëkut.',
            packaging:'20 tableta',
            manufacturer:'Phase 3 fixture',
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/dosage**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('view') !== 'card') {
      await route.continue();
      return;
    }
    const id = url.searchParams.get('id') || 'detail-1';
    await route.fulfill({
      status:200,
      contentType:'application/json; charset=utf-8',
      body:JSON.stringify({
        ok:true,
        drugId:id,
        profile:{
          verificationStatus:'verified',
          summary:'Kartelë klinike e kufizuar për auditimin mobile.',
          indications:'Kapsllëk.',
          warnings:'Përdoreni sipas indikacionit klinik.',
        },
        adult:{
          dose:'5–10 mg një herë në ditë.',
          route:'PO',
          verification:'text_verified',
          indication:'Kapsllëk',
        },
        pediatric:{ dose:'', route:'', verification:'' },
        sources:[],
      }),
    });
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const main = document.querySelector('.mi-main');
    const dialog = document.getElementById('mobileLiteDrugDetail');
    const sheet = dialog?.querySelector('.mobile-lite-detail-sheet');
    const body = dialog?.querySelector('[data-mobile-lite-detail-body]');
    const active = document.activeElement;
    const row = document.querySelector('#tbody .mobile-lite-row');
    const card = row?.querySelector('.mobile-lite-card');
    const style = node => node ? getComputedStyle(node) : null;
    const rect = node => {
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return { top:value.top, right:value.right, bottom:value.bottom, left:value.left, width:value.width, height:value.height };
    };
    return {
      bodyClass:document.body.className,
      dialogHidden:Boolean(dialog?.hidden),
      dialogCount:document.querySelectorAll('#mobileLiteDrugDetail').length,
      dialogRole:sheet?.getAttribute('role') || '',
      dialogModal:sheet?.getAttribute('aria-modal') || '',
      sheet:rect(sheet),
      sheetOverflow:style(sheet)?.overflow || '',
      detailBodyOverflowY:style(body)?.overflowY || '',
      mainOverflowY:style(main)?.overflowY || '',
      mainScrollTop:main?.scrollTop || 0,
      rowHeight:rect(row)?.height || 0,
      cardHeight:rect(card)?.height || 0,
      activeClass:active?.className || '',
      activeClose:Boolean(active?.matches?.('#mobileLiteDrugDetail [data-mobile-lite-close]')),
      fullRuntimeLoaded:Boolean(document.querySelector('script[data-medindex-app-performance]')),
      runtimeMode:document.documentElement.dataset.registryRuntimeMode || '',
      detailState:window.MEDINDEX_MOBILE_LITE?.getDetailState?.() || null,
    };
  });
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
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-card').nth(10).waitFor({ state:'attached', timeout:10000 });

    const trigger = page.locator('#tbody .mobile-lite-more').nth(6);
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);
    const beforeScroll = await page.locator('.mi-main').evaluate(node => node.scrollTop);
    const beforeRowHeight = await page.locator('#tbody .mobile-lite-row').nth(6).evaluate(node => node.getBoundingClientRect().height);

    await trigger.click();
    await page.locator('body.mobile-lite-detail-open').waitFor({ state:'attached', timeout:5000 });
    await page.locator('#mobileLiteDrugDetail [data-mi-phase4-clinical]').waitFor({ state:'attached', timeout:5000 });
    await page.waitForTimeout(50);

    const open = await snapshot(page);
    assert.equal(open.dialogHidden, false, 'Detail sheet did not become visible.');
    assert.equal(open.dialogCount, 1, 'More than one detail dialog exists.');
    assert.equal(open.dialogRole, 'dialog', 'Detail surface must expose dialog semantics.');
    assert.equal(open.dialogModal, 'true', 'Detail surface must be modal on phones.');
    assert.ok(open.sheet && open.sheet.height > 180 && open.sheet.height <= 760, `Detail sheet height is outside the bounded mobile range: ${open.sheet?.height}.`);
    assert.equal(open.detailBodyOverflowY, 'auto', 'Detail content must own vertical scrolling.');
    assert.equal(open.mainOverflowY, 'hidden', 'Registry scroll owner must lock while detail is open.');
    assert.equal(open.activeClose, true, 'Keyboard focus must move into the detail sheet on open.');
    assert.equal(open.fullRuntimeLoaded, false, 'Opening detail woke the full registry runtime.');
    assert.equal(open.runtimeMode, 'mobile-lite', 'Opening detail changed the lightweight renderer owner.');
    assert.ok(Math.abs(open.rowHeight - beforeRowHeight) <= 1, `Opening detail expanded the table row (${beforeRowHeight} -> ${open.rowHeight}).`);
    assert.ok(open.cardHeight <= 150, `Opening detail inflated the collapsed medicine card (${open.cardHeight}px).`);
    assert.equal(open.detailState?.open, true, 'Detail diagnostics did not expose the open state.');

    await page.keyboard.press('Tab');
    const focusInside = await page.evaluate(() => Boolean(document.activeElement?.closest?.('#mobileLiteDrugDetail')));
    assert.equal(focusInside, true, 'Tab escaped the modal detail surface.');

    await page.keyboard.press('Escape');
    await page.locator('body.mobile-lite-detail-open').waitFor({ state:'detached', timeout:5000 });
    await page.waitForTimeout(80);
    const afterEscape = await snapshot(page);
    const triggerFocused = await trigger.evaluate(node => document.activeElement === node);
    assert.equal(afterEscape.dialogHidden, true, 'Escape did not close the detail sheet.');
    assert.ok(Math.abs(afterEscape.mainScrollTop - beforeScroll) <= 1, `Scroll position was not restored after close (${beforeScroll} -> ${afterEscape.mainScrollTop}).`);
    assert.equal(triggerFocused, true, 'Focus did not return to the medicine action that opened detail.');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'Trigger aria-expanded did not reset after close.');
    assert.equal(afterEscape.fullRuntimeLoaded, false, 'Closing detail woke the full registry runtime.');
    assert.equal(afterEscape.detailState?.open, false, 'Detail diagnostics did not expose the closed state.');

    await trigger.click();
    await page.locator('body.mobile-lite-detail-open').waitFor({ state:'attached', timeout:5000 });
    await page.locator('#mobileLiteDrugDetail .mobile-lite-detail-backdrop').click({ position:{ x:4, y:4 } });
    await page.locator('body.mobile-lite-detail-open').waitFor({ state:'detached', timeout:5000 });
    await page.waitForTimeout(50);
    const afterBackdrop = await snapshot(page);
    assert.ok(Math.abs(afterBackdrop.mainScrollTop - beforeScroll) <= 1, 'Backdrop close did not restore the registry scroll position.');
    assert.equal(afterBackdrop.fullRuntimeLoaded, false, 'Backdrop close woke the full registry runtime.');

    assert.ok(apiRequests.some(value => value.startsWith('/api/drug-search?view=registry-detail')), 'Targeted registry detail request was not made.');
    assert.ok(apiRequests.some(value => value.startsWith('/api/dosage?view=card')), 'Targeted clinical card request was not made.');
    assert.equal(apiRequests.some(value => value.startsWith('/api/registry')), false, 'Detail sheet requested the full registry API.');

    console.log(`\nMOBILE_DETAIL_PHASE3_REPORT ${JSON.stringify({ generatedAt:new Date().toISOString(), beforeScroll, beforeRowHeight, apiRequests, open, afterEscape, afterBackdrop }, null, 2)}\n`);
    await context.close();
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Mobile detail Phase 3 audit failed:', error);
  process.exitCode = 1;
});