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

const fachinfo = Policy.rankCandidate({
  url:'https://www.fachinfo.de/fi/pdf/015058/imazol-r-comp-creme',
  documentType:'SmPC',
  documentDate:'2024-06',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(fachinfo.tier.key, 'FACHINFO_DE');
assert.equal(fachinfo.accepted, true);
assert.equal(fachinfo.publicationEligible, false);
assert.equal(Policy.publicationDecision(fachinfo).allowed, false);

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

const romania = Policy.rankCandidate({
  url:'https://www.anm.ro/_/_RCP/RCP_12345_30.08.19.pdf',
  documentType:'SmPC',
  documentDate:'2019-08-30',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(romania.tier.key, 'EU_NATIONAL');
assert.equal(romania.publicationEligible, true);
assert.equal(
  Policy.sourceTierForUrl('https://nomenclator.anm.ro/medicamente').key,
  'EU_NATIONAL'
);

const basg = Policy.rankCandidate({
  url:'https://medikamente.basg.gv.at/documents/example.pdf',
  documentType:'SmPC',
  documentDate:'2022-07',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(basg.tier.key, 'EU_NATIONAL');
assert.equal(basg.publicationEligible, true);

const hpra = Policy.rankCandidate({
  url:'https://assets.hpra.ie/products/Human/example.pdf',
  documentType:'SmPC',
  documentDate:'2026-06-02',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(hpra.tier.key, 'EU_NATIONAL');
assert.equal(hpra.publicationEligible, true);

const zva = Policy.rankCandidate({
  url:'https://www.zva.gov.lv/zvais/zalu-registrs/attachments/smpc/299094',
  documentType:'SmPC',
  documentDate:'2019-01',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(zva.tier.key, 'EU_NATIONAL');
assert.equal(zva.publicationEligible, true);
assert.equal(
  Policy.sourceTierForUrl('https://dati.zva.gov.lv/zalu-registrs/lv').key,
  'EU_NATIONAL'
);

const suklCz = Policy.rankCandidate({
  url:'https://prehledy.sukl.cz/prehled_leciv.html',
  documentType:'SmPC',
  documentDate:'2026-08-29',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(suklCz.tier.key, 'EU_NATIONAL');
assert.equal(suklCz.publicationEligible, true);
assert.equal(
  Policy.sourceTierForUrl('https://www.sukl.cz/example').key,
  'EU_NATIONAL'
);

const aifa = Policy.rankCandidate({
  url:'https://www.aifa.gov.it/documents/20142/1159780/Esiti_CTS_13-14-15-20-26_maggio_2020_AVPM.pdf',
  documentType:'PRODUCT_INFORMATION',
  documentDate:'2020-05-26',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(aifa.tier.key, 'EU_NATIONAL');
assert.equal(aifa.publicationEligible, true);
assert.equal(
  Policy.sourceTierForUrl('https://www.aifa.gov.it/example').key,
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

const invima = Policy.rankCandidate({
  url:'https://webservice.invima.gov.co/registros/pdf/16393702_2023024275.pdf',
  documentType:'REGULATORY_RESOLUTION',
  documentDate:'2023-06-05',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:false,
});
assert.equal(invima.tier.key, 'NON_EU_REGULATOR');
assert.equal(invima.accepted, true);
assert.equal(invima.publicationEligible, false);
assert.equal(Policy.publicationDecision(invima).allowed, false);

const northMacedonia = Policy.rankCandidate({
  url:'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/52577',
  documentType:'PRODUCT_REGISTER',
  documentDate:'2013-09-12',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(northMacedonia.tier.key, 'NON_EU_REGULATOR');
assert.equal(northMacedonia.accepted, true);
assert.equal(northMacedonia.publicationEligible, false);
assert.equal(Policy.publicationDecision(northMacedonia).allowed, false);

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