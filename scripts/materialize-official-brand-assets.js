'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = path.join(ROOT, 'brand/source-v1/medindex-mark-on-light.webp.b64');
const output = path.join(ROOT, 'brand/medindex-mark-on-light.webp');

if (!fs.existsSync(source)) throw new Error('Official MedIndex logo source is missing.');
const buffer = Buffer.from(fs.readFileSync(source, 'utf8').trim(), 'base64');
if (buffer.length < 1000 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
  throw new Error('Official MedIndex logo source is invalid.');
}
fs.mkdirSync(path.dirname(output), { recursive:true });
fs.writeFileSync(output, buffer);
console.log(`Materialized official MedIndex logo fallback (${buffer.length} bytes).`);

// Every build must reject any MedIndex logo outside the four approved v1 assets.
require('../tests/official-brand-policy-test.js');
