'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const suite = require('../tests/test-suite.json');
if (!Array.isArray(suite) || !suite.length) throw new Error('Empty test suite');
for (const file of suite) {
  if (!/^tests\/[\w-]+\.js$/.test(file)) throw new Error(`Invalid test path: ${file}`);
  const result = spawnSync(process.execPath, [file], {cwd:path.resolve(__dirname,'..'),stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`All ${suite.length} test files passed.`);
