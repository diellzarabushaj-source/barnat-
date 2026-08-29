'use strict';

const { neonRequest } = require('./medindex-data-api.js');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function enabledFlag(value) {
  return ['1','TRUE','YES','ON'].includes(clean(value).toUpperCase());
}

function rpcStrict(env = process.env) {
  return enabledFlag(env.DRX_DOSE_V3_RPC_STRICT);
}

function isRpcMissing(error) {
  const status = Number(error?.status || 0);
  const detail = [
    error?.message,
    error?.payload?.message,
    error?.payload?.details,
    error?.payload?.code,
  ].filter(Boolean).join(' ');
  return status === 404 || /PGRST202|function.+does not exist|could not find the function/i.test(detail);
}

function bodyFor(selector) {
  if (!selector || !['product_key','drug_id'].includes(selector.column)) return null;
  if (!clean(selector.value)) return null;
  return {
    p_product_key:selector.column === 'product_key' ? clean(selector.value) : null,
    p_drug_id:selector.column === 'drug_id' ? clean(selector.value) : null,
  };
}

function unwrap(data) {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    if (data.length === 1) return data[0] ?? null;
  }
  return data;
}

function ruleSourceValid(rule = {}) {
  const source = rule?.source || {};
  const snapshot = clean(source.snapshotId);
  const sectionHash = clean(source.sectionSha256);
  const evidenceHash = clean(source.evidenceHash);
  return /^[0-9a-f]{64}$/i.test(snapshot)
    && /^[0-9a-f]{64}$/i.test(sectionHash)
    && /^[0-9a-f]{64}$/i.test(evidenceHash)
    && snapshot.toLowerCase() === evidenceHash.toLowerCase()
    && clean(source.section) === '4.2'
    && Boolean(source.documentVersion || source.documentDate)
    && source.official === true;
}

function payloadValid(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.schemaVersion !== 'dose-product-fast-path-v3') return false;
  if (!payload.product || !Array.isArray(payload.product.rules) || payload.product.rules.length === 0) return false;
  if (!payload.product.rules.every(ruleSourceValid)) return false;
  const meta = payload.meta || {};
  return meta.failClosed === true
    && meta.publishedOnly === true
    && meta.officialVerifiedOnly === true;
}

async function build(selector) {
  const body = bodyFor(selector);
  if (!body) return null;
  const { data } = await neonRequest('rpc/medindex_dose_product_fast_path_v3', {
    method:'POST',
    body,
    timeoutMs:5000,
    label:'V3 dose product RPC',
  });
  const payload = unwrap(data);
  if (!payload) return null;
  if (!payloadValid(payload)) {
    const error = new Error('V3 dose product RPC returned an invalid or unverified payload.');
    error.code = 'DRX_V3_RPC_INVALID_PAYLOAD';
    throw error;
  }
  payload.meta = {
    ...(payload.meta || {}),
    dataSource:'supabase-v3-rpc',
    dbReads:1,
    runtimeModel:'v3-rpc',
  };
  return payload;
}

module.exports = {
  build,
  rpcStrict,
  isRpcMissing,
  _test:{ clean, enabledFlag, bodyFor, unwrap, ruleSourceValid, payloadValid },
};
