'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'registry-unified-table.js');

function ensureArrayEntry(source, name, entry) {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Personal note column patch could not find ${name}.`);
  const open = source.indexOf('[', start);
  const end = source.indexOf(']);', open);
  if (open < 0 || end < 0) throw new Error(`Personal note column patch could not close ${name}.`);
  const block = source.slice(open, end);
  if (block.includes(`'${entry}'`)) return source;
  const next = `${source.slice(0, end).replace(/\s*$/, '')}, '${entry}'\n  `;
  return next + source.slice(end);
}

function ensureObjectEntry(source, name, key, entry) {
  const marker = `const ${name} = Object.freeze({`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Personal note column patch could not find ${name}.`);
  const end = source.indexOf('\n  });', start);
  if (end < 0) throw new Error(`Personal note column patch could not close ${name}.`);
  const block = source.slice(start, end);
  if (block.includes(key)) return source;
  return source.slice(0, end) + `\n    ${entry}` + source.slice(end);
}

let source = fs.readFileSync(TARGET, 'utf8');

source = ensureArrayEntry(source, 'FULL_ORDER', 'personal-note');
source = ensureArrayEntry(source, 'CLINICAL_ORDER', 'personal-note');
source = ensureArrayEntry(source, 'DYNAMIC_KEYS', 'personal-note');
source = ensureObjectEntry(source, 'LABEL_BY_KEY', "'personal-note'", "'personal-note':'Shënime personale',");
source = ensureObjectEntry(source, 'WIDTHS', "'personal-note'", "'personal-note':220,");
source = ensureObjectEntry(source, 'LABEL_KEYS', "shenimepersonale:'personal-note'", "shenimepersonale:'personal-note', shenime:'personal-note',");

if (!source.includes("'personal-note':'Shënime personale'")
    || !source.includes("'personal-note':220")
    || !source.includes("shenimepersonale:'personal-note'")) {
  throw new Error('Personal note column patch contract was not applied.');
}

fs.writeFileSync(TARGET, source);
console.log('Native personal-note unified registry column contract applied.');
