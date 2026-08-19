'use strict';

require('./patch-registry-personal-final.js');
require('./patch-pr157-merge-readiness.js');

/* Lista e aseteve që shërbyesi offline i ruan gjatë instalimit ka qenë e
 * shkruar me dorë te `sw.js`, dhe një e dytë e shkurtër shtohej me dorë te
 * `patch-phase9-pwa-targeted-cache.js`. Të dyja kishin mbetur prapa: nga 36
 * fletë stili dhe 63 skripta që `index.html` ngarkon vërtet, mungonin 23 dhe
 * 39 përkatësisht — bashkë me të dy skedarët e fontit Inter. Offline faqja
 * dukej se punonte vetëm sepse cache-i i HTTP-së ishte i ngrohtë; me atë të
 * pastruar, fonti dhe disa fletë stili dështonin.
 *
 * Prandaj lista nuk shkruhet më me dorë. Ky hap e nxjerr nga vetë faqet: lexon
 * çdo `<link rel=stylesheet>` dhe `<script src>` të faqeve reale, gjurmon
 * fontet e referuara brenda CSS-së, dhe i shton te `APP_SHELL`. Nëse nesër
 * shtohet një fletë stili e re, ajo hyn vetvetiu — nuk ka listë për ta harruar.
 *
 * Ekzekutohet i fundit në `build:runtime`, pasi hapat e tjerë e kanë mbaruar
 * shkrimin te `sw.js` dhe te faqet. Personalizimi kompozohet nga një finalizer
 * i vetëm para paketimit offline; ky skedar nuk njeh fazat e tij individuale.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'sw.js');
const MARKER = 'offline-shell-manifest-v1';

const PAGES = [
  'index.html', 'klasifikimi.html', 'icd.html', 'analizat.html',
  'dozologjia.html', 'urgjencat.html', 'protokollet.html',
  'medical-hub.html', 'recetat.html', 'login-v2.html', 'login.html',
  'recovery.html', 'sistemi.html', 'blog.html',
];

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file.replace(/^\//, '')));

/* Nga një atribut href/src te një shteg absolut i faqes. Kthen null për
   burime të jashtme, data: URL, ose ankora — asgjë prej tyre nuk ruhet dot. */
function toAssetPath(raw) {
  const value = String(raw || '').trim();
  if (!value || /^(https?:)?\/\//i.test(value) || /^(data|blob|mailto|#)/i.test(value)) return null;
  const clean = value.split('?')[0].split('#')[0];
  if (!clean || clean.endsWith('/')) return null;
  return clean.startsWith('/') ? clean : `/${clean}`;
}

function collectFromHtml(html) {
  const found = new Set();
  const linkRe = /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  /* Disa fletë stili nuk vijnë si `rel=stylesheet` por si `rel=preload as=style`,
     dhe një ngarkues i vogël i kthen në stil pasi faqja niset — p.sh.
     `first-page-clinical.css`. Pa këtë rresht ato mbeteshin jashtë cache-it dhe
     dështonin offline, edhe pse faqja i përdor. */
  const preloadRe = /<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["'](?:style|script|font)["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const re of [linkRe, preloadRe, scriptRe]) {
    let match;
    while ((match = re.exec(html))) {
      const asset = toAssetPath(match[1]);
      if (asset) found.add(asset);
    }
  }
  return found;
}

/* Fontet nuk shfaqen te HTML-ja — jetojnë brenda `@font-face` te CSS-ja.
   Pa to, offline faqja bie te fonti i sistemit dhe humb Inter-in. */
function collectFontsFromCss(cssAssets) {
  const fonts = new Set();
  const urlRe = /url\(\s*["']?([^"')]+\.(?:woff2?|ttf|otf))["']?\s*\)/gi;
  for (const asset of cssAssets) {
    const relative = asset.replace(/^\//, '');
    if (!fs.existsSync(path.join(ROOT, relative))) continue;
    const css = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    let match;
    while ((match = urlRe.exec(css))) {
      const font = toAssetPath(match[1]);
      if (font) fonts.add(font);
    }
  }
  return fonts;
}

const collected = new Set();
for (const page of PAGES) {
  if (!exists(page)) continue;
  for (const asset of collectFromHtml(read(page))) collected.add(asset);
}

const cssAssets = [...collected].filter(asset => asset.endsWith('.css'));
for (const font of collectFontsFromCss(cssAssets)) collected.add(font);

/* Vetëm skedarë që ekzistojnë vërtet. `precacheShell` përdor `allSettled`,
   prandaj një 404 nuk e prish instalimin — po e ndot raportin pa nevojë. */
const manifest = [...collected].filter(exists).sort();

if (!manifest.length) throw new Error('Offline shell manifest doli bosh.');

const required = ['/registry-tablet-rows.css', '/fonts/inter-latin-variable-normal.woff2'];
for (const asset of required) {
  if (!manifest.includes(asset)) {
    throw new Error(`Offline shell manifest nuk e kapi ${asset}.`);
  }
}

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const anchor = source.match(/^const APP_SHELL = \[[\s\S]*?\n\];\n/m);
  if (!anchor) throw new Error('Offline shell manifest nuk e gjeti APP_SHELL.');

  const entries = manifest.map(asset => `  '${asset}',`).join('\n');
  const block = `${anchor[0]}
/* ${MARKER}: nxjerrë nga faqet gjatë ndërtimit — mos e shkruaj me dorë.
   Burimi: scripts/patch-offline-shell-manifest.js */
const OFFLINE_SHELL_MANIFEST = [
${entries}
];
for (const asset of OFFLINE_SHELL_MANIFEST) {
  if (!APP_SHELL.includes(asset)) APP_SHELL.push(asset);
}
`;
  source = source.replace(anchor[0], block);
  fs.writeFileSync(TARGET, source, 'utf8');
}

const written = fs.readFileSync(TARGET, 'utf8');
if (!written.includes(MARKER)) throw new Error('Offline shell manifest nuk u shkrua.');
for (const asset of required) {
  if (!written.includes(`'${asset}',`)) {
    throw new Error(`Offline shell manifest e humbi ${asset} pas shkrimit.`);
  }
}

const cssCount = manifest.filter(a => a.endsWith('.css')).length;
const jsCount = manifest.filter(a => a.endsWith('.js')).length;
const fontCount = manifest.filter(a => /\.(woff2?|ttf|otf)$/.test(a)).length;
console.log(
  `Offline shell manifest: ${manifest.length} asete (${cssCount} css, ${jsCount} js, ${fontCount} fonte) `
  + 'të nxjerra nga faqet dhe të shtuara te APP_SHELL.',
);
