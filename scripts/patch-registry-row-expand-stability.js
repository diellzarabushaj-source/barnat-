'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'registry-row-expand.js');

function replacePattern(source, pattern, replacement, appliedMarker, label) {
  if (source.includes(appliedMarker)) return source;
  if (!pattern.test(source)) throw new Error(`Row expansion stability patch could not find ${label}.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

let source = fs.readFileSync(TARGET, 'utf8');

source = replacePattern(
  source,
  /[ \t]*summary\.replaceChildren\(document\.createTextNode\(preview \|\| 'Shfaq skemat'\)\);/,
  "      const nextSummary = preview || 'Shfaq skemat';\n      const alreadyPlain = summary.childNodes.length === 1 && summary.firstChild?.nodeType === Node.TEXT_NODE;\n      if (!alreadyPlain || clean(summary.textContent) !== nextSummary) summary.textContent = nextSummary;",
  'const nextSummary = preview',
  'dosage summary rewrite'
);

source = replacePattern(
  source,
  /[ \t]*const toggle = trigger\.querySelector\('\.registry-dosage-toggle'\);\r?\n[ \t]*if \(toggle\) toggle\.textContent = expanded \? 'Më pak' : 'Më shumë';/,
  "      const toggle = trigger.querySelector('.registry-dosage-toggle');\n      const nextToggle = expanded ? 'Më pak' : 'Më shumë';\n      if (toggle && toggle.textContent !== nextToggle) toggle.textContent = nextToggle;",
  'const nextToggle = expanded',
  'dosage disclosure label rewrite'
);

fs.writeFileSync(TARGET, source);
console.log('Registry row expansion mutation writes made idempotent.');
