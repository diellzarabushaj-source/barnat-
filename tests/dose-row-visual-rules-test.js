const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const css = read('registry-v2.css');
const js = read('registry-v2.js');

assert.match(html, /data-drx-app="registry-v2"/);
assert.match(html, /<th[^>]*data-col="adultDose"[^>]*>Doza e të rriturit<\/th>/);
assert.match(html, /<th[^>]*data-col="pediatricDose"[^>]*>Doza pediatrike<\/th>/);
assert.match(html, /registry-v2\.css\?v=[^"\s]+/);
assert.match(html, /registry-v2\.js\?v=[^"\s]+/);

for (const retired of [
  'registry-dose-calculator.js',
  'registry-dose-table-button.js',
  'registry-dose-10s-flow.js',
  'registry-dose-interaction-loader.js',
  'registry-insulin-row-bridge.js',
  'registry-novorapid-simple-calculator.js',
  'registry-novomix30-simple-calculator.js',
  'registry-other-insulins-simple-calculator.js',
  'registry-insulin-final-safety.js',
  'registry-dose-clinical-row-markers.js',
  'registry-dose-clinical-row-markers.css',
]) {
  assert.ok(!html.includes(retired), `Legacy dosage runtime must stay out of Registry V2: ${retired}`);
}

assert.match(js, /\/api\/dosage\?view=cards/);
assert.match(js, /adultDose/);
assert.match(js, /pediatricDose/);
assert.match(js, /adultRoute/);
assert.match(js, /pediatricRoute/);
assert.match(js, /dose-cell/);
assert.match(js, /route-chip/);
assert.match(js, /data-dose-toggle/);
assert.match(js, /syncDoseToggle/);
assert.match(js, /Më shumë/);
assert.match(js, /Më pak/);

assert.match(css, /--clinical:#0f766e/);
assert.match(css, /--pediatric:#2563eb/);
assert.match(css, /\.registry-table td:nth-child\(9\) \.route-chip/);
assert.match(css, /\.dose-toggle/);
assert.match(css, /\.dose-cell\.is-expanded \.dose-text/);
assert.match(css, /content:"Doza e të rriturit"/);
assert.match(css, /content:"Doza pediatrike"/);
assert.match(css, /border-left:3px solid #8bd4c8/);
assert.match(css, /border-left:3px solid #93b4f6/);
assert.match(css, /@media\(max-width:760px\)/);
assert.doesNotMatch(css, /!important/);

console.log('Registry V2 adult/pediatric dosage semantics, mobile cards and retired calculator isolation passed.');
