'use strict';

const assert = require('node:assert/strict');
const Gate = require('../lib/dose-publication-gate.js');

const completeRule = {
  ruleKey:'r1',
  indicationKey:'fever',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:400,
  doseMaxValue:400,
  doseUnit:'mg',
  frequencyMode:'interval',
  intervalMinHours:6,
  intervalMaxHours:8,
  maxDoses24h:3,
  maxDailyDoseMg:1200,
  durationMode:'none',
  route:'PO',
  sourceKey:'official',
  sourceSection:'4.2',
  sourceSnapshotId:'snapshot-1',
  sourceEvidenceHash:'a'.repeat(64),
  editorialStatus:'published',
  verifiedBy:'reviewer',
  verifiedAt:'2026-08-29T00:00:00Z',
};

const approved = Gate.evaluate({
  rule:completeRule,
  sourceDecision:{ allowed:true, reason:'authoritative_source_complete', candidate:{ tier:{ key:'EMC' } } },
  extractionDecision:{ allowed:true, reason:'required_smpc_sections_present' },
  indicationDecision:{ allowed:true, reason:'indication_verified', verifiedIcdCodes:['R50.9'] },
  binding:{ valid:true, errors:[], productKey:'p1' },
  combinationBasis:{ valid:true, reason:'single_active_unambiguous' },
  legacyComparison:{ status:'exact', conflicts:[], missingFields:[] },
  confidence:{ score:0.97, reviewClass:'auto_reviewable', hardBlockers:[] },
  safetyValidation:{ publishable:true, blockers:[], warnings:[] },
  verifiedBy:'reviewer',
  verifiedAt:'2026-08-29T00:00:00Z',
  reviewStatus:'approved',
  openReviewReasons:[],
});
assert.equal(approved.allowed, true);
assert.equal(approved.decision, 'publish');
assert.equal(approved.evidence.sourceSection, '4.2');

const noReview = Gate.evaluate({
  rule:completeRule,
  sourceDecision:{ allowed:true, candidate:{ tier:{ key:'EMC' } } },
  extractionDecision:{ allowed:true },
  indicationDecision:{ allowed:true },
  binding:{ valid:true, errors:[], productKey:'p1' },
  combinationBasis:{ valid:true },
  legacyComparison:{ status:'exact' },
  confidence:{ score:0.97, reviewClass:'auto_reviewable', hardBlockers:[] },
  safetyValidation:{ publishable:true, blockers:[], warnings:[] },
  verifiedBy:'',
  verifiedAt:'',
  reviewStatus:'open',
});
assert.equal(noReview.allowed, false);
assert.ok(noReview.blockers.includes('review:verified_by_missing'));
assert.ok(noReview.blockers.includes('review:verified_at_missing'));
assert.ok(noReview.blockers.includes('review:not_approved'));

const conflict = Gate.evaluate({
  rule:completeRule,
  sourceDecision:{ allowed:true, candidate:{ tier:{ key:'EMC' } } },
  extractionDecision:{ allowed:true },
  indicationDecision:{ allowed:true },
  binding:{ valid:true, errors:[], productKey:'p1' },
  combinationBasis:{ valid:true },
  legacyComparison:{ status:'conflict', conflicts:[{field:'doseMaxValue'}] },
  confidence:{ score:0.90, reviewClass:'manual_review', hardBlockers:['source_conflict'] },
  safetyValidation:{ publishable:false, blockers:['legacy:conflict'], warnings:[] },
  verifiedBy:'reviewer',
  verifiedAt:'2026-08-29T00:00:00Z',
  reviewStatus:'approved',
});
assert.equal(conflict.allowed, false);
assert.ok(conflict.blockers.includes('legacy:conflict'));
assert.ok(conflict.blockers.includes('confidence:source_conflict'));

console.log('DRx publication gate contract passed.');
