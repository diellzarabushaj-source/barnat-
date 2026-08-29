'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function audit() {
  const batch2 = read('data/drx-dose-batch2-v1.json');
  const map = read('data/drx-dose-source-map-v1.json');
  const issues = [];
  const seen = new Set();

  for (const item of batch2.substances) {
    if (seen.has(item.canonicalKey)) issues.push({key:item.canonicalKey,issue:'duplicate_batch_key'});
    seen.add(item.canonicalKey);

    const mapped = map.substances?.[item.canonicalKey];
    if (!mapped) {
      issues.push({key:item.canonicalKey,issue:'missing_source_map_entry'});
      continue;
    }

    const candidate = mapped.candidates?.find(x => x.sourceKey === item.sourceKey);
    if (!candidate) {
      issues.push({key:item.canonicalKey,issue:'source_key_not_found_in_map'});
      continue;
    }

    if (candidate.url !== item.url) issues.push({key:item.canonicalKey,issue:'url_mismatch'});
    if (candidate.tier !== 'EMC') issues.push({key:item.canonicalKey,issue:'unexpected_source_tier'});
    if (candidate.documentType !== 'SmPC') issues.push({key:item.canonicalKey,issue:'unexpected_document_type'});
    if (candidate.hasDoseSection !== true) issues.push({key:item.canonicalKey,issue:'dose_section_not_expected'});
    if (candidate.productSpecific !== true) issues.push({key:item.canonicalKey,issue:'product_specific_flag_missing'});
    if (candidate.substanceMatch !== true) issues.push({key:item.canonicalKey,issue:'substance_match_missing'});
  }

  if (batch2.substances.length !== 25) issues.push({issue:'batch2_count_not_25'});
  if (seen.size !== 25) issues.push({issue:'batch2_unique_count_not_25'});

  return {
    schemaVersion:'drx-phase16-consistency-audit-v1',
    checkedAt:new Date().toISOString(),
    targetCount:25,
    checkedCount:batch2.substances.length,
    issueCount:issues.length,
    pass:issues.length === 0,
    publicationAllowed:false,
    issues,
  };
}

if (require.main === module) {
  const result = audit();
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

module.exports = { audit };
