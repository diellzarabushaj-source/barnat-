'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const policy = require('../data/registry-substance-names-v1.json');
const names = require('../registry-substance-normalization.js');
const model = require('../registry-column-model.js');
const data = require('../lib/registry-column-data.js');
const gateway = require('../api/drug-search.js');
const registry = require('../api/registry.js');

async function main() {
  const variants = ['amoxicilin','Amoxicilin','Amoxicillin','AMOXICILLIN',' Amoxicilline '];
  for (const name of variants) assert.equal(names.canonicalName(name),'Amoxicillin');
  assert.equal(names.canonicalName('  Amoxicillin   trihydrate '),'Amoxicillin trihydrate');
  assert.equal(names.searchText('amoxicilin'),'Amoxicillin');
  assert.equal(names.searchText('paracetamol'),'paracetamol');
  assert.equal(names.searchText('amoxi'),'amoxi');
  assert.equal(names.canonicalName('amoxycillin; clavulanic acid'),'Amoxicillin; Clavulanic acid');
  for (const [raw, preferred] of Object.entries(policy.preferred)) {
    assert.equal(names.key(raw),names.key(preferred));
    assert.equal(names.canonicalName(raw.toUpperCase()),names.canonicalName(preferred));
  }
  for (const [raw, preferred] of Object.entries(policy.aliases)) assert.equal(names.key(raw),names.key(preferred),raw);
  const all = [...Object.keys(policy.preferred),...Object.values(policy.preferred),...Object.keys(policy.aliases),...Object.values(policy.aliases)];
  for (const raw of all) assert.equal(names.canonicalName(names.canonicalName(raw)),names.canonicalName(raw),'idempotent '+raw);
  const compact = value => names.fold(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const byCompact = new Map(all.map(raw=>[compact(raw),raw]));
  for (const [a,b] of policy.guardPairs) {
    assert.notEqual(names.key(byCompact.get(a)||a),names.key(byCompact.get(b)||b),'reviewed non-merge guard');
  }
  for (const [a,b] of [
    ['Amoxicillin','Amoxicillin trihydrate'], ['Amoxicillin','Amoxicillin sodium'],
    ['Amoxicillin','Amoxicillin; Clavulanic acid'], ['Amoxicillin sodium','Ampicillin sodium'],
    ['Betahistine hydrochloride','Betahistine dihydrochloride'], ['Cetirizine hydrochloride','Cetirizine dihydrochloride'],
    ['Caffeine','Caffeine anhydrous'], ['Lidocaine hydrochloride','Lidocaine hydrochloride monohydrate'],
    ['Ephedrine','Pseudoephedrine'], ['Amoxicillin 100 mg','Amoxicillin 1000 mg'],
    ['Amoxicillin','Amoxicillix'], ['Vitamin B1','Vitamin B12'],
  ]) assert.notEqual(names.key(a),names.key(b),a+' must remain distinct from '+b);
  const originals = variants.map((active_substance,i)=>({id:String(i),registry_number:i+1,active_substance,trade_name:'Product '+i,pdid:'p'+i,pharmaceutical_form:'Tablet',source_payload:{'Substanca':active_substance}}));
  const rows = originals.map(row=>({...gateway.listRow(row),_search:row.trade_name}));
  assert.equal(new Set(rows.map(row=>row.id)).size,variants.length,'products are never deduplicated');
  originals.forEach((row,i)=> {
    for (const transformed of [gateway.listRow(row),gateway.searchRow(row),gateway.detailRow(row)]) {
      assert.equal(transformed.activeSubstance,'Amoxicillin');
      assert.equal(transformed.sourceActiveSubstance,names.clean(variants[i]));
      assert.equal(transformed.id,row.id);
    }
    assert.equal(row.source_payload.Substanca,variants[i],'raw data remains intact');
  });
  assert.deepEqual(data.facets(rows,'substance').values,[{value:'Amoxicillin',label:'Amoxicillin',count:variants.length}]);
  assert.equal(data.facets(rows,'substance','amoxicilin').values[0].count,variants.length);
  const saved = model.parseFilters({substance:{mode:'include',values:['amoxicilin','AMOXICILLIN']}});
  assert.deepEqual(saved.substance.values,['Amoxicillin']);
  assert.equal(data.filterRows(rows,{columnFilters:saved},{}).length,variants.length);
  assert.equal(data.filterRows(rows,{q:'amoxicilin'},{}).length,variants.length);
  assert.equal(data.filterRows(rows,{columnFilters:{substance:{op:'equals',text:'Amoxicilin'}}},{}).length,variants.length);
  assert.equal(data.filterRows(rows,{columnFilters:{substance:{mode:'exclude',values:['Amoxicilline']}}},{}).length,0);
  assert.equal(gateway.buildSearchPath('amoxicilin').body.p_query,'Amoxicillin');
  assert.equal(gateway.buildSearchPath('paracetamol').q,'paracetamol');
  const context = vm.createContext({});
  for (const file of ['registry-substance-data.js','registry-substance-normalization.js','registry-column-model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  for (const name of all.concat(variants)) assert.equal(context.DrxRegistrySubstances.canonicalName(name),names.canonicalName(name),'browser/server parity');
  assert.equal(context.DrxRegistryColumns.value({activeSubstance:'Amoxicilin'},'substance'),'Amoxicillin');

  // Exercise the actual authenticated gateway routing and complete pagination.
  const authorized = registry.authorized, snapshot = data.snapshot;
  registry.authorized = async () => true;
  data.snapshot = async () => Array.from({length:61},(_,i)=>({...rows[i%rows.length],id:String(i),registryNumber:i+1}));
  try {
    for (const view of ['registry-page','registry-search']) {
      const res = {setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
      await gateway({method:'GET',query:{view,q:'amoxicilin',page:'2',pageSize:'25',includeTotal:'true',sort:'substance'}},res);
      assert.equal(res.statusCode,200);
      assert.equal(res.body.pagination.total,61,'canonical search must count beyond an RPC result cap');
      assert.equal(res.body.pagination.page,2);
      assert.equal(res.body.rows.length,25);
      assert.equal(res.body.rows[0].registryNumber,26);
      assert.equal(res.body.meta.completeRegistry,true);
      assert.ok(res.body.rows.every(row=>row.activeSubstance==='Amoxicillin' && !Object.hasOwn(row,'_search')));
    }
  } finally { registry.authorized=authorized; data.snapshot=snapshot; }
  console.log('Substance names: reviewed spelling/case merges, clinical distinctions, raw source preservation, browser/server parity and complete API pagination passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
