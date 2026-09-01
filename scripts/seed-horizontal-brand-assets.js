'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
function enabledFlag(value) {
  return ['1','TRUE','YES','ON'].includes(String(value || '').trim().toUpperCase());
}

const ASSETS = Object.freeze([
  {
    key:'horizontalOnLight',
    source:'brand/source-v2/medindex-horizontal-on-light.webp',
    local:'brand/medindex-horizontal-on-light.webp',
    pathname:'medindex/brand/v1/medindex-horizontal-on-light.webp',
  },
  {
    key:'horizontalOnDark',
    source:'brand/source-v2/medindex-horizontal-on-dark.webp',
    local:'brand/medindex-horizontal-on-dark.webp',
    pathname:'medindex/brand/v1/medindex-horizontal-on-dark.webp',
  },
]);

function verifyWebp(buffer, key) {
  if (buffer.length < 1000
    || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`Invalid cropped horizontal WebP source for ${key}.`);
  }
}

async function main() {
  const prepared = [];
  for (const asset of ASSETS) {
    const sourcePath = path.join(ROOT, asset.source);
    const outputPath = path.join(ROOT, asset.local);
    const buffer = fs.readFileSync(sourcePath);
    verifyWebp(buffer, asset.key);
    fs.mkdirSync(path.dirname(outputPath), { recursive:true });
    fs.writeFileSync(outputPath, buffer);
    prepared.push({ ...asset, buffer });
    console.log(`MEDINDEX_HORIZONTAL_BRAND ${asset.key} materialized ${buffer.length}B`);
  }

  if (!enabledFlag(process.env.MEDINDEX_BLOB_MIRROR_ENABLED)) {
    console.log('MEDINDEX_HORIZONTAL_BRAND Blob mirror disabled; local /brand assets are authoritative.');
    return;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log('MEDINDEX_HORIZONTAL_BRAND Blob mirror requested but BLOB_READ_WRITE_TOKEN is unavailable.');
    return;
  }

  const { put } = require('@vercel/blob');

  // The pages serve the files materialized above, straight from /brand/. The
  // Blob copy is a mirror, so the store being unreachable — suspended, out of
  // quota, or simply down — must not take the whole deployment with it. A bad
  // source still fails, above, before anything is uploaded.
  const failures = [];
  for (const asset of prepared) {
    try {
      const blob = await put(asset.pathname, asset.buffer, {
        access:'private',
        contentType:'image/webp',
        addRandomSuffix:false,
        allowOverwrite:true,
        cacheControlMaxAge:31536000,
      });
      console.log(`MEDINDEX_HORIZONTAL_BRAND ${asset.key} uploaded ${blob.pathname}`);
    } catch (error) {
      failures.push(`${asset.key}: ${error?.message || error}`);
    }
  }

  if (failures.length) {
    console.warn('MEDINDEX_HORIZONTAL_BRAND Blob mirror unavailable; pages ship the materialized files instead.');
    failures.forEach(line => console.warn(`  - ${line}`));
  }
}

main().catch(error => {
  console.error('Horizontal MedIndex brand upload failed:', error?.stack || error);
  process.exitCode = 1;
});
