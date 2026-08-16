'use strict';

/* Porta responsive e regjistrit.
 *
 * Faza 00 e planit: para se të ndryshohet shkalla tipografike, pamja e
 * tabletit apo shtresat e stilit, duhet një matës që dështon kur ndonjë prej
 * tyre prishet. Ky skript e ngarkon faqen Barnat në nëntë gjerësi reale dhe
 * pohon katër gjëra që një ndërfaqe klinike nuk guxon t'i humbë.
 *
 * Pse Chromium dhe jo WebKit si auditet e tjera mobile: ato masin shtresën
 * `registry-mobile-phase8`, e cila kërkon WebKit. Kjo portë mat sjelljen e
 * përgjithshme të faqes, e cila është e njëjtë në të dy motorët — dhe kështu
 * ekzekutohet edhe në ambiente ku vetëm Chromium është i disponueshëm.
 *
 * Pragjet janë vendosur mbi matjet bazë të 16.08.2026, jo mbi dëshira: secili
 * lejon gjendjen e sotme dhe dështon kur ajo përkeqësohet. Kur një fazë e
 * planit e përmirëson një numër, ulet edhe pragu përkatës këtu.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.RESPONSIVE_VIEWPORTS_PORT || 4189);
const BASE = `http://127.0.0.1:${PORT}`;
const SETTLE_MS = Number(process.env.RESPONSIVE_VIEWPORTS_SETTLE_MS || 11000);

/* Gjerësitë janë pajisje të vërteta, jo pika kalimi të rrumbullakosura: një
 * portë që mat vetëm 375 dhe 1440 nuk e sheh kurrë brezin ku faqja prishet. */
const VIEWPORTS = [
  { name:'320 · iPhone SE',       width:320,  height:568,  mobile:true  },
  { name:'360 · Android',         width:360,  height:800,  mobile:true  },
  { name:'390 · iPhone 14',       width:390,  height:844,  mobile:true  },
  { name:'430 · iPhone Pro Max',  width:430,  height:932,  mobile:true  },
  { name:'768 · iPad portret',    width:768,  height:1024, mobile:true  },
  { name:'1024 · iPad shtrirë',   width:1024, height:768,  mobile:false },
  { name:'1280 · laptop',         width:1280, height:800,  mobile:false },
  { name:'1440 · desktop',        width:1440, height:900,  mobile:false },
  { name:'1920 · i gjerë',        width:1920, height:1080, mobile:false },
];

/* Sa e sotmja lejohet. Ulja e këtyre numrave është qëllimi i fazave 01–04. */
const BUDGET = {
  minFontPx:8.5,          // matur: 8.5px është më e vogla sot
  maxTinyTextNodes:12,    // matur: 12 në ≥768, 2 në telefon
  maxSmallTargets:7,      // matur: 4 në telefon, deri 7 në desktop
  maxFontSizes:14,        // matur: 14 madhësi të dallueshme
  maxRadii:8,             // matur: 8 rreze të dallueshme
};

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
      reject(new Error(`responsive viewport server timeout: ${stderr}`));
    }, 15000);
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

/* Ekzekutohet brenda faqes. Mat vetëm atë që shihet: elementët e fshehur nuk
 * kanë rëndësi për një përdorues, dhe do ta ndotnin numërimin. */
function collect() {
  const de = document.documentElement;
  const visible = el => el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  const nodes = [...document.querySelectorAll('body *')].filter(visible);

  const tinyText = [];
  const fontSizes = new Set();
  const radii = new Set();

  /* Rrethet dhe pilulat nuk numërohen: `50%` te një avatar dhe `999px` te një
   * distinktiv janë forma të qëllimshme, jo devijim nga shkalla. Numërohen
   * vetëm rrezet e matura në piksela, ku 6, 7, 9, 13 dhe 14 tregojnë se s'ka
   * shkallë të përbashkët. */
  const ROUND = new Set(['50%', '999px', '9999px']);

  for (const el of nodes) {
    const cs = getComputedStyle(el);
    if (cs.borderRadius && cs.borderRadius !== '0px' && !ROUND.has(cs.borderRadius)) {
      radii.add(cs.borderRadius);
    }
    const leaf = el.children.length === 0 && String(el.textContent || '').trim().length > 0;
    if (!leaf) continue;
    const size = parseFloat(cs.fontSize);
    fontSizes.add(cs.fontSize);
    if (size < 11) tinyText.push({ size, text:String(el.textContent).trim().slice(0, 30) });
  }

  /* Objektiv prekjeje: çdo kontroll që një gisht duhet ta godasë. 40px është
   * pragu i sotëm i matur — jo 44px i rekomanduar — që porta të pohojë
   * gjendjen reale dhe të kapë përkeqësimin, pa dështuar që nga dita e parë. */
  const smallTargets = nodes
    .filter(el => /^(BUTTON|A|SUMMARY)$/.test(el.tagName) && !el.disabled)
    .map(el => ({ el, rect:el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && (rect.height < 40 || rect.width < 24))
    .map(({ el, rect }) => ({
      label:String(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24),
      width:Math.round(rect.width),
      height:Math.round(rect.height),
    }));

  /* Elemente që dalin nga skaji i djathtë. Një tabelë e gjerë brenda një
   * kontejneri që rrëshqet është e ligjshme; kjo kap vetëm rastet ku vetë
   * dokumenti detyrohet të rrëshqasë anash. */
  const documentOverflowPx = de.scrollWidth - de.clientWidth;

  const smallestFont = fontSizes.size
    ? Math.min(...[...fontSizes].map(parseFloat))
    : null;

  return {
    documentOverflowPx,
    tinyTextCount:tinyText.length,
    tinyTextSample:tinyText.slice(0, 4),
    smallestFont,
    smallTargetCount:smallTargets.length,
    smallTargetSample:smallTargets.slice(0, 4),
    fontSizeCount:fontSizes.size,
    fontSizes:[...fontSizes].sort((a, b) => parseFloat(a) - parseFloat(b)),
    radiusCount:radii.size,
  };
}

(async () => {
  const server = await startServer();
  /* Në CI `playwright install` e sjell binarin që i takon versionit. Në
   * ambiente ku shkarkimi është i bllokuar, kjo lejon të tregohet një Chromium
   * ekzistues në vend që porta të mos ekzekutohet fare. */
  const executablePath = process.env.RESPONSIVE_VIEWPORTS_BROWSER_PATH || undefined;
  const browser = await chromium.launch({ headless:true, ...(executablePath ? { executablePath } : {}) });
  const findings = [];

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport:{ width:viewport.width, height:viewport.height },
        serviceWorkers:'block',
        isMobile:viewport.mobile,
        hasTouch:viewport.mobile,
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error).slice(0, 120)));

      await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded', timeout:45000 });
      await page.waitForTimeout(SETTLE_MS);

      const measured = await page.evaluate(collect);
      findings.push({ viewport:viewport.name, width:viewport.width, pageErrors, ...measured });

      await context.close();
    }
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }

  console.log(`RESPONSIVE_VIEWPORTS ${JSON.stringify({ budget:BUDGET, findings }, null, 2)}`);

  for (const row of findings) {
    const at = `${row.viewport}`;

    assert.deepEqual(row.pageErrors, [], `${at}: faqja hodhi gabime — ${row.pageErrors.join(' | ')}`);

    assert.ok(
      row.documentOverflowPx <= 0,
      `${at}: dokumenti del ${row.documentOverflowPx}px jashtë gjerësisë; përmbajtja e gjerë duhet të rrëshqasë brenda kontejnerit të vet, jo ta shtyjë faqen.`,
    );

    assert.ok(
      row.smallestFont === null || row.smallestFont >= BUDGET.minFontPx,
      `${at}: teksti më i vogël është ${row.smallestFont}px, nën dyshemenë ${BUDGET.minFontPx}px.`,
    );

    assert.ok(
      row.tinyTextCount <= BUDGET.maxTinyTextNodes,
      `${at}: ${row.tinyTextCount} elemente teksti nën 11px (buxheti ${BUDGET.maxTinyTextNodes}) — ${JSON.stringify(row.tinyTextSample)}`,
    );

    assert.ok(
      row.smallTargetCount <= BUDGET.maxSmallTargets,
      `${at}: ${row.smallTargetCount} objektiva prekjeje nën 40px (buxheti ${BUDGET.maxSmallTargets}) — ${JSON.stringify(row.smallTargetSample)}`,
    );

    assert.ok(
      row.fontSizeCount <= BUDGET.maxFontSizes,
      `${at}: ${row.fontSizeCount} madhësi fonti të dallueshme (buxheti ${BUDGET.maxFontSizes}) — ${row.fontSizes.join(', ')}`,
    );

    assert.ok(
      row.radiusCount <= BUDGET.maxRadii,
      `${at}: ${row.radiusCount} rreze qoshesh të dallueshme (buxheti ${BUDGET.maxRadii}).`,
    );
  }

  console.log(`Responsive viewport audit passed across ${findings.length} widths.`);
})().catch(error => {
  console.error('Responsive viewport audit failed:', error);
  process.exitCode = 1;
});
