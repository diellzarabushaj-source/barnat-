'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const SmPC = require('./smpc-parser');
const SourcePolicy = require('./dose-source-policy');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const clean = value => String(value ?? '').trim();
const urls = values => [...new Set(values.flatMap(value => String(value || '').split(/;\s*/)).map(clean).filter(value => /^https:\/\//.test(value)))];

// An archive proves source retrieval, not product equivalence or clinical review.
function verifyArchive(entry) {
  if (entry.error || !/^https:\/\//.test(entry.finalUrl || entry.url || '')) return null;
  const primaryManufacturers = new Set(['hemofarm.com', 'vivantagenerics.de', 'krka-farma.hr']);
  const primaryRegulators = new Set(['rejestry.ezdrowie.gov.pl', 'rejestrymedyczne.ezdrowie.gov.pl']);
  const tier = SourcePolicy.sourceTierForUrl(entry.finalUrl || entry.url);
  if (!tier?.autoPublishEligible && !primaryManufacturers.has(tier?.host) && !primaryRegulators.has(tier?.host)) return null;
  const rawPath = entry.files?.rawPath || entry.rawPath;
  const sectionsPath = entry.files?.sectionsPath || entry.sectionsPath;
  if (!rawPath || !sectionsPath) return null;
  const raw = fs.readFileSync(path.resolve(rawPath));
  const metadata = entry.files?.metaPath ? JSON.parse(fs.readFileSync(entry.files.metaPath, 'utf8')) : entry;
  if (metadata.rawSha256 !== entry.rawSha256) throw new Error('Source metadata raw hash mismatch: ' + entry.url);
  if (hash(raw) !== entry.rawSha256) throw new Error('Source raw hash mismatch: ' + entry.url);
  const payload = JSON.parse(fs.readFileSync(path.resolve(sectionsPath), 'utf8'));
  const sections = payload.sections || payload;
  for (const code of ['4.1', '4.2']) {
    if (!clean(sections[code]?.text)) return null;
    if (hash(Buffer.from(sections[code].text, 'utf8')) !== sections[code].sha256) throw new Error('Source section hash mismatch: ' + entry.url);
    if (entry.sectionSha256?.[code] !== sections[code].sha256) throw new Error('Source metadata hash mismatch: ' + entry.url);
    if (metadata.sectionSha256?.[code] !== sections[code].sha256) throw new Error('Archived metadata section hash mismatch: ' + entry.url);
  }
  if (!raw.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    const reparsed = SmPC.extractClinicalSections(raw.toString('utf8'));
    for (const code of ['4.1', '4.2']) if (hash(Buffer.from(reparsed.sections[code]?.text || '', 'utf8')) !== sections[code].sha256) throw new Error('Source reparse mismatch: ' + entry.url);
  }
  return {
    url: entry.url, finalUrl: entry.finalUrl || entry.url, rawSha256: entry.rawSha256,
    sectionSha256: { '4.1': sections['4.1'].sha256, '4.2': sections['4.2'].sha256 },
    productName: metadata.sourceDocument?.productName || null,
    documentDate: metadata.sourceDocument?.documentDate || null,
    fetchedAt: metadata.fetchedAt || null,
    sourceTier: tier.autoPublishEligible ? tier.key : primaryRegulators.has(tier.host) ? 'EU_REGULATOR_REVIEW_ONLY' : 'MANUFACTURER_REVIEW_ONLY',
    discoveryBasis: metadata.catalogEvidence?.discoveryBasis || 'existing_reference_or_manual_discovery',
    referenceIdentity: metadata.catalogEvidence || null,
    // PDF extraction is review evidence until the PDF parser and date are checked.
    requiresPdfReview: raw.subarray(0, 5).equals(Buffer.from('%PDF-')),
    publicationAllowed: false,
  };
}

function buildClinicalReviewQueue(rows, archives, options = {}) {
  if (!/^[a-f0-9]{64}$/.test(options.sourceSha256 || '')) throw new Error('Missing registry document hash.');
  const evidence = archives.map(verifyArchive).filter(Boolean);
  const byUrl = new Map(evidence.flatMap(item => [[item.url.replace(/\/$/, ''), item], [item.finalUrl.replace(/\/$/, ''), item]]));
  const ids = new Set();
  const entries = rows.map(({ product, candidates = [] }) => {
    if (!product?.id || ids.has(product.id) || product.update_status !== 'E re' || product.is_published || product.editorial_status === 'archived') throw new Error('Clinical queue accepts unique unpublished new products only.');
    ids.add(product.id);
    const references = candidates.map(({ drug, profile, regimens = [] }) => ({
      referenceDrugId: drug.id, tradeName: drug.trade_name, activeSubstance: drug.active_substance,
      atcCode: drug.atc_code, strength: drug.strength, pharmaceuticalForm: drug.pharmaceutical_form,
      proposedClass: clean(drug.drug_class) || null, proposedUse: clean(drug.use_text) || null,
      sourceUrls: urls([...(profile?.source_urls || []), ...regimens.map(item => item.source_url)]),
      // Keep reference text outside the published dosage tables. Never copy its verification.
      proposedAdultDoses: regimens.filter(item => item.population === 'adult').map(item => ({ text: item.dose_text, route: item.route, sourceUrls: urls([item.source_url]) })),
      proposedPediatricDoses: regimens.filter(item => item.population === 'pediatric').map(item => ({ text: item.dose_text, route: item.route, sourceUrls: urls([item.source_url]) })),
      bindingStatus: 'requires_product_review', verificationStatus: 'in_review', publicationAllowed: false,
    }));
    const linked = urls(references.flatMap(item => item.sourceUrls)).map(url => byUrl.get(url.replace(/\/$/, ''))).filter(Boolean);
    const discovered = (options.discoveredSources?.[product.id] || []).map(url => byUrl.get(url.replace(/\/$/, ''))).filter(Boolean);
    const sources = [...new Map([...linked, ...discovered].map(item => [item.rawSha256, item])).values()];
    return {
      drugId: product.id, registryNumber: product.registry_number,
      product: { tradeName: product.trade_name, activeSubstance: product.active_substance, atcCode: product.atc_code, strength: product.strength, pharmaceuticalForm: product.pharmaceutical_form, manufacturer: product.manufacturer },
      status: sources.length ? 'needs_product_review' : 'needs_source',
      references, sources, publicationAllowed: false,
      remainingChecks: ['exact_product_and_salt', 'form_strength_route', 'indication_and_population', 'renal_hepatic_adjustment', 'pediatric_restriction', 'source_date_version', 'clinical_review'],
    };
  });
  return { schemaVersion: 'registry-clinical-review-v1', sourceSha256: options.sourceSha256, entries,
    summary: { products: entries.length, withReference: entries.filter(item => item.references.length).length, withArchivedSource: entries.filter(item => item.sources.length).length, needsSource: entries.filter(item => item.status === 'needs_source').length, published: 0 } };
}

function buildClinicalDraftBatch(queue, drafts, archives) {
  if (drafts.sourceSha256 !== queue.sourceSha256 || !Array.isArray(drafts.entries) || !drafts.entries.length) throw new Error('Clinical draft batch does not match registry import.');
  const verified = new Map(archives.map(verifyArchive).filter(Boolean).map(item => [item.rawSha256, item]));
  const ids = new Set();
  const entries = drafts.entries.map(entry => {
    const target = queue.entries.find(item => item.drugId === entry.drugId);
    const evidence = verified.get(entry.sourceRawSha256);
    if (!target || ids.has(entry.drugId)) throw new Error('Unknown or duplicate clinical draft target.');
    ids.add(entry.drugId);
    for (const [key, value] of Object.entries({ tradeName: target.product.tradeName, strength: target.product.strength, pharmaceuticalForm: target.product.pharmaceuticalForm })) if (entry[key] !== value) throw new Error('Clinical draft product identity mismatch: ' + key);
    if (entry.bindingStatus !== 'product_specific_candidate' || entry.publicationAllowed !== false) throw new Error('Clinical proposal must remain an unpublished candidate.');
    for (const key of ['documentDate', 'drugClass', 'useText', 'adultDose', 'pediatricDose', 'route']) if (!clean(entry[key]) || clean(entry[key]).length > 12000) throw new Error('Missing or excessive clinical proposal field: ' + key);
    if (!evidence || !target.sources.some(item => item.rawSha256 === evidence.rawSha256) || ![evidence.url, evidence.finalUrl].includes(entry.sourceUrl)) throw new Error('Clinical proposal has no verified archived source.');
    for (const section of ['4.1', '4.2']) if (entry.sectionSha256?.[section] !== evidence.sectionSha256[section]) throw new Error('Clinical proposal section hash mismatch.');
    return { ...entry };
  });
  return { sourceSha256: queue.sourceSha256, entries };
}

module.exports = { verifyArchive, buildClinicalReviewQueue, buildClinicalDraftBatch };
