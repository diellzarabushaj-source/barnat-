'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../dose-core.js');

const ROOT = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'drx-dose-golden-cases-v1.json'), 'utf8'));

for (const testCase of data.cases) {
  if (testCase.type === 'engine_math' || testCase.type === 'engine_safety') {
    const result = Core.calculate(testCase.rule, testCase.patient || {});
    assert.equal(result.outcome, testCase.expected.outcome, testCase.id);
    if (Object.hasOwn(testCase.expected, 'perDose')) assert.deepEqual(result.perDose, testCase.expected.perDose, testCase.id);
    if (Object.hasOwn(testCase.expected, 'daily')) assert.deepEqual(result.daily, testCase.expected.daily, testCase.id);
    if (testCase.expected.bsaMin !== undefined) {
      assert.ok(result.bsaM2 > testCase.expected.bsaMin && result.bsaM2 < testCase.expected.bsaMax, testCase.id);
    }
    continue;
  }

  if (testCase.type === 'publication_hold') {
    const pilot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', testCase.pilotFile), 'utf8'));
    assert.equal(pilot.publicationAllowed, testCase.expected.publicationAllowed, testCase.id);
    assert.ok(
      pilot.extractedRuleCandidates.every(rule => rule.bindingStatus === testCase.expected.bindingStatus),
      testCase.id
    );
  }
}

console.log('DRx golden QA cases passed.');
