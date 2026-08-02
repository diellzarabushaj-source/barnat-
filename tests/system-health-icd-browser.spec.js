const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:4173';
const OUTPUT = '/tmp/system-health';
fs.mkdirSync(OUTPUT, { recursive:true });

const probeRows = [
  ['compact-code', 'Kod pa pikë', 'A001', 'A00.1', 'code-normalized'],
  ['compact-block', 'Interval pa vizë', 'I10I15', 'I10-I15', 'code-normalized'],
  ['clinical-synonym', 'Sinonim klinik shqip', 'tension i lartë', 'I10', 'synonym-sq'],
  ['typo-tolerance', 'Gabim i vogël shkrimi', 'hipertensjon', 'I10', 'fuzzy-sq'],
  ['symptom-code', 'Simptomë pa inferencë', 'dhimbje gjoksi', 'R07.4', 'title-sq-exact'],
];

function payload({ stale = false } = {}) {
  const now = '2026-08-02T09:30:00.000Z';
  return {
    connected:true,
    provider:'neon',
    project:'MedIndex',
    statusVersion:3,
    overall:stale
      ? { code:'stale', label:'Një burim është vonuar', severity:'warning' }
      : { code:'healthy', label:'Të gjitha në rregull', severity:'success' },
    counts:{ drugs:4012, dosageRegimens:850, icdCodes:12542, labTests:110 },
    synchronization:{
      state:{ code:'healthy', label:'Të gjitha në rregull', severity:'success' },
      currentSpreadsheetId:'dosage-sheet', appsScriptActivated:true, healthy:true, staleAfterMinutes:15,
      dosageSources:[
        { sheetName:'KARTELA_BARNAVE', entityScope:'drugs', enabled:true, status:'synced', state:{ code:'healthy', label:'Në rregull', severity:'success' }, lastSyncedAt:now },
        { sheetName:'DOZA_TE_RRITUR', entityScope:'adult', enabled:true, status:'synced', state:{ code:'healthy', label:'Në rregull', severity:'success' }, lastSyncedAt:now },
        { sheetName:'DOZA_PEDIATRIKE', entityScope:'pediatric', enabled:true, status:'synced', state:{ code:'healthy', label:'Në rregull', severity:'success' }, lastSyncedAt:now },
      ],
      allEnabledSources:[],
      outbox:{ available:true, pending:0, deadLetter:0, lastAppliedAt:now, lastError:null },
    },
    icd:{
      available:true,
      state:stale
        ? { code:'stale', label:'ICD nga cache', severity:'warning' }
        : { code:'healthy', label:'ICD në rregull', severity:'success' },
      source:{
        type:'google-sheet', status:stale ? 'stale' : 'live', visibility:'public-link',
        spreadsheetId:'1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0', sheetName:'ICD-10 EN-SQ',
        sheetGid:329283560, loadedAt:now, ageMs:0, csvBytes:4106422,
        revision:'abcdefghijklmnopqrst', fetchMs:321, buildMs:87,
      },
      hierarchy:{
        expected:{ chapter:22, block:274, category:2050, subcategory:10196, total:12542 },
        actual:{ chapter:22, block:274, category:2050, subcategory:10196, total:12542, nodeArray:12542 },
        complete:true, mismatches:[],
      },
      search:{
        engine:'clinical-ranking-v3', version:'sq-clinical-search-v2', diagnosticDecision:false,
        passed:5, total:5, healthy:true,
        probes:probeRows.map(([id, label, query, firstCode, matchType]) => ({
          id, label, query, passed:true, firstCode, matchType, resultCount:1,
          expectedCode:null, expectedPrefix:null, forbiddenCodes:[], error:null,
        })),
      },
      checkedAt:now,
      error:null,
    },
    editor:{ available:true, lastChangeAt:now, recentChanges:[] },
    recentImports:[],
    checkedAt:now,
  };
}

async function installRoutes(page, options = {}) {
  await page.route('**/api/neon-status', route => route.fulfill({
    status:200,
    contentType:'application/json; charset=utf-8',
    body:JSON.stringify(payload(options)),
  }));
  await page.route('**/api/media', route => route.fulfill({
    status:200,
    contentType:'application/json; charset=utf-8',
    body:JSON.stringify({ ok:true, configured:false, blobs:[] }),
  }));
}

async function openDashboard(page) {
  await page.goto(`${BASE}/sistemi.html`, { waitUntil:'domcontentloaded' });
  await expect(page.locator('#systemIcdState')).not.toHaveText('Duke kontrolluar…');
}

async function viewportReport(page) {
  return page.evaluate(() => ({
    width:innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    probeRect:(() => {
      const node = document.getElementById('systemIcdProbeList');
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { left:rect.left, right:rect.right, width:rect.width };
    })(),
  }));
}

async function captureIcdPanel(page, filename) {
  const panel = page.locator('.system-icd-panel');
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  await panel.screenshot({ path:path.join(OUTPUT, filename) });
}

test('system dashboard shows live ICD revision, hierarchy and five clinical probes', async ({ page }) => {
  await installRoutes(page);
  await openDashboard(page);
  await expect(page.locator('#systemIcdState')).toHaveText('ICD në rregull');
  const liveNodeText = await page.locator('#systemIcdLiveNodes').textContent();
  expect(String(liveNodeText).replace(/\D/g, '')).toBe('12542');
  await expect(page.locator('#systemIcdRevision')).toHaveText('abcdefghijkl');
  await expect(page.locator('#systemIcdSourceStatus')).toContainText('Live');
  await expect(page.locator('#systemIcdProbeScore')).toHaveText('5/5');
  await expect(page.locator('#systemIcdProbeList .system-probe')).toHaveCount(5);
  await expect(page.locator('#systemIcdProbeList .system-probe.is-failed')).toHaveCount(0);
  await captureIcdPanel(page, 'icd-health-live-panel-desktop.png');
});

test('stale ICD fallback remains explicit and inside the phone viewport', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await installRoutes(page, { stale:true });
  await openDashboard(page);
  await expect(page.locator('#systemIcdState')).toHaveText('ICD nga cache');
  await expect(page.locator('#systemIcdSourceStatus')).toHaveText('Cache i fundit i vlefshëm');
  await expect(page.locator('#systemMessage')).toContainText('cache-i i fundit');
  const panel = page.locator('.system-icd-panel');
  await panel.scrollIntoViewIfNeeded();
  const report = await viewportReport(page);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.width + 1);
  expect(report.probeRect.left).toBeGreaterThanOrEqual(-1);
  expect(report.probeRect.right).toBeLessThanOrEqual(report.width + 1);
  await panel.screenshot({ path:path.join(OUTPUT, 'icd-health-stale-panel-mobile.png') });
});
