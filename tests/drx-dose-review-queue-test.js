'use strict';

const assert = require('node:assert/strict');
const Review = require('../lib/dose-review-queue.js');

const queue = Review.buildReviewQueue([
  {
    ruleKey:'r1',
    productKey:'p1',
    highRisk:true,
    confidence:{ score:0.95, reviewClass:'manual_review', hardBlockers:['high_risk_manual_review'] },
    legacyComparison:{ status:'exact' },
  },
  {
    ruleKey:'r2',
    productKey:'p2',
    confidence:{ score:0.81, reviewClass:'quick_review', hardBlockers:[] },
    legacyComparison:{ status:'missing' },
  },
  {
    ruleKey:'r3',
    productKey:'p3',
    confidence:{ score:0.99, reviewClass:'auto_reviewable', hardBlockers:[] },
    legacyComparison:{ status:'exact' },
  },
]);

assert.equal(queue.length, 2);
assert.equal(queue[0].ruleKey, 'r1');
assert.equal(queue[0].priority, 100);
assert.ok(queue[0].reasons.includes('high_risk_manual_review'));
assert.equal(queue[1].ruleKey, 'r2');
assert.ok(queue[1].reasons.includes('quick_review'));
assert.ok(queue[1].reasons.includes('legacy_missing'));
assert.equal(Review.buildReviewItem({
  ruleKey:'r3',
  productKey:'p3',
  confidence:{ score:0.99, reviewClass:'auto_reviewable', hardBlockers:[] },
  legacyComparison:{ status:'exact' },
}), null);

console.log('DRx clinical review queue contract passed.');
