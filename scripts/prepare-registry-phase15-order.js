'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'registry-desktop-column-lite.js');
const source = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
const marker = '  const columns = Object.freeze([';
const start = source.indexOf(marker);
const end = start >= 0 ? source.indexOf('\n  ]);', start) : -1;
if (start < 0 || end < 0) throw new Error('Phase 15 order preparer: desktop column block mungon.');

const priority = [
  'number', 'active-substance', 'trade-name', 'atc', 'drug-class', 'use',
  'pdid', 'protocol', 'strength', 'form', 'population', 'prescription-label',
  'packaging', 'mah', 'manufacturer', 'ma-certificate', 'status',
  'wholesale-price', 'margin-price', 'vat', 'retail-price', 'validity',
];

const keyed = new Map();
const other = [];
for (const line of source.slice(start + marker.length, end).split('\n').filter(line => line.trim())) {
  const match = line.match(/key:'([^']+)'/);
  if (!match) other.push(line);
  else keyed.set(match[1], line);
}

const ordered = [];
for (const key of priority) {
  if (!keyed.has(key)) continue;
  ordered.push(keyed.get(key));
  keyed.delete(key);
}
for (const line of keyed.values()) ordered.push(line);

const next = source.slice(0, start) + `${marker}\n${[...ordered, ...other].join('\n')}` + source.slice(end);
fs.writeFileSync(file, next, 'utf8');
