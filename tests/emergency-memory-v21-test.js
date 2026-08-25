const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync('emergency-memory-v21.js', 'utf8');
const css = fs.readFileSync('emergency-memory-v21.css', 'utf8');
const html = fs.readFileSync('urgjencat.html', 'utf8');
const tailadmin = fs.readFileSync('tailadmin-professional.css', 'utf8');

assert(js.includes("medindex_emergency_memory_v21:"), 'v21 memory state must use its own local key');
assert(js.includes("medindex_emergency_flashcards_v4schedule:"), 'v21 must reuse the existing spaced-review schedule');
assert(js.includes("reviewStatus === 'verified'"), 'cross-protocol mixing must be verified-only');
assert(js.includes("Boolean(item?.version)"), 'cross-protocol mixing must require a version');
assert(js.includes('Array.isArray(item?.sources)'), 'cross-protocol mixing must require clinical sources');
assert(js.includes('Rikujto pa e parë'), 'v21 must lead with retrieval before reveal');
assert(js.includes('Përzieji protokollet'), 'v21 must support interleaving across protocols');
assert(js.includes('nuk është matje e kompetencës klinike'), 'v21 must not equate learning progress with competence');
assert(js.includes('[data-ck-rating]'), 'v21 must integrate with existing recall ratings');
assert(js.includes('[data-flash-reveal]'), 'v21 must gate active recall around the existing reveal control');
assert(!/\bfetch\s*\(/.test(js), 'v21 must not call network APIs');
assert(!/XMLHttpRequest|gemini|openai/i.test(js), 'v21 must not send learning content to AI/network services');
assert(!/adrenalin|epineph|amiodaron|diazepam|mg\/kg|mcg\/kg|\bmg\b/i.test(js), 'v21 must not hardcode drugs or doses');

assert(css.includes('.ck-v21-memory'), 'v21 premium memory panel styles must exist');
assert(css.includes('.ck-v21-predict'), 'v21 recall-first confidence styles must exist');
assert(css.includes('@media(max-width:760px)'), 'v21 must remain mobile friendly');
assert(css.includes('html[data-theme="dark"]'), 'v21 must support dark mode');

assert(html.includes('emergency-memory-v21.js?v=20260825-1'), 'v21 must load through physician bootstrap');
assert(!html.includes('<script src="emergency-memory-v21.js?v=20260825-1" defer'), 'v21 must stay off the critical defer path');
assert(tailadmin.includes('@import url("emergency-memory-v21.css?v=20260825-1");'), 'v21 CSS must load through the final TailAdmin bundle');

const stylesheetLinks = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
assert(stylesheetLinks.at(-1)?.startsWith('tailadmin-professional.css'), 'TailAdmin professional must remain the final static stylesheet');

console.log('Urgjencat Memory v21 contract passed: retrieval-first, spacing reuse, verified interleaving, no AI/treatment generation.');
