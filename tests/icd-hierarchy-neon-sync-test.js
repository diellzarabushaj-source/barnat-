'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Sync = require('../scripts/sync-icd-hierarchy-to-neon.js');
const Reader = require('../lib/icd-hierarchy-neon-reader.js');
const DataApi = require('../lib/neon-data-api.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');

// Legacy filenames remain compatibility adapters, but Phase 3 disconnected
// Neon from runtime. This test now protects the Supabase-only contract.
assert.equal(Sync.REVISION_TABLE, 'icd_hierarchy_revisions');
assert.equal(Sync.NODES_TABLE, 'icd_hierarchy_nodes');
assert.equal(Sync.BATCH_SIZE, 100);
assert.equal(Sync.BATCH_TIMEOUT_MS, 60000);
assert.deepEqual(Sync.batch([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(Sync.batch([], 100), []);
assert.equal(Sync.batch(Array.from({ length:12542 }), Sync.BATCH_SIZE).length, 126);

assert.equal(DataApi.hasNeonConfig(), true, 'compatibility helper should report the configured Supabase data path');
assert.equal(DataApi.readProvider(), 'supabase');
assert.equal(DataApi.writeProvider(), 'supabase');
assert.equal(DataApi.configuredToken(), '', 'legacy Neon/OIDC tokens must not be used by runtime');
assert.match(DataApi.DATA_API_BASE, /\.supabase\.co\/rest\/v1$/);
assert.deepEqual(DataApi.dataOf({ data:[{ id:1 }] }), [{ id:1 }]);
assert.deepEqual(DataApi.dataOf([{ id:2 }]), [{ id:2 }]);
assert.equal(DataApi.isRelationMissing({ status:404, message:'not found' }), true);
assert.equal(DataApi.isRelationMissing({ status:400, payload:{ code:'42P01' } }), true);
assert.equal(DataApi.isRelationMissing({ status:500, message:'timeout' }), false);

const sampleNodes = [
  {
    code:'I', level:'chapter', chapter:'I', block:'', parentCode:'',
    englishTitle:'Certain infectious and parasitic diseases', albanianDraft:'Sëmundje infektive dhe parazitare',
    displayTitle:'Sëmundje infektive dhe parazitare', translationStatus:'machine-draft',
    sourceUrl:'https://icd.who.int/browse10/2019/en#/I', sourceRow:7,
    searchText:'i semundje infektive dhe parazitare',
  },
  {
    code:'A00-A09', level:'block', chapter:'I', block:'A00-A09', parentCode:'I',
    englishTitle:'Intestinal infectious diseases', albanianDraft:'Sëmundje infektive të zorrëve',
    displayTitle:'Sëmundje infektive të zorrëve', translationStatus:'machine-draft',
    sourceUrl:'https://icd.who.int/browse10/2019/en#/A00-A09', sourceRow:8,
    searchText:'a00 a09 semundje infektive te zorreve',
  },
  {
    code:'A00', level:'category', chapter:'I', block:'A00-A09', parentCode:'A00-A09',
    englishTitle:'Cholera', albanianDraft:'Kolera', displayTitle:'Kolera', translationStatus:'machine-draft',
    sourceUrl:'https://icd.who.int/browse10/2019/en#/A00', sourceRow:9,
    searchText:'a00 cholera kolera',
  },
  {
    code:'A00.0', level:'subcategory', chapter:'I', block:'A00-A09', parentCode:'A00',
    englishTitle:'Cholera due to Vibrio cholerae 01, biovar cholerae',
    albanianDraft:'Kolera nga Vibrio cholerae 01, biovar cholerae',
    displayTitle:'Kolera nga Vibrio cholerae 01, biovar cholerae', translationStatus:'machine-draft',
    sourceUrl:'https://icd.who.int/browse10/2019/en#/A00.0', sourceRow:10,
    searchText:'a00 0 cholera vibrio kolera',
  },
];

const sampleDataset = { nodes:sampleNodes };
FullIcd.attachIndexes(sampleDataset);
const record = Sync.nodeRecord(sampleNodes[2], sampleDataset, 'revision-1');
assert.equal(record.revision, 'revision-1');
assert.equal(record.code, 'A00');
assert.equal(record.level_name, 'category');
assert.equal(record.chapter_code, 'I');
assert.equal(record.block_code, 'A00-A09');
assert.equal(record.parent_code, 'A00-A09');
assert.equal(record.title_en, 'Cholera');
assert.equal(record.title_sq, 'Kolera');
assert.equal(record.display_title, 'Kolera');
assert.equal(record.translation_status, 'machine-draft');
assert.match(record.path_text, /I Sëmundje infektive dhe parazitare/);
assert.match(record.source_hash, /^[A-Za-z0-9_-]{43}$/);
assert.equal(record.is_published, true);

const revisionMeta = {
  revision:'revision-1',
  spreadsheet_id:'1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0',
  sheet_name:'ICD-10 EN-SQ',
  sheet_gid:329283560,
};
const mirrored = Reader.datasetFromRows(sampleNodes, revisionMeta, { strictCounts:false });
assert.equal(mirrored.nodes.length, 4);
assert.deepEqual(mirrored.counts, { chapter:1, block:1, category:1, subcategory:1, total:4 });
assert.equal(FullIcd.nodeMap(mirrored).get('A00.0').parentCode, 'A00');
assert.deepEqual(FullIcd.childrenOf(mirrored, 'A00').map(node => node.code), ['A00.0']);
assert.equal(mirrored.sourceSpreadsheetId, revisionMeta.spreadsheet_id);
assert.equal(mirrored.sheetName, revisionMeta.sheet_name);
assert.ok(mirrored.nodes.every(node => typeof node.searchText === 'string' && node.searchText.length > 0));

const revision = Sync.revisionRecord({
  sourceRevision:'abcdefghijklmnopqrst',
  csvBytes:4106422,
  headerRow:6,
  data:{ counts:FullIcd.EXPECTED_COUNTS },
});
assert.equal(revision.status, 'staging');
assert.equal(revision.sheet_gid, 329283560);
assert.deepEqual(revision.counts, FullIcd.EXPECTED_COUNTS);

assert.throws(
  () => Sync.validateLoaded({ sourceType:'neon', sourceRevision:'revision-1', data:{ nodes:sampleNodes } }),
  /full hierarchy validation failed|Importi duhet/,
);

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts/sync-icd-hierarchy-to-neon.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'sql/icd-hierarchy-neon.sql'), 'utf8');
const reader = fs.readFileSync(path.join(root, 'lib/icd-hierarchy-neon-reader.js'), 'utf8');
const dataApi = fs.readFileSync(path.join(root, 'lib/neon-data-api.js'), 'utf8');
const publicSource = fs.readFileSync(path.join(root, 'lib/icd-public-source.js'), 'utf8');

assert.match(script, /sheetOnly:true/);
assert.match(script, /BATCH_SIZE = 100/);
assert.match(script, /BATCH_TIMEOUT_MS = 60000/);
assert.match(script, /prefer:'resolution=merge-duplicates,return=minimal'/);
assert.match(schema, /icd_hierarchy_one_active_revision/);
assert.match(reader, /status=eq\.active/);
assert.match(reader, /FullIcd\.attachIndexes\(data\)/);
assert.match(dataApi, /Runtime database traffic is Supabase-only/);
assert.match(dataApi, /function readProvider\(\) \{ return 'supabase'; \}/);
assert.match(dataApi, /function writeProvider\(\) \{ return 'supabase'; \}/);
assert.doesNotMatch(dataApi, /process\.env\.MEDINDEX_NEON_DATA_API_TOKEN/);
assert.match(publicSource, /NeonHierarchy\.load/); // legacy module name only
assert.match(publicSource, /sheetOnly/);
new Function(script);
new Function(reader);
new Function(dataApi);
new Function(publicSource);

console.log('Bounded ICD hierarchy compatibility and Supabase-only runtime contract passed.');
