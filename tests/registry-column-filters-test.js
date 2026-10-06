'use strict';
const assert = require('node:assert/strict');
const model = require('../registry-column-model.js');
const data = require('../lib/registry-column-data.js');
const {publicBatchCard} = require('../lib/dosage-card-handler.js');
const gateway = require('../api/drug-search.js');

async function main() {
  const rows = [
    {id:'a',registryNumber:1,tradeName:'Aspirinë (test), 5%',activeSubstance:'Acid',strength:'20 mg',form:'Tablet',prescriptionNotation:'Rp. Acid',drugClass:'A',use:'Dhimbje',approvedPopulation:'Pediatric only',atc:'N02BE01',adultDose:'',pediatricDose:'15 mg/kg',updateStatus:'E re',productStatus:'Gjenerik',retailPrice:0,_search:'aspirine acid dhimbje'},
    {id:'b',registryNumber:1100,tradeName:'Z TEST',activeSubstance:'Other',strength:'5 mg',form:'Capsule, hard',prescriptionNotation:'',drugClass:'B',use:'Other',approvedPopulation:'Pediatric and adult both',atc:'J01CA04',adultDose:'500 mg',pediatricDose:'',updateStatus:'Ka qenë',productStatus:'Origjinator',retailPrice:10,_search:'z test other'},
    {id:'c',registryNumber:1200,tradeName:'Middle',activeSubstance:'Third',strength:'1 mg',form:'Tablet',drugClass:'B',approvedPopulation:'Adult only',atc:'N02BE02',adultDose:'200 mg',retailPrice:null,_search:'middle third'},
  ];
  assert.equal(Object.keys(model.fields).length,15);
  for (const id of Object.keys(model.fields)) {
    const value = model.value(rows[0],id);
    const filters = model.parseFilters({[id]:{mode:'include',values:[value]}});
    assert.ok(data.filterRows(rows,{columnFilters:filters},{ }).includes(rows[0]),`${id} exact checkbox filtering`);
  }
  assert.equal(model.label('price','0').includes('0'),true);
  assert.equal(model.value(rows[1],'prescription'),'Rp.: Caps. Other 5 mg');
  assert.equal(model.value(rows[0],'population'),'Vetëm pediatrik');
  assert.ok(model.matches(rows[0],'name',{op:'contains',text:'aspirine (TEST), 5%'}),'accent-insensitive literal search');
  assert.deepEqual(data.filterRows(rows,{columnFilters:{price:{op:'between',text:'0',text2:'5'}}},{}),[rows[0]]);
  assert.deepEqual(data.filterRows(rows,{columnFilters:{price:{op:'empty'}}},{}),[rows[2]]);
  assert.deepEqual(data.filterRows(rows,{columnFilters:{pediatricDose:{op:'notEmpty'},name:{mode:'exclude',values:[rows[0].tradeName]}}},{}),[]);
  assert.deepEqual(data.filterRows(rows,{atc:'N02BE01',columnFilters:{}},{}),[rows[0]]);
  assert.deepEqual(data.filterRows(rows,{formExact:'Capsule, hard',columnFilters:{}},{}),[rows[1]]);
  assert.deepEqual(data.sortRows(rows,'price','asc').map(row=>row.id),['a','b','c']);
  assert.deepEqual(data.sortRows(rows,'price','desc').map(row=>row.id),['b','a','c']);
  assert.deepEqual(data.sortRows(rows,'adultDose','asc').map(row=>row.id),['c','b','a']);
  assert.deepEqual(data.facets(data.filterRows(rows,{columnFilters:{name:{mode:'include',values:['Z TEST']},form:{op:'equals',text:'Tablet'}}},{},'name'),'name').values.map(item=>item.value),['Aspirinë (test), 5%','Middle']);
  assert.throws(()=>model.parseFilters('{bad'),/pavlefshëm/);
  assert.throws(()=>model.parseFilters('{"__proto__":{"op":"empty"}}'),/pavlefshme/);
  assert.throws(()=>model.parseFilters({price:{op:'between',text:'10',text2:'2'}}),/minimal/);
  assert.throws(()=>model.parseFilters({name:{op:'gt',text:'2'}}),/pavlefshëm/);
  assert.throws(()=>model.parseFilters({name:{mode:'include',values:Array(101).fill('X')}}),/më pak/);
  assert.deepEqual(model.parseFilters({name:{mode:'exclude',values:[]}}),{});
  assert.deepEqual(model.parseFilters({name:{mode:'include',values:[]}}),{name:{mode:'include',values:[]}});

  const roster = Array.from({length:1001},(_,i)=>({id:String(i),registry_number:i+1,trade_name:'Drug '+i,registry_search_text:'drug '+i,pediatric_dose_summary:'fallback pediatric',dose_fallback_0:'fallback adult'}));
  const regimens = [{drug_id:'1000',population:'adult',dose_text:'verified adult',source_key:'card:z'},{drug_id:'1000',population:'pediatric',dose_text:'verified pediatric',source_key:'card:z'}];
  const calls = [];
  const request = async path => {
    const [table,query] = path.split('?'), params = new URLSearchParams(query); calls.push([table,params]);
    assert.equal(params.get('editorial_status'),'eq.published');
    assert.ok(!params.get('select').split(',').includes('source_payload'),'must project only source dose fields');
    if(table === 'drugs') assert.equal(params.get('is_published'),'eq.true');
    else {assert.equal(params.get('calculation_status'),'in.(text_verified,calculable_verified)');assert.equal(params.get('source_key'),'like.card:*');}
    const dataset = table === 'drugs' ? roster : regimens, offset = Number(params.get('offset'));
    return {data:dataset.slice(offset,offset+1000),response:{headers:{get:()=>`0-999/${dataset.length}`}}};
  };
  const snapshot = await data.loadSnapshot('id,registry_number,trade_name',gateway.listRow,request);
  assert.equal(snapshot.length,1001);
  assert.equal(snapshot[1000].adultDose,'verified adult');
  assert.equal(snapshot[1000].pediatricDose,'verified pediatric');
  assert.equal(snapshot[0].adultDose,'fallback adult');
  assert.equal(snapshot[0].pediatricDose,'fallback pediatric');
  const canonical = publicBatchCard({...roster[1000],source_payload:{'Doza e plotë — Të rritur':'fallback adult'}},regimens);
  assert.equal(snapshot[1000].adultDose,canonical.adultDose);
  assert.equal(snapshot[1000].pediatricDose,canonical.pediatricDose);
  assert.equal(data.filterRows(snapshot,{columnFilters:{name:{op:'equals',text:'Drug 1000'}}},{}).length,1,'must include records beyond the first 1000/page');
  assert.equal(calls.length,3);
  await assert.rejects(data.readComplete('drugs',new URLSearchParams(),100,async()=>({data:[],response:{headers:{get:()=> '*/1001'}}})),/tepër i madh/);
  await assert.rejects(data.readComplete('drugs',new URLSearchParams(),2000,async()=>({data:[],response:{headers:{get:()=> '*/1001'}}})),/ndryshoi/);
  console.log('All 15 column filters, complete facets, null/numeric/text matching and published dosage parity passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
