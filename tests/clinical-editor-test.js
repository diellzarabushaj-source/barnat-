'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const editor = require('../lib/clinical-editor.js');

assert.equal(editor._test.bodySize({ headers:{ 'content-length':'42' }, body:{} }), 42);
assert.deepEqual(editor._test.parseIndications('Hipertension | I10 | adult\nAstma | J45 | pediatric'), [
  { name:'Hipertension', icdCode:'I10', population:'adult' },
  { name:'Astma', icdCode:'J45', population:'pediatric' },
]);
assert.throws(() => editor._test.normalizeDosePayload({ verified:true, dose:'1 tabletë', route:'Orale' }, 'adult'), /burimin HTTPS/);
assert.equal(editor._test.normalizeDosePayload({ verified:true, dose:'1 tabletë', route:'Orale', sourceUrl:'https://example.org' }, 'adult').verified, true);
assert.throws(() => editor._test.normalizeProfilePayload({ profile:{ verificationStatus:'verified', sourceUrls:[] } }), /së paku një burim/);
assert.equal(editor._test.sameOrigin({ headers:{ origin:'https://barnat-six.vercel.app', host:'barnat-six.vercel.app' } }), true);
assert.equal(editor._test.sameOrigin({ headers:{ origin:'https://example.com', host:'barnat-six.vercel.app' } }), false);

const api = read('api/clinical-editor.js');
const ui = read('clinical-editor.js');
const css = read('clinical-editor.css');
const index = read('index.html');
const driveSync = read('api/drive-sync.js');

assert.match(api, /ClinicalEditor\.handle/);
assert.match(ui, /Redaktim permanent në Neon/);
assert.match(ui, /Ruaj dhe hap tjetrin/);
assert.match(ui, /adultVerified/);
assert.match(ui, /registry-dosage-verified/);
assert.match(ui, /medindex-registry-dosage-columns-v2/);
assert.match(css, /clinical-editor-dialog/);
assert.match(index, /clinical-editor\.css/);
assert.match(index, /clinical-editor\.js/);
assert.match(driveSync, /auth_secret_hash/);
assert.doesNotMatch(driveSync, /console\.log\([^\n]*secret/i);

console.log('Clinical editor and permanent Neon override audit passed.');

assert.equal(editor._test.normalizeRegistryNumber(900000), 900000);
assert.throws(() => editor._test.normalizeRegistryNumber(Number.MAX_SAFE_INTEGER + 1), /Numri i barit/);
assert.equal(
  editor._test.normalizeProfilePayload(
    { profile:{ verificationStatus:'in_review' } },
    null,
    { pregnancyLactation:'Ruaje këtë tekst', sourceUrls:['https://example.org/source'] },
  ).pregnancy_lactation,
  'Ruaje këtë tekst',
);
assert.deepEqual(
  editor._test.normalizeDosePayload({}, 'adult', {
    dose:'1 tabletë',
    route:'Orale',
    sourceUrl:'https://example.org/dose',
    notes:'Ruaje shënimin',
    verified:true,
  }),
  {
    dose:'1 tabletë',
    route:'Orale',
    sourceUrl:'https://example.org/dose',
    notes:'Ruaje shënimin',
    verified:true,
    population:'adult',
  },
);
