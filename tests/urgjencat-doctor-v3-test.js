'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('urgjencat.html');
const v2 = read('emergency-doctor-ux-v2.js');
const v3 = read('emergency-doctor-ux-v3.js');
const css = read('emergency-doctor-ux-v3.css');
const learning = read('emergency-summary-learn.js');
const v4 = read('emergency-learning-v4.js');
const v4css = read('emergency-learning-v4.css');
const v5 = read('emergency-trainers-v5.js');
const v5css = read('emergency-trainers-v5.css');
const v6 = read('emergency-readiness-v6.js');
const v6css = read('emergency-readiness-v6.css');
const v8 = read('emergency-smart-search-v8.js');
const v8css = read('emergency-smart-search-v8.css');
const searchCore = require('../emergency-search-core-v8.js');

assert.match(html, /emergency-doctor-ux-v3\.css\?v=20260823-1/);
assert.match(html, /emergency-doctor-ux-v3\.js\?v=20260823-1/);
assert.match(html, /emergency-learning-v4\.css\?v=20260824-1/);
assert.match(html, /emergency-learning-v4\.js\?v=20260824-1/);
assert.match(html, /emergency-trainers-v5\.css\?v=20260824-1/);
assert.match(html, /emergency-trainers-v5\.js\?v=20260824-1/);
assert.match(html, /emergency-readiness-v6\.css\?v=20260824-1/);
assert.match(html, /emergency-readiness-v6\.js\?v=20260824-1/);
assert.match(html, /emergency-smart-search-v8\.css\?v=20260824-1/);
assert.match(html, /emergency-search-core-v8\.js\?v=20260824-1/);
assert.match(html, /emergency-smart-search-v8\.js\?v=20260824-1/);
assert.doesNotMatch(html, /emergency-smart-search-v7\.(?:js|css)/);
assert.ok(
  html.indexOf('emergency-doctor-ux-v2.js') < html.indexOf('emergency-doctor-keyboard-v2.js')
  && html.indexOf('emergency-doctor-keyboard-v2.js') < html.indexOf('emergency-doctor-ux-v3.js')
  && html.indexOf('emergency-doctor-ux-v3.js') < html.indexOf('emergency-learning-v4.js')
  && html.indexOf('emergency-learning-v4.js') < html.indexOf('emergency-trainers-v5.js')
  && html.indexOf('emergency-trainers-v5.js') < html.indexOf('emergency-search-core-v8.js')
  && html.indexOf('emergency-search-core-v8.js') < html.indexOf('emergency-smart-search-v8.js')
  && html.indexOf('emergency-smart-search-v8.js') < html.indexOf('emergency-readiness-v6.js'),
  'Physician v8 must load the search core before the UI and before readiness.',
);
assert.ok(
  html.indexOf('emergency-readiness-v6.css') < html.indexOf('tailadmin-professional.css')
  && html.indexOf('emergency-smart-search-v8.css') < html.indexOf('tailadmin-professional.css'),
  'TailAdmin professional remains the final canonical stylesheet.',
);

assert.match(v3, /Rruga klinike/);
assert.match(v3, /Vepro shpejt/);
assert.match(v3, /dataset\.ckRouteStep/);
assert.match(css, /attr\(data-ck-route-step\)/);
assert.match(v3, /ck-doctor-nav-count/);
assert.match(v3, /ArrowLeft/);
assert.match(v3, /ArrowRight/);
assert.match(v3, /Home/);
assert.match(v3, /End/);
assert.match(v3, /preventScroll: true/);
assert.match(v3, /medindex_emergency_flashcards_v3meta:/);
assert.match(v3, /misses/);
assert.match(v3, /ratings/);
assert.match(v3, /function nextPriority/);
assert.match(v3, /data-ck-flash-hard-review/);
assert.match(v3, /aria-live/);
assert.match(v3, /MutationObserver/);
assert.match(css, /\.ck-doctor-jumpbar button::before/);
assert.match(css, /\.ck-flash-v3-session/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /html\[data-theme="dark"\]/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(css, /font-size:(?:7|8|9)(?:\.\d+)?px/);

assert.match(learning, /item\.primaryCareSteps/);
assert.match(learning, /item\.secondaryCareSteps/);
assert.match(learning, /item\.redFlags/);
assert.match(learning, /item\.doNotDo/);
assert.match(learning, /item\.referral/);
assert.doesNotMatch(v3, /primaryCareSteps|secondaryCareSteps|dose|dosage|mg\/kg|adrenalin|epinefrin/i);
assert.match(v2, /data-ck-doctor-nav/);

assert.match(v4, /Testo veten/);
assert.match(v4, /Mëso hap pas hapi/);
assert.match(v4, /ck-v4-cockpit/);
assert.match(v4, /RED FLAGS/);
assert.match(v4, /REFERIMI/);
assert.match(v4, /medindex_emergency_flashcards_v4schedule:/);
assert.match(v4, /scheduleRating/);
assert.match(v4, /localStorage/);
assert.match(v4, /Përsërite/);
assert.match(v4, /Vështirë/);
assert.match(v4, /Shumë e lehtë/);
assert.match(v4, /Hape pjesën në mësim/);
assert.match(v4, /Nga protokolli/);
assert.match(v4css, /\.ck-v4-cockpit/);
assert.match(v4css, /\.ck-v4-test-head/);
assert.match(v4css, /@media\(max-width:760px\)/);
assert.match(v4css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(v4, /mg\/kg|adrenalin|epinefrin|nalokson|atropin|amiodaron|adenozin/i);

assert.match(v5, /Smart review/);
assert.match(v5, /Case klinik/);
assert.match(v5, /DOSE TRAINER/);
assert.match(v5, /maskedDoseText/);
assert.match(v5, /primaryCareSteps/);
assert.match(v5, /secondaryCareSteps/);
assert.match(v5, /Teksti i saktë nga protokolli/);
assert.match(v5css, /\.ck-v5-session-bar/);
assert.match(v5css, /\.ck-v5-trainers/);
assert.match(v5css, /@media\(max-width:760px\)/);
assert.doesNotMatch(v5, /adrenalin|epinefrin|nalokson|atropin|amiodaron|adenozin/i);

assert.match(v6, /PARA NDËRRIMIT/);
assert.match(v6, /Review kritik/);
assert.match(v6, /reviewStatus \|\| ''\) === 'verified'/);
assert.match(v6, /CRITICAL_LEVELS/);
assert.match(v6, /Fillo review/);
assert.match(v6, /Tjetra kritike/);
assert.match(v6, /Nuk është vlerësim i kompetencës klinike/);
assert.match(v6css, /\.ck-v6-readiness/);
assert.match(v6css, /\.ck-v6-progress/);
assert.match(v6css, /@media\(max-width:760px\)/);
assert.doesNotMatch(v6, /mg\/kg|adrenalin|epinefrin|nalokson|atropin|amiodaron|adenozin/i);

assert.match(v8, /MedIndexEmergencySearchCore/);
assert.match(v8, /medindex_emergency_search_usage_v1/);
assert.match(v8, /Përputhen/);
assert.match(v8, /Nuk është diagnozë automatike/);
assert.match(v8, /Të shpeshtat/);
assert.match(v8, /aria-activedescendant/);
assert.match(v8, /ArrowDown/);
assert.match(v8, /ArrowUp/);
assert.match(v8, /Enter/);
assert.match(v8, /localStorage/);
assert.match(v8css, /\.ck-v8-smart-results/);
assert.match(v8css, /\.ck-v8-match/);
assert.match(v8css, /\.ck-v8-frequent/);
assert.match(v8css, /@media\(max-width:760px\)/);
assert.match(v8css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(v8, /gemini|generative|fetch\(|XMLHttpRequest/i);

const fixtures = [
  {
    _id:'ana', title:'Anafilaksia', aliases:['reaksion alergjik i rëndë'], icdCodes:['T78.2'],
    category:'Alergologji', triageLevel:'critical', reviewStatus:'verified',
    summary:'Reaksion akut me urtikarie, wheezing dhe hipotension.',
    redFlags:['Edemë e rrugëve të frymëmarrjes', 'Hipotension'],
    primaryCareSteps:[{title:'Vlerësimi fillestar', action:'Vlerëso rrugët e frymëmarrjes dhe qarkullimin.'}],
  },
  {
    _id:'hypo', title:'Hipoglikemia e rëndë', aliases:['sheqer i ulët'], icdCodes:['E16.2'],
    category:'Endokrinologji', triageLevel:'critical', reviewStatus:'verified',
    summary:'Djersitje, tremor, konfuzion ose alterim i vetëdijes.',
    primaryCareSteps:[{title:'Vlerësimi', action:'Kontrollo glukozën dhe gjendjen e vetëdijes.'}],
  },
  {
    _id:'stemi', title:'STEMI', aliases:['infarkt akut i miokardit'], icdCodes:['I21.3'],
    category:'Kardiologji', triageLevel:'very-urgent', reviewStatus:'verified',
    summary:'Dhimbje gjoksi me ndryshime akute në EKG.',
  },
  {
    _id:'asthma', title:'Astma akute', aliases:['krizë astme'], icdCodes:['J45'],
    category:'Pulmologji', triageLevel:'urgent', reviewStatus:'review',
    summary:'Dispne, wheezing dhe përdorim i muskujve aksesorë.',
  },
];

assert.equal(searchCore.rank(fixtures, 'Anafilaksia')[0]?.item?._id, 'ana', 'Exact diagnosis must rank first.');
assert.equal(searchCore.rank(fixtures, 'T78.2')[0]?.item?._id, 'ana', 'Exact ICD must rank first.');
assert.equal(searchCore.rank(fixtures, 'anaflaksi')[0]?.item?._id, 'ana', 'One-character typo must still find anaphylaxis.');
assert.equal(searchCore.rank(fixtures, 'urtikarie hipotension')[0]?.item?._id, 'ana', 'Multiple matching clinical signs must rank anaphylaxis first.');
assert.deepEqual(
  searchCore.rank(fixtures, 'urtikarie hipotension')[0]?.clinicalTerms,
  ['urtikarie','hipotension'],
  'The UI explanation must expose only query terms that occur in indexed clinical content.',
);
assert.equal(searchCore.rank(fixtures, 'sheqer tremor')[0]?.item?._id, 'hypo', 'Mixed alias + symptom query must find severe hypoglycemia.');
assert.equal(searchCore.rank(fixtures, 'I21.3')[0]?.item?._id, 'stemi', 'STEMI ICD lookup must work.');
assert.equal(searchCore.rank(fixtures, 'tekst krejt i palidhur').length, 0, 'Unrelated text must not force a clinical result.');
const usage = {hypo:{count:20,lastAt:Date.now()}};
assert.equal(searchCore.rank(fixtures, 'Anafilaksia', usage)[0]?.item?._id, 'ana', 'Personal frequency must not overpower an exact diagnosis match.');

console.log('Urgjencat physician-first UX + verified learning + explainable smart search v8 regression contract passed.');
