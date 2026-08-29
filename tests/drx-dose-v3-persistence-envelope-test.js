'use strict';

const assert=require('node:assert/strict');
const Gate=require('../lib/dose-v3-persistence-envelope.js');

const SNAP='a'.repeat(64);
const SEC41='b'.repeat(64);
const SEC42='c'.repeat(64);
const UUID1='11111111-1111-4111-8111-111111111111';
const UUID2='22222222-2222-4222-8222-222222222222';
const UUID3='33333333-3333-4333-8333-333333333333';

const extraction={
  canonicalKey:'ibuprofen',
  sourceKey:'emc-7020-smpc',
  requestedUrl:'https://www.medicines.org.uk/emc/product/7020/smpc',
  finalUrl:'https://www.medicines.org.uk/emc/product/7020/smpc',
  sourceTier:'EMC',
  authority:'regulated-product-information',
  jurisdiction:'UK',
  documentDate:'2026-07-01',
  fetchedAt:'2026-08-29T12:00:00Z',
  contentType:'text/html',
  contentLength:1000,
  snapshotId:SNAP,
  rawSha256:SNAP,
  sectionSha256:{'4.1':SEC41,'4.2':SEC42},
  section41Sha256:SEC41,
  section42Sha256:SEC42,
  section41Present:true,
  section42Present:true,
  extractionGate:{allowed:true},
  archiveVerified:true,
  parserSchemaVersion:'drx-smpc-sections-v1',
};

const rule={
  ruleKey:'ibuprofen-pain-adult',
  indicationKey:'pain',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:200,
  doseMaxValue:400,
  doseUnit:'mg',
  frequencyMode:'interval',
  intervalMinHours:6,
  durationMode:'none',
  sourceKey:'emc-7020-smpc',
  sourceSection:'4.2',
  sourceSnapshotId:SNAP,
  sourceSectionSha256:SEC42,
  sourceEvidenceHash:SNAP,
  editorialStatus:'in_review',
};

const good=Gate.buildEnvelope({
  extraction,
  rule,
  productionCanonicalProvenanceVerified:true,
  substanceConceptId:UUID1,
  indicationId:UUID2,
  drugId:UUID3,
  binding:{valid:true,productKey:'ibuprofen-400mg-tablet',matchMethod:'exact_product'},
});
assert.equal(good.ready,true,JSON.stringify(good.blockers));
assert.equal(good.publicationAllowed,false);
assert.ok(good.envelope);
assert.equal(good.envelope.sourceSnapshot.snapshot_id,SNAP);
assert.equal(good.envelope.rule.sourceSectionSha256,SEC42);
assert.equal(good.envelope.rule.editorialStatus,'in_review');
assert.equal(good.envelope.binding.bindingStatus,'candidate');

const noArchive=Gate.draftRulePersistenceGate({
  extraction:{...extraction,archiveVerified:false},
  rule,
  productionCanonicalProvenanceVerified:true,
  substanceConceptId:UUID1,
  indicationId:UUID2,
  drugId:UUID3,
  binding:{valid:true,productKey:'p',matchMethod:'exact_product'},
});
assert.equal(noArchive.ready,false);
assert.ok(noArchive.blockers.includes('source:archive_raw_reparse_not_verified'));

const noCanonical=Gate.draftRulePersistenceGate({
  extraction,
  rule,
  productionCanonicalProvenanceVerified:false,
  substanceConceptId:UUID1,
  indicationId:UUID2,
  drugId:UUID3,
  binding:{valid:true,productKey:'p',matchMethod:'exact_product'},
});
assert.ok(noCanonical.blockers.includes('canonical:production_provenance_not_verified'));

const badBinding=Gate.draftRulePersistenceGate({
  extraction,
  rule,
  productionCanonicalProvenanceVerified:true,
  substanceConceptId:UUID1,
  indicationId:UUID2,
  drugId:UUID3,
  binding:{valid:true,productKey:'p',matchMethod:'substance_only'},
});
assert.ok(badBinding.blockers.includes('binding:not_exact_live_product'));

const badSection=Gate.draftRulePersistenceGate({
  extraction,
  rule:{...rule,sourceSectionSha256:'d'.repeat(64)},
  productionCanonicalProvenanceVerified:true,
  substanceConceptId:UUID1,
  indicationId:UUID2,
  drugId:UUID3,
  binding:{valid:true,productKey:'p',matchMethod:'exact_product'},
});
assert.ok(badSection.blockers.includes('rule:section_4_2_hash_mismatch'));

const publishAttempt=Gate.draftRulePersistenceGate({
  extraction,
  rule:{...rule,editorialStatus:'published'},
  productionCanonicalProvenanceVerified:true,
  substanceConceptId:UUID1,
  indicationId:UUID2,
  drugId:UUID3,
  binding:{valid:true,productKey:'p',matchMethod:'exact_product'},
});
assert.equal(publishAttempt.ready,false);
assert.ok(publishAttempt.blockers.includes('rule:bulk_import_cannot_publish'));

assert.equal(Gate._test.validSha256(SNAP),true);
assert.equal(Gate._test.validUuid(UUID1),true);

console.log('DRx V3 draft persistence envelope gate passed.');
