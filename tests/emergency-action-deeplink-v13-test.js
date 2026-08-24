'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const actionSearch = require('../emergency-action-search-core-v12.js');
const deepLink = require('../emergency-action-deeplink-core-v13.js');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'urgjencat.html'), 'utf8');
const ui12 = fs.readFileSync(path.join(ROOT, 'emergency-action-search-v12.js'), 'utf8');
const ui13 = fs.readFileSync(path.join(ROOT, 'emergency-action-deeplink-v13.js'), 'utf8');
const css13 = fs.readFileSync(path.join(ROOT, 'emergency-action-deeplink-v13.css'), 'utf8');

const source = {title:'Guideline', url:'https://example.org/guideline'};
const fixtures = [
  {
    _id:'ready', title:'Anafilaksia', slug:'anafilaksia', reviewStatus:'verified', version:'2.0', sources:[source],
    primaryCareSteps:[{title:'Trajtimi i parë', action:'Veprimi i dokumentuar në protokoll.'}],
    redFlags:['Hipotension'],
  },
  {
    _id:'review', title:'Në verifikim', slug:'ne-verifikim', reviewStatus:'review', version:'1.0', sources:[source],
    primaryCareSteps:[{title:'Hapi', action:'Nuk duhet të jetë i hapshëm direkt.'}],
  },
  {
    _id:'noversion', title:'Pa version', reviewStatus:'verified', sources:[source],
    primaryCareSteps:[{title:'Hapi', action:'Tekst.'}],
  },
  {
    _id:'nosource', title:'Pa burim', reviewStatus:'verified', version:'1.0',
    primaryCareSteps:[{title:'Hapi', action:'Tekst.'}],
  },
  {
    _id:'empty', title:'Pa hapa', reviewStatus:'verified', version:'1.0', sources:[source],
  },
];

const report = deepLink.audit(fixtures);
assert.equal(report.total, 5);
assert.equal(report.ready, 1);
assert.equal(report.verified, 4);
assert.equal(report.inReview, 1);
assert.equal(report.missingVersion, 1);
assert.equal(report.missingSource, 1);
assert.equal(report.noActionContent, 1);
assert.deepEqual(deepLink.readiness(fixtures[1]).reasons, ['not-verified']);
assert.ok(deepLink.readiness(fixtures[2]).reasons.includes('missing-version'));
assert.ok(deepLink.readiness(fixtures[3]).reasons.includes('missing-source'));
assert.ok(deepLink.readiness(fixtures[4]).reasons.includes('no-action-content'));

const entries = actionSearch.buildEntries(fixtures);
const action = entries.find(entry => entry.itemId === 'ready' && entry.kind === 'primary');
assert.ok(action, 'Verified protocol should produce a stable action entry.');
assert.equal(deepLink.resolveAction(fixtures, action.id, actionSearch)?.id, action.id);
assert.equal(deepLink.resolveAction(fixtures, 'review:primary:0', actionSearch), null, 'Non-verified action links must fail closed.');

const withAction = deepLink.setActionUrl('/urgjencat.html?chapter=abc', action);
assert.match(withAction, /emergency=anafilaksia/);
assert.match(withAction, /action=ready%3Aprimary%3A0/);
assert.equal(deepLink.actionFromUrl(withAction), action.id);
assert.equal(deepLink.actionFromUrl(deepLink.clearActionUrl(withAction)), '');
assert.match(deepLink.clearActionUrl(withAction), /chapter=abc/);

assert.match(html, /emergency-action-deeplink-v13\.css\?v=20260824-1/);
assert.match(html, /emergency-action-deeplink-core-v13\.js\?v=20260824-1/);
assert.match(html, /emergency-action-deeplink-v13\.js\?v=20260824-1/);
assert.ok(html.indexOf('emergency-action-deeplink-v13.css') < html.indexOf('tailadmin-professional.css'), 'TailAdmin professional must remain the final static stylesheet.');
assert.ok(html.indexOf('emergency-action-search-core-v12.js') < html.indexOf('emergency-action-deeplink-core-v13.js'), 'V13 core should load after the verified action-search core.');
assert.ok(html.indexOf('emergency-action-search-v12.js') < html.indexOf('emergency-action-deeplink-v13.js'), 'V13 browser integration should load after action-search UI events exist.');

assert.match(ui12, /medindex:emergency-action-opened/);
assert.match(ui12, /medindex:emergency-action-open/);
assert.match(ui13, /MedIndexEmergencyActionAuditV13/);
assert.match(ui13, /protokollet janë ende në verifikim/);
assert.match(ui13, /linku i hapit nuk është i disponueshëm pa verifikim klinik/);
assert.match(ui13, /history\.replaceState/);
assert.doesNotMatch(ui13, /fetch\(|XMLHttpRequest|gemini|generative/i);
assert.match(css13, /data-ck-v13-ready="true"/);
assert.match(css13, /@media\(max-width:760px\)/);

console.log('Emergency action URL deep links + live readiness audit v13 contract passed.');