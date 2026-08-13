'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'registry-mobile-phase3.js');
let source = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

const before = `    nav.style.visibility = blocked ? 'hidden' : 'visible';\n    nav.style.opacity = blocked ? '0' : '1';\n    nav.style.pointerEvents = blocked ? 'none' : '';`;
const after = `    nav.style.setProperty('visibility', blocked ? 'hidden' : 'visible', 'important');\n    nav.style.setProperty('opacity', blocked ? '0' : '1', 'important');\n    nav.style.setProperty('pointer-events', blocked ? 'none' : 'auto', 'important');\n    nav.style.setProperty('transform', blocked ? 'translateY(calc(100% + 24px))' : 'translateY(0)', 'important');`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Bottom nav style synchronization block changed.');
  source = source.replace(before, after);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Blocked mobile bottom-nav styles now outrank late CSS.');
