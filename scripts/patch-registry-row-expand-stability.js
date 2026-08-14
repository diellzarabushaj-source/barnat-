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

source = replacePattern(
  source,
  /([ \t]*row\.classList\.toggle\('registry-row-expanded', expanded\);\r?\n)[ \t]*row\.dataset\.registryRowExpanded = String\(expanded\);/,
  "$1    const expandedState = String(expanded);\n    const expansionChanged = row.dataset.registryRowExpanded !== expandedState;\n    if (expansionChanged) row.dataset.registryRowExpanded = expandedState;",
  'const expansionChanged = row.dataset.registryRowExpanded !== expandedState',
  'row-expanded idempotent state write'
);

source = replacePattern(
  source,
  /([ \t]*syncDetailsToggle\(row, expanded\);)\r?\n([ \t]*)\}/,
  "$1\n    if (expansionChanged) {\n      window.dispatchEvent(new CustomEvent('medindex:registry-row-expanded-change', {\n        detail:{ row, expanded, key },\n      }));\n    }\n$2}",
  "medindex:registry-row-expanded-change",
  'row-expanded change event'
);

if (!source.includes("medindex:registry-row-expanded-change")) {
  throw new Error('Row expansion stability patch must publish targeted expansion changes.');
}
if (!source.includes('if (expansionChanged) row.dataset.registryRowExpanded = expandedState;')) {
  throw new Error('Row expansion stability patch must avoid duplicate expanded-state attribute writes.');
}

fs.writeFileSync(TARGET, source);
console.log('Registry row expansion writes are idempotent and publish one targeted expansion-change event instead of relying on subtree attribute observers.');
