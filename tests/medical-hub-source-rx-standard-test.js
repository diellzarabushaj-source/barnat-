'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const frontend = read('medical-hub-v2.js');
const css = read('medical-hub-rx-source-v1.css');
const api = read('api/medical-hub.js');

// Canonical source-Rx contract for Medical Hub:
// 1) Sanity stores one rx-source step per numbered treatment group.
// 2) Lines inside that group use REAL newline characters, never the two literal
//    characters "\\n". Alternatives start a new line with OSE (or OR in source).
// 3) Frontend renders one source number for the group and OSE inside the group.
// 4) The API must keep sourceRxTitle, step priority and action available to the UI.

assert.match(frontend, /priority\) === 'rx-source'/, 'rx-source steps must be detected');
assert.match(frontend, /split\(\/\\r\?\\n\/\)/, 'source Rx actions must split on real line breaks');
assert.match(frontend, /\^\(OR\|OSE\)\\b/, 'OR/OSE alternatives must be detected line-by-line');
assert.match(frontend, /ck-book-rx-group/, 'source Rx must render as grouped book-style prescriptions');
assert.match(frontend, /ck-book-rx-number/, 'each source treatment group must have one number');
assert.match(frontend, /ck-book-rx-alternative/, 'alternatives must render inside the same group');

assert.match(css, /\.ck-book-rx-group/, 'grouped Rx styling must remain available');
assert.match(css, /content:"OSE"/, 'Albanian frontend must display OSE for source alternatives');

assert.match(api, /sourceRxTitle/, 'Medical Hub API must expose sourceRxTitle');
assert.match(api, /steps\[\]\{_key,title,action,why,setting,priority,note\}/, 'Medical Hub API must expose source Rx step fields');

console.log('Medical Hub source-Rx frontend/back-end contract passed.');
