const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const markerJs = read('registry-dose-clinical-row-markers.js');
const markerCss = read('registry-dose-clinical-row-markers.css');
const calculator = read('registry-dose-calculator.js');
const fastUi = read('registry-dose-calculator-fast-ui.js');

assert.match(html, /registry-dose-clinical-row-markers\.css\?v=20260806-1/);
assert.match(html, /registry-dose-clinical-row-markers\.js\?v=20260806-1/);
assert.ok(
  html.indexOf('tailadmin-professional.css') < html.indexOf('registry-dose-clinical-row-markers.css'),
  'Clinical row colors must load after the final TailAdmin layer.',
);
assert.ok(
  html.indexOf('registry-dose-table-button.js') < html.indexOf('registry-dose-clinical-row-markers.js'),
  'Clinical row classifier must run after the verified-dose table integration.',
);

assert.match(markerJs, /mi-dose-row--pediatric-only/);
assert.match(markerJs, /mi-dose-row--parenteral/);
assert.match(markerJs, /mi-dose-row--pediatric-parenteral/);
assert.match(markerJs, /dose-calculator-group-pediatric_only/);
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

// Existing calculator flow must remain adaptive and fail-closed.
assert.match(calculator, /officialVerifiedOnly/);
assert.match(calculator, /methodNeedsWeight/);
assert.match(calculator, /dose_per_kg_per_dose/);
assert.match(calculator, /dose_per_kg_per_day/);
assert.match(calculator, /manual_only/);
assert.match(calculator, /patientGroup/);
assert.match(fastUi, /WEIGHT_PRESETS = Object\.freeze\(\[5, 10, 15, 30, 40\]\)/);
assert.match(fastUi, /updateIndicationVisibility/);
assert.match(fastUi, /inferGroupFromAge/);
assert.match(fastUi, /scheduleAutomaticCalculation/);
assert.match(fastUi, /Kopjo udhëzimin/);
assert.match(fastUi, /Pacient i ri/);
assert.match(fastUi, /prefers-reduced-motion/);

console.log('Pediatric-only red text, parenteral green tint, combined state and adaptive verified calculator flow passed.');
