'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.MOBILE_GEOMETRY_PORT || 4176);
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.env.MOBILE_GEOMETRY_SKIP_BUILD === '1';
const WIDTHS = [320, 360, 375, 390, 430];

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
      reject(new Error(`Geometry fixture server did not start. ${stderr}`));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      process.stdout.write(`[geometry-server] ${chunk}`);
      if (!ready && /Registry performance server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(`[geometry-server] ${chunk}`);
    });
    child.once('exit', code => {
      if (ready) return;
      clearTimeout(timeout);
      reject(new Error(`Geometry fixture server exited early (${code}). ${stderr}`));
    });
  });
}

function rows() {
  return Array.from({ length:25 }, (_, index) => ({
    id:`geometry-${index + 1}`,
    registryNumber:String(index + 1),
    pdid:String(91000 + index),
    tradeName:index === 0 ? 'DULCOLAX' : index === 1 ? 'VERY LONG MEDICINE NAME FOR NARROW IPHONE CARD' : `GEOMETRY DRUG ${index + 1}`,
    activeSubstance:index === 0 ? 'Bisacodyl' : index === 1 ? 'Long active substance name for wrapping verification' : `Substance ${index + 1}`,
    atc:index === 0 ? 'A06AB02' : 'N02BE01',
    strength:index === 0 ? '5 mg' : '500 mg',
    form:index === 0 ? 'Gastro-resistant tablet' : 'Film coated tablet',
    productStatus:'Gjenerik',
  }));
}

async function installApiRoute(page) {
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
      await route.fulfill({ status:200, contentType:'application/json; charset=utf-8', body:JSON.stringify({ ok:true, row:item }) });
      return;
    }
    await route.continue();
  });
}

function overlap(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

function inside(inner, outer) {
  return Boolean(inner && outer
    && inner.left >= outer.left - 0.5
    && inner.right <= outer.right + 0.5
    && inner.top >= outer.top - 0.5
    && inner.bottom <= outer.bottom + 0.5);
}

async function auditWidth(browser, width) {
  const context = await browser.newContext({
    viewport:{ width, height:844 },
    serviceWorkers:'block',
    isMobile:true,
    hasTouch:true,
  });
  try {
    const page = await context.newPage();
    await installApiRoute(page);
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.locator('html.auth-ready').waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-card').nth(9).waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mi-mobile-favorite-toggle').nth(9).waitFor({ state:'attached', timeout:10000 });
    await page.locator('#tbody .mobile-lite-actions').nth(9).waitFor({ state:'attached', timeout:10000 });

    const result = await page.evaluate(() => {
      const rect = node => {
        const value = node.getBoundingClientRect();
        return { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height };
      };
      const style = node => {
        if (!node) return null;
        const value = getComputedStyle(node);
        return {
          display:value.display,
          position:value.position,
          width:value.width,
          height:value.height,
          minHeight:value.minHeight,
          maxHeight:value.maxHeight,
          overflow:value.overflow,
          overflowY:value.overflowY,
          contain:value.contain,
          transform:value.transform,
          gridTemplateColumns:value.gridTemplateColumns,
          gridAutoRows:value.gridAutoRows,
          gap:value.gap,
          padding:value.padding,
          paddingTop:value.paddingTop,
          paddingRight:value.paddingRight,
          paddingBottom:value.paddingBottom,
          paddingLeft:value.paddingLeft,
        };
      };

      function matchingPaddingRules(node) {
        if (!node) return [];
        const matches = [];
        let order = 0;
        const rememberRules = (rules, href, context = []) => {
          if (!rules) return;
          for (const rule of rules) {
            order += 1;
            if (rule.type === CSSRule.STYLE_RULE) {
              const selector = rule.selectorText || '';
              let selectorMatches = false;
              try { selectorMatches = Boolean(selector && node.matches(selector)); } catch {}
              if (!selectorMatches) continue;
              const hasPadding = rule.style?.getPropertyValue('padding')
                || rule.style?.getPropertyValue('padding-top')
                || rule.style?.getPropertyValue('padding-right')
                || rule.style?.getPropertyValue('padding-bottom')
                || rule.style?.getPropertyValue('padding-left');
              if (!hasPadding) continue;
              matches.push({
                order,
                href:href || 'inline-style-sheet',
                context,
                selector,
                padding:rule.style.getPropertyValue('padding'),
                paddingPriority:rule.style.getPropertyPriority('padding'),
                paddingTop:rule.style.getPropertyValue('padding-top'),
                paddingTopPriority:rule.style.getPropertyPriority('padding-top'),
                paddingRight:rule.style.getPropertyValue('padding-right'),
                paddingBottom:rule.style.getPropertyValue('padding-bottom'),
                paddingBottomPriority:rule.style.getPropertyPriority('padding-bottom'),
                paddingLeft:rule.style.getPropertyValue('padding-left'),
              });
              continue;
            }
            if ('cssRules' in rule) {
              let childRules = null;
              try { childRules = rule.cssRules; } catch {}
              if (!childRules) continue;
              const condition = rule.conditionText || rule.name || rule.constructor?.name || 'group';
              rememberRules(childRules, href, [...context, String(condition)]);
            }
          }
        };

        for (const sheet of [...document.styleSheets]) {
          let rules = null;
          try { rules = sheet.cssRules; } catch {}
          if (rules) rememberRules(rules, sheet.href || 'inline-style-sheet');
        }
        if (Array.isArray(document.adoptedStyleSheets)) {
          for (const sheet of document.adoptedStyleSheets) {
            let rules = null;
            try { rules = sheet.cssRules; } catch {}
            if (rules) rememberRules(rules, 'adopted-style-sheet');
          }
        }
        return matches;
      }

      const tbody = document.getElementById('tbody');
      const cards = [...document.querySelectorAll('#tbody .mobile-lite-card')].slice(0, 10).map((card, index) => {
        const favorite = card.querySelector('.mi-mobile-favorite-toggle');
        const more = card.querySelector('.mobile-lite-more');
        const open = card.querySelector('.mobile-lite-open');
        const actions = card.querySelector('.mobile-lite-actions');
        const detailTriggers = [...card.querySelectorAll('[data-mobile-lite-detail]')];
        const favoriteControls = [...card.querySelectorAll('[data-mi-mobile-favorite]')];
        const moreControls = [...card.querySelectorAll('.mobile-lite-more')];
        const row = card.closest('.mobile-lite-row');
        const cell = card.closest('td');
        const rowChildren = row ? [...row.children].map(child => ({
          tag:child.tagName,
          className:child.className || '',
          display:getComputedStyle(child).display,
          rect:rect(child),
        })) : [];
        return {
          index,
          row:row ? rect(row) : null,
          rowStyle:style(row),
          rowChildren,
          cell:cell ? rect(cell) : null,
          cellStyle:style(cell),
          card:rect(card),
          cardStyle:style(card),
          cardInlineStyle:card.getAttribute('style') || '',
          paddingRules:index === 1 ? matchingPaddingRules(card) : [],
          actions:actions ? rect(actions) : null,
          actionsStyle:style(actions),
          favorite:favorite ? rect(favorite) : null,
          more:more ? rect(more) : null,
          open:open ? rect(open) : null,
          openTag:open?.tagName || '',
          detailTriggerCount:detailTriggers.length,
          favoriteControlCount:favoriteControls.length,
          moreControlCount:moreControls.length,
          text:(card.textContent || '').replace(/\s+/g, ' ').trim(),
        };
      });
      return {
        cards,
        tbodyRect:tbody ? rect(tbody) : null,
        tbodyStyle:style(tbody),
        htmlPhase8:document.documentElement.dataset.registryMobilePhase8 || '',
        viewport:{ width:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth },
        runtimeMode:document.documentElement.dataset.registryRuntimeMode || '',
        fullRuntimeLoaded:Boolean(document.querySelector('script[data-medindex-app-performance]')),
      };
    });

    const normalized = result.cards.map((card, index, cards) => {
      const rowBoxless = card.rowStyle?.display === 'contents';
      const horizontalOwner = rowBoxless ? result.tbodyRect : card.row;
      return {
        ...card,
        rowBoxless,
        favoriteMoreOverlap:card.favorite && card.more ? overlap(card.favorite, card.more) : 0,
        adjacentCardOverlap:index < cards.length - 1 ? overlap(card.card, cards[index + 1].card) : 0,
        favoriteInside:inside(card.favorite, card.card),
        moreInside:inside(card.more, card.card),
        actionsInside:inside(card.actions, card.card),
        rowOwnsCard:rowBoxless ? true : Boolean(card.row && card.row.top <= card.card.top + 0.5 && card.row.bottom >= card.card.bottom - 0.5 && card.row.height >= card.card.height - 0.5),
        cellOwnsCard:card.cell ? card.cell.top <= card.card.top + 0.5 && card.cell.bottom >= card.card.bottom - 0.5 && card.cell.height >= card.card.height - 0.5 : false,
        cellWidthRatio:horizontalOwner && card.cell && horizontalOwner.width > 0 ? card.cell.width / horizontalOwner.width : 0,
        cardWidthRatio:horizontalOwner && card.card && horizontalOwner.width > 0 ? card.card.width / horizontalOwner.width : 0,
      };
    });

    const report = {
      width,
      horizontalOverflow:result.viewport.scrollWidth > result.viewport.width + 1,
      runtimeMode:result.runtimeMode,
      fullRuntimeLoaded:result.fullRuntimeLoaded,
      htmlPhase8:result.htmlPhase8,
      tbodyRect:result.tbodyRect,
      tbodyStyle:result.tbodyStyle,
      rowBoxlessCount:normalized.filter(card => card.rowBoxless).length,
      minCardHeight:Math.min(...normalized.map(card => card.card.height)),
      maxCardHeight:Math.max(...normalized.map(card => card.card.height)),
      minCardWidthRatio:Math.min(...normalized.map(card => card.cardWidthRatio)),
      actionOverlapCount:normalized.filter(card => card.favoriteMoreOverlap > 0.5).length,
      actionRegionMissingCount:normalized.filter(card => !card.actions).length,
      actionRegionOutsideCount:normalized.filter(card => !card.actionsInside).length,
      duplicateDetailTriggerCount:normalized.filter(card => card.detailTriggerCount !== 1).length,
      duplicateFavoriteControlCount:normalized.filter(card => card.favoriteControlCount !== 1).length,
      duplicateMoreControlCount:normalized.filter(card => card.moreControlCount !== 1).length,
      interactiveSummaryCount:normalized.filter(card => card.openTag === 'BUTTON').length,
      adjacentCardOverlapCount:normalized.filter(card => card.adjacentCardOverlap > 0.5).length,
      outsideCardCount:normalized.filter(card => !card.favoriteInside || !card.moreInside).length,
      rowContainmentFailureCount:normalized.filter(card => !card.rowOwnsCard || !card.cellOwnsCard).length,
      horizontalOwnershipFailureCount:normalized.filter(card => card.cellWidthRatio < 0.95 || card.cardWidthRatio < 0.95).length,
      cards:normalized,
    };

    console.log(`\nMOBILE_CARD_GEOMETRY_WIDTH_REPORT ${JSON.stringify(report, null, 2)}\n`);

    assert.equal(report.horizontalOverflow, false, `${width}px: horizontal overflow detected.`);
    assert.equal(report.fullRuntimeLoaded, false, `${width}px: full registry runtime should not wake for normal card rendering.`);
    assert.equal(report.actionOverlapCount, 0, `${width}px: favorite and Më shumë overlap.`);
    assert.equal(report.actionRegionMissingCount, 0, `${width}px: explicit mobile card action region is missing.`);
    assert.equal(report.actionRegionOutsideCount, 0, `${width}px: mobile card action region escaped the card.`);
    assert.equal(report.duplicateDetailTriggerCount, 0, `${width}px: card must expose exactly one detail trigger.`);
    assert.equal(report.duplicateFavoriteControlCount, 0, `${width}px: card must expose exactly one favorite control.`);
    assert.equal(report.duplicateMoreControlCount, 0, `${width}px: card must expose exactly one Më shumë control.`);
    assert.equal(report.interactiveSummaryCount, 0, `${width}px: card summary must be passive; only Më shumë opens details.`);
    assert.equal(report.adjacentCardOverlapCount, 0, `${width}px: adjacent medicine cards overlap in the vertical flow.`);
    assert.equal(report.outsideCardCount, 0, `${width}px: an action escaped the card bounds.`);
    assert.equal(report.rowContainmentFailureCount, 0, `${width}px: the mobile flow/cell does not own the full medicine card height.`);
    assert.equal(report.horizontalOwnershipFailureCount, 0, `${width}px: a medicine card/cell does not own the full mobile flow width.`);
    assert.ok(report.minCardHeight >= 96, `${width}px: card touch/content height became too small (${report.minCardHeight}).`);
    assert.ok(report.maxCardHeight <= 150, `${width}px: compact card became too tall (${report.maxCardHeight}).`);
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
    console.log(`\nMOBILE_CARD_GEOMETRY_REPORT ${JSON.stringify({ generatedAt:new Date().toISOString(), reports }, null, 2)}\n`);
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Mobile card geometry audit failed:', error);
  process.exitCode = 1;
});
