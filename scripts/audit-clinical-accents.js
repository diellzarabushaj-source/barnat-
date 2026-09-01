'use strict';

/* Porta e theksit klinik.
 *
 * Aplikacioni kishte një sistem të vetëm vizual vetëm në letër. I matur në
 * shfletues, para kësaj porte, secila faqe vizatonte të vetin:
 *
 *   Analizat    nëntë familje ngjyrash të ngopura mbi etiketat e kategorive —
 *               vjollcë, blu, trëndafil, portokalli, indigo, e kuqe, jeshile,
 *               cian, teal. Një ngjyrë për kategori laboratorike.
 *   Dozologjia  indigo dhe vjollcë përkrah teal-it klinik.
 *   Recetat     tri teal-e të ndryshme në të njëjtën pamje.
 *
 * Asnjë prej tyre nuk u kap nga testet ekzistuese, sepse asnjë test nuk e
 * shihte faqen të ndezur — ato lexojnë burimin CSS, ku një `#7c3aed` duket
 * po aq i pafajshëm sa çdo varg tjetër.
 *
 * Kjo portë e ndez faqen, mbledh çdo ngjyrë të vizatuar mbi elemente të
 * dukshme, i heq neutralet dhe i grupon të mbeturat në familje ngjyre. Pastaj
 * pohon se secila faqe rri brenda fjalorit të lejuar.
 *
 * Fjalori nuk është "një ngjyrë e vetme". Dallimet që mbajnë kuptim klinik
 * ruhen shprehimisht:
 *
 *   indigo  theksi i produktit/brandit — Stripe UI, veprimi, gjendja aktive
 *   teal    semantikë klinike e trashëguar ku mban kuptim (p.sh. adult)
 *   blu     pediatria; i njëjti blu si te kolonat e dozimit në regjistër
 *   e kuqe  gabimi
 *   e verdhë kujdesi
 *   jeshile në rregull
 *
 * Pediatria e vizatuar vjollcë te Dozologjia dhe blu te regjistri ishte
 * pikërisht lloji i mospërputhjes që kjo portë ekziston ta ndalojë: një mjek
 * që mëson një ngjyrë te një faqe e gjen tjetrën te faqja pranë.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.CLINICAL_ACCENTS_PORT || 4191);
const BASE = `http://127.0.0.1:${PORT}`;
const SETTLE_MS = Number(process.env.CLINICAL_ACCENTS_SETTLE_MS || 6000);

/* Faqet që përdoruesi i sheh si dashboard-e. Login-i, landing-u dhe faqet
 * informative rrinë jashtë: ato kanë të drejtën e vet të një pamjeje tjetër. */
const PAGES = [
  'index',
  'icd',
  'klasifikimi',
  'analizat',
  'dozologjia',
  'protokollet',
  'recetat',
  'sistemi',
  'urgjencat',
  'medical-hub',
];

/* Familjet me kuptim, të shprehura si breza nuance. Brezat janë të gjerë me
 * qëllim: `#1f7779` dhe `#147d7e` janë i njëjti teal për syrin, dhe një portë
 * që i ndan ata do të kalonte ditën duke u ankuar për asgjë. Ajo çka duhet
 * kapur është një vjollcë aty ku pritej teal. */
const FAMILIES = [
  { name:'teal',   min:150, max:200 },
  { name:'blu',    min:200, max:250 },
  { name:'indigo', min:250, max:285 },
  { name:'jeshile', min:90, max:150 },
  { name:'e verdhë', min:20, max:60 },
  { name:'e kuqe',  min:-1, max:20 },
  { name:'e kuqe',  min:340, max:361 },
];

/* Nuancat që s'i takojnë asnjë familjeje të lejuar marrin këtë emër dhe e
 * rrëzojnë portën. */
const UNKNOWN = 'e palejuar';

/* Një ngjyrë e vetme e humbur nuk është sistem i prishur — një ikonë SVG e
 * importuar mund të mbajë nuancën e vet. Pragu kap driftin, jo pikën. */
const MAX_STRAY_ELEMENTS = 6;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'clinical-smoke-server.js')], {
      cwd:ROOT,
      env:{ ...process.env, PORT:String(PORT) },
      stdio:['ignore', 'pipe', 'pipe'],
    });
    const fail = error => reject(error instanceof Error ? error : new Error(String(error)));
    child.on('error', fail);
    const timer = setTimeout(() => fail(new Error('Serveri i pamjes nuk u ngrit brenda 20s.')), 20000);
    const ready = () => { clearTimeout(timer); resolve(child); };
    child.stdout.on('data', chunk => { if (String(chunk).includes(String(PORT))) ready(); });
    /* Serveri i vogël nuk premton një rresht të caktuar, prandaj një provë e
       drejtpërdrejtë mbetet rruga e sigurt. */
    const poll = setInterval(async () => {
      try {
        const response = await fetch(`${BASE}/index.html`, { method:'HEAD' });
        if (response.ok) { clearInterval(poll); ready(); }
      } catch { /* ende nuk është gati */ }
    }, 300);
    child.on('exit', () => clearInterval(poll));
  });
}

function familyOf(hue) {
  for (const family of FAMILIES) {
    if (hue > family.min && hue <= family.max) return family.name;
  }
  return UNKNOWN;
}

async function collect(page, name) {
  await page.goto(`${BASE}/${name}.html`, { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForTimeout(SETTLE_MS);
  return page.evaluate(() => {
    const hueOf = (r, g, b) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return -1;
      const d = max - min;
      const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
        : max === g ? (b - r) / d + 2
          : (r - g) / d + 4;
      return Math.round(h * 60);
    };
    const found = new Map();
    for (const element of document.querySelectorAll('body *')) {
      if (!element.getClientRects().length) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.opacity === '0') continue;
      for (const property of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor']) {
        const match = style[property].match(/rgba?\((\d+),\s?(\d+),\s?(\d+)(?:,\s?([\d.]+))?/);
        if (!match) continue;
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        if (alpha < 0.5) continue;
        const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        /* Neutralet dalin jashtë: gri, e bardhë dhe boja e errët e tekstit nuk
           janë thekse. Pragu 0.3 e lë jashtë edhe blunë shumë të zbehtë të
           `#101828`, e cila teknikisht ka nuancë por lexohet si e zezë. */
        const saturation = max === 0 ? 0 : (max - min) / max;
        if (saturation < 0.3 || max < 60) continue;
        const hue = hueOf(r, g, b);
        const key = `${hue}|${style[property]}`;
        const record = found.get(key) || { hue, color:style[property], count:0, samples:[] };
        record.count += 1;
        if (record.samples.length < 3) {
          const label = String(element.className || '').trim().split(/\s+/)[0] || element.tagName.toLowerCase();
          if (!record.samples.includes(label)) record.samples.push(label);
        }
        found.set(key, record);
      }
    }
    return [...found.values()].sort((a, b) => b.count - a.count);
  });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const failures = [];
  const report = [];

  try {
    for (const name of PAGES) {
      const context = await browser.newContext({ viewport:{ width:1440, height:900 }, serviceWorkers:'block' });
      const page = await context.newPage();
      let colors = [];
      try {
        colors = await collect(page, name);
      } catch (error) {
        failures.push(`${name}: faqja nuk u ngarkua — ${String(error).slice(0, 140)}`);
        await context.close();
        continue;
      }
      await context.close();

      const strays = colors.filter(entry => familyOf(entry.hue) === UNKNOWN);
      const strayElements = strays.reduce((total, entry) => total + entry.count, 0);
      const families = [...new Set(colors.map(entry => familyOf(entry.hue)))].filter(f => f !== UNKNOWN);

      report.push(
        `${name.padEnd(13)} familje: ${families.join(', ') || '—'}`
        + (strays.length ? `  ·  jashtë fjalorit: ${strayElements} elemente` : '')
      );

      if (strayElements > MAX_STRAY_ELEMENTS) {
        const worst = strays.slice(0, 4)
          .map(entry => `${entry.color} (nuancë ${entry.hue}, ${entry.count}× — ${entry.samples.join(', ')})`)
          .join('; ');
        failures.push(
          `${name}: ${strayElements} elemente jashtë fjalorit klinik (kufiri ${MAX_STRAY_ELEMENTS}). ${worst}`
        );
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(report.join('\n'));
  assert.deepEqual(failures, [], `\n${failures.join('\n')}\n`);
  console.log('\nPorta e theksit klinik kaloi: çdo dashboard rri brenda Stripe indigo + ngjyrave semantike klinike.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
