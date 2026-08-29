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
  if (typeof payload !== 'object' || payload.schemaVersion !== 'dose-product-fast-path-v3') {
    const error = new Error('V3 dose product RPC returned an invalid payload.');
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
  _test:{ clean, enabledFlag, bodyFor, unwrap },
};
