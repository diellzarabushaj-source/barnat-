((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexEmergencyVerificationQueueV14 = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const TRIAGE_WEIGHT = {critical: 0, 'very-urgent': 1, urgent: 2};
  const DOSE_RE = /\b\d+(?:[.,]\d+)?\s*(?:mg\/kg|mcg\/kg|µg\/kg|mg|mcg|µg|g|mL|ml|mmol|IU|UI|units?|njësi|%)\b/i;

  const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const text = value => String(value ?? '').trim();

  function sourceCount(item) {
    const rows = [
      ...asList(item?.sources),
      ...asList(item?.clinicalSources),
      ...asList(item?.references),
    ];
    const seen = new Set();
    return rows.filter(source => {
      const key = `${text(source?.url)}|${text(source?.title || source?.label || source?.organization)}`;
      if (key === '|' || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  }

  function actionTexts(item) {
    const referral = item?.referral || {};
    return [
      ...asList(item?.primaryCareSteps).map(step => `${text(step?.title)} ${text(step?.action)}`),
      ...asList(item?.secondaryCareSteps).map(step => `${text(step?.title)} ${text(step?.action)}`),
      ...asList(item?.redFlags).map(text),
      ...asList(item?.doNotDo).map(text),
      text(referral.when), text(referral.destination), text(referral.handover),
      ...asList(referral.beforeTransfer).map(text),
    ].filter(Boolean);
  }

  function hasDoseLikeContent(item) {
    return actionTexts(item).some(value => DOSE_RE.test(value));
  }

  function structuralIssues(item) {
    const issues = [];
    if (!text(item?.version)) issues.push('missing-version');
    if (!sourceCount(item)) issues.push('missing-source');
    if (!asList(item?.primaryCareSteps).some(step => text(step?.action))) issues.push('missing-primary-actions');
    if (!asList(item?.redFlags).some(value => text(value))) issues.push('missing-red-flags');
    if (!asList(item?.doNotDo).some(value => text(value))) issues.push('missing-do-not-do');
    const referral = item?.referral || {};
    if (![referral.when, referral.destination, referral.handover, ...asList(referral.beforeTransfer)].some(value => text(value))) issues.push('missing-referral');
    return issues;
  }

  function checklist(item) {
    const sections = [
      {id:'sources', label:'Versioni dhe burimet klinike', required:true},
      {id:'actions', label:'Veprimi fillestar dhe hapat urgjentë', required:true},
    ];
    if (hasDoseLikeContent(item)) sections.push({id:'doses', label:'Dozat, rruga dhe koha — vetëm sipas burimit', required:true});
    sections.push(
      {id:'safety', label:'Red flags dhe “Mos bëj”', required:true},
      {id:'referral', label:'Referimi, transferimi dhe handover', required:true},
    );
    return sections;
  }

  function reviewKey(item) {
    return `${text(item?._id) || 'unknown'}:${text(item?.version) || 'noversion'}`;
  }

  function status(item) {
    const reviewStatus = text(item?.reviewStatus);
    const issues = structuralIssues(item);
    return {
      id:text(item?._id),
      title:text(item?.title) || 'Urgjencë',
      slug:text(item?.slug),
      triageLevel:text(item?.triageLevel) || 'urgent',
      reviewStatus,
      version:text(item?.version),
      sourceCount:sourceCount(item),
      structuralIssues:issues,
      structurallyReady:issues.length === 0,
      clinicallyVerified:reviewStatus === 'verified',
      reviewKey:reviewKey(item),
      checklist:checklist(item),
      reviewedBy:text(item?.reviewedBy),
      lastReviewedAt:text(item?.lastReviewedAt),
      reviewDueAt:text(item?.reviewDueAt),
    };
  }

  function queue(items) {
    return (Array.isArray(items) ? items : [])
      .map(item => ({item, ...status(item)}))
      .filter(row => !row.clinicallyVerified)
      .sort((a, b) => {
        const triage = (TRIAGE_WEIGHT[a.triageLevel] ?? 9) - (TRIAGE_WEIGHT[b.triageLevel] ?? 9);
        if (triage) return triage;
        if (a.structurallyReady !== b.structurallyReady) return a.structurallyReady ? -1 : 1;
        if (Boolean(a.lastReviewedAt) !== Boolean(b.lastReviewedAt)) return a.lastReviewedAt ? 1 : -1;
        return a.title.localeCompare(b.title, 'sq');
      });
  }

  function summary(items) {
    const rows = (Array.isArray(items) ? items : []).map(status);
    return {
      total:rows.length,
      verified:rows.filter(row => row.clinicallyVerified).length,
      pending:rows.filter(row => !row.clinicallyVerified).length,
      structurallyReady:rows.filter(row => !row.clinicallyVerified && row.structurallyReady).length,
      blocked:rows.filter(row => !row.clinicallyVerified && !row.structurallyReady).length,
      criticalPending:rows.filter(row => !row.clinicallyVerified && row.triageLevel === 'critical').length,
      rows,
    };
  }

  function studioIntent(studioUrl, item) {
    const base = text(studioUrl);
    const id = text(item?._id);
    if (!base || !id) return base || '';
    const root = base.endsWith('/') ? base : `${base}/`;
    return `${root}intent/edit/id=${encodeURIComponent(id)};type=emergencyProtocol`;
  }

  return {
    sourceCount,
    hasDoseLikeContent,
    structuralIssues,
    checklist,
    reviewKey,
    status,
    queue,
    summary,
    studioIntent,
  };
});
