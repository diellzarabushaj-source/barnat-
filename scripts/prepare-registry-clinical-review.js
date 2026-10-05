'use strict';
const fs = require('node:fs');
const { neonRequest } = require('../lib/medindex-data-api');
const { buildClinicalReviewQueue } = require('../lib/registry-clinical-review');
async function main() {
  const args = process.argv.slice(2);
  const option = key => { const index = args.indexOf(key); if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Missing ' + key); return args[index + 1]; };
  const input = JSON.parse(fs.readFileSync(option('--candidates'), 'utf8'));
  const archives = JSON.parse(fs.readFileSync(option('--archives'), 'utf8'));
  const discoveredSources = args.includes('--discovered-sources') ? JSON.parse(fs.readFileSync(option('--discovered-sources'), 'utf8')) : {};
  const queue = buildClinicalReviewQueue(input, archives, { sourceSha256: option('--source-sha256'), discoveredSources });
  fs.writeFileSync(option('--output'), JSON.stringify(queue, null, 2));
  console.log(JSON.stringify(queue.summary));
  if (args.includes('--apply')) {
    const { data } = await neonRequest('rpc/stage_registry_clinical_review_v1', { method: 'POST', body: { p_queue: queue } });
    console.log(JSON.stringify(data));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
