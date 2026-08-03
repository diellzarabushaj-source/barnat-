'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const Source = require('../lib/icd-public-source.js');
const Sync = require('../scripts/sync-icd-hierarchy-neon.js');

const root = path.resolve(__dirname, '..');
const syncSource = fs.readFileSync(path.join(root, 'scripts/sync-icd-hierarchy-neon.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(Sync.REVISION_TABLE, 'icd_hierarchy_revisions');
assert.equal(Sync.NODE_TABLE, 'icd_hierarchy_nodes');
assert.equal(Sync.ACTIVATE_RPC, 'rpc/activate_icd_hierarchy_revision');
assert.equal(Sync.UPSERT_CHUNK, 100);
assert.equal(Sync.expectedCountsMatch(FullIcd.EXPECTED_COUNTS), true);
assert.equal(Sync.expectedCountsMatch({ ...FullIcd.EXPECTED_COUNTS, total:0 }), false);

const fixture = [
  'Metadata',
  '',
  '',
  '',
  '',
  'Niveli,Kapitulli,Blloku,Kodi ICD-10,Titulli zyrtar — English,Titulli — Shqip,Kodi prind',
  'KAPITULL,I,,I,Chapter I — Infectious diseases,Kapitulli I — Sëmundje infektive,',
  'BLLOK,I,A00-A09,A00-A09,Intestinal infectious diseases,Sëmundje infektive të zorrëve,I',
  'KATEGORI,I,A00-A09,A00,Cholera,Kolera,A00-A09',
  'NËNKATEGORI,I,A00-A09,A00.0,Cholera due to Vibrio cholerae,Kolera nga Vibrio cholerae,A00',
].join('\n');
const dataset = FullIcd.buildDataset(fixture, { strictCounts:false });
const node = dataset.nodes.find(item => item.code === 'A00.0');
const record = Sync.nodeRecord(dataset, node, 'revision-1', 'hash-1');
assert.equal(record.revision, 'revision-1');
assert.equal(record.code, 'A00.0');
assert.equal(record.level_name, 'subcategory');
assert.equal(record.parent_code, 'A00');
assert.equal(record.path_text, 'I > A00-A09 > A00 > A00.0');
assert.equal(record.source_hash, 'hash-1');
assert.equal(record.is_published, true);

const completeSource = {
  sourceRevision:'abcdefghijklmnopqrst',
  sourceHash:'abcdefghijklmnopqrst',
  csvBytes:4106422,
  headerRow:6,
  data:{ counts:{ ...FullIcd.EXPECTED_COUNTS }, nodes:[] },
};
const revision = Sync.revisionRecord(completeSource);
assert.equal(revision.status, 'staging');
assert.equal(revision.spreadsheet_id, Source.SPREADSHEET_ID);
assert.equal(revision.sheet_gid, Source.SHEET_GID);
assert.deepEqual(revision.counts, FullIcd.EXPECTED_COUNTS);
assert.throws(
  () => Sync.revisionRecord({ ...completeSource, data:{ counts:{ ...FullIcd.EXPECTED_COUNTS, total:0 } } }),
  /nuk është i plotë/,
);

const order = [
  'await upsertRevision(record)',
  'await clearStagingNodes(record.revision)',
  'await uploadNodes(source, record)',
  'await databaseCounts(record.revision)',
  'await activateRevision(record.revision)',
  'await verifyActive(record.revision, source)',
].map(marker => syncSource.indexOf(marker));
assert.ok(order.every(index => index >= 0), 'Atomic sync stages are all required.');
assert.deepEqual([...order].sort((a, b) => a - b), order, 'Activation must happen only after upload and count verification.');
assert.match(syncSource, /current\.status !== 'staging'/);
assert.match(syncSource, /nyjet nuk u prekën/);
assert.match(syncSource, /current\.status === 'active'/);
assert.match(syncSource, /expectedCountsMatch\(stagedCounts\)/);
assert.match(syncSource, /source_hash/);
assert.match(syncSource, /markFailed/);
assert.doesNotMatch(syncSource, /localStorage|sessionStorage|eval\(|new Function/);

assert.equal(packageJson.scripts['sync:icd-hierarchy'], 'node scripts/sync-icd-hierarchy-neon.js');
assert.match(packageJson.scripts.build, /pnpm test/);
assert.match(packageJson.scripts.build, /sync:icd-hierarchy/);
assert.match(packageJson.scripts.test, /icd-source-rebuild-test\.js/);

(async () => {
  const validated = await Sync.sync({ environment:'preview', source:completeSource });
  assert.equal(validated.mode, 'validate-only');
  assert.equal(validated.revision, completeSource.sourceRevision);
  assert.deepEqual(validated.counts, FullIcd.EXPECTED_COUNTS);
  console.log('ICD public-source rebuild, atomic Neon staging and source-parity contract passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
