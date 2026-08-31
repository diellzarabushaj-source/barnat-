'use strict';
const assert=require('node:assert/strict');
const Handler=require('../lib/dose-product-fast-path-handler.js');
const Reader=require('../lib/dose-v3-product-reader.js');
const Gate=require('../lib/dose-v3-runtime-gate.js');

assert.equal(typeof Handler,'function');
assert.equal(typeof Handler.buildProductPayload,'function');
assert.equal(typeof Handler.buildRuntimePayload,'function');
assert.equal(typeof Reader.build,'function');
assert.equal(typeof Gate.chooseRuntime,'function');

assert.equal(Reader._test.inIds(['a','b','a']),'in.(a,b)');
assert.match(Reader._test.pathFor('dose_rules_v3','rule_id',{editorial_status:'eq.published'},5),/^dose_rules_v3\?/);
assert.match(Reader._test.pathFor('dose_products_v3','product_id',{editorial_status:'eq.published'},1),/^dose_products_v3\?/);
assert.match(Reader._test.pathFor('dose_renal_adjustments_v3','adjustment_id',{review_status:'eq.verified'},5),/^dose_renal_adjustments_v3\?/);
assert.match(Reader._test.pathFor('dose_hepatic_adjustments_v3','adjustment_id',{review_status:'eq.verified'},5),/^dose_hepatic_adjustments_v3\?/);
assert.equal(Reader._test.productSourceValid({
  source_snapshot_id:'a'.repeat(64),
  source_evidence_hash:'a'.repeat(64),
  source_document_date:'2026-08-27'
}),true);
assert.equal(Reader._test.sourceValid({
  source_snapshot_id:'a'.repeat(64),
  source_section:'4.2',
  source_section_sha256:'b'.repeat(64),
  source_evidence_hash:'a'.repeat(64),
  source_document_date:'2026-08-27'
}),true);
assert.equal(Reader._test.sourceValid({
  source_snapshot_id:'a'.repeat(64),
  source_section:'4.2',
  source_section_sha256:'',
  source_evidence_hash:'a'.repeat(64),
  source_document_date:'2026-08-27'
}),false);

const verifiedAdjustment={
  source_snapshot_id:'a'.repeat(64),
  source_section:'4.2',
  source_section_sha256:'b'.repeat(64),
  source_evidence_hash:'a'.repeat(64),
  source_document_date:'2026-08-27',
  review_status:'verified',
  verified_by:'reviewer',
  verified_at:'2026-08-31T20:00:00Z',
  dose_action:'no_adjustment',
};
assert.equal(Reader._test.adjustmentRowValid(verifiedAdjustment),true);
assert.equal(Reader._test.adjustmentRowValid({...verifiedAdjustment,verified_by:''}),false);
assert.equal(Reader._test.adjustmentRowValid({...verifiedAdjustment,dose_action:'max_daily_cap',max_daily_dose_mg:null}),false);
assert.equal(Reader._test.adjustmentRowValid({...verifiedAdjustment,dose_action:'max_daily_cap',max_daily_dose_mg:1000}),true);

const verifiedBinding={
  binding_status:'verified',
  verified_by:'reviewer',
  verified_at:'2026-08-31T20:00:00Z',
};
assert.equal(Reader._test.bindingValid(verifiedBinding),true);
assert.equal(Reader._test.bindingValid({...verifiedBinding,verified_at:null}),false);

assert.equal(Gate._test.adjustmentValid({
  source:{snapshotId:'a'.repeat(64),section:'4.2',sectionSha256:'b'.repeat(64),evidenceHash:'a'.repeat(64),documentDate:'2026-08-27',official:true},
  reviewStatus:'verified',
  verifiedBy:'reviewer',
  verifiedAt:'2026-08-31T20:00:00Z',
  doseAction:'no_adjustment',
}),true);
assert.equal(Gate._test.conversionValid({
  enabled:true,status:'automatic',bindingStatus:'verified',verifiedBy:'reviewer',verifiedAt:'2026-08-31T20:00:00Z',
}),true);
assert.equal(Gate._test.conversionValid({
  enabled:true,status:'verified',bindingStatus:'verified',verifiedBy:'reviewer',verifiedAt:'2026-08-31T20:00:00Z',
}),false);
assert.equal(
  [
    {
      rule_id:'r1',
      indication_id:'i1',
      renal_adjustment_required:true,
      hepatic_adjustment_required:false,
      source_snapshot_id:'a'.repeat(64),
      source_section:'4.2',
      source_section_sha256:'b'.repeat(64),
      source_evidence_hash:'a'.repeat(64),
      source_document_date:'2026-08-27'
    }
  ].filter(rule => {
    const renalMap=new Map();
    const hepaticMap=new Map();
    const indicationMap=new Map([['i1',{}]]);
    const key=Reader._test.clean(rule.rule_id);
    return Reader._test.sourceValid(rule)
      && indicationMap.has(Reader._test.clean(rule.indication_id))
      && (rule.renal_adjustment_required !== true || (renalMap.get(key)||[]).length>0)
      && (rule.hepatic_adjustment_required !== true || (hepaticMap.get(key)||[]).length>0);
  }).length,
  0
);

const fallback=Gate.chooseRuntime({v3Enabled:true,v3Available:false,v2Available:true,strictV3:false});
assert.equal(fallback.runtime,'v2');
assert.equal(fallback.fallback,true);
const strict=Gate.chooseRuntime({v3Enabled:true,v3Available:false,v2Available:true,strictV3:true});
assert.equal(strict.failClosed,true);

console.log('DRx V3 fast-path integration parses and remains fail-closed.');
