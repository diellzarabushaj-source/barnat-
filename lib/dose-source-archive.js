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

const MONTH_NUMBER = Object.freeze({
  jan:'01', january:'01',
  feb:'02', february:'02',
  mar:'03', march:'03',
  apr:'04', april:'04',
  may:'05',
  jun:'06', june:'06',
  jul:'07', july:'07',
  aug:'08', august:'08',
  sep:'09', sept:'09', september:'09',
  oct:'10', october:'10',
  nov:'11', november:'11',
  dec:'12', december:'12',
});

function parseEmcDocumentDate(input) {
  const text = SmPC.normalizeClinicalText(input);
  const match = text.match(/Last updated on emc:\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i);
  if (!match) return null;
  const month = MONTH_NUMBER[String(match[2] || '').toLowerCase()];
  if (!month) return null;
  const day = String(Number(match[1])).padStart(2, '0');
  return `${match[3]}-${month}-${day}`;
}

function extractSourceDocumentMetadata(input) {
  const html = String(input || '');
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const productName = SmPC.normalizeClinicalText(h1?.[1] || title?.[1] || '')
    .replace(/\s+-\s+Summary of Product Characteristics[\s\S]*$/i, '')
    .trim();

  return {
    productName:productName || null,
    documentDate:parseEmcDocumentDate(html),
  };
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
  // Section 2 carries the salt and strength basis, which no clinical section
  // states. It is hashed alongside them so a base-to-salt equivalence can be
  // proven from archived evidence rather than assumed from naming convention.
  // It stays out of `parsed` so clinicalSectionCoverage keeps its meaning.
  const composition = SmPC.extractCompositionSection(bodyText);
  const hashableSections = Object.entries(parsed.sections || {});
  if (composition && String(composition.text || '').trim()) {
    hashableSections.push([composition.code, composition]);
  }
  const sectionSha256 = Object.fromEntries(
    hashableSections
      .filter(([, section]) => String(section?.text || '').trim())
      .map(([code, section]) => [code, sha256(Buffer.from(section.text, 'utf8'))])
  );
  const sourceDocument = extractSourceDocumentMetadata(bodyText);

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
    sourceDocument,
    sectionSha256,
    composition,
    parser:{
      schemaVersion:parsed.schemaVersion,
      present:parsed.present,
      missing:parsed.missing,
      clinicalSectionCoverage:parsed.clinicalSectionCoverage,
      doseSectionPresent:parsed.doseSectionPresent,
      indicationsSectionPresent:parsed.indicationsSectionPresent,
      compositionSectionPresent:Boolean(composition && String(composition.text || '').trim()),
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
  const sectionsPath = path.join(dir, basename + '.sections.json');

  fs.writeFileSync(rawPath, snapshot.raw);

  // Section text goes in its own file rather than the metadata.
  //
  // The metadata is read by several consumers that only want identity and
  // hashes, so it stays text-free. But stripping the text and writing it
  // nowhere left the database load with no source for it: the ingester found
  // an empty section map, wrote only section 2 - which was carried separately
  // at the top level - and reported success. A partial load that reports
  // success is the failure this whole provenance model exists to prevent.
  //
  // This exposes nothing new. The full raw document is already written beside
  // it in the same directory and travels in the same artifact, so the text was
  // always there; it just was not in a form the loader could use without
  // re-running the parser itself. Keeping the parse here means the job that
  // holds the Supabase key never has to run it.
  const sectionEntries = Object.entries(snapshot.parsed?.sections || {})
    .filter(([, section]) => String(section?.text || '').trim())
    .map(([code, section]) => [code, {
      code,
      key: section.key || code,
      heading: section.heading || null,
      text: section.text,
      sha256: sha256(Buffer.from(section.text, 'utf8')),
    }]);
  const composition = snapshot.composition;
  if (composition && String(composition.text || '').trim()) {
    sectionEntries.push([composition.code, {
      code: composition.code,
      key: composition.key,
      heading: composition.heading || null,
      text: composition.text,
      sha256: sha256(Buffer.from(composition.text, 'utf8')),
    }]);
  }
  fs.writeFileSync(sectionsPath, JSON.stringify({
    schemaVersion: 'drx-dose-section-payload-v1',
    snapshotId: snapshot.snapshotId,
    rawSha256: snapshot.rawSha256,
    parserVersion: snapshot.parser?.schemaVersion || null,
    sections: Object.fromEntries(sectionEntries),
  }, null, 2) + '\n', 'utf8');

  const metadata = { ...snapshot };
  delete metadata.raw;
  delete metadata.parsed?.sections;
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');

  return { rawPath, metaPath, sectionsPath };
}

module.exports = {
  DEFAULT_MAX_BYTES,
  ACCEPTED_TYPES,
  sha256,
  fetchSourceSnapshot,
  writeSnapshot,
  _test:{ safeSegment, contentTypeBase, readBoundedBody, parseEmcDocumentDate, extractSourceDocumentMetadata },
};
