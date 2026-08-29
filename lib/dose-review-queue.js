'use strict';

const PRIORITY = Object.freeze({
  high_risk_manual_review:100,
  safety_conflict:95,
  source_conflict:90,
  combination_basis_ambiguous:85,
  legacy_conflict:80,
  indication_not_verified:75,
  substance_identity_not_exact:70,
  product_match_missing:65,
  formulation_mismatch:60,
  manual_review_required:55,
  quick_review:35,
  legacy_missing:20,
});

function clean(value) {
  return String(value ?? '').trim();
}

function reasonCode(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^[a-z]+:/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function reasonPriority(code) {
  return PRIORITY[reasonCode(code)] || 40;
}

function collectReasons(bundle = {}) {
  const reasons = new Set();

  for (const blocker of bundle.safetyValidation?.blockers || []) reasons.add(reasonCode(blocker));
  for (const warning of bundle.safetyValidation?.warnings || []) reasons.add(reasonCode(warning));
  for (const blocker of bundle.confidence?.hardBlockers || []) reasons.add(reasonCode(blocker));

  if (bundle.legacyComparison?.status === 'conflict') reasons.add('legacy_conflict');
  if (bundle.legacyComparison?.status === 'missing') reasons.add('legacy_missing');
  if (bundle.highRisk === true) reasons.add('high_risk_manual_review');
  if (bundle.sourceConflict === true) reasons.add('source_conflict');
  if (bundle.safetyConflict === true) reasons.add('safety_conflict');
  if (bundle.combinationBasis?.valid === false) reasons.add('combination_basis_ambiguous');
  if (bundle.confidence?.reviewClass === 'manual_review') reasons.add('manual_review_required');
  if (bundle.confidence?.reviewClass === 'quick_review') reasons.add('quick_review');

  return [...reasons].filter(Boolean);
}

function buildReviewItem(bundle = {}) {
  const reasons = collectReasons(bundle);
  if (!reasons.length) return null;
  const priority = Math.max(...reasons.map(reasonPriority));
  const ruleKey = clean(bundle.ruleKey || bundle.rule?.ruleKey || bundle.rule?.rule_key);
  const productKey = clean(bundle.productKey || bundle.product?.productKey || bundle.product?.product_key);

  return {
    schemaVersion:'drx-dose-review-item-v1',
    reviewKey:[ruleKey || 'unknown-rule', productKey || 'unbound'].join('|'),
    ruleKey,
    productKey,
    priority,
    reasons:reasons.sort((a, b) => reasonPriority(b) - reasonPriority(a) || a.localeCompare(b)),
    reviewStatus:'open',
    sourceKey:clean(bundle.sourceKey || bundle.rule?.sourceKey || bundle.rule?.source_key),
    confidenceScore:Number.isFinite(Number(bundle.confidence?.score)) ? Number(bundle.confidence.score) : null,
    confidenceClass:clean(bundle.confidence?.reviewClass),
    legacyStatus:clean(bundle.legacyComparison?.status),
    highRisk:bundle.highRisk === true,
  };
}

function buildReviewQueue(bundles) {
  const byKey = new Map();
  for (const bundle of Array.isArray(bundles) ? bundles : []) {
    const item = buildReviewItem(bundle);
    if (!item) continue;
    const current = byKey.get(item.reviewKey);
    if (!current || item.priority > current.priority) {
      byKey.set(item.reviewKey, item);
      continue;
    }
    current.reasons = [...new Set([...current.reasons, ...item.reasons])]
      .sort((a, b) => reasonPriority(b) - reasonPriority(a) || a.localeCompare(b));
    current.priority = Math.max(...current.reasons.map(reasonPriority));
  }
  return [...byKey.values()].sort((a, b) =>
    b.priority - a.priority
    || a.ruleKey.localeCompare(b.ruleKey)
    || a.productKey.localeCompare(b.productKey)
  );
}

module.exports = {
  PRIORITY,
  reasonCode,
  reasonPriority,
  collectReasons,
  buildReviewItem,
  buildReviewQueue,
};
