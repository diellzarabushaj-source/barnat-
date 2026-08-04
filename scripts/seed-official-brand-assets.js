'use strict';

const { put, list } = require('@vercel/blob');

const PREFIX = 'medindex/brand/v1/';
const ASSETS = [
  {
    key:'markOnLight',
    pathname:`${PREFIX}medindex-mark-on-light.webp`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F8a6b18bf-6008-4bdc-9334-0c62f5ffefae/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAABg4CpaK0aUh6LgU-kiHRmhWB99PQXOclv_K8bRudMyx&exp=1785877829&osig=AAAAAAAAAAAAAAAAAAAAABssoIM-4iBumHXz2EfNuKsYwu0LcXt_5xqlMMnI9qza&signer=media-rpc&x-canva-quality=thumbnail',
    contentType:'image/png',
  },
  {
    key:'fullOnDark',
    pathname:`${PREFIX}medindex-full-on-dark.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:158/quality:100/uri:ifs%3A%2F%2FM%2F7c892e82-467a-4ceb-a165-e32f1e6cc242/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAD9eyQY8t-dW7eT3nNNYcqUCAE_C0Ka6UPFOiGQID9I9&exp=1785880428&osig=AAAAAAAAAAAAAAAAAAAAAMDxoBgo2D2QLebc7dV2MoppmV7ov7UhzbhD3ERf9ZTe&signer=media-rpc&x-canva-quality=thumbnail',
    contentType:'image/png',
  },
  {
    key:'markOnDark',
    pathname:`${PREFIX}medindex-mark-on-dark.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:200/quality:100/uri:ifs%3A%2F%2FM%2F5f7d0ae8-f999-4b96-8850-5d91a6ef2166/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAKowqNcKQYtfIJ-7DkzD69XCPuWKYZAifEETWMPNZHtt&exp=1785877621&osig=AAAAAAAAAAAAAAAAAAAAAFFrFdpDQ0FqUa60eD47Avoz64wya1iO7VTfaeuJASyo&signer=media-rpc&x-canva-quality=thumbnail',
    contentType:'image/png',
  },
  {
    key:'fullOnLight',
    pathname:`${PREFIX}medindex-full-on-light.png`,
    source:'https://media.canva.com/v2/image-resize/format:PNG/height:158/quality:100/uri:ifs%3A%2F%2FM%2F89ef0ee6-0f1a-4f94-b596-763edad9ae7b/watermark:F/width:200?csig=AAAAAAAAAAAAAAAAAAAAAPVAtrX-8HsIGYDrTNwji2iz8WBhwiFh5gJvEkM93FDP&exp=1785878577&osig=AAAAAAAAAAAAAAAAAAAAAHfXIjmaMzwkH--6WPYK_aO89IM0JEQ51-EV6bNN-HLO&signer=media-rpc&x-canva-quality=thumbnail',
    contentType:'image/png',
  },
];

function dimensions(buffer, contentType) {
  if (contentType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width:buffer.readUInt32BE(16), height:buffer.readUInt32BE(20) };
  }
  return { width:0, height:0 };
}

async function sourceFor(asset) {
  const response = await fetch(asset.source, {
    headers:{ Accept:'image/png,image/*;q=0.9,*/*;q=0.8', 'User-Agent':'MedIndex-Transparent-Brand/2.0' },
  });
  if (!response.ok) throw new Error(`Source HTTP ${response.status} for ${asset.key}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1000) throw new Error(`Remote source too small for ${asset.key}`);
  return { buffer, contentType:asset.contentType, dimensions:dimensions(buffer, asset.contentType) };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log('Official transparent MedIndex brand seed skipped: BLOB_READ_WRITE_TOKEN is unavailable.');
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
    console.log(`MEDINDEX_TRANSPARENT_BRAND ${asset.key} ${blob.pathname} ${source.dimensions.width}x${source.dimensions.height} ${source.buffer.length}B${previous ? ' replaced' : ' created'}`);
  }
}

main().catch(error => {
  console.error('Official transparent MedIndex brand seed failed:', error?.stack || error);
  process.exitCode = 1;
});
