'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const x=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','drx-first100-source-discovery-wave-c-v1.json'),'utf8'));
assert.equal(x.verifiedProductSpecificCount,8);assert.equal(x.rows.length,8);assert.equal(x.publicationAllowed,false);
assert.ok(x.rows.every(r=>r.section41Present===true&&r.section42Present===true));
assert.ok(x.rows.find(r=>r.canonicalKey==='captopril').reviewFlags.includes('renal_crcl_adjustment'));
assert.ok(x.rows.find(r=>r.canonicalKey==='amlodipinevalsartan').reviewFlags.includes('combination_drug'));
assert.ok(x.rows.find(r=>r.canonicalKey==='atorvastatinezetimibe').reviewFlags.includes('not_initial_therapy'));
console.log('DRx first-100 source discovery wave C passed.');
