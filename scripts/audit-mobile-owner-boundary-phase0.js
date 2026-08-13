'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MOBILE_OWNER_BOUNDARY_PORT || 4181);
const BASE = `http://127.0.0.1:${PORT}`;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'registry-performance-server.js')], {
      cwd:ROOT,
      env:{ ...process.env, PERFORMANCE_PORT:String(PORT) },
      stdio:['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    let stderr = '';
    const timer = setTimeout(() => {
      if (ready) return;
      child.kill('SIGTERM');
      reject(new Error(`mobile owner boundary server timeout: ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (!ready && /Registry performance server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
  });
}

function fixtureRows() {
  return Array.from({ length:25 }, (_, index) => ({
    id:`owner-${index + 1}`,
    registryNumber:String(index + 1),
    pdid:String(96000 + index),
    tradeName:index === 0 ? 'DULCOLAX' : `OWNER DRUG ${index + 1}`,
    activeSubstance:index === 0 ? 'Bisacodyl' : `Substance ${index + 1}`,
    atc:index === 0 ? 'A06AB02' : 'N02BE01',
    strength:index === 0 ? '5 mg' : '500 mg',
    form:index === 0 ? 'Gastro-resistant tablet' : 'Tablet',
    productStatus:'Gjenerik',
  }));
}

(async () => {
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
    const registryRequests = [];

    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/registry') registryRequests.push(url.href);
    });

    await page.route('**/api/drug-search**', async route => {
      const url = new URL(route.request().url());
      const view = url.searchParams.get('view') || '';
      const rows = fixtureRows();
      if (view === 'registry-page') {
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
          body:JSON.stringify({ ok:true, row:rows[0] }),
        });
        return;
      }
      await route.fulfill({ status:200, contentType:'application/json; charset=utf-8', body:JSON.stringify({ ok:true, results:[] }) });
    });

    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('html[data-registry-mobile-phase8]').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-card').nth(9).waitFor({ state:'attached', timeout:10000 });
    await page.waitForTimeout(120);

    const state = await page.evaluate(() => {
      const visible = node => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const rect = node => {
        if (!(node instanceof HTMLElement)) return null;
        const value = node.getBoundingClientRect();
        return {
          top:value.top,
          right:value.right,
          bottom:value.bottom,
          left:value.left,
          width:value.width,
          height:value.height,
        };
      };
      const intersects = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
      const row = document.querySelector('#tbody .mobile-lite-row');
      const cardCell = row ? Array.from(row.children).find(cell => cell.querySelector('.mobile-lite-card')) : null;
      const cells = row ? Array.from(row.children) : [];
      const preview = row?.querySelector('.registry-cell-preview-trigger') || null;
      const header = document.querySelector('.mi-index-content > header');
      const viewToolbar = document.getElementById('registryViewToolbar');
      const search = document.getElementById('search');
      const toolbar = search?.closest('.registry-filter-panel-unified,.toolbar') || null;
      const card = row?.querySelector('.mobile-lite-card') || null;
      const favorite = card?.querySelector('.mi-mobile-favorite-toggle') || null;
      const more = card?.querySelector('.mobile-lite-more') || null;
      const open = card?.querySelector('.mobile-lite-open') || null;
      const cardRect = rect(card);
      const favoriteRect = rect(favorite);
      const moreRect = rect(more);
      const openRect = rect(open);
      return {
        phase8:document.documentElement.dataset.registryMobilePhase8 || '',
        legacyHeaderDisplay:header ? getComputedStyle(header).display : 'missing',
        viewToolbarDisplay:viewToolbar ? getComputedStyle(viewToolbar).display : 'missing',
        toolbar:rect(toolbar),
        row:rect(row),
        card:cardRect,
        cardCell:rect(cardCell),
        favorite:favoriteRect,
        more:moreRect,
        open:openRect,
        favoriteMoreOverlap:intersects(favoriteRect, moreRect),
        favoriteOutsideCard:Boolean(favoriteRect && cardRect && (favoriteRect.left < cardRect.left || favoriteRect.right > cardRect.right || favoriteRect.top < cardRect.top || favoriteRect.bottom > cardRect.bottom)),
        moreOutsideCard:Boolean(moreRect && cardRect && (moreRect.left < cardRect.left || moreRect.right > cardRect.right || moreRect.top < cardRect.top || moreRect.bottom > cardRect.bottom)),
        directCellCount:cells.length,
        visibleDirectCellCount:cells.filter(visible).length,
        extraVisibleCells:cells.filter(cell => cell !== cardCell && visible(cell)).map(cell => ({ className:cell.className, text:String(cell.textContent || '').trim().slice(0,80) })),
        previewVisible:Boolean(preview && visible(preview)),
        horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });

    console.log(`MOBILE_OWNER_BOUNDARY_PHASE0 ${JSON.stringify({ ...state, registryRequestCount:registryRequests.length })}`);

    assert.ok(state.phase8, 'Phase 8 mobile owner layer did not initialize.');
    assert.equal(state.legacyHeaderDisplay, 'none', 'Legacy registry header is still visible under mobile-lite ownership.');
    assert.ok(['none','missing'].includes(state.viewToolbarDisplay), 'Shared registry view toolbar is still visible on mobile-lite.');
    assert.ok(state.toolbar && state.toolbar.height <= 94, `Mobile search/count toolbar is too tall (${state.toolbar?.height}px).`);
    assert.equal(state.visibleDirectCellCount, 1, `Mobile-lite row exposes ${state.visibleDirectCellCount} visible direct cells instead of one canonical card cell.`);
    assert.deepEqual(state.extraVisibleCells, [], 'Shared synthetic cells are visible beside the mobile-lite card.');
    assert.equal(state.previewVisible, false, 'Desktop cell-preview trigger is visible inside a mobile-lite row.');
    assert.ok(state.row && state.card && Math.abs(state.row.width - state.card.width) <= 4, `Mobile card does not own row width (row=${state.row?.width}, card=${state.card?.width}).`);

    // Phase 2 screenshot-regression gates: both actions must remain real 44px
    // touch targets, stay inside the compact card and never intersect.
    assert.ok(state.card && state.card.height >= 96 && state.card.height <= 112, `Mobile medicine card density drifted outside 96–112px (${state.card?.height}px).`);
    assert.ok(state.favorite && state.favorite.width >= 43 && state.favorite.height >= 43, 'Favorite action fell below the 44px touch target.');
    assert.ok(state.more && state.more.height >= 43, '“Më shumë” action fell below the 44px touch target.');
    assert.equal(state.favoriteMoreOverlap, false, 'Favorite action overlaps “Më shumë”.');
    assert.equal(state.favoriteOutsideCard, false, 'Favorite action escapes the medicine card bounds.');
    assert.equal(state.moreOutsideCard, false, '“Më shumë” action escapes the medicine card bounds.');
    assert.ok(state.open && state.card && state.open.right <= state.card.right + 1, 'Primary medicine content escapes the card bounds.');

    assert.equal(state.horizontalOverflow, false, 'Mobile-lite ownership boundary introduced horizontal overflow.');
    assert.equal(registryRequests.length, 0, 'Mobile-lite boundary woke /api/registry.');

    await context.close();
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Mobile Phase 0 owner boundary audit failed:', error);
  process.exitCode = 1;
});