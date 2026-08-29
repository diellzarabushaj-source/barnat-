'use strict';
const assert=require('node:assert/strict');
const Handler=require('../lib/dose-product-fast-path-handler.js');
const Reader=require('../lib/dose-v3-product-reader.js');
const Gate=require('../lib/dose-v3-runtime-gate.js');

assert.equal(typeof Handler,'function');
assert.equal(typeof Handler.buildProductPayload,'function');
assert.equal(typeof Handler.buildRuntimePayload,'function');
assert.equal(typeof Reader.build,'function');
assert.equal(typeof Gate.chooseRuntime,'function');

assert.equal(Reader._test.inIds(['a','b','a']),'in.(a,b)');
assert.match(Reader._test.pathFor('dose_rules_v3','rule_id',{editorial_status:'eq.published'},5),/^dose_rules_v3\?/);
assert.match(Reader._test.pathFor('dose_products_v3','product_id',{editorial_status:'eq.published'},1),/^dose_products_v3\?/);
assert.equal(Reader._test.productSourceValid({
  source_snapshot_id:'a'.repeat(64),
  source_evidence_hash:'a'.repeat(64),
  source_document_date:'2026-08-27'
}),true);
assert.equal(Reader._test.sourceValid({
  source_snapshot_id:'a'.repeat(64),
  source_section:'4.2',
  source_section_sha256:'b'.repeat(64),
  source_evidence_hash:'a'.repeat(64),
  source_document_date:'2026-08-27'
}),true);
assert.equal(Reader._test.sourceValid({
  source_snapshot_id:'a'.repeat(64),
  source_section:'4.2',
  source_section_sha256:'',
  source_evidence_hash:'a'.repeat(64),
  source_document_date:'2026-08-27'
}),false);

const fallback=Gate.chooseRuntime({v3Enabled:true,v3Available:false,v2Available:true,strictV3:false});
assert.equal(fallback.runtime,'v2');
assert.equal(fallback.fallback,true);
const strict=Gate.chooseRuntime({v3Enabled:true,v3Available:false,v2Available:true,strictV3:true});
assert.equal(strict.failClosed,true);

console.log('DRx V3 fast-path integration parses and remains fail-closed.');
