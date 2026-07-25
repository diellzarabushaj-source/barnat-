const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('icd.html');
const css = read('icd-premium-cards.css');
const js = read('icd-premium-cards.js');

assert.match(html, /icd-premium-cards\.css\?v=20260725-1/);
assert.match(html, /icd-premium-cards\.js\?v=20260725-1/);
assert.ok(html.indexOf('icd.js?v=20260723-4') < html.indexOf('icd-premium-cards.js?v=20260725-1'), 'Premium renderer must load after the ICD data renderer');

new Function(js);
assert.match(js, /const THEMES = \[/);
assert.match(js, /const ICONS = \[/);
assert.match(js, /romanToNumber/);
assert.match(js, /ICONS\[chapterIndex % ICONS\.length\]/);
assert.match(js, /themeStyle\(chapterIndex\)/);
assert.match(js, /MutationObserver/);
assert.match(js, /Hap kapitullin/);
assert.match(js, /dataset\[DECORATED\]/);
assert.equal((js.match(/\['#[0-9a-f]{6}','#[0-9a-f]{6}','#[0-9a-f]{6}'\]/gi) || []).length, 22, 'Every ICD chapter must have a distinct gradient theme');

for (const marker of [
  '.icd-aura-card', '.icd-aura-icon', '.icd-aura-roman', '.icd-aura-title',
  '.icd-aura-range', '.icd-aura-count', '.icd-aura-action', '.icd-aura-arrow',
  '@media(max-width:1180px)', '@media(max-width:720px)',
  '@media(prefers-reduced-motion:reduce)', '@media(forced-colors:active)'
]) assert.ok(css.includes(marker), `Premium ICD CSS missing ${marker}`);

assert.doesNotMatch(js, /fetch\(|\/api\//, 'Premium visual renderer must not touch backend APIs');
assert.doesNotMatch(css, /https?:\/\//, 'Premium cards must not load external visual assets');

console.log('Premium ICD aura cards audit passed.');
