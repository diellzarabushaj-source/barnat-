const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const gateway = require('../api/gemini-prescription-secure.js');
assert.equal(gateway._test.MAX_REQUESTS, 8);
assert.equal(gateway._test.MAX_BODY_BYTES, 48 * 1024);
assert.ok(gateway._test.bodySize({ headers:{ 'content-length':'123' }, body:{} }) === 123);
assert.ok(gateway._test.bodySize({ headers:{}, body:{ input:'x' } }) > 0);

const gatewaySource = read('api/gemini-prescription-secure.js');
assert.match(gatewaySource, /application\/json/);
assert.match(gatewaySource, /status\(413\)/);
assert.match(gatewaySource, /status\(415\)/);
assert.match(gatewaySource, /status\(429\)/);
assert.match(gatewaySource, /Retry-After/);
assert.match(gatewaySource, /RateLimit-Limit/);
assert.match(gatewaySource, /require\('\.\.\/lib\/gemini-prescription\.js'\)/);
assert.ok(!fs.existsSync(path.join(ROOT, 'api/gemini-prescription.js')), 'Gemini core must not consume a separate Serverless Function');
assert.ok(fs.existsSync(path.join(ROOT, 'lib/gemini-prescription.js')), 'Gemini core library is missing');

const vercel = JSON.parse(read('vercel.json'));
assert.ok(vercel.rewrites.some(item => item.source === '/api/gemini-prescription' && item.destination === '/api/gemini-prescription-secure'), 'Gemini route must pass through the secure gateway');
const protocolManifestIndex = vercel.headers.findIndex(item => item.source === '/data/protocols.json');
const genericJsonIndex = vercel.headers.findIndex(item => item.source === '/(.*)\\.(json|txt)');
assert.ok(protocolManifestIndex >= 0 && protocolManifestIndex < genericJsonIndex, 'Private protocol manifest headers must precede the generic JSON cache rule');
const protocolManifestHeaders = Object.fromEntries(vercel.headers[protocolManifestIndex].headers.map(item => [item.key.toLowerCase(), item.value]));
assert.match(protocolManifestHeaders['cache-control'], /\bprivate\b/);
assert.match(protocolManifestHeaders['cache-control'], /\bno-cache\b/);
assert.equal(protocolManifestHeaders.vary, 'Cookie');

const protocol = require('../api/protocol-document.js');
assert.equal(protocol.safeRange('bytes=0-100'), 'bytes=0-100');
assert.equal(protocol.safeRange('bytes=100-'), 'bytes=100-');
assert.equal(protocol.safeRange('bytes=-100'), 'bytes=-100');
assert.equal(protocol.safeRange('bytes=0-1,4-5'), null);
assert.equal(protocol.safeRange('items=0-1'), null);
assert.equal(protocol.safeRange('x'.repeat(120)), null);

const protocolSource = read('api/protocol-document.js');
assert.match(protocolSource, /status\(416\)/);
assert.match(protocolSource, /Protocol document upstream error/);
assert.match(protocolSource, /Protocol document stream error/);
assert.match(protocolSource, /BLOB_READ_WRITE_TOKEN/);
assert.match(protocolSource, /access:'private'/);

console.log('API security deep audit passed.');
