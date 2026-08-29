'use strict';

const fs = require('node:fs');
const path = require('node:path');
const SourceMap = require('../lib/dose-source-map.js');

const outputArg = process.argv.find(arg => arg.startsWith('--output='));
const outputPath = outputArg
  ? path.resolve(outputArg.slice('--output='.length))
  : path.resolve(process.cwd(), 'artifacts', 'drx-dose-source-archive-queue.json');

const map = SourceMap.loadSourceMap();
const validation = SourceMap.validateSourceMap(map);
if (!validation.valid) {
  console.error(JSON.stringify({ ok:false, errors:validation.errors }, null, 2));
  process.exitCode = 1;
  return;
}

const queue = SourceMap.archiveQueue(map);
fs.mkdirSync(path.dirname(outputPath), { recursive:true });
fs.writeFileSync(outputPath, JSON.stringify({
  schemaVersion:'drx-dose-source-archive-queue-v1',
  generatedAt:new Date().toISOString(),
  count:queue.length,
  queue,
}, null, 2) + '\n');

console.log(JSON.stringify({
  ok:true,
  output:outputPath,
  count:queue.length,
  publicationReady:validation.summary.publicationReady,
}, null, 2));
