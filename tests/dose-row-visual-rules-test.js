const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const professionalCss = read('tailadmin-professional.css');
const markerJs = read('registry-dose-clinical-row-markers.js');
const markerCss = read('registry-dose-clinical-row-markers.css');

assert.match(html, /tailadmin-professional\.css\?v=20260811-3/);
assert.doesNotMatch(html, /<link[^>]+registry-dose-clinical-row-markers\.css/,
  'Clinical row CSS must not create a second stylesheet after the canonical TailAdmin bundle.');
assert.match(professionalCss, /registry-dose-clinical-row-markers\.css\?v=20260812-pediatric-pink-1/);
assert.ok(
  professionalCss.lastIndexOf('registry-dose-clinical-row-markers.css') > professionalCss.lastIndexOf('medindex-phase5-performance.css'),
  'Clinical row semantics must be the last import inside the canonical TailAdmin bundle.',
);
assert.match(html, /registry-dose-clinical-row-markers\.js\?v=20260812-pediatric-pink-1/);
assert.ok(
  html.indexOf('registry-dosage-loader.js') < html.indexOf('registry-dose-clinical-row-markers.js'),
  'Clinical row classifier must run after the dosage loader.',
);

// The medicines table no longer exposes a dose calculator. Keep clinical row
// semantics, but prevent every retired calculator UI/runtime from returning.
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
]) {
  assert.ok(!html.includes(retired), `Retired calculator runtime must stay out of index.html: ${retired}`);
}
assert.doesNotMatch(html, /registry-dose-calculator-fast-ui\.js/, 'Retired fast-UI controller must not return to production.');

assert.match(markerJs, /mi-dose-row--pediatric-only/);
assert.match(markerJs, /mi-dose-row--parenteral/);
assert.match(markerJs, /mi-dose-row--pediatric-parenteral/);
assert.match(markerJs, /data-registry-column-key=\"form\"/);
assert.match(markerJs, /injeksion\|injection/);
assert.match(markerJs, /infuzion\|infusion/);
assert.match(markerJs, /requestIdleCallback/);
assert.doesNotMatch(markerJs, /fetch\s*\(/, 'Row markers must not perform another API request.');

assert.match(markerCss, /--mi-dose-pediatric-text:\s*#b42318/);
assert.match(markerCss, /--mi-dose-parenteral-bg:\s*#ecfdf3/);
assert.match(markerCss, /mi-dose-row--pediatric-parenteral/);
assert.match(markerCss, /\[data-theme=\"dark\"\]/);
assert.match(markerCss, /forced-colors/);
assert.match(markerCss, /print-color-adjust/);

console.log('Clinical dosage row semantics remain available while all calculator UI/runtimes stay retired from the medicines table.');
