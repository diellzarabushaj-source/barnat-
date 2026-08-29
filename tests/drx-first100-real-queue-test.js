'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const q=read('data/drx-first100-source-discovery-queue-v1.json');
const b1=read('data/drx-dose-batch1-v1.json');
const b2=read('data/drx-dose-batch2-v1.json');
const key=v=>String(v??'').normalize('NFC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
const covered=new Set([
 ...(b1.substances||[]).map(x=>key(x.canonicalKey||x.key||x.name)),
 ...(b2.substances||[]).map(x=>key(x.canonicalKey||x.key||x.name)),
].filter(Boolean));

assert.equal(q.schemaVersion,'drx-first100-source-discovery-queue-v1');
assert.equal(q.ordering,'canonical_key_ascending_then_source_row');
assert.equal(q.coveredBatch1And2Count,35);
assert.equal(q.queuedCount,100);
assert.equal(q.complete,true);
assert.equal(q.publicationAllowed,false);
assert.equal(q.queue.length,100);
assert.ok(q.queue.every(x=>x.sourceRow>0&&x.atcCodes&&x.canonicalKey&&x.canonicalName));
assert.ok(q.queue.every(x=>x.status==='source_discovery_pending'&&x.publicationAllowed===false));
assert.ok(q.queue.every(x=>!covered.has(x.canonicalKey)));
const keys=q.queue.map(x=>x.canonicalKey);
assert.deepEqual(keys,[...keys].sort((a,b)=>a.localeCompare(b,'en')));
assert.equal(new Set(keys).size,100);
console.log('DRx first-100 real registry discovery queue passed.');
