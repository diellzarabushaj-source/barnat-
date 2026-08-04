'use strict';

const { put, list } = require('@vercel/blob');

const PREFIX = 'medindex/brand/v1/';
const ASSETS = [
  {
    key:'markOnLight',
    pathname:`${PREFIX}medindex-mark-on-light.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F2d9640b9-e0a4-4969-ad66-33c926872224/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAEaU1adiTqYN77YH83zFLqJ6d0HRwG7I3zx3lxgcOds5&exp=1785856344&osig=AAAAAAAAAAAAAAAAAAAAAHSuUBcn6HIJZ13Mm7Whg2cKr3cO8MCkTjyUTcI2eyMw&signer=media-rpc&x-canva-quality=thumbnail',
  },
  {
    key:'fullOnDark',
    pathname:`${PREFIX}medindex-full-on-dark.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F84a4224c-4d3c-42de-b3db-e8e2de1b88d6/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAALyZhYhGREDmY0MSlixZ-DCaef3Tif-8SJY-cISsw0p&exp=1785856458&osig=AAAAAAAAAAAAAAAAAAAAAEW5MIKMZNgvSrlpkvbXDxHEZTLxMUb_wXC520QGkW3s&signer=media-rpc&x-canva-quality=thumbnail',
  },
  {
    key:'markOnDark',
    pathname:`${PREFIX}medindex-mark-on-dark.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F69d9b85f-8f3e-44f8-a161-3fdb4b61d269/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAMWWDvtH2S5h-rgeb6N_4kp3EzoOb4SwkoASZhlMvtqe&exp=1785854846&osig=AAAAAAAAAAAAAAAAAAAAAEwILUWLmk1zCX1H_ztKoWqxidGN7r8Z9xNVHrprFw5k&signer=media-rpc&x-canva-quality=thumbnail',
  },
  {
    key:'fullOnLight',
    pathname:`${PREFIX}medindex-full-on-light.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F0b229f7f-96fb-4280-8726-d622f496cbff/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAOvN6iDusix0FLml1bqHRWM1qL2gQqEPUOtZ4WS99QAD&exp=1785856093&osig=AAAAAAAAAAAAAAAAAAAAAONMQJ4Vu2QkJFaLpycc1Jw4HDX7QRcWGvFzCv3Vi9tD&signer=media-rpc&x-canva-quality=thumbnail',
  },
];

function highResolutionUrl(source, size) {
  return source
    .replace('/height:200/', `/height:${size}/`)
    .replace('/width:200?', `/width:${size}?`)
    .replace('x-canva-quality=thumbnail', 'x-canva-quality=screen');
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return { width:0, height:0 };
  return { width:buffer.readUInt32BE(16), height:buffer.readUInt32BE(20) };
}

async function fetchCandidate(url) {
  const response = await fetch(url, {
    headers:{ Accept:'image/png,image/*;q=0.9,*/*;q=0.8', 'User-Agent':'MedIndex-Brand-Seed/1.0' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error(`Content-Type ${contentType || 'missing'}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000) throw new Error(`Image too small (${buffer.length} bytes)`);
  return { buffer, dimensions:pngDimensions(buffer), contentType:'image/png' };
}

async function bestSource(asset) {
  const candidates = [highResolutionUrl(asset.source, 1254), highResolutionUrl(asset.source, 800), asset.source];
  const successful = [];
  for (const url of candidates) {
    try {
      const result = await fetchCandidate(url);
      successful.push(result);
    } catch (error) {
      console.warn(`Brand source candidate failed for ${asset.key}: ${error.message}`);
    }
  }
  if (!successful.length) throw new Error(`No valid source image for ${asset.key}`);
  successful.sort((left, right) => {
    const leftArea = left.dimensions.width * left.dimensions.height;
    const rightArea = right.dimensions.width * right.dimensions.height;
    return rightArea - leftArea || right.buffer.length - left.buffer.length;
  });
  return successful[0];
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log('Official MedIndex brand seed skipped: BLOB_READ_WRITE_TOKEN is unavailable.');
    return;
  }

  const existing = await list({ prefix:PREFIX, limit:100 });
  const byPath = new Map((existing.blobs || []).map(blob => [blob.pathname, blob]));

  for (const asset of ASSETS) {
    const source = await bestSource(asset);
    const blob = await put(asset.pathname, source.buffer, {
      access:'public',
      contentType:source.contentType,
      addRandomSuffix:false,
      allowOverwrite:true,
      cacheControlMaxAge:31536000,
    });
    const previous = byPath.get(asset.pathname);
    console.log(
      `MEDINDEX_BRAND_ASSET ${asset.key} ${blob.url} ${source.dimensions.width}x${source.dimensions.height} ${source.buffer.length}B${previous ? ' replaced' : ' created'}`,
    );
  }
}

main().catch(error => {
  console.error('Official MedIndex brand seed failed:', error?.stack || error);
  process.exitCode = 1;
});
