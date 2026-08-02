'use strict';

const fs = require('node:fs');
const path = require('node:path');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const Source = require('../lib/icd-public-source.js');

async function fromFile(filePath) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const source = Source.validateCsv(raw, { contentType:'text/csv' });
  const startedAt = Date.now();
  const data = FullIcd.buildDataset(source.text, { strictCounts:true });
  return {
    loadedAt:Date.now(),
    fetchMs:0,
    buildMs:Date.now() - startedAt,
    csvBytes:source.bytes,
    sourceRevision:source.revision,
    sourceUrl:`file://${resolved}`,
    data,
    stale:false,
  };
}

async function main() {
  const loaded = process.env.ICD_CSV_FILE
    ? await fromFile(process.env.ICD_CSV_FILE)
    : await Source.load({ force:true });
  const data = loaded.data;
  const index = FullIcd.attachIndexes(data);
  const report = {
    ok:true,
    version:data.version,
    source:Source.sourceMeta(loaded),
    counts:data.counts,
    quality:data.quality,
    indexes:{
      codes:index.byCode.size,
      parentBuckets:index.childrenByParent.size,
      chapters:index.chapters.length,
      blocks:index.blocks.length,
      chapterBuckets:index.byChapter.size,
      levelBuckets:index.byLevel.size,
    },
    smoke:{
      firstChapter:index.chapters[0]?.code || null,
      firstBlock:index.blocks[0]?.code || null,
      a00Children:FullIcd.childrenOf(data, 'A00').map(node => node.code),
      i10Ancestors:FullIcd.ancestorsOf(data, 'I10').map(node => node.code),
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
