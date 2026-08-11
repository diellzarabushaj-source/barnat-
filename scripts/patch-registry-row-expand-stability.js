'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'registry-row-expand.js');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Row expansion stability patch could not find ${label}.`);
  return source.replace(before, after);
}

let source = fs.readFileSync(TARGET, 'utf8');

source = replaceOnce(
  source,
  "      summary.replaceChildren(document.createTextNode(preview || 'Shfaq skemat'));",
  "      const nextSummary = preview || 'Shfaq skemat';\n      const alreadyPlain = summary.childNodes.length === 1 && summary.firstChild?.nodeType === Node.TEXT_NODE;\n      if (!alreadyPlain || clean(summary.textContent) !== nextSummary) summary.textContent = nextSummary;",
  'dosage summary rewrite'
);

source = replaceOnce(
  source,
  "      const toggle = trigger.querySelector('.registry-dosage-toggle');\n      if (toggle) toggle.textContent = expanded ? 'Më pak' : 'Më shumë';",
  "      const toggle = trigger.querySelector('.registry-dosage-toggle');\n      const nextToggle = expanded ? 'Më pak' : 'Më shumë';\n      if (toggle && toggle.textContent !== nextToggle) toggle.textContent = nextToggle;",
  'dosage disclosure label rewrite'
);

fs.writeFileSync(TARGET, source);
console.log('Registry row expansion mutation writes made idempotent.');
