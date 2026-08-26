'use strict';

/*
 * Phase 4 acceptance gate for the canonical registry row-actions menu.
 *
 * This is intentionally a browser test, not another source-rewrite patch. It
 * runs against the composed build:runtime output and the same deterministic
 * 4006-row fixture used by registry performance audits. The frozen mobile
 * owner is not touched; this gate exercises the desktop singleton menu only.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');
const { TEST_USER } = require('../tests/phase5-browser-fixture.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.ROW_ACTIONS_PHASE4_PORT || 4193);
const BASE = `http://127.0.0.1:${PORT}`;
const BROWSER_PATH = process.env.ROW_ACTIONS_PHASE4_BROWSER_PATH || undefined;

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
      reject(new Error(`Phase 4 registry server timeout: ${stderr.slice(-1200)}`));
    }, 20000);
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
    child.once('exit', code => {
      if (!ready) {
        clearTimeout(timer);
        reject(new Error(`Phase 4 registry server exited early (${code}): ${stderr.slice(-1200)}`));
      }
    });
  });
}

async function waitForRegistry(page) {
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll('#tbody > tr')];
    return rows.some(row => !row.querySelector('.empty-state') && row.querySelector('[data-row-actions-menu]'));
  }, null, { timeout:60000 });
}

async function waitMenuState(page, open) {
  await page.waitForFunction(expected => {
    const menu = document.getElementById('registryRowActionsMenu');
    return Boolean(menu && !menu.hidden) === expected;
  }, open, { timeout:10000 });
}

async function waitFavoriteState(page, checked) {
  await page.waitForFunction(expected => {
    const action = document.querySelector('#registryRowActionsMenu [data-row-menu-favorite]');
    return action && action.getAttribute('aria-checked') === String(expected) && !action.disabled;
  }, checked, { timeout:15000 });
}

async function visibleRowName(page) {
  return page.locator('#tbody > tr:has([data-row-actions-menu])').first().evaluate(row => {
    const cell = row.querySelector('td.name,[data-registry-column-key="trade-name"],[data-column-key="Emri tregtar"]');
    return String(cell?.textContent || '').replace(/\s+/g, ' ').trim();
  });
}

async function openFirstMenu(page) {
  const trigger = page.locator('#tbody > tr [data-row-actions-menu]').first();
  await trigger.waitFor({ state:'visible', timeout:15000 });
  await trigger.click();
  await waitMenuState(page, true);
  return trigger;
}

async function assertMenuInViewport(page) {
  const geometry = await page.locator('#registryRowActionsMenu').evaluate(menu => {
    const rect = menu.getBoundingClientRect();
    return {
      left:rect.left,
      top:rect.top,
      right:rect.right,
      bottom:rect.bottom,
      width:rect.width,
      height:rect.height,
      innerWidth:window.innerWidth,
      innerHeight:window.innerHeight,
      placement:menu.dataset.placement || '',
    };
  });
  assert.ok(geometry.width > 0 && geometry.height > 0, 'Phase 4: singleton menu must have real browser geometry.');
  assert.ok(geometry.left >= 7, `Phase 4: menu escaped the left viewport edge (${geometry.left}).`);
  assert.ok(geometry.top >= 7, `Phase 4: menu escaped the top viewport edge (${geometry.top}).`);
  assert.ok(geometry.right <= geometry.innerWidth - 7, `Phase 4: menu escaped the right viewport edge (${geometry.right}/${geometry.innerWidth}).`);
  assert.ok(geometry.bottom <= geometry.innerHeight - 7, `Phase 4: menu escaped the bottom viewport edge (${geometry.bottom}/${geometry.innerHeight}).`);
  assert.ok(['top', 'bottom'].includes(geometry.placement), `Phase 4: invalid placement marker ${geometry.placement}.`);
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ headless:true, ...(BROWSER_PATH ? { executablePath:BROWSER_PATH } : {}) });
  const context = await browser.newContext({
    viewport:{ width:1280, height:900 },
    serviceWorkers:'block',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error).slice(0, 240)));

  // Keep authenticated library writes deterministic. GET still comes from the
  // shared fixture; PUT echoes the exact versioned payload the real client sent,
  // which gives mergeRemote an authoritative acknowledgement without Supabase.
  await page.route('**/api/user-library', async route => {
    const request = route.request();
    if (request.method() !== 'PUT') return route.continue();
    let body = {};
    try { body = JSON.parse(request.postData() || '{}'); } catch {}
    await route.fulfill({
      status:200,
      contentType:'application/json; charset=utf-8',
      body:JSON.stringify({ user:TEST_USER, generatedAt:new Date().toISOString(), ...body }),
    });
  });

  const report = {
    firstRender:false,
    singleton:false,
    semantics:false,
    keyboard:false,
    favoriteRoundTrip:false,
    noteRoundTrip:false,
    searchRerender:false,
    paginationRerender:false,
    filterRerender:false,
    favoritesView:false,
    notesView:false,
    navigationRecovery:false,
    darkMode:false,
    pageErrors,
  };

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:45000 });
    await waitForRegistry(page);

    const trigger = page.locator('#tbody > tr [data-row-actions-menu]').first();
    const firstName = await visibleRowName(page);
    assert.ok(firstName, 'Phase 4: first canonical row needs a medicine name.');
    assert.equal(await trigger.getAttribute('aria-haspopup'), 'menu');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await trigger.getAttribute('aria-controls'), 'registryRowActionsMenu');
    assert.equal(await page.locator('#tbody [data-row-favorite-toggle],#tbody [data-row-note-toggle]').count(), 0,
      'Phase 4: legacy row star/pencil controls must not return.');
    report.firstRender = true;

    assert.equal(await page.locator('#registryRowActionsMenu').count(), 1,
      'Phase 4: exactly one singleton menu must exist after first render.');
    report.singleton = true;

    // Keyboard-only contract: Enter/Space/Arrow keys, Home/End and focus restore.
    await trigger.focus();
    await page.keyboard.press('Enter');
    await waitMenuState(page, true);
    const menu = page.locator('#registryRowActionsMenu');
    const favorite = menu.locator('[data-row-menu-favorite]');
    const note = menu.locator('[data-row-menu-note]');
    assert.equal(await menu.getAttribute('role'), 'menu');
    assert.match(await menu.getAttribute('aria-label') || '', /^Veprimet për /);
    assert.equal(await favorite.getAttribute('role'), 'menuitemcheckbox');
    assert.equal(await favorite.getAttribute('aria-checked'), 'false');
    assert.equal(await note.getAttribute('role'), 'menuitem');
    assert.equal(await favorite.evaluate(el => document.activeElement === el), true,
      'Phase 4: Enter must focus the first menu action.');
    report.semantics = true;
    await assertMenuInViewport(page);

    await page.keyboard.press('ArrowDown');
    assert.equal(await note.evaluate(el => document.activeElement === el), true,
      'Phase 4: ArrowDown must move to Note.');
    await page.keyboard.press('Home');
    assert.equal(await favorite.evaluate(el => document.activeElement === el), true,
      'Phase 4: Home must move to the first action.');
    await page.keyboard.press('End');
    assert.equal(await note.evaluate(el => document.activeElement === el), true,
      'Phase 4: End must move to the last action.');
    await page.keyboard.press('Escape');
    await waitMenuState(page, false);
    assert.equal(await trigger.evaluate(el => document.activeElement === el), true,
      'Phase 4: Escape must restore focus to ⋯.');

    await page.keyboard.press('ArrowUp');
    await waitMenuState(page, true);
    assert.equal(await note.evaluate(el => document.activeElement === el), true,
      'Phase 4: ArrowUp from ⋯ must open on the last action.');
    await page.keyboard.press('Escape');
    await page.keyboard.press(' ');
    await waitMenuState(page, true);
    assert.equal(await favorite.evaluate(el => document.activeElement === el), true,
      'Phase 4: Space must open on the first action.');
    await page.keyboard.press('Escape');
    report.keyboard = true;

    // Favorite optimistic write + authoritative acknowledgement + removal.
    await openFirstMenu(page);
    await favorite.click();
    await waitFavoriteState(page, true);
    assert.equal(await favorite.getAttribute('aria-checked'), 'true');
    await favorite.click();
    await waitFavoriteState(page, false);
    assert.equal(await favorite.getAttribute('aria-checked'), 'false');
    report.favoriteRoundTrip = true;

    // Add a note, reopen it and edit it through the real dialog/save path.
    await note.click();
    const dialog = page.locator('#registryNoteDialog');
    const textarea = dialog.locator('[data-note-dialog-text]');
    const save = dialog.locator('[data-note-dialog-save]');
    await dialog.waitFor({ state:'visible', timeout:10000 });
    await textarea.fill('Phase 4 browser note');
    await save.click();
    await dialog.waitFor({ state:'hidden', timeout:15000 });

    await openFirstMenu(page);
    assert.equal(await note.getAttribute('data-has-note'), 'true');
    assert.match(await note.textContent(), /ndrysho shënimin/i);
    await note.click();
    await dialog.waitFor({ state:'visible', timeout:10000 });
    assert.equal(await textarea.inputValue(), 'Phase 4 browser note');
    await textarea.fill('Phase 4 browser note · edited');
    await save.click();
    await dialog.waitFor({ state:'hidden', timeout:15000 });
    report.noteRoundTrip = true;

    // Keep one favorite for the canonical Favorites personal view later.
    await openFirstMenu(page);
    await favorite.click();
    await waitFavoriteState(page, true);

    // Search must close any stale menu and rerender safely to a row far outside
    // the first 50-row page.
    const search = page.locator('#search');
    await search.fill('STRESS DRUG 3999');
    await waitMenuState(page, false);
    await page.waitForFunction(() => /STRESS DRUG 3999/.test(document.querySelector('#tbody')?.textContent || ''), null, { timeout:20000 });
    assert.equal(await page.locator('#registryRowActionsMenu').count(), 1,
      'Phase 4: search rerender must not duplicate the singleton menu.');
    report.searchRerender = true;

    await search.fill('');
    await waitForRegistry(page);

    // Pagination rerender must invalidate the active row/menu without moving to
    // a second owner. Choose literal page 2 from the composed pagination UI.
    await openFirstMenu(page);
    const pageTwo = page.locator('#pagination button').filter({ hasText:/^\s*2\s*$/ }).first();
    assert.ok(await pageTwo.count(), 'Phase 4: the 4006-row fixture must expose page 2.');
    await pageTwo.click();
    await waitMenuState(page, false);
    await waitForRegistry(page);
    assert.equal(await page.locator('#registryRowActionsMenu').count(), 1);
    report.paginationRerender = true;

    // Status filter is another independent table rerender path.
    await openFirstMenu(page);
    await page.locator('#statusFilter').selectOption('Origjinator');
    await waitMenuState(page, false);
    await waitForRegistry(page);
    assert.equal(await page.locator('#registryRowActionsMenu').count(), 1);
    report.filterRerender = true;
    await page.locator('#statusFilter').selectOption('');
    await waitForRegistry(page);

    // Personal views must reuse the same canonical table/chrome. Their switch
    // also proves stale Barnat search/filter state cannot strand the menu.
    const favoritesView = page.locator('[data-personal-view="favorites"]').first();
    const notesView = page.locator('[data-personal-view="notes"]').first();
    const allView = page.locator('[data-personal-view="all"]').first();
    assert.ok(await favoritesView.count(), 'Phase 4: Favorites view control is missing.');
    assert.ok(await notesView.count(), 'Phase 4: Notes view control is missing.');

    await favoritesView.click();
    await page.waitForFunction(() => location.hash === '#favoritet', null, { timeout:10000 });
    await waitForRegistry(page);
    assert.match((await page.locator('#tbody').textContent()) || '', /MEDINDEX STRESS 0001/,
      'Phase 4: favorited canonical row must survive in Favorites view.');
    assert.equal(await page.locator('#dataTable').count(), 1);
    report.favoritesView = true;

    await notesView.click();
    await page.waitForFunction(() => location.hash === '#shenimet', null, { timeout:10000 });
    await waitForRegistry(page);
    assert.match((await page.locator('#tbody').textContent()) || '', /MEDINDEX STRESS 0001/,
      'Phase 4: noted canonical row must survive in Notes view.');
    assert.equal(await page.locator('#dataTable').count(), 1);
    report.notesView = true;

    if (await allView.count()) await allView.click();
    else await page.evaluate(() => history.replaceState(null, '', location.pathname));
    await waitForRegistry(page);

    // Back/forward lifecycle: pageshow recovery must leave no orphan menu and
    // the returned canonical row must remain operable.
    await page.goto(`${BASE}/recetat.html`, { waitUntil:'domcontentloaded', timeout:45000 });
    await page.goBack({ waitUntil:'domcontentloaded', timeout:45000 });
    await waitForRegistry(page);
    assert.equal(await page.locator('#registryRowActionsMenu').count(), 1);
    assert.equal(await page.locator('#registryRowActionsMenu').isVisible(), false,
      'Phase 4: navigation recovery must return with the singleton menu closed.');
    await openFirstMenu(page);
    await page.keyboard.press('Escape');
    report.navigationRecovery = true;

    // Dark mode acceptance uses the production theme contract and proves the
    // same singleton stays readable/visible rather than spawning an alternate UI.
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await openFirstMenu(page);
    const darkStyle = await menu.evaluate(el => {
      const style = getComputedStyle(el);
      return { display:style.display, visibility:style.visibility, background:style.backgroundColor, color:style.color };
    });
    assert.notEqual(darkStyle.display, 'none');
    assert.notEqual(darkStyle.visibility, 'hidden');
    assert.notEqual(darkStyle.background, 'rgba(0, 0, 0, 0)');
    assert.notEqual(darkStyle.color, 'rgba(0, 0, 0, 0)');
    await assertMenuInViewport(page);
    report.darkMode = true;

    const rowActionErrors = pageErrors.filter(error => /row.?actions|registryRowActions|activeActions|menuitem/i.test(error));
    assert.deepEqual(rowActionErrors, [], `Phase 4: row-actions browser errors: ${rowActionErrors.join(' | ')}`);

    const required = Object.entries(report).filter(([key]) => key !== 'pageErrors');
    assert.ok(required.every(([, value]) => value === true), `Phase 4 incomplete: ${JSON.stringify(report)}`);
    console.log(`REGISTRY_ROW_ACTIONS_PHASE4 ${JSON.stringify(report, null, 2)}`);
    console.log('✓ Registry row actions Phase 4 browser acceptance passed: first-render singleton, ARIA semantics, keyboard focus, favorite/note persistence, search/pagination/filter rerenders, Favorites/Notes canonical views, navigation recovery and dark mode.');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Registry row actions Phase 4 browser acceptance failed:', error);
  process.exitCode = 1;
});
