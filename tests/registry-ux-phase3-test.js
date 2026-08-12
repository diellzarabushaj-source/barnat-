'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('index.html');
const js = read('registry-ux-phase3.js');
const css = read('registry-ux-phase3.css');

assert.doesNotThrow(() => new Function(js), 'Phase 3 personal workspace JS must parse');
assert.match(html, /data-registry-ui-release="20260812-1"/, 'Visual UX phases must preserve the audited clinical release contract');
assert.match(html, /registry-ux-phase3\.css\?v=20260810-1/);
assert.match(html, /registry-ux-phase3\.js\?v=20260810-1/);
assert.ok(html.indexOf('registry-user-personalization.js') < html.indexOf('registry-ux-phase3.js'), 'Phase 3 must enhance the per-user persistence controller after it loads');
assert.ok(html.indexOf('registry-ux-phase2.js') < html.indexOf('registry-ux-phase3.js'), 'Phase 3 must extend the Clinical Scanner instead of replacing it');
assert.ok(html.indexOf('registry-ux-phase2.css') < html.indexOf('registry-ux-phase3.css'), 'Phase 3 styling must layer after Phase 2');

assert.match(js, /registry-ux-phase3-v1\.0\.1/);
assert.match(js, /regjistriBarnave_shenime_v1/);
assert.match(js, /regjistriBarnave_favoritet_v1/);
assert.match(js, /noteStorageSnapshot/);
assert.match(js, /noteEntryCache/);
assert.match(js, /renderList = false/);
assert.match(js, /panel\?\.hidden/);
assert.match(js, /registryPersonalWorkspace/);
assert.match(js, /data-workspace-note-key/);
assert.match(js, /data-row-note-jump/);
assert.match(js, /medindex:personal-note-saved/);
assert.match(js, /medindex:favorites-changed/);
assert.match(js, /medindex:library-synced/);
assert.match(js, /requestAnimationFrame/);
assert.match(js, /showAll/);
assert.match(js, /search\.dispatchEvent\(new Event\('input'/);
assert.doesNotMatch(js, /MutationObserver/);
assert.doesNotMatch(js, /setInterval\s*\(/);
assert.doesNotMatch(js, /calculateDose|dose-calculator-submit|novorapid|novomix|insulin/i, 'Phase 3 must not implement or alter clinical dosing logic');

assert.match(css, /Personal Clinical Workspace/);
assert.match(css, /registry-workspace-panel/);
assert.match(css, /registry-workspace-note-item/);
assert.match(css, /registry-row-note-jump/);
assert.match(css, /has-personal-note/);
assert.match(css, /data-status="synced"/);
assert.match(css, /@media\(max-width:620px\)/);
assert.match(css, /data-theme="dark"/);
assert.match(css, /prefers-reduced-motion/);
assert.doesNotMatch(css, /https?:\/\//, 'Phase 3 must not load third-party visual assets');

console.log('Phase 3 personal clinical workspace, cached note panel and per-user event-driven UX audit passed.');
