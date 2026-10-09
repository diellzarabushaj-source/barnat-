'use strict';

const crypto = require('node:crypto');
const { supabaseRequest } = require('./supabase-data-api.js');
const SharedBudget = require('./shared-request-budget.js');
const AdminAccess = require('./admin-access.js');

const RELEASE = '20261009-rum-v1';
const MODULES = Object.freeze(['registry','atc','icd','dosage','antibiotics','protocols','emergencies','favorites','notes','prescriptions','labs','medical-hub','system']);
const DEVICES = Object.freeze(['mobile','tablet','desktop']);
const METRICS = Object.freeze(['NAV','LCP','INP','CLS','RUNTIME_ERROR','NETWORK_ERROR','SERVER_ERROR']);
const MAX_BODY_BYTES = 8192;
const MAX_EVENTS = 12;
const MIN_SAMPLES = 20;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
const AUTH_UUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;

class TelemetryError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function exactKeys(value, expected) {
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === expected.length
    && expected.every(key => Object.hasOwn(value, key));
}

function sameOrigin(req) {
  const origin = String(req.headers?.origin || '');
  const host = String(req.headers?.host || '').toLowerCase();
  if (!origin || !/^[a-z\d.:[\]-]{1,200}$/i.test(host)) return false;
  try {
    const url = new URL(origin);
    return url.origin === origin && url.host.toLowerCase() === host
      && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)));
  } catch { return false; }
}

async function readBody(req) {
  if (Number(req.headers?.['content-length'] || 0) > MAX_BODY_BYTES) throw new TelemetryError(413,'TELEMETRY_TOO_LARGE');
  let raw = req.body;
  if (raw === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += part.length;
      if (size > MAX_BODY_BYTES) throw new TelemetryError(413,'TELEMETRY_TOO_LARGE');
      chunks.push(part);
    }
    raw = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw !== 'string') {
    try { raw = JSON.stringify(raw); } catch { throw new TelemetryError(400,'TELEMETRY_INVALID'); }
  }
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new TelemetryError(413,'TELEMETRY_TOO_LARGE');
  try { return JSON.parse(raw); } catch { throw new TelemetryError(400,'TELEMETRY_INVALID'); }
}

function validRelease(value) {
  const deployed = String(process.env.VERCEL_GIT_COMMIT_SHA || '');
  return value === RELEASE || (/^[a-f\d]{40}$/.test(deployed) && value === deployed);
}

function validatePayload(body) {
  if (!exactKeys(body,['version','module','device','release','events']) || body.version !== 1
    || !MODULES.includes(body.module) || !DEVICES.includes(body.device) || !validRelease(body.release)
    || !Array.isArray(body.events) || !body.events.length || body.events.length > MAX_EVENTS) {
    throw new TelemetryError(400,'TELEMETRY_INVALID');
  }
  const seen = new Set();
  const events = body.events.map(event => {
    if (!exactKeys(event,['id','name','value','revision']) || typeof event.id !== 'string' || !UUID.test(event.id)
      || !METRICS.includes(event.name) || typeof event.value !== 'number' || !Number.isFinite(event.value)
      || !Number.isInteger(event.revision) || event.revision < 1 || event.revision > 1000) {
      throw new TelemetryError(400,'TELEMETRY_INVALID');
    }
    const maximum = event.name === 'CLS' ? 10 : ['LCP','INP'].includes(event.name) ? 60000 : 1;
    if (event.value < 0 || event.value > maximum || (!['CLS','LCP','INP'].includes(event.name) && event.value !== 1)) {
      throw new TelemetryError(400,'TELEMETRY_INVALID');
    }
    const key = `${event.id}:${event.name}`;
    if (seen.has(key)) throw new TelemetryError(400,'TELEMETRY_INVALID');
    seen.add(key);
    return { id:event.id, name:event.name, value:event.name === 'CLS' ? Math.round(event.value * 10000) / 10000 : Math.round(event.value),revision:event.revision };
  });
  return { version:1,module:body.module,device:body.device,release:body.release,events };
}

function privatePayload(payload) {
  const key = String(process.env.MEDINDEX_RATE_LIMIT_KEY || process.env.SESSION_SECRET || process.env.MEDINDEX_SESSION_SECRET || '').trim();
  if (key.length < 32) throw new TelemetryError(503,'TELEMETRY_UNAVAILABLE');
  const deployed = String(process.env.VERCEL_GIT_COMMIT_SHA || '');
  const release = /^[a-f\d]{40}$/.test(deployed) ? deployed : RELEASE;
  return { ...payload,release,events:payload.events.map(event => ({ ...event,
    id:crypto.createHmac('sha256',key).update(JSON.stringify(['runtime-metric-v1',process.env.VERCEL_ENV || 'local',release,payload.module,payload.device,event.id,event.name])).digest('hex'),
  })) };
}

async function activeSession(req, deps = {}) {
  const auth = deps.auth || await import('./auth.mjs');
  const session = auth.sessionData(auth.sessionFromRequest(req));
  if (!session) throw new TelemetryError(401,'SESSION_REQUIRED');
  if (!['supabase-google','supabase-password'].includes(session.provider) || !AUTH_UUID.test(String(session.authUid || ''))) {
    throw new TelemetryError(403,'SUPABASE_SESSION_REQUIRED');
  }
  if (!auth.verifyCsrfToken(req, String(req.headers?.['x-csrf-token'] || ''))) throw new TelemetryError(403,'CSRF_INVALID');
  const request = deps.request || supabaseRequest;
  const { data } = await request(`profiles?select=id,role,status&id=eq.${encodeURIComponent(session.authUid)}&limit=1`,
    { privileged:true,timeoutMs:2500,label:'Telemetry profile authorization' });
  const profile = Array.isArray(data) ? data[0] : null;
  if (profile?.id !== session.authUid || profile.status !== 'active' || !['doctor','admin'].includes(profile.role)) {
    throw new TelemetryError(403,'ACCOUNT_INACTIVE');
  }
  return session;
}

async function ingest(req,res,deps = {}) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Vary','Cookie, Origin');
  try {
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); throw new TelemetryError(405,'METHOD_NOT_ALLOWED'); }
    if (process.env.MEDINDEX_RUNTIME_TELEMETRY !== '1') throw new TelemetryError(503,'TELEMETRY_DISABLED');
    if (!sameOrigin(req)) throw new TelemetryError(403,'ORIGIN_INVALID');
    if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.['content-type'] || ''))) throw new TelemetryError(415,'CONTENT_TYPE_INVALID');
    const payload = validatePayload(await readBody(req));
    const session = await activeSession(req,deps);
    const request = deps.request || supabaseRequest;
    // This budget always applies to telemetry, independently of auth/AI rollout.
    const budget = await (deps.consume || SharedBudget.consume)('runtime-telemetry',session.authUid,12,60,request);
    if (!budget.allowed) { res.setHeader('Retry-After',String(budget.resetSeconds)); throw new TelemetryError(429,'TELEMETRY_LIMIT'); }
    const { data } = await request('rpc/drx_record_runtime_telemetry_v1',{
      privileged:true,method:'POST',timeoutMs:2500,label:'Runtime telemetry',body:{ p_payload:privatePayload(payload) },
    });
    if (!Number.isInteger(data?.accepted) || data.accepted < 0 || data.accepted > payload.events.length) throw new TelemetryError(503,'TELEMETRY_UNAVAILABLE');
    return res.status(204).end();
  } catch (error) {
    // Never log received bodies, upstream details, account data or raw exceptions.
    return res.status(error instanceof TelemetryError ? error.status : 503).json({ ok:false,code:error instanceof TelemetryError ? error.code : 'TELEMETRY_UNAVAILABLE' });
  }
}

function percentileUpper(buckets,count,fraction = .75) {
  if (count < MIN_SAMPLES) return null;
  const target = Math.ceil(count * fraction); let cumulative = 0;
  for (const bucket of buckets) { cumulative += bucket.count; if (cumulative >= target) return bucket.upper; }
  return null;
}

function summarize(data) {
  if (data?.available !== true || data.windowHours !== 24 || !Array.isArray(data.groups) || data.groups.length > 1000) throw new TelemetryError(503,'TELEMETRY_UNAVAILABLE');
  const seen = new Set();
  const groups = data.groups.map(group => {
    if (!exactKeys(group,['module','device','release','metric','count','buckets'])
      || !MODULES.includes(group.module) || !DEVICES.includes(group.device) || !(group.release === RELEASE || /^[a-f\d]{40}$/.test(group.release)) || !METRICS.includes(group.metric)
      || !Number.isSafeInteger(group.count) || group.count < 0 || !Array.isArray(group.buckets) || group.buckets.length > 20) throw new TelemetryError(503,'TELEMETRY_UNAVAILABLE');
    const id = [group.module,group.device,group.release,group.metric].join(':');
    if (seen.has(id)) throw new TelemetryError(503,'TELEMETRY_UNAVAILABLE');
    seen.add(id);
    let previous = -1; let total = 0;
    const buckets = group.buckets.map(bucket => {
      if (!exactKeys(bucket,['upper','count']) || !Number.isFinite(bucket.upper) || bucket.upper <= previous || !Number.isSafeInteger(bucket.count) || bucket.count < 0) throw new TelemetryError(503,'TELEMETRY_UNAVAILABLE');
      previous = bucket.upper; total += bucket.count;
      return { upper:bucket.upper,count:bucket.count };
    });
    if (total !== group.count) throw new TelemetryError(503,'TELEMETRY_UNAVAILABLE');
    const p75Upper = ['LCP','INP','CLS'].includes(group.metric) ? percentileUpper(buckets,group.count) : null;
    const good = { LCP:2500,INP:200,CLS:.1 }[group.metric];
    const poor = { LCP:4000,INP:500,CLS:.25 }[group.metric];
    const state = p75Upper === null ? 'insufficient-data' : p75Upper > poor ? 'poor' : p75Upper > good ? 'needs-improvement' : 'good';
    return { ...group,p75Upper,p75Method:'histogram-upper-bound',state };
  });
  const cohorts = new Map();
  for (const group of groups) {
    const key = [group.module,group.device,group.release].join(':');
    if (!cohorts.has(key)) cohorts.set(key,{ module:group.module,device:group.device,release:group.release,navigations:0,metrics:{},errors:{} });
    const cohort = cohorts.get(key);
    if (group.metric === 'NAV') cohort.navigations = group.count;
    else if (group.metric.endsWith('_ERROR')) cohort.errors[group.metric] = group.count;
    else cohort.metrics[group.metric] = { count:group.count,p75Upper:group.p75Upper,state:group.state };
  }
  const operational = [...cohorts.values()].map(cohort => {
    const enough = cohort.navigations >= MIN_SAMPLES;
    const metrics = Object.fromEntries(['LCP','INP','CLS'].map(name => [name,cohort.metrics[name] || { count:0,p75Upper:null,state:'unavailable' }]));
    const errors = Object.fromEntries(['RUNTIME_ERROR','NETWORK_ERROR','SERVER_ERROR'].map(name => {
      const count = cohort.errors[name] || 0;
      return [name,{ count,rate:enough ? count / cohort.navigations : null,alarm:enough && count >= 3 && count / cohort.navigations >= .05 }];
    }));
    return { ...cohort,metrics,errors,state:!enough ? 'insufficient-data' : Object.values(metrics).some(metric => ['poor','needs-improvement'].includes(metric.state)) || Object.values(errors).some(error => error.alarm) ? 'warning' : Object.values(metrics).some(metric => ['unavailable','insufficient-data'].includes(metric.state)) ? 'partial-data' : 'healthy' };
  });
  return { available:true,windowHours:24,minimumSamples:MIN_SAMPLES,groups,cohorts:operational,checkedAt:new Date().toISOString() };
}

async function readSummary(req,res,deps = {}) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Vary','Cookie');
  try {
    if (req.method !== 'GET') { res.setHeader('Allow','GET'); throw new TelemetryError(405,'METHOD_NOT_ALLOWED'); }
    await (deps.requireAdmin || AdminAccess.requireAdminSession)(req);
    const { data } = await (deps.request || supabaseRequest)('rpc/drx_runtime_telemetry_summary_v1',{
      privileged:true,method:'POST',timeoutMs:2500,label:'Runtime telemetry summary',body:{},
    });
    const deployed = String(process.env.VERCEL_GIT_COMMIT_SHA || '');
    return res.status(200).json({ ...summarize(data),currentRelease:/^[a-f\d]{40}$/.test(deployed) ? deployed : RELEASE,enabled:process.env.MEDINDEX_RUNTIME_TELEMETRY === '1' });
  } catch (error) {
    const status = error instanceof TelemetryError ? error.status : [401,403].includes(error?.status) ? error.status : 503;
    return res.status(status).json({ available:false,code:status === 401 ? 'SESSION_REQUIRED' : status === 403 ? 'ADMIN_REQUIRED' : 'TELEMETRY_UNAVAILABLE' });
  }
}

module.exports = { RELEASE,MODULES,DEVICES,METRICS,MAX_BODY_BYTES,MIN_SAMPLES,ingest,readSummary,_test:{ TelemetryError,exactKeys,sameOrigin,readBody,validatePayload,privatePayload,activeSession,percentileUpper,summarize } };
