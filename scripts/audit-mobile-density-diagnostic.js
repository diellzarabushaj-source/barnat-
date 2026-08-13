'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MOBILE_DENSITY_PORT || 4180);
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
      if (!ready) {
        child.kill('SIGTERM');
        reject(new Error(`density server timeout: ${stderr}`));
      }
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      process.stdout.write(`[density-server] ${chunk}`);
      if (!ready && /Registry performance server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(`[density-server] ${chunk}`);
    });
  });
}

function rows() {
  return Array.from({ length:25 }, (_, index) => ({
    id:`density-${index + 1}`,
    registryNumber:String(index + 1),
    pdid:String(95000 + index),
    tradeName:index === 0 ? 'DULCOLAX' : `DENSITY DRUG ${index + 1}`,
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
        const item = rows()[0];
        await route.fulfill({ status:200, contentType:'application/json; charset=utf-8', body:JSON.stringify({ ok:true, row:item }) });
        return;
      }
      await route.fulfill({ status:200, contentType:'application/json; charset=utf-8', body:JSON.stringify({ ok:true, results:[] }) });
    });

    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-card').nth(9).waitFor({ state:'attached', timeout:10000 });
    await page.locator('#miRegistryBottomNav').waitFor({ state:'attached', timeout:10000 });
    await page.waitForTimeout(100);

    const report = await page.evaluate(() => {
      const rect = node => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height };
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
          height:style.height,
          minHeight:style.minHeight,
          marginTop:style.marginTop,
          marginBottom:style.marginBottom,
          paddingTop:style.paddingTop,
          paddingBottom:style.paddingBottom,
          gridTemplateColumns:style.gridTemplateColumns,
          rect:rect(node),
        };
      };
      const search = document.getElementById('search');
      const toolbar = search?.closest('.registry-filter-panel-unified,.toolbar');
      const flowSelectors = [
        '.mi-content-container',
        '.mi-page-heading',
        '.mi-index-content',
        '.registry-overview',
        '.toolbar',
        '.registry-filter-panel-unified',
        '.registry-toolbar-secondary',
        '.mi-registry-mobile-filter-bar',
        '.registry-table-bar',
        '#registryContent',
        '.table-wrap',
        '#dataTable',
        '#tbody',
        '#tbody .mobile-lite-row',
        '#tbody .mobile-lite-card',
        '#pagination',
      ];
      return {
        viewport:{ width:innerWidth, height:innerHeight },
        htmlClass:document.documentElement.className,
        htmlDataset:{ ...document.documentElement.dataset },
        bodyClass:document.body.className,
        toolbar:describe(toolbar),
        toolbarChildren:toolbar ? [...toolbar.children].map(describe) : [],
        flow:flowSelectors.map(selector => ({ selector, node:describe(document.querySelector(selector)) })),
      };
    });

    console.log(`\nMOBILE_DENSITY_DIAGNOSTIC ${JSON.stringify(report, null, 2)}\n`);
    await context.close();
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Mobile density diagnostic failed:', error);
  process.exitCode = 1;
});