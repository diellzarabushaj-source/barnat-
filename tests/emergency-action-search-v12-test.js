'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const search = require('../emergency-action-search-core-v12.js');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'urgjencat.html'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'emergency-action-search-v12.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'emergency-action-search-v12.css'), 'utf8');

const source = {title:'Guideline',url:'https://example.org/guideline'};
const fixtures = [
  {
    _id:'ana', title:'Anafilaksia', aliases:['reaksion anafilaktik'], icdCodes:['T78.2'],
    reviewStatus:'verified', version:'3.1', sources:[source],
    primaryCareSteps:[
      {_key:'abc-step',title:'ABC',action:'Vlerëso menjëherë rrugët e frymëmarrjes dhe qarkullimin.'},
      {_key:'dose-step',title:'Trajtimi i parë',action:'Adrenalinë 0.5 mg IM sipas protokollit të verifikuar.'},
    ],
    redFlags:['Hipotension i rëndë'],
    doNotDo:['Mos vono trajtimin urgjent.'],
    referral:{when:'Refero pas stabilizimit sipas gjendjes.',destination:'Urgjenca spitalore',beforeTransfer:['Monitoro parametrat vitalë.'],handover:'Jep handover të strukturuar.'},
  },
  {
    _id:'status', title:'Status epilepticus', aliases:['kriza epileptike e zgjatur'],
    reviewStatus:'verified', version:'2.0', clinicalSources:[source],
    primaryCareSteps:[
      {_key:'first-step',title:'Hapi i parë',action:'Siguro ABC dhe mat glukozën.'},
      {_key:'therapy-step',title:'Trajtimi',action:'Jep terapinë e dokumentuar në protokoll.'},
    ],
  },
  {
    _id:'draft', title:'Protokoll draft', reviewStatus:'review', version:'1', sources:[source],
    primaryCareSteps:[{title:'Hapi',action:'Ky tekst nuk duhet të dalë në action search.'}],
  },
  {
    _id:'nosource', title:'Pa burim', reviewStatus:'verified', version:'1',
    primaryCareSteps:[{title:'Hapi',action:'As ky tekst nuk duhet të dalë.'}],
  },
];

const prepared = search.buildEntries(fixtures);
assert.ok(prepared.length > 0);
assert.equal(prepared.some(row => row.itemId === 'draft'), false, 'Non-verified protocols must fail closed.');
assert.equal(prepared.some(row => row.itemId === 'nosource'), false, 'Verified protocols without a source must fail closed.');
assert.ok(prepared.some(row => row.id === 'ana:primary:dose-step'), 'Sanity step _key must produce a reorder-stable action ID.');
assert.ok(prepared.some(row => row.kind === 'redFlag' && /^ana:redFlag:t[a-z0-9]+$/.test(row.id)), 'Scalar clinical rows should use a content fingerprint instead of an array index.');

let result = search.searchPrepared(prepared, 'doza adrenaline', {limit:3})[0];
assert.equal(result?.itemId, 'ana');
assert.equal(result?.kind, 'primary');
assert.equal(result?.id, 'ana:primary:dose-step');
assert.match(result?.text || '', /Adrenalin/i);

result = search.searchPrepared(prepared, 'çka jap në anafilaksi', {limit:3})[0];
assert.equal(result?.itemId, 'ana');
assert.equal(result?.kind, 'primary');

result = search.searchPrepared(prepared, 'status epilepticus first line', {limit:3})[0];
assert.equal(result?.itemId, 'status');
assert.equal(result?.kind, 'primary');
assert.equal(result?.index, 0, 'First-line intent should prefer the first verified primary step.');
assert.equal(result?.id, 'status:primary:first-step');

result = search.searchPrepared(prepared, 'red flags anafilaksi', {limit:3})[0];
assert.equal(result?.itemId, 'ana');
assert.equal(result?.kind, 'redFlag');

result = search.searchPrepared(prepared, 'referim anafilaksi', {limit:3})[0];
assert.equal(result?.itemId, 'ana');
assert.equal(result?.kind, 'referral');

assert.deepEqual(search.searchPrepared(prepared, 'tekst krejt i palidhur', {limit:3}), [], 'Unrelated text must not force a deep clinical action.');

assert.match(html, /emergency-action-search-v12\.css\?v=20260824-1/);
assert.match(html, /emergency-action-search-core-v12\.js\?v=20260824-2/);
assert.match(html, /emergency-action-search-v12\.js\?v=20260824-2/);
assert.ok(html.indexOf('emergency-action-search-v12.css') < html.indexOf('tailadmin-professional.css'), 'TailAdmin professional must remain the final canonical stylesheet.');
assert.ok(html.indexOf('emergency-action-search-core-v12.js') < html.indexOf('emergency-smart-search-v8.js'), 'Action core must load before smart-search UI.');
assert.ok(html.indexOf('emergency-smart-search-v8.js') < html.indexOf('emergency-action-search-v12.js'), 'Deep-link enhancement must load after smart-search host creation.');
assert.match(ui, /Jo gjenerim AI/);
assert.match(ui, /Verifikuar/);
assert.match(ui, /tekst nga protokolli/);
assert.match(ui, /ck-v12-jump-highlight/);
assert.match(ui, /medindex:emergency-action-opened/);
assert.match(ui, /medindex:emergency-action-open/);
assert.doesNotMatch(ui, /MutationObserver/, 'Action search must not observe and mutate the same results host.');
assert.doesNotMatch(ui, /fetch\(|XMLHttpRequest|gemini|generative/i);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Emergency verified deep action search v12 contract passed.');