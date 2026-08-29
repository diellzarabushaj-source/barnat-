'use strict';

const assert = require('node:assert/strict');
const Archive = require('../lib/dose-source-archive.js');

function response(body, options = {}) {
  const headers = new Map(Object.entries({
    'content-type':'text/html; charset=utf-8',
    etag:'"abc"',
    'last-modified':'Fri, 28 Aug 2026 12:00:00 GMT',
    ...(options.headers || {}),
  }));
  return {
    ok:options.ok !== false,
    status:options.status || 200,
    url:options.url || 'https://www.medicines.org.uk/emc/product/7020/smpc',
    headers:{ get:key => headers.get(String(key).toLowerCase()) || headers.get(String(key)) || '' },
    arrayBuffer:async () => Buffer.from(body, 'utf8'),
  };
}

(async () => {
  const snapshot = await Archive.fetchSourceSnapshot(
    'https://www.medicines.org.uk/emc/product/7020/smpc',
    {
      fetchImpl:async () => response(
        '<h1>Amlodipine 5mg tablets</h1><p>Last updated on emc: 20 Apr 2026</p>'
        + '<h2>4.1 Therapeutic indications</h2><p>Pain.</p>'
        + '<h2>4.2 Posology and method of administration</h2><p>Dose text.</p>'
        + '<h2>5. Pharmacological properties</h2>'
      ),
    }
  );

  assert.equal(snapshot.sourceTier, 'EMC');
  assert.equal(snapshot.parser.doseSectionPresent, true);
  assert.equal(snapshot.parser.indicationsSectionPresent, true);
  assert.match(snapshot.rawSha256, /^[0-9a-f]{64}$/);
  assert.equal(snapshot.contentType, 'text/html');
  assert.equal(snapshot.sourceDocument.productName, 'Amlodipine 5mg tablets');
  assert.equal(snapshot.sourceDocument.documentDate, '2026-04-20');

  await assert.rejects(
    () => Archive.fetchSourceSnapshot('https://mediately.co/drugs/example', {
      fetchImpl:async () => response('x', { url:'https://mediately.co/drugs/example' }),
    }),
    /not authoritative enough/
  );

  await assert.rejects(
    () => Archive.fetchSourceSnapshot('http://www.medicines.org.uk/emc/product/7020/smpc', {
      fetchImpl:async () => response('x'),
    }),
    /invalid or not HTTPS/
  );

  console.log('DRx raw source archive contract passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
