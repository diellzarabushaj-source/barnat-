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
const v7 = read('emergency-smart-search-v7.js');
const v7css = read('emergency-smart-search-v7.css');

assert.match(html, /emergency-doctor-ux-v3\.css\?v=20260823-1/);
assert.match(html, /emergency-doctor-ux-v3\.js\?v=20260823-1/);
assert.match(html, /emergency-learning-v4\.css\?v=20260824-1/);
assert.match(html, /emergency-learning-v4\.js\?v=20260824-1/);
assert.match(html, /emergency-trainers-v5\.css\?v=20260824-1/);
assert.match(html, /emergency-trainers-v5\.js\?v=20260824-1/);
assert.match(html, /emergency-readiness-v6\.css\?v=20260824-1/);
assert.match(html, /emergency-readiness-v6\.js\?v=20260824-1/);
assert.match(html, /emergency-smart-search-v7\.css\?v=20260824-1/);
assert.match(html, /emergency-smart-search-v7\.js\?v=20260824-1/);
assert.ok(
  html.indexOf('emergency-doctor-ux-v2.js') < html.indexOf('emergency-doctor-keyboard-v2.js')
  && html.indexOf('emergency-doctor-keyboard-v2.js') < html.indexOf('emergency-doctor-ux-v3.js')
  && html.indexOf('emergency-doctor-ux-v3.js') < html.indexOf('emergency-learning-v4.js')
  && html.indexOf('emergency-learning-v4.js') < html.indexOf('emergency-trainers-v5.js')
  && html.indexOf('emergency-trainers-v5.js') < html.indexOf('emergency-smart-search-v7.js')
  && html.indexOf('emergency-smart-search-v7.js') < html.indexOf('emergency-readiness-v6.js'),
  'Physician v7 must load after v5 and before the readiness overlay.',
);
assert.ok(
  html.indexOf('emergency-readiness-v6.css') < html.indexOf('tailadmin-professional.css')
  && html.indexOf('emergency-smart-search-v7.css') < html.indexOf('tailadmin-professional.css'),
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
assert.match(v3, /round/);
assert.match(v3, /function nextPriority/);
assert.match(v3, /meta\.misses\[state\.index\]/);
assert.match(v3, /data-ck-flash-hard-review/);
assert.match(v3, /Rishiko/);
assert.match(v3, /U ruajt për përsëritje/);
assert.match(v3, /E shënuar si e ditur/);
assert.match(v3, /event\.stopImmediatePropagation\(\)/);
assert.match(v3, /refreshLearn\(\)/);
assert.match(v3, /aria-live/);
assert.match(v3, /MutationObserver/);

assert.match(css, /\.ck-doctor-jumpbar button::before/);
assert.match(css, /\.ck-doctor-nav-count/);
assert.match(css, /\.ck-flash-v3-session/);
assert.match(css, /\.ck-flash-feedback/);
assert.match(css, /\.ck-flash-v3-cardmeta/);
assert.match(css, /\.ck-flash-hard-review/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /grid-template-columns:1fr 1fr/);
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
assert.match(v4css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(v4css, /\.ck-v4-cockpit/);
assert.match(v4css, /\.ck-v4-test-head/);
assert.match(v4css, /\.ck-v4-source-meta/);
assert.match(v4css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
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
assert.match(v5, /medindex_emergency_flashcards_v4schedule:/);
assert.match(v5css, /\.ck-v5-session-bar/);
assert.match(v5css, /\.ck-v5-trainers/);
assert.match(v5css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(v5css, /@media\(max-width:760px\)/);
assert.match(v5css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(v5, /adrenalin|epinefrin|nalokson|atropin|amiodaron|adenozin/i);

assert.match(v6, /PARA NDËRRIMIT/);
assert.match(v6, /Review kritik/);
assert.match(v6, /reviewStatus \|\| ''\) === 'verified'/);
assert.match(v6, /CRITICAL_LEVELS/);
assert.match(v6, /critical/);
assert.match(v6, /very-urgent/);
assert.match(v6, /Fillo review/);
assert.match(v6, /Tjetra kritike/);
assert.match(v6, /Nuk është vlerësim i kompetencës klinike/);
assert.match(v6, /medindex_emergency_flashcards_v4schedule:/);
assert.match(v6, /localStorage/);
assert.match(v6css, /\.ck-v6-readiness/);
assert.match(v6css, /\.ck-v6-queue-item/);
assert.match(v6css, /\.ck-v6-progress/);
assert.match(v6css, /@media\(max-width:760px\)/);
assert.match(v6css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(v6, /mg\/kg|adrenalin|epinefrin|nalokson|atropin|amiodaron|adenozin/i);

assert.match(v7, /medindex_emergency_search_usage_v1/);
assert.match(v7, /function levenshtein/);
assert.match(v7, /meaningfulTokens/);
assert.match(v7, /primaryCareSteps/);
assert.match(v7, /redFlags/);
assert.match(v7, /aliases/);
assert.match(v7, /icdCodes/);
assert.match(v7, /Diagnozë e saktë/);
assert.match(v7, /Shenja \/ përmbajtje/);
assert.match(v7, /aria-activedescendant/);
assert.match(v7, /ArrowDown/);
assert.match(v7, /ArrowUp/);
assert.match(v7, /Enter/);
assert.match(v7, /localStorage/);
assert.match(v7css, /\.ck-v7-smart-results/);
assert.match(v7css, /\.ck-v7-result-main/);
assert.match(v7css, /@media\(max-width:760px\)/);
assert.match(v7css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(v7, /gemini|generative|fetch\(|XMLHttpRequest/i);

console.log('Urgjencat physician-first UX v3 + learning v4 + trainers v5 + critical review v6 + smart search v7 regression contract passed.');
