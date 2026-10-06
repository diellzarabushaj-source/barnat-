'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'data/registry-substance-names-v1.json'), 'utf8'));
const projection = {version:policy.schemaVersion, preferred:policy.preferred, aliases:policy.aliases};
const output = '/* Generated from data/registry-substance-names-v1.json; edit the reviewed policy. */\n(function(root, factory) {\n  if (typeof module === "object" && module.exports) module.exports = factory();\n  else root.DrxRegistrySubstanceData = factory();\n})(typeof globalThis !== "undefined" ? globalThis : this, function() {\n  return ' + JSON.stringify(projection) + ';\n});\n';
fs.writeFileSync(path.join(root, 'registry-substance-data.js'), output);
console.log('Registry substance policy: ' + Object.keys(policy.aliases).length + ' reviewed spellings.');
