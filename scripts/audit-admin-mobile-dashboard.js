'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.ADMIN_MOBILE_AUDIT_PORT || 4190);
const BASE = `http://127.0.0.1:${PORT}`;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'clinical-smoke-server.js')], {
      cwd:ROOT,
      env:{ ...process.env, PORT:String(PORT) },
      stdio:['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    let stderr = '';
    const timer = setTimeout(() => {
      if (ready) return;
      child.kill('SIGTERM');
      reject(new Error(`admin mobile audit server timeout: ${stderr}`));
    }, 15000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (!ready && /Clinical smoke server listening/.test(chunk)) {
        ready = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
  });
}

const adminSession = {
  ok:true,
  authenticated:true,
  user:{ email:'admin@medindex.local', role:'admin', name:'Admin Browser Test' },
  authUser:{ adminConsole:true },
  csrfToken:'admin-mobile-audit-csrf',
};

const drugSummary = {
  ok:true,
  summary:{
    total:1,
    verified:1,
    pending:0,
    inReview:0,
    items:[{
      registryNumber:1,
      tradeName:'PARACETAMOL MOBILE AUDIT',
      verificationStatus:'verified',
      adultVerified:true,
      pediatricVerified:true,
    }],
  },
};

const drugDetail = {
  ok:true,
  record:{
    drug:{
      registryNumber:1,
      tradeName:'PARACETAMOL MOBILE AUDIT',
      activeSubstance:'Paracetamol',
      strength:'500 mg',
      pharmaceuticalForm:'Tabletë',
      atcCode:'N02BE01',
      drugClass:'Analgesic',
      packaging:'20 tableta',
      useText:'Dhimbje dhe temperaturë',
    },
    profile:{
      verificationStatus:'verified',
      sourceUrls:['https://example.test/source-a', 'https://example.test/source-b'],
      clinicalSummary:'Përmbledhje klinike e gjatë për të detyruar dialogun të përdorë scroll-in e vet në telefon.',
      indicationsText:'Dhimbje | R52 | all\nTemperaturë | R50.9 | all',
      contraindications:'Hipersensitivitet ndaj substancës aktive.',
      warnings:'Kontrollo dozën totale ditore dhe funksionin hepatik kur indikohet.',
      interactions:'Rishiko barnat e tjera hepatotoksike.',
    },
    dosage:{
      adult:{ dose:'500–1000 mg', route:'Orale', sourceUrl:'https://example.test/adult' },
      pediatric:{ dose:'10–15 mg/kg', route:'Orale', sourceUrl:'https://example.test/pediatric' },
    },
  },
};

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({
    viewport:{ width:390, height:844 },
    isMobile:true,
    hasTouch:true,
    serviceWorkers:'block',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  await page.route('**/api/auth**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'DELETE') {
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true }) });
    }
    if (url.searchParams.get('scope') === 'users') {
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true, users:[] }) });
    }
    return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(adminSession) });
  });

  await page.route('**/api/clinical-editor**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('summary') === '1') {
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(drugSummary) });
    }
    if (url.searchParams.get('registryNumber') === '1') {
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(drugDetail) });
    }
    return route.fulfill({ status:405, contentType:'application/json', body:JSON.stringify({ ok:false, error:'Read-only browser audit fixture' }) });
  });

  try {
    await page.goto(`${BASE}/admin.html`, { waitUntil:'domcontentloaded', timeout:45000 });
    await page.locator('#adminShell').waitFor({ state:'visible', timeout:15000 });
    await page.locator('[data-edit-drug="1"]').waitFor({ state:'attached', timeout:15000 });

    assert.equal(await page.locator('#adminMenu').isVisible(), true, '390px admin must expose the mobile menu button');
    await page.locator('#adminMenu').click();
    assert.equal(await page.evaluate(() => document.body.classList.contains('mi-admin-nav-open')), true,
      'mobile menu button must open the admin sidebar');

    await page.locator('[data-view="drugs"]').click();
    const navigation = await page.evaluate(() => ({
      drugsHidden:document.querySelector('[data-panel="drugs"]').hidden,
      navOpen:document.body.classList.contains('mi-admin-nav-open'),
      overviewHidden:document.querySelector('[data-panel="overview"]').hidden,
      title:document.getElementById('viewTitle').textContent.trim(),
      documentOverflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.deepEqual(navigation, {
      drugsHidden:false,
      navOpen:false,
      overviewHidden:true,
      title:'Barnat',
      documentOverflow:0,
    }, 'Barnat navigation must own the mobile workspace and close the sidebar without page-level horizontal overflow');

    const trigger = page.locator('[data-edit-drug="1"]');
    await trigger.click();
    await page.locator('#drugDialog[open]').waitFor({ state:'visible', timeout:10000 });

    const geometry = await page.evaluate(() => {
      const dialog = document.getElementById('drugDialog');
      const rect = dialog.getBoundingClientRect();
      const style = getComputedStyle(dialog);
      return {
        open:dialog.open,
        left:Math.round(rect.left),
        right:Math.round(rect.right),
        width:Math.round(rect.width),
        top:Math.round(rect.top),
        bottom:Math.round(rect.bottom),
        clientHeight:dialog.clientHeight,
        scrollHeight:dialog.scrollHeight,
        clientWidth:dialog.clientWidth,
        scrollWidth:dialog.scrollWidth,
        overflowY:style.overflowY,
        overscrollY:style.overscrollBehaviorY,
        actionsPosition:getComputedStyle(document.querySelector('#drugDialog .mi-dialog-actions')).position,
        bodyOverflow:getComputedStyle(document.body).overflow,
        htmlOverflow:getComputedStyle(document.documentElement).overflow,
        documentOverflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    assert.equal(geometry.open, true);
    assert.ok(geometry.left >= 0 && geometry.right <= 390,
      `drug dialog must remain inside 390px viewport: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.width <= 362,
      `drug dialog width must respect 14px phone gutters: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.clientHeight <= Math.ceil(844 * 0.90) + 2,
      `drug dialog must respect 90dvh max height: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.scrollHeight > geometry.clientHeight + 100,
      `editing a full drug record must scroll inside the dialog: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1,
      `drug dialog must not overflow horizontally: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.overflowY, 'auto', 'drug dialog owns its vertical scroll');
    assert.equal(geometry.overscrollY, 'contain', 'dialog scroll must not chain to the admin dashboard');
    assert.equal(geometry.actionsPosition, 'sticky', 'DRx dialog actions must stay sticky while the long drug form scrolls');
    assert.equal(geometry.bodyOverflow, 'hidden', 'background body must lock while a modal dialog is open');
    assert.equal(geometry.htmlOverflow, 'hidden', 'root scrolling must lock while a modal dialog is open');
    assert.equal(geometry.documentOverflow, 0, 'opening the dialog must not create page-level horizontal overflow');

    await page.evaluate(() => {
      const dialog = document.getElementById('drugDialog');
      dialog.scrollTop = dialog.scrollHeight;
    });
    await page.waitForTimeout(80);
    const actions = await page.evaluate(() => {
      const dialogRect = document.getElementById('drugDialog').getBoundingClientRect();
      const saveRect = document.getElementById('drugSave').getBoundingClientRect();
      return {
        dialogTop:dialogRect.top,
        dialogBottom:dialogRect.bottom,
        saveTop:saveRect.top,
        saveBottom:saveRect.bottom,
      };
    });
    assert.ok(actions.saveTop >= actions.dialogTop - 1 && actions.saveBottom <= actions.dialogBottom + 1,
      `dialog actions must be reachable after scrolling: ${JSON.stringify(actions)}`);

    await page.locator('#drugDialog .mi-dialog-actions button[value="cancel"]').click();
    await page.waitForFunction(() => !document.getElementById('drugDialog').open);
    const closed = await page.evaluate(() => ({
      bodyOverflow:getComputedStyle(document.body).overflow,
      htmlOverflow:getComputedStyle(document.documentElement).overflow,
      focusDrug:document.activeElement?.getAttribute?.('data-edit-drug') || '',
    }));
    assert.notEqual(closed.bodyOverflow, 'hidden', 'background scroll lock must release after dialog close');
    assert.notEqual(closed.htmlOverflow, 'hidden', 'root scroll lock must release after dialog close');
    assert.equal(closed.focusDrug, '1', 'closing the modal should restore focus to the edited drug row action');
    assert.deepEqual(pageErrors, [], `admin mobile dashboard raised page errors: ${pageErrors.join(' | ')}`);

    console.log(`ADMIN_MOBILE_DIALOG ${JSON.stringify({ viewport:'390x844', navigation, geometry, actions, closed }, null, 2)}`);
    console.log('Admin mobile dashboard audit passed at 390x844.');
  } finally {
    await context.close();
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch(error => {
  console.error('Admin mobile dashboard audit failed:', error);
  process.exitCode = 1;
});
