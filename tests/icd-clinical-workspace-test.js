const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('icd.html');
const css = read('icd-clinical-workspace.css');
const js = read('icd-clinical-workspace.js');
const loader = read('icd-clinical-style-loader.js');
const cardsCss = read('icd-premium-cards.css');

assert.match(html, /rel="preload" href="icd-clinical-workspace\.css\?v=20260725-1" as="style"/);
assert.match(html, /icd-clinical-style-loader\.js\?v=20260725-1/);
assert.match(html, /icd-clinical-workspace\.js\?v=20260725-1/);
const staticStyles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
assert.match(staticStyles.at(-1), /tailadmin-professional\.css/, 'The shared professional shell must remain the final static stylesheet.');
assert.ok(html.indexOf('icd-premium-cards.js') < html.indexOf('icd-clinical-workspace.js'), 'Workspace behavior must run after chapter-card decoration.');

for (const marker of [
  'icd-clinical-hero', 'icd-hero-stats', 'icd-workbench', 'icd-quick-nav',
  'data-icd-quick="family"', 'data-icd-quick="emergency"', 'data-icd-quick="critical"',
  'icdHeroChapterCount', 'icdHeroCodeCount', 'icdHeroCriticalCount',
]) assert.ok(html.includes(marker), `ICD HTML missing ${marker}`);

for (const marker of [
  '.icd-clinical-hero', '.icd-workbench', 'position:sticky', '.icd-quick-button',
  '.icd-code-grid', '.icd-code-card', 'html[data-theme=dark]',
  '@media(max-width:860px)', '@media(max-width:620px)',
  '@media(prefers-reduced-motion:reduce)', '@media(forced-colors:active)',
]) assert.ok(css.includes(marker), `ICD clinical CSS missing ${marker}`);

for (const marker of [
  'medindex:icd-workspace-ready', 'updateHeroStats', 'ensureSourceNoticeIcon',
  'clearAllFilters', 'syncQuickButtons', 'syncSelectedChapter', 'event.altKey',
  'MutationObserver', 'aria-pressed',
]) assert.ok(js.includes(marker), `ICD workspace JS missing ${marker}`);

for (const marker of [
  'icdClinicalWorkspaceStyles', 'icd-clinical-workspace.css?v=20260725-1',
  'medindex:tailadmin-ready', 'pageshow', 'document.head.lastElementChild',
]) assert.ok(loader.includes(marker), `ICD style loader missing ${marker}`);

assert.doesNotMatch(js, /fetch\s*\(/, 'The ICD UI workspace must not fetch or replace clinical data.');
assert.doesNotMatch(js, /\/api\//, 'The ICD UI workspace must remain frontend-only.');
assert.doesNotMatch(loader, /fetch\s*\(/, 'The ICD style loader must only manage local CSS order.');
assert.match(cardsCss, /background:linear-gradient\(145deg,#fff/);
assert.match(cardsCss, /border-top:4px solid var\(--icd-accent\)/);
assert.doesNotMatch(cardsCss, /min-height:272px/, 'Chapter cards must no longer use the heavy showcase height.');

new Function(js);
new Function(loader);
console.log('ICD clinical workspace audit passed.');
