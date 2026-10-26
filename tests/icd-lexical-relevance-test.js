'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=require('../icd-search-lexical'),S=require('../lib/icd-search-engine-v3'),H=require('../lib/icd-advanced-handler')._test;
const data=require('../lib/icd-hierarchy-snapshot').load().data;
const tests=[
 ['faringitis acu','J02'],['pharyngitis acu','J02'],['faringitis acuta','J02'],['faringit akut','J02'],['faringjiti akut','J02'],['farignitis acu','J02'],['pharyngits acu','J02'],['faringitis','J02'],
 ['pharyngitis chronic','J31'],['faringitis kronik','J31'],
 ['laringitis acu','J04'],['laryngitis acuta','J04'],['sinusitis acu','J01'],['sinusit akut','J01'],
 ['tonsillitis acu','J03'],['tonsillit acu','J03'],['tonsilit akut','J03'],
 ['bronkit acu','J20'],['bronchitis acuta','J20'],['bronchitis chronica','J42'],
 ['gastritis chr','K29'],['gastritis chronica','K29'],['gastrit akut','K29'],
 ['cystitis acu','N30'],['appendicitis acu','K35'],['otitis media acu','H65'],
 ['infarkt akut','I21'],['angina pectoris','I20'],['hipertensoin','I10'],['hipertension','I10'],
 ['pneumonia','J18'],['asthma','J45'],['migrena','G43'],['diabet tip 2','E11'],
 ['I1O','I10'],['j029','J02.9'],['A001','A00.1'],['dhimbje gjoksi','R07.4'],
];
const originals=JSON.stringify(data.nodes.filter(n=>['J02','J04','I10'].includes(n.code)));
const started=performance.now();
for(const [q,first] of tests){const rows=H.suggestionPayload(data,{q}).rows;assert.equal(rows[0]?.code,first,q+': '+rows.slice(0,5).map(n=>n.code));assert.equal(new Set(rows.map(r=>r.code)).size,rows.length);}
assert.equal(JSON.stringify(data.nodes.filter(n=>['J02','J04','I10'].includes(n.code))),originals,'Search augmentation must not rewrite canonical source nodes');
const pharyngitis=H.suggestionPayload(data,{q:'faringitis acu'}).rows;
assert.ok(pharyngitis.findIndex(n=>n.code==='J02.9')<pharyngitis.findIndex(n=>n.code==='J04'),'The matching family precedes weaker near-spellings');
assert.equal(H.suggestionPayload(data,{q:'infarkt akut'}).rows.some(n=>['G36','J22','N12'].includes(n.code)),false,'A long medical term must not match the candidate word i');
assert.equal(H.suggestionPayload(data,{q:'hipertension'}).rows.some(n=>n.code==='O12'),false,'Without hypertension is not a positive hypertension match');
assert.equal(H.suggestionPayload(data,{q:'zxqvplmnkjhgfdsawert'}).rows.length,0);
assert.ok(H.suggestionPayload(data,{q:'faringitis acu',chapter:'X'}).rows.every(n=>n.chapter==='X'),'Filters still constrain lexical matches');
assert.ok(H.suggestionPayload(data,{q:'faringitis acu',levels:'subcategory'}).rows.every(n=>n.level==='subcategory'));
assert.equal(L.tokenMatch('infarkt','i'),null);assert.equal(L.scoreTokens(['faringitis','acu'],['acute']),null);
assert.equal(L.scoreTokens(['non','infectious'],['infectious']),null,'A clinical negation is not a filler word');
assert.ok(L.tokenMatch('farignitis','pharyngitis'));assert.ok(L.scoreTokens(['faringitis','acu'],['Pharyngitis','acuta']));
assert.equal(L.scoreTokens(['bronkit','acu'],['chronic','bronchitis']),null);
assert.ok(S.suggestDataset({nodes:[{code:'J02',level:'category',englishTitle:'Acute pharyngitis'}]},'pharyng*').rows.length);
const sandbox={};vm.runInNewContext(fs.readFileSync(require.resolve('../icd-search-lexical'),'utf8'),sandbox);
for(const [q] of tests.slice(0,20)){const fields=['Pharyngitis acuta','Laryngitis acuta et tracheitis acuta','Acute pharyngitis'];assert.equal(sandbox.DRxIcdLexical.scoreFields(q,fields),L.scoreFields(q,fields),'Browser and server share the same matcher');}
console.log(`ICD lexical relevance: ${tests.length} full-catalog ranking cases, contextual qualifiers, distinct token coverage, Latin source preservation, filters and browser/server parity passed (${Math.round(performance.now()-started)} ms).`);
