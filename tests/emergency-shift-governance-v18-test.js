'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shift = require('../emergency-shift-core-v18.js');

const ROOT = path.resolve(__dirname, '..');
const loader = fs.readFileSync(path.join(ROOT, 'emergency-review-loader-v16.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'emergency-shift-governance-v18.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'emergency-shift-governance-v18.css'), 'utf8');

const now = Date.parse('2026-08-25T08:00:00Z');
const source = {title:'Guideline',url:'https://example.org/g'};
const fixture = {
  _id:'critical',title:'Critical protocol',triageLevel:'critical',reviewStatus:'review',version:'0.10',sources:[source],
  reviewedBy:null,lastReviewedAt:null,reviewDueAt:null,primaryCareSteps:[{action:'Existing protocol action.'}],
};
const governance = shift.governance(fixture, now);
assert.equal(governance.eligible, false);
assert.ok(governance.reasons.includes('not-verified'));
assert.ok(governance.reasons.includes('missing-reviewer'));
assert.ok(governance.reasons.includes('missing-review-date'));

assert.match(loader, /emergency-shift-governance-v18\.css\?v=\$\{SHIFT_VERSION\}/);
assert.match(loader, /emergency-shift-governance-v18\.js\?v=\$\{SHIFT_VERSION\}/);
assert.ok(loader.indexOf('emergency-verification-queue-v14.js') < loader.indexOf('emergency-shift-governance-v18.js'), 'Governance summary should load after the reviewer queue host.');
assert.match(loader, /authUser\?\.adminConsole !== true/);
assert.match(loader, /searchParams\.get\('review'\) === '1'/);

assert.match(ui, /READY FOR SHIFT · GOVERNANCE/);
assert.match(ui, /Ky panel nuk aprovon asgjë/);
assert.match(ui, /Hape në Sanity/);
assert.match(ui, /missing-reviewer/);
assert.match(ui, /missing-review-date/);
assert.match(ui, /review-overdue/);
assert.match(ui, /MedIndexEmergencyShiftV18/);
assert.match(ui, /MEDINDEX_AUTH_READY/);
assert.match(ui, /authUser\?\.adminConsole !== true/);
assert.doesNotMatch(ui, /patch_documents|create_documents|reviewStatus\s*=|fetch\(|XMLHttpRequest|gemini|generative/i, 'Governance summary must be read-only and must not call external AI/network services.');
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Emergency Ready for Shift v18 reviewer governance summary contract passed.');
