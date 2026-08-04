'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { put, list } = require('@vercel/blob');

const PREFIX = 'medindex/brand/v1/';
const ASSETS = [
  {
    key:'markOnLight',
    pathname:`${PREFIX}medindex-mark-on-light.webp`,
    base64File:'brand/source-v1/medindex-mark-on-light.webp.b64',
    contentType:'image/webp',
  },
  {
    key:'fullOnDark',
    pathname:`${PREFIX}medindex-full-on-dark.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F84a4224c-4d3c-42de-b3db-e8e2de1b88d6/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAALyZhYhGREDmY0MSlixZ-DCaef3Tif-8SJY-cISsw0p&exp=1785856458&osig=AAAAAAAAAAAAAAAAAAAAAEW5MIKMZNgvSrlpkvbXDxHEZTLxMUb_wXC520QGkW3s&signer=media-rpc&x-canva-quality=thumbnail',
    contentType:'image/png',
  },
  {
    key:'markOnDark',
    pathname:`${PREFIX}medindex-mark-on-dark.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F69d9b85f-8f3e-44f8-a161-3fdb4b61d269/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAMWWDvtH2S5h-rgeb6N_4kp3EzoOb4SwkoASZhlMvtqe&exp=1785854846&osig=AAAAAAAAAAAAAAAAAAAAAEwILUWLmk1zCX1H_ztKoWqxidGN7r8Z9xNVHrprFw5k&signer=media-rpc&x-canva-quality=thumbnail',
    contentType:'image/png',
  },
  {
    key:'fullOnLight',
    pathname:`${PREFIX}medindex-full-on-light.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F0b229f7f-96fb-4280-8726-d622f496cbff/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAOvN6iDusix0FLml1bqHRWM1qL2gQqEPUOtZ4WS99QAD&exp=1785856093&osig=AAAAAAAAAAAAAAAAAAAAAONMQJ4Vu2QkJFaLpycc1Jw4HDX7QRcWGvFzCv3Vi9tD&signer=media-rpc&x-canva-quality=thumbnail',
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
    const encoded = fs.readFileSync(path.resolve(__dirname, '..', asset.base64File), 'utf8').trim();
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length < 1000) throw new Error(`Local source too small for ${asset.key}`);
    return { buffer, contentType:asset.contentType, dimensions:dimensions(buffer, asset.contentType) };
  }
  const response = await fetch(asset.source, {
    headers:{ Accept:'image/png,image/*;q=0.9,*/*;q=0.8', 'User-Agent':'MedIndex-Brand-Seed/1.0' },
  });
  if (!response.ok) throw new Error(`Source HTTP ${response.status} for ${asset.key}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000) throw new Error(`Remote source too small for ${asset.key}`);
  return { buffer, contentType:asset.contentType, dimensions:dimensions(buffer, asset.contentType) };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log('Official MedIndex brand seed skipped: BLOB_READ_WRITE_TOKEN is unavailable.');
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
    console.log(`MEDINDEX_BRAND_ASSET ${asset.key} ${blob.pathname} ${blob.url} ${source.dimensions.width}x${source.dimensions.height} ${source.buffer.length}B${previous ? ' replaced' : ' created'}`);
  }
}

main().catch(error => {
  console.error('Official MedIndex brand seed failed:', error?.stack || error);
  process.exitCode = 1;
});
