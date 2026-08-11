'use strict';

const QUOTA_RETRY_SECONDS = 15 * 60;
const RATE_LIMIT_RETRY_SECONDS = 90;
const TRANSIENT_RETRY_SECONDS = 30;
const LOG_THROTTLE_MS = 5 * 60 * 1000;
const lastLogs = new Map();

function neonStatus(error) {
  return Number(error?.neonStatus || error?.status || 0) || 0;
}

function isUnavailable(error) {
  const status = neonStatus(error);
  if ([402, 408, 425, 429].includes(status) || status >= 500) return true;
  const detail = [error?.code, error?.message, error?.cause?.code].filter(Boolean).join(' ');
  return /ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|timed out/i.test(detail);
}

function retryAfterSeconds(error) {
  const explicit = Number(error?.retryAfterSeconds || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.ceil(explicit);
  const status = neonStatus(error);
  if (status === 402) return QUOTA_RETRY_SECONDS;
  if (status === 429) return RATE_LIMIT_RETRY_SECONDS;
  return isUnavailable(error) ? TRANSIENT_RETRY_SECONDS : 0;
}

function applyRetryHeaders(res, error) {
  const seconds = retryAfterSeconds(error);
  if (seconds > 0) res.setHeader('Retry-After', String(seconds));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-MedIndex-Data-Mode', 'degraded');
  return seconds;
}

function safeLog(label, error, intervalMs = LOG_THROTTLE_MS) {
  if (!isUnavailable(error)) {
    console.error(label, error);
    return true;
  }
  const key = `${label}|${neonStatus(error) || 'network'}`;
  const now = Date.now();
  const previous = Number(lastLogs.get(key) || 0);
  if (now - previous < intervalMs) return false;
  lastLogs.set(key, now);
  console.warn(`${label}: Neon unavailable (${neonStatus(error) || 'network'}); fallback/degraded mode active.`);
  return true;
}

module.exports = {
  QUOTA_RETRY_SECONDS,
  RATE_LIMIT_RETRY_SECONDS,
  TRANSIENT_RETRY_SECONDS,
  LOG_THROTTLE_MS,
  neonStatus,
  isUnavailable,
  retryAfterSeconds,
  applyRetryHeaders,
  safeLog,
};
