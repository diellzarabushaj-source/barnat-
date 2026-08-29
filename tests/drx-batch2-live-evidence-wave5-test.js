'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const w=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','drx-batch2-live-evidence-wave5-v1.json'),'utf8'));
assert.equal(w.sourceCount,5);assert.equal(w.publicationAllowed,false);assert.ok(w.sources.every(x=>x.section41Present&&x.section42Present));assert.ok(w.sources.every(x=>x.archiveHashStatus==='pending'));
assert.ok(w.sources.find(x=>x.canonicalKey==='doxycycline').reviewFlags.includes('official_antimicrobial_guidance_required'));
assert.ok(w.sources.find(x=>x.canonicalKey==='gliclazide').reviewFlags.includes('hypoglycaemia_risk'));
console.log('DRx Batch 2 live evidence wave 5 guards passed.');