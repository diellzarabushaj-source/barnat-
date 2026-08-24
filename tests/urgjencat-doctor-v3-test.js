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

assert.match(html, /emergency-doctor-ux-v3\.css\?v=20260823-1/);
assert.match(html, /emergency-doctor-ux-v3\.js\?v=20260823-1/);
assert.match(html, /emergency-learning-v4\.css\?v=20260824-1/);
assert.match(html, /emergency-learning-v4\.js\?v=20260824-1/);
assert.ok(
  html.indexOf('emergency-doctor-ux-v2.js') < html.indexOf('emergency-doctor-keyboard-v2.js')
  && html.indexOf('emergency-doctor-keyboard-v2.js') < html.indexOf('emergency-doctor-ux-v3.js')
  && html.indexOf('emergency-doctor-ux-v3.js') < html.indexOf('emergency-learning-v4.js'),
  'Physician v4 must load after the stable v2, keyboard and v3 layers.',
);
assert.ok(
  html.indexOf('emergency-learning-v4.css') < html.indexOf('tailadmin-professional.css'),
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

console.log('Urgjencat physician-first UX v3 + learning workspace v4 regression contract passed.');
