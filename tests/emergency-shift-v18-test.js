'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shift = require('../emergency-shift-core-v18.js');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'urgjencat.html'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'emergency-shift-v18.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'emergency-shift-v18.css'), 'utf8');
const now = Date.parse('2026-08-25T08:00:00Z');
const source = {title:'Guideline', url:'https://example.org/guideline'};

const ready = {
  _id:'ana', title:'Anafilaksia', triageLevel:'critical', reviewStatus:'verified', version:'2.0', sources:[source],
  reviewedBy:'Dr Reviewer', lastReviewedAt:'2026-08-20T10:00:00Z', reviewDueAt:'2026-09-20T10:00:00Z',
  primaryCareSteps:[{_key:'a1',title:'Hapi i parë',action:'Veprimi ekzakt nga protokolli.'}],
  redFlags:['Red flag ekzakt nga protokolli.'],
  doNotDo:['Mos bëj ekzakt nga protokolli.'],
  referral:{when:'Refero tani sipas protokollit.',destination:'Urgjenca spitalore.'},
};
const second = {
  ...ready, _id:'status', title:'Status epilepticus', triageLevel:'very-urgent',
  primaryCareSteps:[{_key:'s1',title:'ABC',action:'ABC ekzakt nga protokolli.'}],
};
const stale = {...ready,_id:'stale',reviewDueAt:'2026-08-01T00:00:00Z'};
const noReviewer = {...ready,_id:'no-reviewer',reviewedBy:''};
const nonCritical = {...ready,_id:'routine',triageLevel:'urgent'};
const inReview = {...ready,_id:'review',reviewStatus:'review'};

assert.equal(shift.governance(ready, now).eligible, true);
assert.ok(shift.governance(stale, now).reasons.includes('review-overdue'));
assert.ok(shift.governance(noReviewer, now).reasons.includes('missing-reviewer'));
assert.ok(shift.governance(nonCritical, now).reasons.includes('not-critical'));
assert.ok(shift.governance(inReview, now).reasons.includes('not-verified'));

const questions = shift.questionsForItem(ready);
assert.equal(questions[0].kind, 'firstAction');
assert.equal(questions[0].answer, ready.primaryCareSteps[0].action, 'Shift review must use the exact verified protocol action.');
assert.equal(questions.find(row => row.kind === 'redFlag')?.answer, ready.redFlags[0]);
assert.equal(questions.find(row => row.kind === 'doNotDo')?.answer, ready.doNotDo[0]);
assert.equal(questions.find(row => row.kind === 'referralWhen')?.answer, ready.referral.when);
assert.equal(questions.find(row => row.kind === 'referralDestination')?.answer, ready.referral.destination);

const session = shift.buildSession([ready,second,stale,noReviewer,nonCritical,inReview], {
  now, limit:6, priorityById:{status:50,ana:10},
});
assert.equal(session.eligibleCount, 2);
assert.equal(session.questions.length, 6);
assert.equal(session.questions[0].protocolId, 'status', 'Existing learning priority may order protocols but cannot change clinical answers.');
assert.equal(session.questions[1].protocolId, 'ana', 'Question generation should rotate across eligible protocols.');
assert.ok(session.questions.every(row => ['ana','status'].includes(row.protocolId)));
assert.ok(session.questions.length <= 12);

assert.match(html, /emergency-shift-v18\.css\?v=20260825-1/);
assert.match(html, /emergency-shift-core-v18\.js\?v=20260825-1/);
assert.match(html, /emergency-shift-v18\.js\?v=20260825-1/);
assert.ok(html.indexOf('emergency-shift-v18.css') < html.indexOf('tailadmin-professional.css'), 'TailAdmin professional must remain the final stylesheet.');
assert.ok(html.indexOf('emergency-shift-core-v18.js') < html.indexOf('emergency-shift-v18.js'), 'Shift core must load before its browser UI.');
assert.ok(html.indexOf('emergency-readiness-v6.js') < html.indexOf('emergency-shift-v18.js'), 'Ready for Shift should enhance the existing critical readiness panel.');

assert.match(ui, /Ready for Shift/);
assert.match(ui, /medindex_emergency_shift_v18/);
assert.match(ui, /medindex_emergency_flashcards_v4schedule:/);
assert.match(ui, /jo vlerësim i kompetencës klinike/);
assert.match(ui, /nuk gjeneron trajtim me AI/);
assert.match(ui, /medindex:emergency-action-open/);
assert.doesNotMatch(ui, /fetch\(|XMLHttpRequest|gemini|generativeLanguage|patch_documents/i, 'Ready for Shift must stay local and deterministic.');
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Emergency Ready for Shift v18 deterministic critical-session contract passed.');
