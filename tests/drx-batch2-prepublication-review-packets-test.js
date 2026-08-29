'use strict';
const assert=require('node:assert/strict');
const Gate=require('../scripts/audit-drx-batch2-prepublication.js');
const Packets=require('../scripts/build-drx-batch2-review-packets.js');

const g=Gate.audit();
assert.equal(g.total,25);
assert.equal(g.publishable,0);
assert.equal(g.blocked,25);
assert.equal(g.pass,true);
assert.equal(g.publicationAllowed,false);

const p=Packets.build();
assert.equal(p.total,25);
assert.equal(p.publicationAllowed,false);
assert.ok(p.packets.every(x=>x.status==='pending_clinical_review'));
assert.ok(p.packets.every(x=>Array.isArray(x.requiredDecisions)&&x.requiredDecisions.length>=3));
assert.ok(p.packets.find(x=>x.canonicalKey==='ciprofloxacin').requiredDecisions.includes('confirm_antimicrobial_guidance_context'));
assert.ok(p.packets.find(x=>x.canonicalKey==='spironolactone').requiredDecisions.includes('confirm_renal_adjustment_logic'));
assert.ok(p.packets.find(x=>x.canonicalKey==='tramadol').requiredDecisions.includes('confirm_high_risk_manual_review'));
console.log('DRx Batch 2 prepublication and review packet contracts passed.');
