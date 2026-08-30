'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const js=fs.readFileSync('dozologjia-v2.js','utf8');
const html=fs.readFileSync('dozologjia.html','utf8');

assert.match(js,/Rx — DRx/);
assert.match(js,/Indikacioni:/);
assert.match(js,/Doza:/);
assert.match(js,/Frekuenca:/);
assert.match(js,/Rruga:/);
assert.match(js,/Burimi i dozimit:/);
assert.match(js,/Versioni i burimit të produktit:/);
assert.match(js,/Konteksti V3:/);
assert.match(js,/phase9-prescription-preview/);
assert.match(js,/Kopjo për recetë/);
assert.match(html,/id="dosageCopyResult" hidden>Kopjo për recetë</);

cp.execFileSync(process.execPath,['--check','dozologjia-v2.js'],{stdio:'pipe'});
console.log('DRx Phase 9 prescription context contract: PASS');
