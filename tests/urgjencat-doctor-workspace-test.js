'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('urgjencat.html');
const core = read('urgjencat.js');
const doctor = read('emergency-doctor-mode.js');
const assist = read('emergency-directory-assist.js');
const priority = read('emergency-directory-priority.js');
const triageFilter = read('emergency-triage-filter.js');
const triageFilterCss = read('emergency-triage-filter.css');
const assistCss = read('emergency-directory-assist.css');
const timeline = read('emergency-clinician-timeline.js');
const timelineCss = read('emergency-clinician-timeline.css');
const safetyCss = read('emergency-doctor-safety.css');

assert.ok(
  html.indexOf('sanity-clinical-client.js') < html.indexOf('urgjencat.js'),
  'Sanity client must load before the emergency workspace.',
);
assert.ok(
  html.indexOf('urgjencat.js') < html.indexOf('emergency-doctor-mode.js')
  && html.indexOf('emergency-doctor-mode.js') < html.indexOf('emergency-directory-assist.js')
  && html.indexOf('emergency-directory-assist.js') < html.indexOf('emergency-directory-priority.js')
  && html.indexOf('emergency-directory-priority.js') < html.indexOf('emergency-triage-filter.js')
  && html.indexOf('emergency-triage-filter.js') < html.indexOf('emergency-clinician-timeline.js'),
  'Clinician enhancements must run after the core Sanity renderer in deterministic order.',
);
assert.match(html, /emergency-directory-assist\.css\?v=20260818-2/);
assert.match(html, /emergency-directory-assist\.js\?v=20260818-2/);
assert.match(html, /emergency-directory-priority\.js\?v=20260818-1/);
assert.match(html, /emergency-triage-filter\.css\?v=20260818-1/);
assert.match(html, /emergency-triage-filter\.js\?v=20260818-1/);
assert.match(html, /emergency-clinician-timeline\.css\?v=20260818-1/);
assert.match(html, /emergency-clinician-timeline\.js\?v=20260818-1/);

assert.match(core, /reviewStatus != "archived"/);
assert.match(core, /reviewStatus,reviewedBy,lastReviewedAt,reviewDueAt,version/);
assert.match(core, /Burimi &amp; verifikimi/);
assert.match(core, /Shenjat alarmuese/);
assert.match(core, /Çfarë të mos bëhet/);
assert.match(core, /Para transferimit/);

assert.match(doctor, /Pamja e mjekut · 10 sekonda/);
assert.match(doctor, /Ky dokument nuk ka ende status “Verifikuar”/);
assert.match(doctor, /Kopjo handover/);
assert.match(doctor, /Veprimi tani/);
assert.match(doctor, /Red flags/);
assert.match(doctor, /Burimi & verifikimi/);

assert.match(assist, /META_QUERY/);
assert.match(assist, /"sourceCount":count\(sources\)/);
assert.match(assist, /sources\[\]\{title,url,publishedAt\}/);
assert.match(assist, /Për verifikim/);
assert.match(assist, /Pa burime/);
assert.match(assist, /Rishikim i vonuar/);
assert.match(assist, /event\.key === 'ArrowDown'/);
assert.match(assist, /event\.key === 'ArrowUp'/);
assert.match(assist, /Kopjo protokollin/);
assert.match(assist, /jo handover specifik i pacientit/);
assert.match(assist, /Publikuar:/);

assert.match(priority, /TRIAGE_RANK/);
assert.match(priority, /critical: 0/);
assert.match(priority, /'very-urgent': 1/);
assert.match(priority, /urgent: 2/);
assert.match(priority, /localeCompare/);
assert.match(priority, /Renditja sipas triazhit|renditja sipas triazhit/i);

assert.match(triageFilter, /triageLevel/);
assert.match(triageFilter, /value: 'critical'/);
assert.match(triageFilter, /value: 'very-urgent'/);
assert.match(triageFilter, /value: 'urgent'/);
assert.match(triageFilter, /role="group"/);
assert.match(triageFilter, /aria-pressed/);
assert.match(triageFilter, /sessionStorage/);
assert.match(triageFilter, /MutationObserver/);
assert.match(triageFilter, /button\.hidden = !matches/);
assert.match(triageFilter, /Filtro listën pa ndryshuar përmbajtjen e protokollit/);
assert.match(triageFilterCss, /ck-triage-filter-group/);
assert.match(triageFilterCss, /overflow-x:auto/);
assert.match(triageFilterCss, /button\[aria-pressed="true"\]/);
assert.match(triageFilterCss, /min-height:36px/);

assert.match(timeline, /0–1 min/);
assert.match(timeline, /1–5 min/);
assert.match(timeline, /Pas stabilizimit/);
assert.match(timeline, /Nuk ka hap të etiketuar “Menjëherë”/);
assert.match(timeline, /nuk shtohen veprime të supozuara/);
assert.match(timeline, /Rendi klinik mbetet ai i dokumentit në Sanity/);
assert.match(timeline, /ck-doctor-redflags/);
assert.match(timeline, /ck-doctor-referral/);
assert.match(timelineCss, /ck-time-phase\.is-zero/);
assert.match(timelineCss, /ck-time-phase\.is-five/);
assert.match(timelineCss, /ck-time-phase\.is-after/);

assert.match(assistCss, /ck-directory-review\.is-verified/);
assert.match(assistCss, /ck-directory-review\.is-draft/);
assert.match(assistCss, /ck-directory-source-count\.has-no-sources/);
assert.match(safetyCss, /ck-doctor-review-warning/);

console.log('Urgjencat doctor-first safety workspace contract passed.');
