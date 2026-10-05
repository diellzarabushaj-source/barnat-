'use strict';
const fs = require('node:fs');
const { neonRequest } = require('../lib/medindex-data-api');
const { buildClinicalDraftBatch } = require('../lib/registry-clinical-review');
async function main() {
  const args = process.argv.slice(2);
  const option = key => { const index = args.indexOf(key); if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Missing ' + key); return args[index + 1]; };
  const read = key => JSON.parse(fs.readFileSync(option(key), 'utf8'));
  const batch = buildClinicalDraftBatch(read('--queue'), read('--drafts'), read('--archives'));
  fs.writeFileSync(option('--output'), JSON.stringify(batch, null, 2));
  console.log(JSON.stringify({ drafts: batch.entries.length, published: 0 }));
  if (args.includes('--apply')) {
    const { data } = await neonRequest('rpc/stage_registry_clinical_drafts_v1', { method: 'POST', body: { p_batch: batch } });
    console.log(JSON.stringify(data));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
