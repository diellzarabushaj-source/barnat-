'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = require('../runtime-asset-manifest.json');
const check = process.argv.includes('--check');
for (const [page, assets] of Object.entries(manifest)) {
  const file = path.join(root, page);
  const html = fs.readFileSync(file, 'utf8');
  let next = html;
  for (const [asset, version] of Object.entries(assets)) {
    if (!fs.existsSync(path.join(root, asset))) throw new Error(`Missing asset: ${asset}`);
    const pattern = new RegExp(`(/${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=)[^"'&]+`, 'g');
    if (!pattern.test(next)) throw new Error(`Missing versioned reference: ${page}: ${asset}`);
    next = next.replace(pattern, (_, prefix) => prefix + version);
  }
  if (check && next !== html) throw new Error(`Asset versions differ from the manifest: ${page}`);
  if (!check && next !== html) fs.writeFileSync(file, next);
}
console.log(`Runtime asset manifest ${check ? 'verified' : 'synchronized'}.`);
