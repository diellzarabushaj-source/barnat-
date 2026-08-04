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

const canonicalReplacements = new Map([
  ['medindex-brand-runtime.js', [
    ["const ROOT = '/public/images/brand/';", "const ROOT = '/brand/';"],
    ['medindex-icon-on-light.png', 'medindex-mark-on-light.webp'],
    ['medindex-icon-on-dark.png', 'medindex-mark-on-dark.png'],
  ]],
  ['middleware.ts', [
    ['/images/brand/medindex-mark-mplus.svg', '/brand/medindex-mark-on-light.webp'],
    ['/medindex-icon.svg', '/brand/medindex-mark-on-light.webp'],
  ]],
  ['sw.js', [['/medindex-icon.svg', '/brand/medindex-mark-on-light.webp']]],
  ['sw-resilient.js', [['/medindex-icon.svg', '/brand/medindex-mark-on-light.webp']]],
  ['sw-resilient-v3.js', [['/medindex-icon.svg', '/brand/medindex-mark-on-light.webp']]],
]);

for (const [relativePath, replacements] of canonicalReplacements) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const original = fs.readFileSync(absolutePath, 'utf8');
  let canonical = original;
  for (const [legacy, approved] of replacements) canonical = canonical.replaceAll(legacy, approved);
  if (canonical !== original) fs.writeFileSync(absolutePath, canonical);
}

console.log('Canonicalized MedIndex runtime logo references.');

// Every build must reject any MedIndex logo outside the four approved v1 assets.
require('../tests/official-brand-policy-test.js');
