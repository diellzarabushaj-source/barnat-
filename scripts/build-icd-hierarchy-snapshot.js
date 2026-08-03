'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const Source = require('../lib/icd-public-source.js');

const OUTPUT = path.resolve(__dirname, '../data/icd-hierarchy-snapshot.json.gz');

async function main() {
  const loaded = await Source._test.buildSheet();
  const snapshot = {
    formatVersion:1,
    generatedAt:new Date(loaded.loadedAt).toISOString(),
    source:{
      spreadsheetId:Source.SPREADSHEET_ID,
      sheetName:Source.SHEET_NAME,
      sheetGid:Source.SHEET_GID,
      headerRow:loaded.headerRow,
      csvBytes:loaded.csvBytes,
      revision:loaded.sourceRevision,
    },
    data:{
      version:loaded.data.version,
      sourceSpreadsheetId:loaded.data.sourceSpreadsheetId,
      sheetName:loaded.data.sheetName,
      counts:loaded.data.counts,
      terminology:loaded.data.terminology,
      quality:loaded.data.quality,
      nodes:loaded.data.nodes,
    },
  };
  const json = Buffer.from(JSON.stringify(snapshot));
  const compressed = zlib.gzipSync(json, { level:9 });
  fs.writeFileSync(OUTPUT, compressed);
  const counts = snapshot.data.nodes.reduce((result, node) => {
    result[node.urgencyLevel] = (result[node.urgencyLevel] || 0) + 1;
    return result;
  }, {});
  process.stdout.write(`${JSON.stringify({
    ok:true,
    output:OUTPUT,
    jsonBytes:json.length,
    gzipBytes:compressed.length,
    revision:snapshot.source.revision,
    nodes:snapshot.data.nodes.length,
    urgency:counts,
  }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
