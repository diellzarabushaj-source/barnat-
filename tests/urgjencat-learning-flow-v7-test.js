const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'urgjencat.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'emergency-learning-flow-v7.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'emergency-learning-flow-v7.css'), 'utf8');

function includes(haystack, needle, message) {
  assert.ok(haystack.includes(needle), message || `Expected to include: ${needle}`);
}

includes(html, 'emergency-learning-flow-v7.css?v=20260824-1', 'V7 CSS must be loaded by Urgjencat');
includes(html, 'emergency-learning-flow-v7.js?v=20260824-1', 'V7 JS must be loaded by Urgjencat');
assert.ok(html.indexOf('emergency-learning-flow-v7.css') > html.indexOf('emergency-learning-v4.css'), 'V7 CSS must load after learning v4');
assert.ok(html.indexOf('emergency-learning-flow-v7.js') > html.indexOf('emergency-learning-v4.js'), 'V7 JS must load after learning v4');
assert.ok(html.indexOf('emergency-learning-flow-v7.js') > html.indexOf('emergency-readiness-v6.js'), 'V7 JS must load after readiness v6');

includes(js, 'function fixLearnJumpbar()', 'V7 must clean the Learn jumpbar after flashcards move to Test');
includes(js, "label === 'flashcards'", 'Stale Flashcards entry must be removed from Learn navigation');
includes(js, 'test.contains(target)', 'Targets moved into Test must not remain in Learn navigation');
includes(js, "'summary',\n      'learn'", 'Summary must guide doctors to Learn');
includes(js, "'learn',\n      'test'", 'Learn must guide doctors to Test');
includes(js, 'Vazhdo te Mëso', 'Summary CTA must clearly continue to learning');
includes(js, 'Testo veten', 'Learn CTA must clearly continue to active recall');
includes(js, "mobile: 'Mëso'", 'Mobile learning label must stay compact');
includes(js, "mobile: 'Testo'", 'Mobile test label must stay compact');
includes(js, "aria: 'Mëso protokollin hap pas hapi'", 'Learning mode needs an explicit accessible name');
includes(js, "aria: 'Testo veten me flashcards'", 'Test mode needs an explicit accessible name');

includes(js, "[repeat, '1', 'Përsërite']", 'Key 1 must map to repeat');
includes(js, "[hard, '2', 'Vështirë']", 'Key 2 must map to hard');
includes(js, "[good, '3', 'E di']", 'Key 3 must map to known/good');
includes(js, "[easy, '4', 'Shumë e lehtë']", 'Key 4 must map to easy');
includes(js, "'[data-flash-repeat]'", 'Repeat selector must be preserved');
includes(js, "'[data-ck-rating=\"hard\"]'", 'Hard rating selector must be preserved');
includes(js, "'[data-flash-known]'", 'Known selector must be preserved');
includes(js, "'[data-ck-rating=\"easy\"]'", 'Easy rating selector must be preserved');
includes(js, "['1', '2', '3', '4'].includes(event.key)", 'Keyboard handler must support all four recall grades');
includes(js, '}, true);', 'Recall keyboard handling must use capture so it wins over legacy shortcuts');

includes(css, 'grid-template-columns:repeat(3,minmax(0,1fr))!important', 'Mobile mode switch must stay in one compact three-column row');
includes(css, '@media(pointer:coarse)', 'Touch devices must get touch-appropriate shortcut treatment');
includes(css, '.ck-v7-shortcuts{display:none}', 'Keyboard hints must be hidden on coarse pointer devices');
includes(css, 'html[data-theme="dark"] .ck-v7-next-step', 'V7 CTA must support dark mode');
includes(css, '@media(prefers-reduced-motion:reduce)', 'V7 must respect reduced motion preferences');

console.log('✓ Urgjencat guided learning flow v7 contract passed');