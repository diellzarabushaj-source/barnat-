'use strict';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const enabledFlag = value => ['1','TRUE','YES','ON'].includes(clean(value).toUpperCase());
const SHA256_RE = /^[0-9a-f]{64}$/i;

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

function sourceValid(source = {}) {
  const snapshot = clean(source.snapshotId);
  const sectionHash = clean(source.sectionSha256);
  const evidenceHash = clean(source.evidenceHash);
  return SHA256_RE.test(snapshot)
    && SHA256_RE.test(sectionHash)
    && SHA256_RE.test(evidenceHash)
    && snapshot.toLowerCase() === evidenceHash.toLowerCase()
    && clean(source.section) === '4.2'
    && Boolean(source.documentVersion || source.documentDate)
    && source.official === true;
}

function adjustmentValid(adjustment = {}) {
  return Boolean(adjustment && sourceValid(adjustment.source || {}));
}

function ruleValid(rule = {}) {
  const renal = Array.isArray(rule.renalAdjustments) ? rule.renalAdjustments : [];
  const hepatic = Array.isArray(rule.hepaticAdjustments) ? rule.hepaticAdjustments : [];
  return sourceValid(rule.source || {})
    && renal.every(adjustmentValid)
    && hepatic.every(adjustmentValid)
    && (rule.renalAdjustmentRequired !== true || renal.length > 0)
    && (rule.hepaticAdjustmentRequired !== true || hepatic.length > 0);
}

function validateV3Payload(payload) {
  if (!payload || payload.schemaVersion !== 'dose-product-fast-path-v3') return false;
  if (payload?.meta?.failClosed !== true) return false;
  if (payload?.meta?.publishedOnly !== true) return false;
  if (payload?.meta?.officialVerifiedOnly !== true) return false;
  if (!payload?.product?.productKey || !Array.isArray(payload?.product?.rules) || payload.product.rules.length === 0) return false;
  return payload.product.rules.every(ruleValid);
}

module.exports = {
  v3ReadsEnabled,
  v3StrictEnabled,
  chooseRuntime,
  validateV3Payload,
  _test:{ clean, enabledFlag, sourceValid, adjustmentValid, ruleValid, SHA256_RE },
};
