'use strict';

const { neonRequest } = require('./medindex-data-api.js');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

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

function adjustmentSourceValid(adjustment = {}) {
  const source = adjustment?.source || {};
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

function adjustmentValid(adjustment = {}) {
  if (!adjustmentSourceValid(adjustment)) return false;
  const status = clean(adjustment.reviewStatus ?? adjustment.review_status).toLowerCase();
  if (!['verified','approved'].includes(status)) return false;
  if (!clean(adjustment.verifiedBy ?? adjustment.verified_by)) return false;
  if (!clean(adjustment.verifiedAt ?? adjustment.verified_at)) return false;
  const action = clean(adjustment.doseAction ?? adjustment.dose_action);
  if (action === 'max_daily_cap') {
    const cap = finite(adjustment.maxDailyDoseMg ?? adjustment.max_daily_dose_mg);
    if (cap === null || cap <= 0) return false;
  }
  return true;
}

function conversionValid(conversion = {}) {
  const status = clean(conversion.status);
  const enabled = conversion.enabled === true;
  return clean(conversion.bindingStatus).toLowerCase() === 'verified'
    && Boolean(clean(conversion.verifiedBy))
    && Boolean(clean(conversion.verifiedAt))
    && (enabled ? status === 'automatic' : status === 'not_allowed');
}

function ruleSourceValid(rule = {}) {
  const source = rule?.source || {};
  const snapshot = clean(source.snapshotId);
  const sectionHash = clean(source.sectionSha256);
  const evidenceHash = clean(source.evidenceHash);
  const renal = Array.isArray(rule.renalAdjustments) ? rule.renalAdjustments : [];
  const hepatic = Array.isArray(rule.hepaticAdjustments) ? rule.hepaticAdjustments : [];
  return /^[0-9a-f]{64}$/i.test(snapshot)
    && /^[0-9a-f]{64}$/i.test(sectionHash)
    && /^[0-9a-f]{64}$/i.test(evidenceHash)
    && snapshot.toLowerCase() === evidenceHash.toLowerCase()
    && clean(source.section) === '4.2'
    && Boolean(source.documentVersion || source.documentDate)
    && source.official === true
    && renal.every(adjustmentValid)
    && hepatic.every(adjustmentValid)
    && conversionValid(rule.conversion || {})
    && (rule.renalAdjustmentRequired !== true || renal.length > 0)
    && (rule.hepaticAdjustmentRequired !== true || hepatic.length > 0);
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
  const { data } = await neonRequest('rpc/medindex_dose_product_fast_path_v4', {
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
    runtimeModel:'v3-rpc-v4',
  };
  return payload;
}

module.exports = {
  build,
  rpcStrict,
  isRpcMissing,
  _test:{ clean, finite, enabledFlag, bodyFor, unwrap, adjustmentSourceValid, adjustmentValid, conversionValid, ruleSourceValid, payloadValid },
};
