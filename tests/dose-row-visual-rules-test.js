const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const professionalCss = read('tailadmin-professional.css');
const markerJs = read('registry-dose-clinical-row-markers.js');
const markerCss = read('registry-dose-clinical-row-markers.css');
const calculator = read('registry-dose-calculator.js');
const tenSecondFlow = read('registry-dose-10s-flow.js');

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
  html.indexOf('registry-dose-table-button.js') < html.indexOf('registry-dose-clinical-row-markers.js'),
  'Clinical row classifier must run after the verified-dose table integration.',
);
assert.match(html, /registry-dose-10s-flow\.js\?v=20260811-2/);
assert.doesNotMatch(html, /registry-dose-calculator-fast-ui\.js/, 'Retired fast-UI controller must not return to production.');

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

// Canonical V2.3 calculator must remain adaptive, automatic and fail-closed.
assert.match(calculator, /officialVerifiedOnly/);
assert.match(calculator, /needsWeightMethod/);
assert.match(calculator, /dose_per_kg_per_dose/);
assert.match(calculator, /dose_per_kg_per_day/);
assert.match(calculator, /manual_only/);
assert.match(calculator, /patientGroup/);
assert.match(calculator, /ageMatchedRules/);
assert.match(calculator, /preferredUnique/);
assert.match(calculator, /maybeCalculate/);
assert.match(calculator, /renderPlainLanguageTemplate/);
assert.match(calculator, /Kopjo udhëzimin/);
assert.match(calculator, /Pacient i ri/);
assert.match(calculator, /prefers-reduced-motion/);

// The one active physician-speed layer may tune UX, never clinical arithmetic.
assert.match(tenSecondFlow, /registry-dose-10s-flow-v2/);
assert.match(tenSecondFlow, /ensureExplicitIndication/);
assert.match(tenSecondFlow, /Zgjidh indikacionin/);
assert.match(tenSecondFlow, /updateCue/);
assert.match(tenSecondFlow, /focusNextFromAge/);
assert.match(tenSecondFlow, /Rezultati llogaritet automatikisht/);
assert.match(tenSecondFlow, /min-height:48px/);
assert.doesNotMatch(tenSecondFlow, /computeDose|doseMinValue|doseMaxValue|fetch\s*\(/,
  '10-second flow may not duplicate or alter clinical dose arithmetic.');

console.log('Pediatric-only red text, parenteral green tint, combined state and canonical adaptive V2.3 dose flow passed.');
