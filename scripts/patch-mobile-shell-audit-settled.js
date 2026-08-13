'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, 'audit-mobile-shell-state.js');
let source = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

const anchor = "    await page.locator('#miRegistryBottomNav').waitFor({ state:'attached', timeout:10000 });";
const settled = `${anchor}\n    await page.locator('html[data-registry-mobile-lite-ready="1"]').waitFor({ state:'attached', timeout:5000 });\n    await page.waitForTimeout(120);`;

if (!source.includes(settled)) {
  if (!source.includes(anchor)) throw new Error('Mobile shell audit readiness anchor changed.');
  source = source.replace(anchor, settled);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Mobile shell audit waits for the settled mobile-lite owner.');
