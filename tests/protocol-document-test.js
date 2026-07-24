const assert = require('node:assert/strict');
const { ReadableStream } = require('node:stream/web');
const route = require('../api/protocol-document.js');

function response() {
  const headers = new Map();
  return {
    statusCode:200,
    body:null,
    setHeader(name, value) { headers.set(name.toLowerCase(), String(value)); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value ?? this.body; return this; },
    on() {},
    once() {},
    emit() {},
    write() { return true; },
  };
}

(async () => {
  let res = response();
  await route.handle({ method:'POST', headers:{}, query:{} }, res, { authorized:async () => true });
  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader('allow'), 'GET, HEAD');

  res = response();
  await route.handle({ method:'GET', headers:{}, query:{ id:'upk-01' } }, res, { authorized:async () => false });
  assert.equal(res.statusCode, 401);

  res = response();
  await route.handle({ method:'GET', headers:{}, query:{ id:'outside' } }, res, { authorized:async () => true });
  assert.equal(res.statusCode, 404);

  res = response();
  await route.handle(
    { method:'GET', headers:{}, query:{ id:'upk-unsynced' } },
    res,
    {
      authorized:async () => true,
      safeDocument:() => ({
        id:'upk-unsynced',
        type:'pdf',
        officialUrl:'https://msh.rks-gov.net/Documents/DownloadDocument?fileName=unsynced.pdf',
        blobUrl:null,
        contentSha256:null,
      }),
    },
  );
  assert.equal(res.statusCode, 503, 'unsynchronized manifest entries must not bypass private storage');

  const document = {
    id:'upk-test', type:'pdf', blobUrl:'https://store.private.blob.vercel-storage.com/test.pdf',
    contentSha256:'a'.repeat(64), bytes:4,
  };
  res = response();
  await route.handle(
    { method:'GET', headers:{ 'if-none-match':`"${'a'.repeat(64)}"` }, query:{ id:'upk-test' } },
    res,
    { authorized:async () => true, safeDocument:() => document },
  );
  assert.equal(res.statusCode, 304);
  assert.equal(res.getHeader('etag'), `"${'a'.repeat(64)}"`);

  const seen = {};
  res = response();
  await route.handle(
    { method:'HEAD', headers:{ range:'bytes=0-3' }, query:{ id:'upk-test' } },
    res,
    {
      authorized:async () => true,
      safeDocument:() => document,
      getBlob:async (url, options) => {
        seen.url = url;
        seen.options = options;
        return {
          statusCode:200,
          stream:new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([37, 80, 68, 70])); controller.close(); } }),
          headers:new Headers({ 'content-range':'bytes 0-3/10', 'content-length':'4' }),
        };
      },
    },
  );
  assert.equal(res.statusCode, 206);
  assert.equal(seen.options.headers.Range, 'bytes=0-3');
  assert.equal(seen.options.access, 'private');
  assert.equal(res.getHeader('content-range'), 'bytes 0-3/10');
  assert.equal(res.getHeader('cache-control'), 'private, no-cache, max-age=0');
  console.log('Protocol document route tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
