const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const balanced = css => (css.match(/{/g) || []).length === (css.match(/}/g) || []).length;

const classificationHtml = read('klasifikimi.html');
const registryHtml = read('index.html');
const icdHtml = read('icd.html');
const icdCss = read('icd-tree-polish.css');
const labHtml = read('analizat.html');
const labCss = read('analizat-tailwind-cards-v2.css');

assert.match(classificationHtml, /id=["']atcContent["']/, 'Klasifikimi redirect needs an accessible main landmark');
assert.match(classificationHtml, /classification-redirect\.js/, 'Klasifikimi must preserve the current table-only redirect');
assert.match(classificationHtml, /href=["']\/index\.html["']/, 'Klasifikimi needs a no-script link to the Barnat table');
assert.match(registryHtml, /id=["']search["']/, 'The shared Barnat and Klasifikimi table must preserve its search field');

for (const id of ['icdContent', 'icdSmartSearch', 'icdSearch', 'icdTreeStatus', 'icdSourceHealth', 'icdTree', 'icdFavoritesPanel']) {
  assert.match(icdHtml, new RegExp(`id=["']${id}["']`), `icd: missing preserved #${id}`);
}
assert.match(icdHtml, /icd-tree-polish\.css/, 'ICD must load the current hierarchy polish layer');
assert.match(icdHtml, /icd-advanced-search\.css/, 'ICD must retain advanced search styling');
assert.match(icdHtml, /icd-tree\.js/, 'ICD hierarchy controller must remain wired');
assert.match(icdCss, /\.icd-tree-toolbar\s*\{[^}]*grid-template-columns:/, 'ICD toolbar needs a practical responsive grid');
assert.match(icdCss, /\.icd-search-wrap #icdSearch\s*\{/, 'ICD search needs its dedicated professional treatment');
assert.match(icdCss, /html\[data-theme="dark"\]/, 'ICD dark mode overrides missing');
assert.match(icdCss, /@media\(max-width:/, 'ICD responsive override missing');
assert.match(icdCss, /@media\(prefers-reduced-motion:reduce\)/, 'ICD reduced-motion support missing');
assert.match(icdCss, /@media\(forced-colors:active\)/, 'ICD forced-colors support missing');
assert.doesNotMatch(icdCss, /(?:linear|radial)-gradient/i, 'ICD hierarchy polish must use calm solid surfaces');
assert.ok(balanced(icdCss), 'ICD hierarchy polish has unbalanced CSS braces');

for (const id of ['labContent', 'labSearch', 'labCategory', 'labCount', 'labCategoryNav', 'labSections', 'detailOverlay']) {
  assert.match(labHtml, new RegExp(`id=["']${id}["']`), `analizat: missing preserved #${id}`);
}
assert.match(labCss, /data-mi-page=["']analizat["']/, 'Analizat overrides must remain page scoped');
assert.match(labCss, /medindex-professional/, 'Analizat late-cascade specificity marker missing');
assert.match(labCss, /background-image\s*:\s*none\s*!important/, 'Analizat decorative backgrounds are not neutralized');
assert.match(labCss, /html\[data-theme=["']dark["']\]/, 'Analizat dark mode overrides missing');
assert.match(labCss, /@media\(max-width:/, 'Analizat responsive override missing');
assert.match(labCss, /@media\(prefers-reduced-motion:reduce\)/, 'Analizat reduced-motion support missing');
assert.doesNotMatch(labCss, /(?:linear|radial)-gradient/i, 'Analizat final card layer must not define gradients');
assert.match(labCss, /--lab-accent:var\(--mi-brand-600\)!important/, 'Laboratory category palettes must collapse to one professional accent');
assert.match(labCss, /\.lab-card-open\s*\{[\s\S]*min-height:180px!important/, 'Laboratory cards must use compact desktop density');
assert.ok(balanced(labCss), 'Analizat CSS has unbalanced braces');

for (const html of [icdHtml, labHtml]) {
  const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
  assert.match(styles.at(-1), /tailadmin-professional\.css/, 'Shared professional stylesheet must remain the final static layer');
}

console.log('Klasifikimi table redirect, current ICD hierarchy, and Analizat professional UI audit passed.');
