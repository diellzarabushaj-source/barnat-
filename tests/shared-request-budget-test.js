'use strict';
const assert = require('node:assert/strict');
const budget = require('../lib/shared-request-budget.js');

async function main() {
  process.env.MEDINDEX_SHARED_RATE_LIMIT = '1';
  process.env.MEDINDEX_RATE_LIMIT_KEY = 'synthetic-key-for-budget-test-only-12345';
  const subjects = ['127.0.0.1','doctor@example.test'];
  assert.notEqual(budget.bucketHash('auth-ip',subjects[0]),budget.bucketHash('ai-ip',subjects[0]));
  assert.notEqual(budget.bucketHash('ai-user',subjects[0]),budget.bucketHash('ai-user',subjects[1]));
  const buckets = new Map();
  const request = async (path,options) => {
    assert.equal(path,'rpc/drx_consume_request_budget_v1');
    assert.equal(options.privileged,true);
    assert.match(options.body.p_bucket_hash,/^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(options.body).includes(subjects[0]));
    const used = (buckets.get(options.body.p_bucket_hash) || 0) + 1;
    buckets.set(options.body.p_bucket_hash,used);
    return {data:{allowed:used <= options.body.p_limit,remaining:Math.max(0,options.body.p_limit-used),resetSeconds:60}};
  };
  // Two independent server modules consume the same shared bucket.
  delete require.cache[require.resolve('../lib/shared-request-budget.js')];
  const otherInstance = require('../lib/shared-request-budget.js');
  const results = await Promise.all(Array.from({length:4},(_,i)=>(i%2 ? otherInstance : budget).consume('ai-ip',subjects[0],3,60,request)));
  assert.equal(results.filter(r=>r.allowed).length,3);
  const response = () => ({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
  const denied = response();
  assert.equal(await budget.enforce(denied,[['ai-ip',subjects[0],3,60]],request),false);
  assert.equal(denied.statusCode,429); assert.equal(denied.headers['Retry-After'],'60');
  const unavailable = response(); let providerCalls=0;
  if (await budget.enforce(unavailable,[['auth-ip',subjects[0],3,60]],async()=>{throw new Error('private provider detail');})) providerCalls++;
  assert.equal(unavailable.statusCode,503); assert.equal(providerCalls,0);
  assert.ok(!JSON.stringify(unavailable.body).includes('private provider detail'));
  const malformed = response();
  assert.equal(await budget.enforce(malformed,[['auth-ip',subjects[0],3,60]],async()=>({data:{allowed:true,remaining:-1}})),false);
  assert.equal(malformed.statusCode,503);
  process.env.MEDINDEX_SHARED_RATE_LIMIT='0';
  assert.equal(await budget.enforce(response(),[],async()=>{throw new Error('disabled');}),true);
  delete process.env.MEDINDEX_SHARED_RATE_LIMIT;
  process.env.VERCEL_ENV='production'; assert.equal(budget.enabled(),false);
  console.log('Shared request budgets: cross-instance limit, private hashing, denial and outage behavior passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
