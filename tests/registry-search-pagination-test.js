'use strict';
const assert = require('node:assert/strict');
const apiPath = require.resolve('../lib/supabase-data-api.js');
const realApi = require(apiPath);
const roster = Array.from({length:87}, (_, i) => ({
  id:`00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  registry_number:i + 1, trade_name:`AMOX ${String(i).padStart(2, '0')}`,
  active_substance:'Amoxicillin', approved_population:i % 2 ? 'Pediatric only' : 'Pediatric and adult both',
}));
const calls = [];
require.cache[apiPath].exports = {
  ...realApi,
  supabaseRequest:async (requestPath, options) => {
    const params = new URLSearchParams(requestPath.split('?')[1]);
    calls.push(params);
    assert.equal(options.prefer, 'count=exact');
    assert.equal(params.get('registry_search_text'), 'ilike.*amox*');
    assert.equal(params.get('order'), 'trade_name.desc.nullslast,registry_number.asc,id.asc');
    assert.ok(params.get('select').split(',').includes('approved_population'));
    const offset = Number(params.get('offset')), size = Number(params.get('limit'));
    return {data:[...roster].reverse().slice(offset, offset + size), response:{headers:{get:() => `*/${roster.length}`}}};
  },
};
delete require.cache[require.resolve('../api/drug-search.js')];
const gateway = require('../api/drug-search.js');
async function page(number) {
  let payload;
  const response = {setHeader(){},status(code){assert.equal(code,200);return this;},json(value){payload=value;return this;}};
  await gateway.sendRankedRegistrySearch({method:'GET',query:{view:'registry-search',q:'amox',page:String(number),pageSize:'50',sort:'name',direction:'desc'}}, response, Date.now());
  return payload;
}
(async () => {
  const first = await page(1), second = await page(2);
  assert.equal(first.rows.length,50);
  assert.equal(second.rows.length,37);
  assert.equal(first.pagination.total,87);
  assert.equal(second.pagination.totalPages,2);
  assert.equal(first.pagination.hasNext,true);
  assert.equal(second.pagination.hasNext,false);
  assert.equal(second.pagination.hasPrevious,true);
  assert.equal(new Set([...first.rows,...second.rows].map(row => row.id)).size,87);
  assert.equal(first.rows[0].approvedPopulation,roster[86].approved_population);
  assert.equal(second.rows[0].approvedPopulation,roster[36].approved_population);
  assert.equal(calls[1].get('offset'),'50');
  const numeric = new URLSearchParams(gateway.buildPageRequest({q:'7'}).path.split('?')[1]);
  assert.equal(numeric.get('or'),'(registry_number.eq.7,pdid.eq.7)');
  console.log('Complete 87-result search, population parity and stable sorted pagination passed.');
})().catch(error => {console.error(error);process.exitCode=1;});
