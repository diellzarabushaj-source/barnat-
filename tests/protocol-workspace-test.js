const assert = require('node:assert/strict');
const fs = require('node:fs');
const manifest = require('../data/protocols.json');

const html = fs.readFileSync(require.resolve('../protokollet.html'), 'utf8');
const js = fs.readFileSync(require.resolve('../protocol-workspace.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../protocol-workspace.css'), 'utf8');

assert.equal(manifest.documents.length, 55, 'protocol workspace must cover the complete 55-document manifest');
assert.match(html, /protocol-workspace\.css\?v=/, 'protocol workspace stylesheet must be loaded');
assert.match(html, /protocol-workspace\.js\?v=/, 'protocol workspace runtime must be loaded');
assert.match(js, /medindex_protocol_workspace_/, 'workspace state must be isolated per protocol');
assert.match(js, /routeId\(\)/, 'workspace must follow the currently opened protocol route');
assert.match(js, /protocol-primary-care/, 'workspace must yield to a source-grounded primary-care renderer when one exists');
assert.match(js, /Nuk ka ende elaborim klinik të strukturuar/, 'non-elaborated documents must be presented explicitly as draft workspaces');
assert.match(js, /nuk shpik rekomandime/i, 'workspace must not present unsupported clinical recommendations');
assert.match(js, /Hap burimin zyrtar/, 'workspace must keep the official source one action away');
assert.match(js, /faqe \/ referencë të qartë në burim/, 'publication checklist must require traceable source references');
assert.match(js, /localStorage/, 'audit notes must persist locally per protocol');
assert.match(css, /protocol-audit-workspace/, 'workspace shell must have dedicated styling');
assert.match(css, /@media\(max-width:560px\)/, 'workspace must include a mobile layout contract');

console.log('Protocol workspace tests passed.');
