'use strict';

const fs = require('node:fs');
const path = require('node:path');

const POLICY_PATH = path.join(__dirname, '..', 'data', 'drx-dose-source-policy-v1.json');

function loadPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

function clean(value) {
  return String(value ?? '').trim();
}

function canonicalHost(value) {
  try {
    const url = new URL(clean(value));
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizedUrl(value) {
  const raw = clean(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function domainMatches(host, domain) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  const d = String(domain || '').toLowerCase().replace(/^www\./, '');
  return Boolean(h && d && (h === d || h.endsWith('.' + d)));
}

function sourceTierForUrl(value, policy = loadPolicy()) {
  const url = normalizedUrl(value);
  if (!url) return null;
  const host = canonicalHost(url);
  const ordered = [...policy.tiers].sort((a, b) => a.rank - b.rank);
  for (const tier of ordered) {
    if ((tier.domains || []).some(domain => domainMatches(host, domain))) {
      return {
        key:tier.key,
        rank:Number(tier.rank),
        label:tier.label,
        authority:tier.authority,
        jurisdiction:tier.jurisdiction,
        autoPublishEligible:Boolean(tier.autoPublishEligible),
        url,
        host,
      };
    }
  }
  const fallback = ordered.find(tier => tier.key === 'FALLBACK') || null;
  return fallback ? {
    key:fallback.key,
    rank:Number(fallback.rank),
    label:fallback.label,
    authority:fallback.authority,
    jurisdiction:fallback.jurisdiction,
    autoPublishEligible:false,
    url,
    host,
  } : null;
}

function candidateKey(candidate) {
  const url = normalizedUrl(candidate?.url);
  return [
    url,
    clean(candidate?.documentType).toUpperCase(),
    clean(candidate?.productName).toLowerCase(),
  ].join('|');
}

function rankCandidate(candidate, policy = loadPolicy()) {
  const tier = sourceTierForUrl(candidate?.url, policy);
  const documentType = clean(candidate?.documentType).toUpperCase();
  const hasVersion = Boolean(clean(candidate?.documentVersion) || clean(candidate?.documentDate));
  const productSpecific = candidate?.productSpecific === true;
  const substanceMatch = candidate?.substanceMatch === true;
  const productMatch = candidate?.productMatch === true;
  const doseSection = candidate?.hasDoseSection === true;

  if (!tier) return {
    ...candidate,
    accepted:false,
    rejectReason:'invalid_or_non_https_url',
    rankScore:Number.POSITIVE_INFINITY,
    tier:null,
  };

  const knownTier = policy.tiers.find(item => item.key === tier.key);
  const acceptedDocument = Boolean(
    knownTier && (knownTier.acceptedDocumentTypes || []).map(x => String(x).toUpperCase()).includes(documentType)
  );

  let penalty = 0;
  if (!acceptedDocument) penalty += 25;
  if (!hasVersion) penalty += 8;
  if (!doseSection) penalty += 20;
  if (!productSpecific) penalty += 4;
  if (!productMatch && !substanceMatch) penalty += 30;

  return {
    ...candidate,
    url:tier.url,
    tier,
    accepted:acceptedDocument && (productMatch || substanceMatch),
    rejectReason:acceptedDocument
      ? ((productMatch || substanceMatch) ? '' : 'identity_not_matched')
      : 'document_type_not_accepted',
    rankScore:tier.rank + penalty,
    publicationEligible:Boolean(
      tier.autoPublishEligible
      && acceptedDocument
      && hasVersion
      && doseSection
      && (productMatch || substanceMatch)
    ),
  };
}

function chooseBestCandidate(candidates, policy = loadPolicy()) {
  const unique = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const ranked = rankCandidate(candidate, policy);
    const key = candidateKey(ranked);
    if (!key || key.startsWith('|')) continue;
    const current = unique.get(key);
    if (!current || ranked.rankScore < current.rankScore) unique.set(key, ranked);
  }
  const ordered = [...unique.values()].sort((a, b) =>
    a.rankScore - b.rankScore
    || Number(Boolean(b.productSpecific)) - Number(Boolean(a.productSpecific))
    || clean(a.url).localeCompare(clean(b.url))
  );
  return {
    best:ordered.find(item => item.accepted) || null,
    candidates:ordered,
  };
}

function publicationDecision(candidate, policy = loadPolicy()) {
  const ranked = rankCandidate(candidate, policy);
  if (!ranked.accepted) {
    return { allowed:false, reason:ranked.rejectReason || 'source_not_accepted', candidate:ranked };
  }
  if (!ranked.publicationEligible) {
    return { allowed:false, reason:'source_requires_review', candidate:ranked };
  }
  if (!policy.publication.minimumAuthority.includes(ranked.tier.key)) {
    return { allowed:false, reason:'authority_below_publication_threshold', candidate:ranked };
  }
  return { allowed:true, reason:'authoritative_source_complete', candidate:ranked };
}

module.exports = {
  loadPolicy,
  canonicalHost,
  normalizedUrl,
  domainMatches,
  sourceTierForUrl,
  rankCandidate,
  chooseBestCandidate,
  publicationDecision,
  _test:{ clean, candidateKey },
};
