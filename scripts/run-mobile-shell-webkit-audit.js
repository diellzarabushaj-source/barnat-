'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const sourcePath = path.join(__dirname, 'audit-mobile-shell-state.js');
const runtimePath = path.join(__dirname, '.audit-mobile-shell-state-webkit-runtime.js');
let source = fs.readFileSync(sourcePath, 'utf8');

const legacyScroll = "await page.locator('.mi-main').evaluate(node => { node.scrollTop = node.scrollHeight; });";
const webkitScroll = "await page.locator('#pagination').evaluate(node => node.scrollIntoView({ block:'end', inline:'nearest', behavior:'auto' }));";
const legacyGate = "assertCompactShellGeometry(report.geometryAtEnd, 'end-of-list geometry', { lastCardVisible:true });";
const webkitGate = [
  "assert.ok(report.geometryAtEnd.mainScroll?.scrollTop > 0, 'end-of-list geometry: WebKit did not scroll .mi-main to the final controls.');",
  "assert.ok(report.geometryAtEnd.pagination && report.geometryAtEnd.nav && report.geometryAtEnd.pagination.bottom <= report.geometryAtEnd.nav.top - 4, 'end-of-list geometry: bottom navigation covers pagination controls.');",
  legacyGate,
].join('\n    ');

assert.ok(source.includes(legacyScroll), 'Mobile shell audit scroll probe changed; update the WebKit runner intentionally.');
assert.ok(source.includes(legacyGate), 'Mobile shell audit end gate changed; update the WebKit runner intentionally.');
source = source.replace(legacyScroll, webkitScroll).replace(legacyGate, webkitGate);

try {
  fs.writeFileSync(runtimePath, source, 'utf8');
  const result = spawnSync(process.execPath, [runtimePath], {
    cwd:path.resolve(__dirname, '..'),
    stdio:'inherit',
    env:process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  try { fs.unlinkSync(runtimePath); } catch {}
}
