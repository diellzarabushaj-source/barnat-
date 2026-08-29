'use strict';

const assert = require('node:assert/strict');
const Legacy = require('../lib/dose-legacy-comparator.js');
const Confidence = require('../lib/dose-confidence-engine.js');
const Safety = require('../lib/dose-safety-validator.js');
const Dose = require('../lib/dose-rule-normalizer.js');

const baseRule = {
  ruleKey:'r1',
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
  sourceKey:'emc',
  sourceSection:'4.2',
};

const exact = Legacy.compareRules(baseRule, { ...baseRule });
assert.equal(exact.status, 'exact');

const conflict = Legacy.compareRules(baseRule, { ...baseRule, doseMaxValue:600 });
assert.equal(conflict.status, 'conflict');
assert.equal(conflict.conflicts[0].field, 'doseMaxValue');

const missing = Legacy.compareRules(baseRule, null);
assert.equal(missing.status, 'missing');

const highConfidence = Confidence.confidence({
  sourceTier:'EMC',
  substanceMatch:'exact_concept',
  formulationMatch:'exact_key',
  indicationMatch:'exact_alias',
  productMatch:'exact_product',
  extractionMethod:'structured_verified',
});
assert.equal(highConfidence.reviewClass, 'auto_reviewable');
assert.equal(highConfidence.hardBlockers.length, 0);

const weak = Confidence.confidence({
  sourceTier:'MEDIATELY',
  substanceMatch:'fuzzy',
  formulationMatch:'unspecified',
  indicationMatch:'candidate',
  productMatch:'substance_only',
  extractionMethod:'secondary_reference',
});
assert.equal(weak.reviewClass, 'manual_review');
assert.ok(weak.hardBlockers.includes('non_authoritative_source'));

const validation = Dose.validateRule({
  ...baseRule,
  sourceSnapshotId:'snapshot',
  sourceEvidenceHash:'a'.repeat(64),
  editorialStatus:'published',
});
assert.equal(validation.valid, true);

const publishable = Safety.validatePublicationBundle({
  ruleValidation:validation,
  sourceDecision:{ allowed:true },
  indicationDecision:{ allowed:true },
  binding:{ valid:true, errors:[] },
  combinationBasis:{ valid:true },
  legacyComparison:exact,
  confidence:highConfidence,
  siblingRules:[baseRule],
});
assert.equal(publishable.publishable, true);

const conflictingBundle = Safety.validatePublicationBundle({
  ruleValidation:validation,
  sourceDecision:{ allowed:true },
  indicationDecision:{ allowed:true },
  binding:{ valid:true, errors:[] },
  combinationBasis:{ valid:true },
  legacyComparison:conflict,
  confidence:highConfidence,
  siblingRules:[
    baseRule,
    { ...baseRule, ruleKey:'r2', doseMaxValue:600 },
  ],
});
assert.equal(conflictingBundle.publishable, false);
assert.ok(conflictingBundle.blockers.includes('legacy:conflict'));
assert.ok(conflictingBundle.blockers.includes('rule_set:contradiction'));

const manualConfidence = Confidence.confidence({
  sourceTier:'EMC',
  substanceMatch:'exact_concept',
  formulationMatch:'exact_key',
  indicationMatch:'exact_alias',
  productMatch:'exact_product',
  extractionMethod:'structured_verified',
  highRisk:true,
});
const highRisk = Safety.validatePublicationBundle({
  ruleValidation:validation,
  sourceDecision:{ allowed:true },
  indicationDecision:{ allowed:true },
  binding:{ valid:true, errors:[] },
  combinationBasis:{ valid:true },
  legacyComparison:exact,
  confidence:manualConfidence,
  highRisk:true,
});
assert.equal(highRisk.publishable, false);
assert.ok(highRisk.blockers.some(x => x.includes('high_risk')));

console.log('DRx legacy comparison, confidence and safety contract passed.');
