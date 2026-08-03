const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const manifest = require('../data/protocols.json');
const elaborationManifest = require('../data/protocol-elaborations.json');
const reader = require('../protokollet.js');
const {
  parseRegistryEntries,
  officialUrlKey,
  validateRegistryUrl,
  verifyRegistryDocument,
} = require('../scripts/sync-protocols.js');

assert.equal(manifest.documents.length, 55, 'manifest must contain exactly 55 documents');
assert.equal(manifest.categories.length, 12, 'manifest must contain exactly 12 categories');
assert.equal(manifest.documents.filter(document => document.archived).length, 3, 'exactly three COVID-19 documents must be archival');

for (const field of ['id', 'officialUrl', 'blobPath']) {
  const values = manifest.documents.map(document => document[field]);
  assert.equal(new Set(values).size, 55, `${field} values must be unique`);
}

const sourceFingerprints = manifest.documents.map(document => crypto.createHash('sha256').update(document.officialUrl).digest('hex'));
assert.equal(new Set(sourceFingerprints).size, 55, 'official source fingerprints must be unique');

manifest.documents.forEach((document, index) => {
  assert.equal(document.order, index + 1);
  const url = new URL(document.officialUrl);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'msh.rks-gov.net');
  assert.ok(['pdf', 'docx'].includes(document.type));
  assert.ok(document.blobPath.endsWith(`.${document.type}`));
  if (document.blobUrl) {
    assert.match(document.contentSha256, /^[a-f0-9]{64}$/);
    assert.ok(document.bytes > 0);
  } else {
    assert.equal(document.contentSha256, null);
  }
});

assert.deepEqual(manifest.documents.filter(document => document.archived).map(document => document.id), ['upk-53', 'upk-54', 'upk-55']);
assert.deepEqual(
  manifest.documents.filter(document => document.registryException).map(document => document.id),
  ['upk-29'],
  'only the official direct Demenca PDF may use the documented registry exception',
);
assert.equal(manifest.documents[28].registryException.kind, 'official-direct-unlisted');
assert.equal(manifest.documents[28].registryException.documentMetadataDate, '2025-02-18');

const registryFixture = `
  <h2>Protokolli Klinik - Menaxhimi i Osteoporoz&#xEB;s</h2>
  <a href="/Documents/DownloadDocument?fileName=Proto35871754.9615.pdf">Shkarko</a>
  <li><i class="fa fa-calendar"></i> 21.07.2026</li>
  <h2>Udh&#xEB;rr&#xEB;fyesi Klinik &#x2013; Test</h2>
  <a href="/Documents/DownloadDocument?fileName=test.docx">Shkarko</a>
  <li><i class="fa fa-calendar"></i> 04.11.2022</li>`;
const registryEntries = parseRegistryEntries(registryFixture, manifest.sourceRegistry);
assert.deepEqual(
  registryEntries.get(officialUrlKey(manifest.documents[0].officialUrl)),
  {
    registryTitle:'Protokolli Klinik - Menaxhimi i Osteoporozës',
    publishedAt:'2026-07-21',
    officialUrl:manifest.documents[0].officialUrl,
  },
);
const registryVerified = verifyRegistryDocument(manifest.documents[0], registryEntries);
assert.equal(registryVerified.registryTitle, 'Protokolli Klinik - Menaxhimi i Osteoporozës');
assert.equal(registryVerified.publishedAt, '2026-07-21');
assert.match(registryVerified.registryVerifiedAt, /^\d{4}-\d{2}-\d{2}T/);
const unlistedVerified = verifyRegistryDocument(manifest.documents[28], registryEntries);
assert.equal(unlistedVerified.registryStatus, 'official-direct-unlisted');
assert.equal(unlistedVerified.registryVerifiedAt, null);
assert.equal(unlistedVerified.publishedAt, null);
assert.throws(() => validateRegistryUrl('https://example.com/Documents/Index/273'), /Regjistër jozyrtar/);
assert.throws(() => verifyRegistryDocument(manifest.documents[1], registryEntries), /nuk u gjet/);

assert.equal(elaborationManifest.schemaVersion, 1);
const publishedElaborations = reader.normalizeElaborations(elaborationManifest);
assert.equal(publishedElaborations.size, elaborationManifest.entries.length, 'every published elaboration must satisfy the reader schema');
for (const elaboration of publishedElaborations.values()) {
  const source = manifest.documents.find(document => document.id === elaboration.protocolId);
  assert.ok(source, `unknown elaboration protocol ${elaboration.protocolId}`);
  assert.equal(elaboration.sourceHash, source.contentSha256, `stale elaboration sourceHash for ${elaboration.protocolId}`);
}

const fixtureHash = 'a'.repeat(64);
const fixtureElaborations = reader.normalizeElaborations({
  schemaVersion:1,
  entries:[{
    protocolId:'upk-test',
    sourceHash:fixtureHash,
    reviewedAt:'2026-08-01',
    summary:'Përmbledhje testuese.',
    sections:[{ id:'section-1', title:'Seksion testues', body:'Tekst testues.', citations:[{ page:2 }] }],
  }],
});
assert.ok(reader.matchingElaboration({ id:'upk-test', contentSha256:fixtureHash }, fixtureElaborations));
assert.equal(reader.matchingElaboration({ id:'upk-test', contentSha256:'b'.repeat(64) }, fixtureElaborations), null, 'stale source hashes must hide elaborations');
assert.equal(reader.safeHttpsUrl(manifest.documents[0].officialUrl), manifest.documents[0].officialUrl);
assert.equal(reader.safeHttpsUrl('https://example.com/Documents/DownloadDocument?fileName=test.pdf'), '');
assert.equal(reader.safeHttpsUrl('https://msh.rks-gov.net.evil.example/Documents/DownloadDocument?fileName=test.pdf'), '');
console.log('Protocol manifest tests passed.');
