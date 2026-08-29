'use strict';

const Dose = require('./dose-rule-normalizer.js');

function canonicalScope(rule = {}) {
  const r = Dose.normalizeRule(rule);
  return [
    r.indicationKey,
    r.patientGroup,
    r.route.toLowerCase(),
    r.minAgeMonths ?? '',
    r.maxAgeMonths ?? '',
    r.minWeightKg ?? '',
    r.maxWeightKg ?? '',
  ].join('|');
}

function clinicalSignature(rule = {}) {
  const r = Dose.normalizeRule(rule);
  return JSON.stringify({
    calculationMethod:r.calculationMethod,
    doseMinValue:r.doseMinValue,
    doseMaxValue:r.doseMaxValue,
    doseUnit:r.doseUnit,
    doseBasis:r.doseBasis,
    frequencyMode:r.frequencyMode,
    intervalMinHours:r.intervalMinHours,
    intervalMaxHours:r.intervalMaxHours,
    timesPerDay:r.timesPerDay,
    maxSingleDoseMg:r.maxSingleDoseMg,
    maxDailyDoseMg:r.maxDailyDoseMg,
    maxDoses24h:r.maxDoses24h,
    durationMode:r.durationMode,
    durationMinDays:r.durationMinDays,
    durationMaxDays:r.durationMaxDays,
    reviewAfterDays:r.reviewAfterDays,
    prn:r.prn,
  });
}

function detectRuleConflicts(rules) {
  const groups = new Map();
  for (const input of Array.isArray(rules) ? rules : []) {
    const scope = canonicalScope(input);
    if (!groups.has(scope)) groups.set(scope, []);
    groups.get(scope).push(input);
  }

  const conflicts = [];
  for (const [scope, items] of groups) {
    const signatures = new Map();
    for (const item of items) {
      const sig = clinicalSignature(item);
      if (!signatures.has(sig)) signatures.set(sig, []);
      signatures.get(sig).push(item);
    }
    if (signatures.size > 1) {
      conflicts.push({
        scope,
        ruleKeys:items.map(item => Dose.normalizeRule(item).ruleKey).filter(Boolean),
        variants:signatures.size,
      });
    }
  }
  return conflicts;
}

function validatePublicationBundle(bundle = {}) {
  const blockers = [];
  const warnings = [];

  const ruleValidation = bundle.ruleValidation || Dose.validateRule(bundle.rule || {});
  if (!ruleValidation.valid) blockers.push(...ruleValidation.errors.map(code => 'rule:' + code));

  if (bundle.sourceDecision && bundle.sourceDecision.allowed !== true) {
    blockers.push('source:' + (bundle.sourceDecision.reason || 'not_allowed'));
  }
  if (bundle.indicationDecision && bundle.indicationDecision.allowed !== true) {
    blockers.push('indication:' + (bundle.indicationDecision.reason || 'not_allowed'));
  }
  if (bundle.binding && bundle.binding.valid !== true) {
    blockers.push(...(bundle.binding.errors || ['binding_invalid']).map(code => 'binding:' + code));
  }
  if (bundle.combinationBasis && bundle.combinationBasis.valid !== true) {
    blockers.push('combination:' + (bundle.combinationBasis.reason || 'invalid'));
  }
  if (bundle.legacyComparison?.status === 'conflict') blockers.push('legacy:conflict');
  if (bundle.legacyComparison?.status === 'missing') warnings.push('legacy:missing');
  if (bundle.confidence?.hardBlockers?.length) {
    blockers.push(...bundle.confidence.hardBlockers.map(code => 'confidence:' + code));
  }
  if (bundle.confidence?.reviewClass === 'manual_review') blockers.push('confidence:manual_review');
  if (bundle.confidence?.reviewClass === 'quick_review') warnings.push('confidence:quick_review');
  if (bundle.highRisk === true) blockers.push('high_risk_manual_review');

  const siblingConflicts = detectRuleConflicts(bundle.siblingRules || []);
  if (siblingConflicts.length) blockers.push('rule_set:contradiction');

  return {
    schemaVersion:'drx-dose-safety-validation-v1',
    publishable:blockers.length === 0,
    blockers:[...new Set(blockers)],
    warnings:[...new Set(warnings)],
    siblingConflicts,
    rule:ruleValidation.rule,
  };
}

module.exports = {
  canonicalScope,
  clinicalSignature,
  detectRuleConflicts,
  validatePublicationBundle,
};
