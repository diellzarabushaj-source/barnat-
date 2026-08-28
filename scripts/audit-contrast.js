'use strict';

/* Porta e kontrastit.
 *
 * Sirtari kaloi te një sfond navy, dhe nënmenutë nuk e ndoqën. `icd-sidebar.css`
 * dhe `atc-sidebar.css` ishin shkruar për një sirtar të bardhë: emrat e
 * kapitujve `#475467`, kodet `#344054` mbi çipa `#f2f4f7`. Mbi navy ato bëhen
 * gri e errët mbi blu të errët — dy ngjyra të mbyllta bashkë. Emrat e
 * kapitujve ICD ishin praktikisht të padukshëm, dhe asnjë test nuk e kapi,
 * sepse asnjë test nuk e shihte faqen të ndezur.
 *
 * Rregulli që mat kjo portë është ai i kërkuar, dhe është i njëjti rregull që
 * WCAG-u e kodifikon: sfond i errët → tekst i çelët, sfond i çelët → tekst i
 * mbyllët. Konkretisht, raporti i kontrastit ndërmjet tekstit dhe sfondit të
 * tij real duhet të jetë të paktën 4.5:1 për tekst normal dhe 3:1 për tekst të
 * madh — pikërisht pragjet e AA-së.
 *
 * Sfondi "real" nuk është ai i vetë elementit: shumica e elementeve kanë
 * `background-color: transparent`, prandaj ngjyra që sheh syri vjen nga prindi
 * i parë jo i tejdukshëm. Po ashtu, ngjyra e tekstit shpesh ka alfa
 * (`rgba(255,255,255,.67)`), e cila duhet përzier mbi atë sfond para se të
 * matet. Të dyja bëhen këtu; pa to matja do të nxirrte numra që s'i përgjigjen
 * asaj që shfaqet.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.CONTRAST_PORT || 4193);
const BASE = `http://127.0.0.1:${PORT}`;
const SETTLE_MS = Number(process.env.CONTRAST_SETTLE_MS || 6000);

/* Faqet ku sirtari vizatohet. ICD-ja hapet shprehimisht sepse pema e saj është
 * pikërisht ajo që u thye, dhe rri e mbyllur derisa dikush e prek. */
const PAGES = [
  { name:'index' },
  { name:'icd', open:'.mi-icd-root-trigger' },
  { name:'klasifikimi', open:'.mi-atc-root-trigger' },
  { name:'analizat' },
  { name:'dozologjia' },
  { name:'protokollet' },
  { name:'recetat' },
  { name:'sistemi' },
  { name:'urgjencat' },
  { name:'medical-hub' },
];

/* Të dyja temat, sepse "e koordinuar" do të thotë e lexueshme në të dyja. Një
 * ngjyrë e vendosur vetëm për dritën shpesh mbetet e pandryshuar në errësirë,
 * dhe ajo është pikërisht mënyra si lind teksti i mbyllët mbi sfond të errët. */
const THEMES = ['light', 'dark'];

const MIN_NORMAL = 4.5;
const MIN_LARGE = 3;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'clinical-smoke-server.js')], {
      cwd:ROOT,
      env:{ ...process.env, PORT:String(PORT) },
      stdio:['ignore', 'pipe', 'pipe'],
    });
    child.on('error', error => reject(error));
    const timer = setTimeout(() => reject(new Error('Serveri i pamjes nuk u ngrit brenda 20s.')), 20000);
    const poll = setInterval(async () => {
      try {
        const response = await fetch(`${BASE}/index.html`, { method:'HEAD' });
        if (response.ok) { clearInterval(poll); clearTimeout(timer); resolve(child); }
      } catch { /* ende nuk është gati */ }
    }, 300);
    child.on('exit', () => clearInterval(poll));
  });
}

async function measure(page, entry, theme) {
  await page.goto(`${BASE}/${entry.name}.html`, { waitUntil:'domcontentloaded', timeout:30000 });
  await page.evaluate(value => {
    document.documentElement.dataset.theme = value;
    document.documentElement.classList.toggle('dark', value === 'dark');
  }, theme);
  await page.waitForTimeout(SETTLE_MS);
  if (entry.open) {
    /* Nëse dega nuk hapet, faqja thjesht nuk ka çfarë të matë atje; kjo nuk
       është dështim i kontrastit. */
    await page.locator(entry.open).first().click({ timeout:4000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  return page.evaluate(({ minNormal, minLarge }) => {
    const parse = value => {
      const m = String(value).match(/rgba?\((\d+),\s?(\d+),\s?(\d+)(?:,\s?([\d.]+))?/);
      return m ? { r:+m[1], g:+m[2], b:+m[3], a:m[4] === undefined ? 1 : Number(m[4]) } : null;
    };
    const over = (front, back) => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1,
    });
    const luminance = ({ r, g, b }) => {
      const f = channel => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    /* Sfondi që sheh syri: prindi i parë me alfa jo-zero. */
    const backdrop = element => {
      let node = element;
      while (node && node !== document.documentElement) {
        const parsed = parse(getComputedStyle(node).backgroundColor);
        if (parsed && parsed.a > 0.95) return parsed;
        node = node.parentElement;
      }
      return { r:255, g:255, b:255, a:1 };
    };

    const findings = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (!element.getClientRects().length) continue;
      /* Vetëm elemente që mbajnë vetë tekst, jo kontejnerë. */
      const own = [...element.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.nodeValue.trim())
        .join(' ')
        .trim();
      if (!own) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || Number(style.opacity) < 0.2) continue;
      const colour = parse(style.color);
      if (!colour || colour.a < 0.2) continue;
      const back = backdrop(element);
      const front = over(colour, back);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? minLarge : minNormal;
      const got = ratio(front, back);
      if (got + 0.05 < need) {
        findings.push({
          scope: element.closest('.mi-sidebar') ? 'sirtar' : element.closest('#dataTable') ? 'tabelë' : 'faqe',
          label: String(element.className || element.tagName).trim().split(/\s+/).slice(0, 2).join('.'),
          text: own.slice(0, 30),
          colour: style.color,
          background: `rgb(${Math.round(back.r)}, ${Math.round(back.g)}, ${Math.round(back.b)})`,
          ratio: Math.round(got * 100) / 100,
          need,
        });
      }
    }
    return { skipped:false, findings };
  }, { minNormal:MIN_NORMAL, minLarge:MIN_LARGE });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const failures = [];
  const report = [];

  try {
    for (const entry of PAGES) {
      for (const theme of THEMES) {
        const context = await browser.newContext({ viewport:{ width:1440, height:1000 } });
        const page = await context.newPage();
        let result = { skipped:true, findings:[] };
        try {
          result = await measure(page, entry, theme);
        } catch (error) {
          failures.push(`${entry.name} (${theme}): faqja nuk u ngarkua — ${String(error).slice(0, 140)}`);
          await context.close();
          continue;
        }
        await context.close();

        const label = `${entry.name} · ${theme}`;
        report.push(`${label.padEnd(24)} ${result.findings.length ? `${result.findings.length} nën pragun` : 'i lexueshëm'}`);
        for (const finding of result.findings.slice(0, 5)) {
          failures.push(
            `${label}: [${finding.scope}] ${finding.label} — ${finding.colour} mbi ${finding.background} `
            + `jep ${finding.ratio}:1, nën ${finding.need}:1 ("${finding.text}")`
          );
        }
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(report.join('\n'));
  assert.deepEqual(failures, [], `\n${failures.join('\n')}\n`);
  console.log('\nPorta e kontrastit kaloi: asnjë tekst nuk rri nën pragun AA, në asnjërën temë.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
