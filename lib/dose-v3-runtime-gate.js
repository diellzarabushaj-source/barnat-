'use strict';

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const enabledFlag = value => ['1','TRUE','YES','ON'].includes(clean(value).toUpperCase());
const SHA256_RE = /^[0-9a-f]{64}$/i;
const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

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
  if (!adjustment || !sourceValid(adjustment.source || {})) return false;
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

function ruleValid(rule = {}) {
  const renal = Array.isArray(rule.renalAdjustments) ? rule.renalAdjustments : [];
  const hepatic = Array.isArray(rule.hepaticAdjustments) ? rule.hepaticAdjustments : [];
  return sourceValid(rule.source || {})
    && renal.every(adjustmentValid)
    && hepatic.every(adjustmentValid)
    && conversionValid(rule.conversion || {})
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
  _test:{ clean, finite, enabledFlag, sourceValid, adjustmentValid, conversionValid, ruleValid, SHA256_RE },
};
