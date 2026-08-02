'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tree = fs.readFileSync('icd-tree.js', 'utf8');
new Function(tree);
assert.doesNotMatch(tree, /eval\s*\(|new Function\s*\(/);
assert.ok(tree.includes("document.documentElement.dataset.miIcdTree = 'ready'"));
assert.ok(tree.includes('aria-busy'));
console.log('ICD tree runtime syntax and safety check passed.');
