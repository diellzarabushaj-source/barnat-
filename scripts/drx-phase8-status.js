'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const { supabaseRequest } = require('../lib/medindex-data-api.js');

async function rpc(name,body={}) {
  const { data } = await supabaseRequest('rpc/' + name,{
    method:'POST',body,timeoutMs:5000,label:'DRx Phase 8 ' + name
  },{ privileged:true });
  return data;
}

async function main() {
  const status = await rpc('drx_phase8_status_v1');
  assert.equal(status.phase8_functions,3);
  assert.equal(status.v3_published_products,0);
  assert.equal(status.v3_published_rules,0);
  assert.equal(status.reconstruction_true_diffs,0);
  assert.equal(status.generated_true_diffs,0);
  assert.equal(status.shadow_only,true);
  assert.equal(status.v2_runtime_preserved,true);
  assert.equal(status.v3_cutover_enabled,false);
  assert.equal(status.publication_allowed,false);
  assert.equal(status.implementation_gate_pass,true);
  assert.equal(status.exit_gate_pass,false);
  assert.equal(status.gate_pass,false);
  assert.ok(status.review_product_source_bindings > 0);
  assert.equal(status.verified_product_source_bindings,0);
  assert.equal(status.legacy_exact_url_and_section_hash,0);

  const search = await rpc('drx_dose_search_v3_shadow_v1',{ p_query:'aa',p_limit:5 });
  assert.ok(Array.isArray(search));
  assert.equal(search.length,0);

  const evidence = {
    evidence_version:'drx-phase8-status-evidence-v1',
    generated_at:new Date().toISOString(),
    source:'public.drx_phase8_status_v1',
    status,
    shadow_search_empty_while_v3_unpublished:search.length===0
  };
  fs.writeFileSync('drx-phase8-status-evidence.json',JSON.stringify(evidence,null,2) + '\n');
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(error => { console.error(error); process.exitCode=1; });
