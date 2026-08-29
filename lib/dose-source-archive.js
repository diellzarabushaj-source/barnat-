'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const SourcePolicy = require('./dose-source-policy.js');
const SmPC = require('./smpc-parser.js');

const DEFAULT_MAX_BYTES = 6 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/plain',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeSegment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'source';
}

async function readBoundedBody(response, maxBytes) {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    const error = new Error(`Dose source exceeds archive limit of ${maxBytes} bytes.`);
    error.code = 'DOSE_SOURCE_TOO_LARGE';
    throw error;
  }
  return buffer;
}

function contentTypeBase(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

async function fetchSourceSnapshot(url, options = {}) {
  const policy = options.policy || SourcePolicy.loadPolicy();
  const tier = SourcePolicy.sourceTierForUrl(url, policy);
  if (!tier) {
    const error = new Error('Dose source URL is invalid or not HTTPS.');
    error.code = 'DOSE_SOURCE_URL_INVALID';
    throw error;
  }
  if (options.authoritativeOnly !== false && !tier.autoPublishEligible) {
    const error = new Error(`Dose source tier ${tier.key} is not authoritative enough for automatic archive ingestion.`);
    error.code = 'DOSE_SOURCE_TIER_REVIEW_ONLY';
    throw error;
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable.');

  const response = await fetchImpl(tier.url, {
    method:'GET',
    redirect:'follow',
    headers:{
      Accept:'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
      'User-Agent':'DRx-Dosierung-Source-Archiver/1.0',
    },
  });
  if (!response?.ok) {
    const error = new Error(`Dose source fetch failed with HTTP ${response?.status || 0}.`);
    error.code = 'DOSE_SOURCE_FETCH_FAILED';
    error.status = Number(response?.status || 0);
    throw error;
  }

  const finalUrl = SourcePolicy.normalizedUrl(response.url || tier.url);
  const finalTier = SourcePolicy.sourceTierForUrl(finalUrl, policy);
  if (!finalTier || finalTier.key !== tier.key) {
    const error = new Error('Dose source redirect crossed the approved source tier.');
    error.code = 'DOSE_SOURCE_REDIRECT_TIER_CHANGED';
    throw error;
  }

  const contentType = contentTypeBase(response.headers?.get?.('content-type'));
  if (contentType && !ACCEPTED_TYPES.has(contentType)) {
    const error = new Error(`Unsupported dose source content type: ${contentType}.`);
    error.code = 'DOSE_SOURCE_CONTENT_TYPE_UNSUPPORTED';
    throw error;
  }

  const maxBytes = Number.isFinite(Number(options.maxBytes))
    ? Math.max(1024, Number(options.maxBytes))
    : DEFAULT_MAX_BYTES;
  const raw = await readBoundedBody(response, maxBytes);
  const rawSha256 = sha256(raw);
  const bodyText = raw.toString('utf8');
  const parsed = SmPC.extractClinicalSections(bodyText);

  return {
    schemaVersion:'drx-dose-raw-snapshot-v1',
    snapshotId:rawSha256,
    fetchedAt:new Date().toISOString(),
    requestedUrl:tier.url,
    finalUrl,
    sourceTier:finalTier.key,
    authority:finalTier.authority,
    jurisdiction:finalTier.jurisdiction,
    contentType:contentType || 'unknown',
    contentLength:raw.length,
    rawSha256,
    etag:String(response.headers?.get?.('etag') || ''),
    lastModified:String(response.headers?.get?.('last-modified') || ''),
    parser:{
      schemaVersion:parsed.schemaVersion,
      present:parsed.present,
      missing:parsed.missing,
      clinicalSectionCoverage:parsed.clinicalSectionCoverage,
      doseSectionPresent:parsed.doseSectionPresent,
      indicationsSectionPresent:parsed.indicationsSectionPresent,
    },
    parsed,
    raw,
  };
}

function writeSnapshot(snapshot, outputDirectory) {
  if (!snapshot?.raw || !Buffer.isBuffer(snapshot.raw)) throw new Error('Snapshot raw body is missing.');
  const dir = path.resolve(outputDirectory);
  fs.mkdirSync(dir, { recursive:true });

  const host = SourcePolicy.canonicalHost(snapshot.finalUrl);
  const basename = `${safeSegment(snapshot.sourceTier)}-${safeSegment(host)}-${snapshot.rawSha256.slice(0, 20)}`;
  const rawPath = path.join(dir, basename + '.raw');
  const metaPath = path.join(dir, basename + '.json');

  fs.writeFileSync(rawPath, snapshot.raw);
  const metadata = { ...snapshot };
  delete metadata.raw;
  delete metadata.parsed?.sections;
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');

  return { rawPath, metaPath };
}

module.exports = {
  DEFAULT_MAX_BYTES,
  ACCEPTED_TYPES,
  sha256,
  fetchSourceSnapshot,
  writeSnapshot,
  _test:{ safeSegment, contentTypeBase, readBoundedBody },
};
