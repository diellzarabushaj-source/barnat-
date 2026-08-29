'use strict';

const assert = require('node:assert/strict');
const Adjust = require('../lib/dose-adjustment-engine.js');

const hash = 'c'.repeat(64);
const sectionHash = 'd'.repeat(64);
const verifiedAt = '2026-08-29T12:00:00Z';

const renalRows = [
  {
    measure_type:'CrCl_mL_min',
    min_value:30,
    max_value:49.999,
    dose_action:'extend_interval',
    interval_min_hours:12,
    interval_max_hours:12,
    source_key:'emc-x',
    source_section:'4.2',
    source_section_sha256:sectionHash,
    source_snapshot_id:hash,
    source_evidence_hash:hash,
    review_status:'verified',
    verified_by:'drx-reviewer',
    verified_at:verifiedAt,
  },
  {
    measure_type:'CrCl_mL_min',
    min_value:50,
    dose_action:'no_adjustment',
    source_key:'emc-x',
    source_section:'4.2',
    source_section_sha256:sectionHash,
    source_snapshot_id:hash,
    source_evidence_hash:hash,
    review_status:'verified',
    verified_by:'drx-reviewer',
    verified_at:verifiedAt,
  },
];

const selected = Adjust.selectAdjustment(renalRows, {crClMlMin:42});
assert.equal(selected.status,'matched');
assert.equal(selected.adjustment.doseAction,'extend_interval');

const applied = Adjust.applyAdjustment({
  doseMinValue:250,
  doseMaxValue:500,
  frequencyMode:'times_per_day',
  timesPerDay:2,
}, selected);
assert.equal(applied.status,'applied');
assert.equal(applied.rule.frequencyMode,'interval');
assert.equal(applied.rule.intervalMinHours,12);
assert.equal(applied.rule.timesPerDay,null);

const egfrCannotSubstitute = Adjust.selectAdjustment(renalRows, {eGfrMlMin173m2:42});
assert.equal(egfrCannotSubstitute.status,'no_match');

const hepatic = Adjust.selectAdjustment([
  {
    measure_type:'Child_Pugh_class',
    accepted_values:['C'],
    dose_action:'specialist_review',
    source_key:'emc-y',
    source_section:'4.2',
    source_section_sha256:sectionHash,
    source_snapshot_id:hash,
    source_evidence_hash:hash,
    review_status:'verified',
    verified_by:'drx-reviewer',
    verified_at:verifiedAt,
  },
], {childPughClass:'C'});
assert.equal(hepatic.status,'blocked');
assert.equal(hepatic.reason,'specialist_review');

const invalid = Adjust.selectAdjustment([
  {
    measure_type:'eGFR_mL_min_1_73m2',
    dose_action:'reduce_dose',
    source_key:'emc-z',
    source_section:'4.2',
    source_section_sha256:'',
    review_status:'verified',
  },
], {eGfrMlMin173m2:25});
assert.equal(invalid.status,'blocked');
assert.equal(invalid.reason,'invalid_adjustment_rows');

const provenanceMismatch = Adjust.validateAdjustmentRow({
  measure_type:'CrCl_mL_min',
  min_value:10,
  max_value:20,
  dose_action:'no_adjustment',
  source_key:'emc-mismatch',
  source_section:'4.2',
  source_section_sha256:sectionHash,
  source_snapshot_id:'a'.repeat(64),
  source_evidence_hash:'b'.repeat(64),
  review_status:'verified',
  verified_by:'drx-reviewer',
  verified_at:verifiedAt,
});
assert.equal(provenanceMismatch.valid,false);
assert.ok(provenanceMismatch.errors.includes('source_snapshot_evidence_hash_mismatch'));

const missingReviewer = Adjust.validateAdjustmentRow({
  measure_type:'Child_Pugh_class',
  accepted_values:['B'],
  dose_action:'specialist_review',
  source_key:'emc-review',
  source_section:'4.2',
  source_section_sha256:sectionHash,
  source_snapshot_id:hash,
  source_evidence_hash:hash,
  review_status:'verified',
});
assert.equal(missingReviewer.valid,false);
assert.ok(missingReviewer.errors.includes('verified_by_missing'));
assert.ok(missingReviewer.errors.includes('verified_at_missing'));

console.log('DRx renal/hepatic adjustment engine contracts passed.');
