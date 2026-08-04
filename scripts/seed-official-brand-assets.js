'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { put, list } = require('@vercel/blob');

const ROOT = path.resolve(__dirname, '..');
const PREFIX = 'medindex/brand/v1/';
const ASSETS = [
  {
    key:'markOnLight',
    pathname:`${PREFIX}medindex-mark-on-light.webp`,
    base64File:'brand/source-v2/medindex-mark-on-light-transparent.webp.b64',
    contentType:'image/webp',
  },
  {
    key:'fullOnDark',
    pathname:`${PREFIX}medindex-full-on-dark.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F7cd23b91-bae0-4697-a818-825d21765acf/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAMuogy4w82OSH4epsIDPYqN_NgxiCey_jJdNiDL1Cms2&exp=1785882631&osig=AAAAAAAAAAAAAAAAAAAAADIWMadNpGGwlQ2VQcYWtHvLf_pyHDhxIpTAy8W9frez&signer=media-rpc&x-canva-quality=thumbnail',
    contentType:'image/png',
  },
  {
    key:'markOnDark',
    pathname:`${PREFIX}medindex-mark-on-dark.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2Fa2c01489-a58e-407c-a6af-00afbc66f736/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAJY5dXGeoYSixBf2PPe7t3qH8gDeRyd61_1mMmXIc1Xr&exp=1785881270&osig=AAAAAAAAAAAAAAAAAAAAAOuBjRBc78sU5I9A6H6WYIDSrp7b6IwUlIGJVG2f8sOQ&signer=media-rpc&x-canva-quality=thumbnail',
    contentType:'image/png',
  },
  {
    key:'fullOnLight',
    pathname:`${PREFIX}medindex-full-on-light.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F95badee1-cbbb-48de-88a7-ddd86560234c/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAMdmOHbEqgbb0Lr8lNIi7hY37VYaCgiRWaMYqvMv4C3X&exp=1785881075&osig=AAAAAAAAAAAAAAAAAAAAAMmZmvF7E5ZLqhS9gh2O0ryVBIbvCjAhLrh0_I1yTlH3&signer=media-rpc&x-canva-quality=thumbnail',
    contentType:'image/png',
  },
];

function dimensions(buffer, contentType) {
  if (contentType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width:buffer.readUInt32BE(16), height:buffer.readUInt32BE(20) };
  }
  if (contentType === 'image/webp' && buffer.length >= 30) {
    try {
      const chunk = buffer.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { width:1 + buffer.readUIntLE(24, 3), height:1 + buffer.readUIntLE(27, 3) };
    } catch {}
  }
  return { width:0, height:0 };
}

async function sourceFor(asset) {
  if (asset.base64File) {
    const encoded = fs.readFileSync(path.join(ROOT, asset.base64File), 'utf8').trim();
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length < 1000) throw new Error(`Local source too small for ${asset.key}`);
    return { buffer, contentType:asset.contentType, dimensions:dimensions(buffer, asset.contentType) };
  }
  const response = await fetch(asset.source, {
    headers:{ Accept:'image/png,image/*;q=0.9,*/*;q=0.8', 'User-Agent':'MedIndex-User-Approved-Brand/3.0' },
  });
  if (!response.ok) throw new Error(`Source HTTP ${response.status} for ${asset.key}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000) throw new Error(`Remote source too small for ${asset.key}`);
  return { buffer, contentType:asset.contentType, dimensions:dimensions(buffer, asset.contentType) };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log('User-approved MedIndex brand seed skipped: BLOB_READ_WRITE_TOKEN is unavailable.');
    return;
  }
  const existing = await list({ prefix:PREFIX, limit:100 });
  const byPath = new Map((existing.blobs || []).map(blob => [blob.pathname, blob]));
  for (const asset of ASSETS) {
    const source = await sourceFor(asset);
    const blob = await put(asset.pathname, source.buffer, {
      access:'private',
      contentType:source.contentType,
      addRandomSuffix:false,
      allowOverwrite:true,
      cacheControlMaxAge:31536000,
    });
    const previous = byPath.get(asset.pathname);
    console.log(`MEDINDEX_USER_APPROVED_BRAND ${asset.key} ${blob.pathname} ${source.dimensions.width}x${source.dimensions.height} ${source.buffer.length}B${previous ? ' replaced' : ' created'}`);
  }
}

main().catch(error => {
  console.error('User-approved MedIndex brand seed failed:', error?.stack || error);
  process.exitCode = 1;
});
