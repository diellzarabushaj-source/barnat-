((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexEmergencyActionDeepLinkV13 = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];

  function uniqueSources(item) {
    const values = [
      ...asList(item?.sources),
      ...asList(item?.clinicalSources),
      ...asList(item?.references),
    ];
    const seen = new Set();
    return values.filter(source => {
      const url = String(source?.url || '').trim();
      const title = String(source?.title || source?.label || source?.organization || '').trim();
      const key = `${url}|${title}`;
      if (key === '|' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function hasActionContent(item) {
    const referral = item?.referral || {};
    return asList(item?.primaryCareSteps).some(step => String(step?.action || '').trim())
      || asList(item?.secondaryCareSteps).some(step => String(step?.action || '').trim())
      || asList(item?.redFlags).some(value => String(value || '').trim())
      || asList(item?.doNotDo).some(value => String(value || '').trim())
      || [referral.when, referral.destination, referral.handover, ...asList(referral.beforeTransfer)]
        .some(value => String(value || '').trim());
  }

  function readiness(item) {
    const reviewStatus = String(item?.reviewStatus || '').trim();
    const version = String(item?.version || '').trim();
    const sourceCount = uniqueSources(item).length;
    const reasons = [];
    if (reviewStatus !== 'verified') reasons.push('not-verified');
    if (!version) reasons.push('missing-version');
    if (!sourceCount) reasons.push('missing-source');
    if (!hasActionContent(item)) reasons.push('no-action-content');
    return {
      id:String(item?._id || ''),
      title:String(item?.title || 'Urgjencë'),
      reviewStatus,
      version,
      sourceCount,
      ready:reasons.length === 0,
      reasons,
    };
  }

  function audit(items) {
    const rows = (Array.isArray(items) ? items : []).map(readiness);
    return {
      total:rows.length,
      ready:rows.filter(row => row.ready).length,
      verified:rows.filter(row => row.reviewStatus === 'verified').length,
      inReview:rows.filter(row => row.reviewStatus === 'review').length,
      draft:rows.filter(row => row.reviewStatus === 'draft').length,
      missingVersion:rows.filter(row => row.reasons.includes('missing-version')).length,
      missingSource:rows.filter(row => row.reasons.includes('missing-source')).length,
      noActionContent:rows.filter(row => row.reasons.includes('no-action-content')).length,
      issues:rows.filter(row => !row.ready),
      rows,
    };
  }

  function relativeUrl(url) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function actionFromUrl(href) {
    try {
      const url = new URL(href, 'https://medindex.local');
      const value = String(url.searchParams.get('action') || '').trim();
      return value.length <= 300 ? value : '';
    } catch {
      return '';
    }
  }

  function setActionUrl(href, result) {
    try {
      const url = new URL(href, 'https://medindex.local');
      const actionId = String(result?.id || '').trim();
      if (!actionId) return relativeUrl(url);
      const slug = String(result?.item?.slug || result?.slug || '').trim();
      if (slug) url.searchParams.set('emergency', slug);
      url.searchParams.set('action', actionId);
      return relativeUrl(url);
    } catch {
      return String(href || '');
    }
  }

  function clearActionUrl(href) {
    try {
      const url = new URL(href, 'https://medindex.local');
      url.searchParams.delete('action');
      return relativeUrl(url);
    } catch {
      return String(href || '');
    }
  }

  function resolveAction(items, actionId, actionEngine) {
    const id = String(actionId || '').trim();
    if (!id || !actionEngine?.buildEntries) return null;
    return actionEngine.buildEntries(Array.isArray(items) ? items : [])
      .find(entry => String(entry?.id || '') === id) || null;
  }

  return {
    uniqueSources,
    hasActionContent,
    readiness,
    audit,
    actionFromUrl,
    setActionUrl,
    clearActionUrl,
    resolveAction,
  };
});