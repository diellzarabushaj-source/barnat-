'use strict';

const assert = require('node:assert/strict');
const Dose = require('../lib/dose-rule-normalizer.js');

const HASH = 'a'.repeat(64);

const fixed = Dose.validateRule({
  ruleKey:'ibuprofen-pain-adult',
  indicationKey:'pain',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:200,
  doseMaxValue:400,
  doseUnit:'mg',
  frequencyMode:'interval',
  intervalMinHours:6,
  intervalMaxHours:8,
  durationMode:'none',
  route:'PO',
  sourceKey:'emc-7020-smpc',
  sourceSection:'4.2',
  sourceSnapshotId:HASH,
  sourceEvidenceHash:HASH,
  editorialStatus:'published',
});
assert.equal(fixed.valid, true);
assert.deepEqual(fixed.rule.requiredInputs, []);
assert.equal(Dose.publicationDecision(fixed.rule).allowed, true);

const perKg = Dose.validateRule({
  ruleKey:'example-ped',
  indicationKey:'fever',
  patientGroup:'pediatric_only',
  calculationMethod:'dose_per_kg_per_dose',
  doseMinValue:5,
  doseMaxValue:10,
  doseUnit:'mg/kg',
  frequencyMode:'interval',
  intervalMinHours:6,
  maxDoses24h:4,
  durationMode:'none',
  minAgeMonths:6,
  maxAgeMonths:144,
  sourceKey:'official',
  sourceSection:'4.2',
});
assert.equal(perKg.valid, true);
assert.ok(perKg.rule.requiredInputs.includes('weight_kg'));
assert.ok(perKg.rule.requiredInputs.includes('age_months'));

const bsa = Dose.normalizeRule({
  calculationMethod:'dose_per_m2_per_dose',
});
assert.deepEqual(bsa.requiredInputs, ['weight_kg','height_cm']);

const renal = Dose.normalizeRule({
  calculationMethod:'fixed_dose',
  renalAdjustmentRequired:true,
});
assert.ok(renal.requiredInputs.includes('renal_function'));

const prnMissingCeiling = Dose.validateRule({
  ruleKey:'bad-prn',
  indicationKey:'pain',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:200,
  doseUnit:'mg',
  frequencyMode:'prn',
  prn:true,
  durationMode:'none',
  sourceKey:'official',
  sourceSection:'4.2',
});
assert.ok(prnMissingCeiling.errors.includes('prn_ceiling_missing'));

const inverted = Dose.validateRule({
  ruleKey:'bad-range',
  indicationKey:'pain',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:400,
  doseMaxValue:200,
  doseUnit:'mg',
  frequencyMode:'single',
  durationMode:'none',
  sourceKey:'official',
  sourceSection:'4.2',
});
assert.ok(inverted.errors.includes('dose_range_inverted'));

const noProvenance = Dose.validateRule({
  ruleKey:'bad-publish',
  indicationKey:'pain',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:200,
  doseUnit:'mg',
  frequencyMode:'single',
  durationMode:'none',
  sourceKey:'official',
  sourceSection:'4.2',
  editorialStatus:'published',
});
assert.ok(noProvenance.errors.includes('source_snapshot_missing_or_invalid'));
assert.ok(noProvenance.errors.includes('source_evidence_hash_missing_or_invalid'));

const manual = Dose.publicationDecision({
  ruleKey:'manual',
  indicationKey:'oncology',
  patientGroup:'adult_only',
  calculationMethod:'manual_only',
  frequencyMode:'manual',
  durationMode:'manual',
  sourceKey:'official',
  sourceSection:'4.2',
  sourceSnapshotId:HASH,
  sourceEvidenceHash:HASH,
  editorialStatus:'published',
  specialistOnly:true,
});
assert.equal(manual.allowed, false);

console.log('DRx dose rule normalization and required-input contract passed.');
