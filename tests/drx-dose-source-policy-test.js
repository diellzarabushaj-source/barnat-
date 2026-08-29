'use strict';

const assert = require('node:assert/strict');
const Policy = require('../lib/dose-source-policy.js');

const policy = Policy.loadPolicy();
assert.equal(policy.schemaVersion, 'drx-dose-source-policy-v1');

const ema = Policy.rankCandidate({
  url:'https://www.ema.europa.eu/en/medicines/human/EPAR/example',
  documentType:'SmPC',
  documentDate:'2026-08-01',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(ema.tier.key, 'EMA');
assert.equal(ema.publicationEligible, true);

const emc = Policy.rankCandidate({
  url:'https://www.medicines.org.uk/emc/product/123/smpc',
  documentType:'SmPC',
  documentVersion:'v4',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(emc.tier.key, 'EMC');
assert.ok(emc.rankScore > ema.rankScore);

const cima = Policy.rankCandidate({
  url:'https://cima.aemps.es/cima/dochtml/ft/66458/FT_66458.html',
  documentType:'FICHA_TECNICA',
  documentDate:'2026-05-13',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(cima.tier.key, 'AEMPS_CIMA');

const hungary = Policy.rankCandidate({
  url:'https://ogyei.gov.hu/gyogyszeradatbazis&action=show_details&item=22259',
  documentType:'PRODUCT_INFORMATION',
  documentDate:'2026-02-12',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(hungary.tier.key, 'EU_NATIONAL');
assert.equal(hungary.publicationEligible, true);
assert.equal(
  Policy.sourceTierForUrl('https://nngyk.gov.hu/example').key,
  'EU_NATIONAL'
);

const kosovo = Policy.rankCandidate({
  url:'https://akppm.rks-gov.net/example',
  documentType:'PRODUCT_REGISTER',
  documentDate:'2026-01-01',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(kosovo.tier.key, 'KOSOVO_AKPPM');

const mediately = Policy.rankCandidate({
  url:'https://mediately.co/drugs/example',
  documentType:'DRUG_MONOGRAPH',
  documentDate:'2026-01-01',
  substanceMatch:true,
  hasDoseSection:true,
});
assert.equal(mediately.tier.key, 'MEDIATELY');
assert.equal(mediately.publicationEligible, false);
assert.equal(Policy.publicationDecision(mediately).allowed, false);

const insecure = Policy.rankCandidate({
  url:'http://www.ema.europa.eu/example',
  documentType:'SmPC',
  documentDate:'2026-01-01',
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(insecure.accepted, false);
assert.equal(insecure.rejectReason, 'invalid_or_non_https_url');

const mismatched = Policy.rankCandidate({
  url:'https://www.ema.europa.eu/en/medicines/human/EPAR/example',
  documentType:'SmPC',
  documentDate:'2026-01-01',
  productMatch:false,
  substanceMatch:false,
  hasDoseSection:true,
});
assert.equal(mismatched.accepted, false);
assert.equal(mismatched.rejectReason, 'identity_not_matched');

const choice = Policy.chooseBestCandidate([
  mediately,
  cima,
  emc,
  ema,
  { ...ema, url:'https://www.ema.europa.eu/en/medicines/human/EPAR/example#dose' },
]);
assert.equal(choice.best.tier.key, 'EMA');
assert.equal(Policy.publicationDecision(choice.best).allowed, true);

assert.equal(
  Policy.sourceTierForUrl('https://subdomain.ema.europa.eu/path').key,
  'EMA'
);
assert.equal(
  Policy.sourceTierForUrl('https://example.invalid/path').key,
  'FALLBACK'
);

console.log('DRx dose source hierarchy contract passed.');
