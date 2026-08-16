'use strict';

/* Porta responsive e regjistrit.
 *
 * Faza 00 e planit: para se të ndryshohet shkalla tipografike, pamja e
 * tabletit apo shtresat e stilit, duhet një matës që dështon kur ndonjë prej
 * tyre prishet. Ky skript e ngarkon faqen Barnat në nëntë gjerësi reale dhe
 * pohon shtatë gjëra që një ndërfaqe klinike nuk guxon t'i humbë.
 *
 * Pse Chromium dhe jo WebKit si auditet e tjera mobile: ato masin shtresën
 * `registry-mobile-phase8`, e cila kërkon WebKit. Kjo portë mat sjelljen e
 * përgjithshme të faqes, e cila është e njëjtë në të dy motorët — dhe kështu
 * ekzekutohet edhe në ambiente ku vetëm Chromium është i disponueshëm.
 *
 * Pragjet janë kalibruar kundrejt ekzekutimit në CI, mbi runtime-in e ndërtuar
 * me `build:runtime`. Kjo është e rëndësishme: pa atë ndërtim faqja nuk i
 * ngarkon kurrë 4006 rreshtat, dhe çdo numër del shumë më i vogël se realiteti
 * — matja e parë lokale nxori 14 madhësi fonti aty ku CI-ja nxjerr 19, dhe 12
 * elemente teksti të vogël aty ku CI-ja nxjerr 309. Prandaj një ekzekutim
 * lokal mbi burimin e pandërtuar do të dështojë kundrejt këtyre pragjeve, dhe
 * kjo është në rregull: matësi i vlefshëm është ai që sheh faqen e vërtetë.
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

/* Buxhete të ndara për telefonin dhe për ekranet e gjera.
 *
 * Një buxhet i vetëm nuk vlen: në desktop faqja ka 309 elemente teksti nën
 * 11px, sepse tabela vizaton mijëra qeliza. Nën atë tavan, një regresion i
 * telefonit nga 0 në 50 do të kalonte pa u vënë re. Telefoni sot është
 * dukshëm më i mirë se desktopi, prandaj i takon një prag më i rreptë.
 *
 * Numrat vijnë nga ekzekutimi në CI mbi runtime-in e ndërtuar — jo nga burimi
 * i pandërtuar, ku faqja s'i ngarkon kurrë të dhënat dhe çdo numër del shumë
 * më i vogël se realiteti.
 *
 * `maxRadii` u ul nga 7/9 në 4 me Fazën 01: shkalla e rrezeve tashmë është
 * 8/12/16 dhe faqja llogarit vetëm 8px, 12px dhe një vlerë të përbërë që
 * përdor 12. Ulja e madhësive të fontit mbetet për fazat pasuese. */
const BUDGET = {
  phone:{   // ≤430px
    minFontPx:11,
    maxTinyTextNodes:0,
    maxSmallTargets:2,
    maxFontSizes:9,
    maxRadii:4,
  },
  wide:{    // ≥768px
    minFontPx:8.5,
    maxTinyTextNodes:320,
    maxSmallTargets:170,
    maxFontSizes:19,
    maxRadii:4,
  },
};

/* Gabime që dihen, me arsye, që porta të kapë gabimet e reja pa u bllokuar nga
 * ky. Faza 00 e planit e lejon shprehimisht kuarantinën e dokumentuar.
 *
 * `releaseMobileShellOwner is not defined` shfaqet vetëm në telefon (≤430px),
 * ku ekzekutohet `registry-mobile-phase3.js`. Në burim funksioni është i
 * përcaktuar në thellësi 1 të IIFE-së dhe përdoret në thellësi 2 — mbyllje
 * krejt e rregullt. Prishja vjen nga zinxhiri i arnimeve në `build:runtime`,
 * i cili nuk ekzekutohet dot këtu: `@vercel/blob` mungon dhe pema e varësive
 * s'instalohet sepse burimi i `xlsx` është i bllokuar nga rrjeti.
 *
 * Rregullimi kërkon një ambient që e ekzekuton ndërtimin e plotë. Deri atëherë
 * kjo hyrje e mban portën të dobishme për çdo gabim tjetër. */
const KNOWN_PAGE_ERRORS = [
  'ReferenceError: releaseMobileShellOwner is not defined',
];

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
   * vetëm rrezet e matura në piksela; pas Fazës 01 faqja duhet të përdorë
   * vetëm 8, 12 dhe 16. */
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
    const budget = row.width <= 430 ? BUDGET.phone : BUDGET.wide;

    const unknownErrors = row.pageErrors.filter(error => !KNOWN_PAGE_ERRORS.includes(error));
    assert.deepEqual(
      unknownErrors, [],
      `${at}: faqja hodhi gabime të reja — ${unknownErrors.join(' | ')}`,
    );

    assert.ok(
      row.documentOverflowPx <= 0,
      `${at}: dokumenti del ${row.documentOverflowPx}px jashtë gjerësisë; përmbajtja e gjerë duhet të rrëshqasë brenda kontejnerit të vet, jo ta shtyjë faqen.`,
    );

    assert.ok(
      row.smallestFont === null || row.smallestFont >= budget.minFontPx,
      `${at}: teksti më i vogël është ${row.smallestFont}px, nën dyshemenë ${budget.minFontPx}px.`,
    );

    assert.ok(
      row.tinyTextCount <= budget.maxTinyTextNodes,
      `${at}: ${row.tinyTextCount} elemente teksti nën 11px (buxheti ${budget.maxTinyTextNodes}) — ${JSON.stringify(row.tinyTextSample)}`,
    );

    assert.ok(
      row.smallTargetCount <= budget.maxSmallTargets,
      `${at}: ${row.smallTargetCount} objektiva prekjeje nën 40px (buxheti ${budget.maxSmallTargets}) — ${JSON.stringify(row.smallTargetSample)}`,
    );

    assert.ok(
      row.fontSizeCount <= budget.maxFontSizes,
      `${at}: ${row.fontSizeCount} madhësi fonti të dallueshme (buxheti ${budget.maxFontSizes}) — ${row.fontSizes.join(', ')}`,
    );

    assert.ok(
      row.radiusCount <= budget.maxRadii,
      `${at}: ${row.radiusCount} rreze qoshesh të dallueshme (buxheti ${budget.maxRadii}).`,
    );
  }

  console.log(`Responsive viewport audit passed across ${findings.length} widths.`);
})().catch(error => {
  console.error('Responsive viewport audit failed:', error);
  process.exitCode = 1;
});
