'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Sync = require('../scripts/sync-icd-hierarchy-to-neon.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');

assert.equal(Sync.REVISION_TABLE, 'icd_hierarchy_revisions');
assert.equal(Sync.NODES_TABLE, 'icd_hierarchy_nodes');
assert.equal(Sync.BATCH_SIZE, 500);
assert.deepEqual(Sync.batch([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(Sync.batch([], 500), []);

const category = {
  code:'A00',
  level:'category',
  chapter:'I',
  block:'A00-A09',
  parentCode:'A00-A09',
  englishTitle:'Cholera',
  albanianDraft:'Kolera',
  displayTitle:'Kolera',
  translationStatus:'draft',
  sourceUrl:'https://icd.who.int/browse10/2019/en#/A00',
  sourceRow:297,
  searchText:'a00 cholera kolera',
};
const dataset = {
  breadcrumbFor:() => [
    { code:'I', title:'Kapitulli I' },
    { code:'A00-A09', title:'Sëmundjet infektive intestinale' },
    { code:'A00', title:'Kolera' },
  ],
};
const record = Sync.nodeRecord(category, dataset, 'revision-1');
assert.equal(record.revision, 'revision-1');
assert.equal(record.code, 'A00');
assert.equal(record.level_name, 'category');
assert.equal(record.chapter_code, 'I');
assert.equal(record.block_code, 'A00-A09');
assert.equal(record.parent_code, 'A00-A09');
assert.equal(record.title_en, 'Cholera');
assert.equal(record.title_sq, 'Kolera');
assert.equal(record.display_title, 'Kolera');
assert.equal(record.translation_status, 'draft');
assert.match(record.path_text, /I Kapitulli I › A00-A09/);
assert.match(record.source_hash, /^[A-Za-z0-9_-]{43}$/);
assert.equal(record.is_published, true);

const revision = Sync.revisionRecord({
  sourceRevision:'abcdefghijklmnopqrst',
  csvBytes:4106422,
  headerRow:6,
  data:{ counts:FullIcd.EXPECTED_COUNTS },
});
assert.equal(revision.revision, 'abcdefghijklmnopqrst');
assert.equal(revision.status, 'staging');
assert.equal(revision.spreadsheet_id, '1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0');
assert.equal(revision.sheet_gid, 329283560);
assert.deepEqual(revision.counts, FullIcd.EXPECTED_COUNTS);

assert.throws(
  () => Sync.validateLoaded({
    sourceType:'neon',
    sourceRevision:'revision-1',
    data:{ nodes:[] },
  }),
  /numri i nyjeve|Importi duhet/,
);

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts/sync-icd-hierarchy-to-neon.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'sql/icd-hierarchy-neon.sql'), 'utf8');
const reader = fs.readFileSync(path.join(root, 'lib/icd-hierarchy-neon-reader.js'), 'utf8');
const publicSource = fs.readFileSync(path.join(root, 'lib/icd-public-source.js'), 'utf8');

assert.match(script, /sheetOnly:true/);
assert.match(script, /BATCH_SIZE = 500/);
assert.match(script, /activate_icd_hierarchy_revision/);
assert.match(script, /status:'failed'/);
assert.match(script, /strictCounts:true/);
assert.match(schema, /icd_hierarchy_one_active_revision/);
assert.match(schema, /v_total <> 12542/);
assert.match(schema, /v_orphans <> 0/);
assert.match(schema, /SET status = 'superseded'/);
assert.match(reader, /status=eq\.active/);
assert.match(reader, /strictCounts:true/);
assert.match(publicSource, /NeonHierarchy\.load/);
assert.doesNotMatch(script, /icd_codes\?/);
assert.doesNotMatch(script, /drugs\?|lab_tests\?|dosage_regimens\?/);
new Function(script);
new Function(reader);

console.log('Atomic Google Sheet to Neon ICD hierarchy sync contract passed.');
