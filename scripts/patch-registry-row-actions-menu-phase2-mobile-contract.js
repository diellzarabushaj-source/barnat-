'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PERSONAL = path.join(ROOT, 'registry-user-personalization.js');
const source = fs.readFileSync(PERSONAL, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes('registry-row-actions-menu-phase2-v1')) {
  throw new Error('Phase 2 mobile-contract gate requires the singleton row-actions patch first.');
}

const next = source.replace(
  "const VERSION = 'registry-user-personalization-v3.4.0';",
  "const VERSION = 'registry-user-personalization-v3.3.0';"
);

if (!next.includes("const VERSION = 'registry-user-personalization-v3.3.0';")) {
  throw new Error('Could not preserve the frozen mobile personalization v3.3.0 contract.');
}

fs.writeFileSync(PERSONAL, next, 'utf8');
console.log('Registry row actions Phase 2 preserves the frozen mobile personalization v3.3.0 contract.');
