const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const count = (value, pattern) => [...value.matchAll(pattern)].length;

const pages = [
  'index.html',
  'klasifikimi.html',
  'icd.html',
  'analizat.html',
  'dozologjia.html',
  'protokollet.html',
  'recetat.html',
];

for (const fileName of pages) {
  const html = read(fileName);
  assert.match(html, /<html[^>]+class=["'][^"']*medindex-tailadmin/, `${fileName}: TailAdmin marker must exist before scripts execute`);
  assert.equal(count(html, /tailadmin-professional\.css/gi), 1, `${fileName}: professional CSS must load once`);
  assert.equal(count(html, /tailadmin-professional\.js/gi), 1, `${fileName}: professional JS must load once`);
  assert.match(html, /data-tailadmin-professional-css/, `${fileName}: professional CSS marker missing`);

  const baseCss = html.indexOf('tailadmin-medindex.css');
  const proCss = html.indexOf('tailadmin-professional.css');
  const shellJs = html.indexOf('tailadmin-shell.js');
  const proJs = html.indexOf('tailadmin-professional.js');
  assert.ok(baseCss >= 0 && proCss > baseCss, `${fileName}: professional CSS must follow base TailAdmin CSS`);
  assert.ok(shellJs >= 0 && proJs > shellJs, `${fileName}: professional runtime must follow shell runtime`);
}

const professionalBundle = read('tailadmin-professional.css');
assert.match(professionalBundle, /medindex-visual-system-v4\.css\?v=20260811-1/, 'Phase 4 visual system must be part of the professional bundle');
assert.match(professionalBundle, /medindex-phase5-performance\.css\?v=20260811-1/, 'Phase 5 performance system must be the final professional visual contract');
assert.ok(
  professionalBundle.indexOf('medindex-tailwind-touch.css') < professionalBundle.indexOf('medindex-phase5-performance.css'),
  'Phase 5 performance contract must load after the touch correction layer'
);

const phase4Css = read('medindex-visual-system-v4.css');
[
  /--mi-v4-font:/,
  /--mi-v4-bg:/,
  /--mi-v4-surface:/,
  /--mi-v4-line:/,
  /--mi-v4-accent:/,
  /--mi-v4-radius-sm:/,
  /--mi-v4-shadow-1:/,
  /html\.medindex-tailadmin body/,
  /:focus-visible/,
  /#dataTable thead th/,
  /\.icd-tree-toolbar/,
  /\.registry-workspace-panel/,
  /html\[data-theme="dark"\]\.medindex-tailadmin/,
  /@media\(max-width:720px\)/,
  /@media\(prefers-reduced-motion:reduce\)/,
].forEach(pattern => assert.match(phase4Css, pattern, `Phase 4 visual system missing ${pattern}`));
assert.doesNotMatch(phase4Css, /https?:\/\//, 'Phase 4 visual system must not depend on external assets');

const phase5Css = read('medindex-phase5-performance.css');
[
  /--mi-p5-touch-target:44px/,
  /overflow-anchor:none/,
  /font-variant-numeric:tabular-nums/,
  /overscroll-behavior-x:contain/,
  /scrollbar-gutter:stable/,
  /@media\(min-width:1024px\) and \(max-width:1366px\)/,
  /@media\(min-width:1600px\)/,
  /@media\(pointer:coarse\)/,
  /@media\(max-width:1023px\)/,
  /contain-intrinsic-size:auto 420px/,
  /@media\(update:slow\)/,
  /@media\(prefers-reduced-motion:reduce\)/,
].forEach(pattern => assert.match(phase5Css, pattern, `Phase 5 performance contract missing ${pattern}`));
assert.doesNotMatch(phase5Css, /https?:\/\//, 'Phase 5 performance contract must not load external assets');
assert.doesNotMatch(phase5Css, /animation-name|@keyframes/i, 'Phase 5 must not introduce decorative animation work');

const phase5Browser = read('tests/phase5-final-performance.spec.js');
[
  /phone:\{ width:390, height:844 \}/,
  /tablet:\{ width:820, height:1180 \}/,
  /laptop13:\{ width:1366, height:768 \}/,
  /desktopLarge:\{ width:1920, height:1080 \}/,
  /type:'layout-shift'/,
  /type:'event'/,
  /type:'longtask'/,
  /post-ready CLS/,
  /keyboard search/,
  /overscrollBehaviorX/,
  /Network\.emulateNetworkConditions/,
  /PHASE5_METRICS/,
].forEach(pattern => assert.match(phase5Browser, pattern, `Phase 5 browser audit missing ${pattern}`));

const workflow = read('.github/workflows/physician-browser-audit.yml');
assert.match(workflow, /tests\/phase5-final-performance\.spec\.js/, 'Browser CI must execute the Phase 5 final performance audit');

const css = [
  professionalBundle,
  read('tailadmin-professional-core.css'),
  read('medindex-tailwind-ui.css'),
  phase4Css,
  read('medindex-tailwind-touch.css'),
  phase5Css,
].join('\n');
[
  /position:\s*fixed\s*!important;[\s\S]*inset:\s*0\s*!important;/,
  /#appMenu \.app-menu-link,[\s\S]*flex-direction:\s*row\s*!important;/,
  /overflow-x:\s*hidden\s*!important;/,
  /data-mi-page="barnat"/,
  /data-mi-page="klasifikimi"/,
  /data-mi-page="icd"/,
  /data-mi-page="analizat"/,
  /data-mi-page="dozologjia"/,
  /data-mi-page="protokollet"/,
  /data-mi-page="recetat"/,
  /@media \(max-width: 1023px\)/,
  /@media \(max-height: 760px\)/,
].forEach(pattern => assert.match(css, pattern, `professional CSS bundle missing ${pattern}`));

const runtime = read('tailadmin-professional.js');
[
  /ROOT\.dataset\.miPage/,
  /tools\.appendChild\(logout\)/,
  /resetRootHorizontalOffset/,
  /orderStylesheets/,
  /MutationObserver/,
  /ResizeObserver/,
  /medindex:professional-ui-ready/,
].forEach(pattern => assert.match(runtime, pattern, `professional runtime missing ${pattern}`));

assert.doesNotMatch(runtime, /fetch\(|\/api\//, 'professional runtime must not touch backend APIs');

const labHtml = read('analizat.html');
const labRuntime = read('analizat.js');
const labCss = read('analizat-polish.css');
assert.match(labHtml, /analizat-polish\.css\?v=20260725-1/);
assert.match(labHtml, /analizat\.js\?v=20260727-neon1/);
[
  /CATEGORY_THEMES/,
  /function iconFor\(/,
  /lab-category-tile/,
  /lab-category-symbol/,
  /lab-test-icon/,
  /data-category-open/,
  /aria-pressed/,
  /\/api\/icd\?dataset=labs/,
  /loadLocalDataset/,
].forEach(pattern => assert.match(labRuntime, pattern, `laboratory runtime missing ${pattern}`));
[
  /\.lab-category-tile/,
  /\.lab-category-head \.lab-category-symbol/,
  /\.lab-test-icon/,
  /\.lab-card-arrow/,
  /--lab-accent/,
  /html\[data-theme=dark\]\.medindex-tailadmin/,
  /@media\(max-width:640px\)/,
].forEach(pattern => assert.match(labCss, pattern, `laboratory CSS missing ${pattern}`));
/* Ky pohim kërkonte të kundërtën: një temë ngjyre për secilën nga
   katërmbëdhjetë kategoritë laboratorike. E matur në shfletues, kjo nxirrte
   nëntë familje ngjyrash të ngopura mbi një faqe të vetme — vjollcë, blu,
   trëndafil, portokalli, indigo, e kuqe, jeshile, cian, teal — dhe e bënte
   Analizat të dukeshin si aplikacion tjetër nga pjesa tjetër e DRx-it.

   Ngjyra nuk mbante informacion: kategoria lexohet nga emri dhe nga numri i
   saj. Dallimi me ngjyrë ruhet vetëm aty ku ngatërrimi është i rrezikshëm —
   doza e të rriturve kundrejt asaj pediatrike — dhe ai rri te shtresa e
   dozimit, jo te kategoritë.

   Kontrata tani është e kundërta, dhe `scripts/audit-clinical-accents.js` e
   mat atë mbi faqen e ndezur. */
assert.equal(
  (labRuntime.match(/accent:'#/g) || []).length,
  1,
  'Laboratory categories share the one clinical accent; per-category hues are what the accent gate exists to stop'
);
assert.match(labRuntime, /accent:'#1f7779'/, 'the shared laboratory accent must be the clinical teal of the design system');
[
  /return 'blood'/,
  /return 'microscope'/,
  /return 'platelet'/,
  /return 'coagulation'/,
  /return 'kidney'/,
  /return 'liver'/,
  /return 'glucose'/,
  /return 'lipid'/,
  /return 'pancreas'/,
  /return 'inflammation'/,
  /return 'endocrine'/,
  /return 'urine'/,
  /return 'bacteria'/,
  /return 'flask'/,
].forEach(pattern => assert.match(labRuntime, pattern, `laboratory medical icon mapping missing ${pattern}`));

console.log('Professional TailAdmin shell, Phase 4 visual system, Phase 5 performance contract, Neon-aware laboratory cards and section audit passed.');
