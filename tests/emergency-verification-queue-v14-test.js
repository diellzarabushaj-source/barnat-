'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const queue = require('../emergency-verification-queue-core-v14.js');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'urgjencat.html'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'emergency-verification-queue-v14.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'emergency-verification-queue-v14.css'), 'utf8');
const source = {title:'Guideline', url:'https://example.org/guideline', year:'2026'};

const fixtures = [
  {
    _id:'critical-review', title:'Anafilaksia', slug:'anafilaksia', triageLevel:'critical', reviewStatus:'review', version:'2.0', sources:[source],
    primaryCareSteps:[{title:'Veprimi',action:'Jep terapinë e verifikuar 0.5 mg IM sipas burimit.'}],
    redFlags:['Hipotension'], doNotDo:['Mos vono trajtimin.'],
    referral:{when:'Menjëherë',destination:'Urgjenca',handover:'Handover i strukturuar'},
  },
  {
    _id:'urgent-review', title:'Plagë', slug:'plage', triageLevel:'urgent', reviewStatus:'review', version:'1.0', sources:[source],
    primaryCareSteps:[{title:'Veprimi',action:'Kontrollo gjakderdhjen.'}],
    redFlags:['Hemorragji'], doNotDo:['Mos mbyll pa vlerësim.'], referral:{when:'Sipas rrezikut',destination:'Urgjenca'},
  },
  {
    _id:'blocked', title:'Pa burim', triageLevel:'critical', reviewStatus:'review', version:'1.0',
    primaryCareSteps:[{title:'Veprimi',action:'Tekst.'}], redFlags:['Shenjë'], doNotDo:['Mos.'], referral:{when:'Menjëherë'},
  },
  {
    _id:'draft', title:'Draft', triageLevel:'critical', reviewStatus:'draft', version:'0.1', sources:[source],
    primaryCareSteps:[{title:'Veprimi',action:'Tekst.'}], redFlags:['Shenjë'], doNotDo:['Mos.'], referral:{when:'Menjëherë'},
  },
  {
    _id:'verified', title:'Verified', triageLevel:'critical', reviewStatus:'verified', version:'1.0', sources:[source],
    primaryCareSteps:[{title:'Veprimi',action:'Tekst.'}], redFlags:['Shenjë'], doNotDo:['Mos.'], referral:{when:'Menjëherë'},
  },
];

const summary = queue.summary(fixtures);
assert.equal(summary.total, 5);
assert.equal(summary.verified, 1);
assert.equal(summary.pending, 3, 'Only review-status protocols belong in the verification queue.');
assert.equal(summary.structurallyReady, 2);
assert.equal(summary.blocked, 1);
assert.equal(summary.criticalPending, 2);
assert.equal(summary.otherUnverified, 1, 'Drafts stay outside the clinical verification queue.');

const rows = queue.queue(fixtures);
assert.equal(rows.length, 3);
assert.equal(rows.some(row => row.id === 'draft'), false, 'Draft protocols must not be presented as ready for review.');
assert.equal(rows[0].id, 'critical-review', 'Critical structurally ready protocols should lead the review queue.');
assert.equal(rows[1].id, 'blocked', 'Blocked critical protocol should remain ahead of lower-triage items.');
assert.ok(rows[0].checklist.some(item => item.id === 'doses'), 'Dose review should appear only when protocol text contains a numeric dose/unit string.');
assert.equal(rows[1].structurallyReady, false);
assert.ok(rows[1].structuralIssues.includes('missing-source'));
assert.equal(queue.hasDoseLikeContent(fixtures[1]), false);
assert.equal(queue.reviewKey(fixtures[0]), 'critical-review:2.0');
assert.deepEqual(queue.sourceRows(fixtures[0])[0], source);
assert.match(queue.studioIntent('https://studio.example/', fixtures[0]), /intent\/edit\/id=critical-review;type=emergencyProtocol$/);

assert.match(html, /emergency-verification-queue-v14\.css\?v=20260824-1/);
assert.match(html, /emergency-verification-queue-core-v14\.js\?v=20260824-1/);
assert.match(html, /emergency-verification-queue-v14\.js\?v=20260824-1/);
assert.ok(html.indexOf('emergency-verification-queue-v14.css') < html.indexOf('tailadmin-professional.css'), 'TailAdmin professional must remain the final stylesheet.');
assert.ok(html.indexOf('emergency-verification-queue-core-v14.js') < html.indexOf('emergency-verification-queue-v14.js'), 'Verification queue core must load before its browser UI.');
assert.match(ui, /searchParams\.get\('review'\) === '1'/, 'Reviewer queue must stay out of the normal bedside hot path unless review=1 is explicit.');
assert.match(ui, /MEDINDEX_AUTH_READY/);
assert.match(ui, /authUser\?\.adminConsole !== true/);
assert.match(ui, /authState\?\.offline === true/);
assert.match(ui, /Panel vetëm për administratorin/);
assert.match(ui, /medindex_emergency_verification_v14:/);
assert.match(ui, /ck-v14-sources/);
assert.match(ui, /nuk<\/strong> e ndryshon statusin klinik/);
assert.match(ui, /Hape në Sanity për aprovim/);
assert.match(ui, /Gati për vendim klinik/);
assert.doesNotMatch(ui, /patch_documents|reviewStatus\s*=|fetch\(|XMLHttpRequest|gemini|generative/i, 'Reviewer UI must never self-approve or call external AI/network services.');
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Emergency admin-only clinical verification queue v14 contract passed.');
