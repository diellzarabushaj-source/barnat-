'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const consistency = require('../emergency-consistency-core-v15.js');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'urgjencat.html'), 'utf8');
const loader = fs.readFileSync(path.join(ROOT, 'emergency-review-loader-v16.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'emergency-consistency-v15.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'emergency-consistency-v15.css'), 'utf8');

const asthma = {
  _id:'asthma', title:'Astma akute', version:'0.10',
  primaryCareSteps:[{_key:'as-3',title:'Oksigjeni',action:'Titra oksigjenin për SpO₂ 94–98% sipas protokollit.'}],
  referral:{beforeTransfer:['Titra oksigjenin në 92–95%.']},
  sources:[{title:'Guideline',url:'https://example.org/a'}],
};
const sepsis = {
  _id:'sepsis', title:'Sepsis', version:'0.10',
  primaryCareSteps:[{_key:'sep-3',title:'Oksigjeni',action:'Për oksigjen, syno SpO₂ 94–98% te shumica ose 88–92% kur ka rrezik hiperkapnik.'}],
  redFlags:['SpO₂ <92%'],
  sources:[{title:'Guideline',url:'https://example.org/s'}],
};
const noUrl = {
  _id:'source', title:'Burim pa URL', version:'1', primaryCareSteps:[{action:'ABCDE'}], sources:[{title:'Local guideline'}],
};

const asthmaIssue = consistency.oxygenTargetConflict(asthma);
assert.ok(asthmaIssue, 'Different oxygen target ranges in different protocol blocks should be surfaced for human review.');
assert.equal(asthmaIssue.id, 'oxygen-target-range');
assert.deepEqual(astmaRanges(asthmaIssue), ['92–95%','94–98%']);
function astmaRanges(issue) { return [...new Set(issue.occurrences.flatMap(row => row.ranges))].sort(); }

assert.equal(consistency.oxygenTargetConflict(sepsis), null, 'Conditional alternative targets within the same block must not be called a cross-section conflict.');
assert.equal(consistency.oxygenTargetRanges(sepsis).length, 1);
assert.ok(consistency.sourceLinkIssues(noUrl), 'A source without a URL should be surfaced for verification.');
assert.equal(consistency.auditItem(asthma).requiresReview, true);
assert.equal(consistency.auditItem(sepsis).requiresReview, false);
const report = consistency.audit([asthma,sepsis,noUrl]);
assert.equal(report.total, 3);
assert.equal(report.flagged, 2);
assert.equal(report.clean, 1);

assert.match(html, /emergency-review-loader-v16\.js\?v=20260824-1/);
assert.doesNotMatch(html, /<link[^>]+emergency-consistency-v15\.css/);
assert.doesNotMatch(html, /<script[^>]+emergency-consistency-core-v15\.js/);
assert.doesNotMatch(html, /<script[^>]+emergency-consistency-v15\.js/);
assert.match(loader, /emergency-consistency-v15\.css/);
assert.match(loader, /emergency-consistency-core-v15\.js/);
assert.match(loader, /emergency-consistency-v15\.js/);
assert.ok(loader.indexOf('emergency-consistency-core-v15.js') < loader.indexOf('emergency-consistency-v15.js'), 'Consistency core must load before reviewer UI.');
assert.match(ui, /searchParams\.get\('review'\) === '1'/);
assert.match(ui, /MEDINDEX_AUTH_READY/);
assert.match(ui, /authUser\?\.adminConsole !== true/);
assert.match(ui, /Ky është sinjal konsistence, jo vendim klinik/);
assert.match(ui, /nuk garanton që dozat, targetet ose udhëzimet janë të sakta/);
assert.match(ui, /medindex_emergency_consistency_v15:/);
assert.doesNotMatch(ui, /fetch\(|XMLHttpRequest|gemini|generative|patch_documents|reviewStatus\s*=/i);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Emergency lazy reviewer-only deterministic consistency guard v15 contract passed.');
