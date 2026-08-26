'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-desktop-lite.js');
const MARKER = 'registry-personal-view-filter-reset-v1';
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const nextAnchor = "    const next = mode === 'favorites' || mode === 'notes' ? mode : 'all';\n";
  if (!source.includes(nextAnchor)) throw new Error(`${MARKER}: personal view mode anchor missing.`);
  source = source.replace(
    nextAnchor,
    nextAnchor + "    const modeChanged = next !== state.personalMode;\n",
  );

  const changedAnchor = '    const changed = next !== state.personalMode\n';
  if (!source.includes(changedAnchor)) throw new Error(`${MARKER}: personal changed-state anchor missing.`);
  source = source.replace(changedAnchor, '    const changed = modeChanged\n');

  const assignmentAnchor = '    state.personalMode = next;\n';
  if (!source.includes(assignmentAnchor)) throw new Error(`${MARKER}: personal mode assignment anchor missing.`);
  const reset = `    // ${MARKER}: independent search context\n    // A query typed in Barnat must not silently filter Favorites/Notes. Clear\n    // only when the view changes; searches typed inside the current personal\n    // view keep working normally.\n    if (modeChanged) {\n      window.clearTimeout(searchTimer);\n      searchTimer = 0;\n      state.q = '';\n      const search = document.getElementById('search');\n      if (search) search.value = '';\n    }\n`;
  source = source.replace(assignmentAnchor, reset + assignmentAnchor);
}

const start = source.indexOf('async function setPersonalView');
const end = source.indexOf('window.MEDINDEX_DESKTOP_LITE =', start);
if (start < 0 || end < 0) throw new Error(`${MARKER}: personal owner API missing.`);
const block = source.slice(start, end);
if (!block.includes(MARKER)) throw new Error(`${MARKER}: stale-filter reset is missing.`);
if (!block.includes('const modeChanged = next !== state.personalMode')) throw new Error(`${MARKER}: mode-change detection missing.`);
if (!block.includes("state.q = ''")) throw new Error(`${MARKER}: stale search state is not cleared.`);
if (!block.includes("search.value = ''")) throw new Error(`${MARKER}: visible search input is not cleared.`);
if (block.indexOf("state.q = ''") > block.indexOf('await loadPage')) throw new Error(`${MARKER}: search must clear before personal rows load.`);

fs.writeFileSync(FILE, source, 'utf8');
console.log(`${MARKER}: Barnat search no longer leaks into Favorites/Notes; each personal view opens unfiltered and remains searchable.`);
