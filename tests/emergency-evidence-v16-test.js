'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const evidence = require('../emergency-evidence-core-v16.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('urgjencat.html');
const loader = read('emergency-review-loader-v16.js');
const ui = read('emergency-evidence-v16.js');
const css = read('emergency-evidence-v16.css');

const fixture = {
  _id:'review-1', title:'Protokoll në rishikim', version:'1.2', reviewStatus:'review',
  reviewedBy:'Dr Reviewer', lastReviewedAt:'2026-08-24', reviewDueAt:'2099-08-24',
  sources:[{
    _key:'src-1', title:'Guideline zyrtar', organization:'Shoqata profesionale',
    url:'https://example.org/guideline', publishedAt:'2026-01-15', note:'Kontrollo versionin aktiv.',
  }],
  primaryCareSteps:[{_key:'p1',title:'Vlerësimi fillestar',action:'Kryej vlerësimin e dokumentuar në protokoll.'}],
  redFlags:['Shenjë alarmuese e dokumentuar.'],
  doNotDo:['Mos anashkalo vlerësimin klinik.'],
  referral:{when:'Sipas gjendjes klinike.',destination:'Shërbimi përkatës',handover:'Handover i strukturuar.'},
};

const sources = evidence.sourceRows(fixture);
assert.equal(sources.length, 1);
assert.deepEqual(sources[0], {
  key:'src-1', title:'Guideline zyrtar', organization:'Shoqata profesionale',
  url:'https://example.org/guideline', publishedAt:'2026-01-15', note:'Kontrollo versionin aktiv.',
});

assert.equal(evidence.governance(fixture, Date.parse('2026-08-24T12:00:00Z')).ready, true);
const missing = evidence.governance({...fixture, reviewedBy:'', reviewDueAt:''}, Date.parse('2026-08-24T12:00:00Z'));
assert.ok(missing.reasons.includes('missing-reviewer'));
assert.ok(missing.reasons.includes('missing-review-due'));
const expired = evidence.governance({...fixture, reviewDueAt:'2025-01-01'}, Date.parse('2026-08-24T12:00:00Z'));
assert.equal(expired.overdue, true);
assert.ok(expired.reasons.includes('review-overdue'));

const packet = evidence.packet(fixture, Date.parse('2026-08-24T12:00:00Z'));
assert.equal(packet.provenanceLevel, 'protocol', 'Sources are protocol-level provenance, never implicit per-step citations.');
assert.equal(packet.governance.ready, true);
assert.ok(packet.blocks.some(row => row.path === 'primaryCareSteps[0].action' && row.text === fixture.primaryCareSteps[0].action));
assert.ok(packet.blocks.some(row => row.path === 'referral.handover' && row.text === fixture.referral.handover));
assert.equal(evidence.audit([fixture]).governanceReady, 1);

assert.match(html, /emergency-review-loader-v16\.js\?v=20260824-1/);
assert.doesNotMatch(html, /<link[^>]+emergency-(?:verification-queue-v14|consistency-v15|evidence-v16)\.css/);
assert.doesNotMatch(html, /<script[^>]+emergency-(?:verification-queue|consistency|evidence)(?:-core)?-v(?:14|15|16)\.js/);
const stylesheets = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(match => match[1]);
assert.match(stylesheets.at(-1), /^tailadmin-professional\.css/, 'TailAdmin professional must remain the final static stylesheet.');

assert.match(loader, /searchParams\.get\('review'\) === '1'/);
assert.match(loader, /MEDINDEX_AUTH_READY/);
assert.match(loader, /authenticated !== true/);
assert.match(loader, /offline === true/);
assert.match(loader, /authUser\?\.adminConsole !== true/);
assert.match(loader, /canonical\.parentNode\.insertBefore\(link, canonical\)/, 'Lazy reviewer CSS must stay before the canonical TailAdmin stylesheet.');
assert.ok(loader.indexOf('emergency-verification-queue-core-v14.js') < loader.indexOf('emergency-consistency-core-v15.js'));
assert.ok(loader.indexOf('emergency-consistency-core-v15.js') < loader.indexOf('emergency-evidence-core-v16.js'));
assert.ok(loader.indexOf('emergency-evidence-core-v16.js') < loader.indexOf('emergency-verification-queue-v14.js'));
assert.ok(loader.indexOf('emergency-verification-queue-v14.js') < loader.indexOf('emergency-consistency-v15.js'));
assert.ok(loader.indexOf('emergency-consistency-v15.js') < loader.indexOf('emergency-evidence-v16.js'));

assert.match(ui, /MedIndexSanity/);
assert.match(ui, /reviewedBy,lastReviewedAt,reviewDueAt/);
assert.match(ui, /Gjurmueshmëri në nivel protokolli/);
assert.match(ui, /Burimet janë në nivel protokolli/);
assert.match(ui, /nuk po lidh automatikisht një burim me një hap apo pohim specifik/);
assert.match(ui, /Ky panel nuk aprovon dhe nuk ndryshon Sanity/);
assert.doesNotMatch(ui, /patch_documents|reviewStatus\s*=|gemini|generative/i);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Emergency evidence traceability + admin lazy review v16 contract passed.');
