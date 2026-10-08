'use strict';
const crypto = require('node:crypto');
const {supabaseRequest} = require('./supabase-data-api.js');
function enabled() {
  // Enable after the private RPC and server credentials have been verified.
  return process.env.MEDINDEX_SHARED_RATE_LIMIT === '1';
}
function bucketHash(scope,subject) {
  const secret = String(process.env.MEDINDEX_RATE_LIMIT_KEY || process.env.SESSION_SECRET || process.env.MEDINDEX_SESSION_SECRET || '').trim();
  if (secret.length < 32) throw new Error('Shared request budget key is missing.');
  return crypto.createHmac('sha256',secret).update(JSON.stringify([process.env.VERCEL_ENV || 'local',scope,String(subject || 'unknown').slice(0,400)])).digest('hex');
}
async function consume(scope,subject,limit,windowSeconds,request = supabaseRequest) {
  const {data} = await request('rpc/drx_consume_request_budget_v1', {
    privileged:true,method:'POST',timeoutMs:3500,label:'Shared request budget',
    body:{p_bucket_hash:bucketHash(scope,subject),p_limit:limit,p_window_seconds:windowSeconds},
  });
  if (typeof data?.allowed !== 'boolean' || !Number.isInteger(data.remaining) || data.remaining < 0
    || !Number.isInteger(data.resetSeconds) || data.resetSeconds < 1) throw new Error('Shared request budget response is invalid.');
  return data;
}
async function enforce(res,checks,request = supabaseRequest) {
  if (!enabled()) return true;
  try {
    for (const [scope,subject,limit,seconds] of checks) {
      const result = await consume(scope,subject,limit,seconds,request);
      res.setHeader('RateLimit-Limit',String(limit)); res.setHeader('RateLimit-Remaining',String(result.remaining)); res.setHeader('RateLimit-Reset',String(result.resetSeconds));
      if (!result.allowed) {
        res.setHeader('Retry-After',String(result.resetSeconds));
        res.status(429).json({code:'SHARED_RATE_LIMIT',error:'Shumë kërkesa. Provo përsëri pas pak.'}); return false;
      }
    }
    return true;
  } catch {
    res.status(503).json({code:'SHARED_RATE_LIMIT_UNAVAILABLE',error:'Kontrolli i kërkesave nuk është i disponueshëm. Provo përsëri pas pak.'}); return false;
  }
}
module.exports={enabled,bucketHash,consume,enforce};
