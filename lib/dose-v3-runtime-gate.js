'use strict';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const enabledFlag = value => ['1','TRUE','YES','ON'].includes(clean(value).toUpperCase());

function v3ReadsEnabled(env = process.env) {
  return enabledFlag(env.DRX_DOSE_V3_READS);
}

function v3StrictEnabled(env = process.env) {
  return enabledFlag(env.DRX_DOSE_V3_STRICT);
}

function chooseRuntime({ v3Enabled, v3Available, v2Available, strictV3 }) {
  if (v3Enabled && v3Available) return { runtime:'v3', failClosed:false };
  if (v3Enabled && strictV3) return { runtime:null, failClosed:true, reason:'v3_unavailable' };
  if (v2Available) return { runtime:'v2', failClosed:false, fallback:v3Enabled };
  return { runtime:null, failClosed:true, reason:'no_published_runtime' };
}

function validateV3Payload(payload) {
  if (!payload || payload.schemaVersion !== 'dose-product-fast-path-v3') return false;
  if (payload?.meta?.failClosed !== true) return false;
  if (payload?.meta?.publishedOnly !== true) return false;
  if (payload?.meta?.officialVerifiedOnly !== true) return false;
  if (!payload?.product?.productKey || !Array.isArray(payload?.product?.rules)) return false;
  return payload.product.rules.every(rule =>
    clean(rule?.source?.snapshotId)
    && /^[0-9a-f]{64}$/i.test(clean(rule?.source?.evidenceHash))
    && clean(rule?.source?.section) === '4.2'
  );
}

module.exports = {
  v3ReadsEnabled,
  v3StrictEnabled,
  chooseRuntime,
  validateV3Payload,
  _test:{ clean, enabledFlag },
};
