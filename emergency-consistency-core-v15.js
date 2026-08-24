((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexEmergencyConsistencyV15 = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const clean = value => String(value ?? '').trim();
  const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const normalize = value => clean(value)
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  function textBlocks(item) {
    const blocks = [];
    asList(item?.primaryCareSteps).forEach((step, index) => {
      if (clean(step?.action)) blocks.push({section:'Kujdes parësor', key:clean(step?._key) || `primary-${index}`, heading:clean(step?.title) || `Hapi ${index + 1}`, text:clean(step.action)});
    });
    asList(item?.secondaryCareSteps).forEach((step, index) => {
      if (clean(step?.action)) blocks.push({section:'Kujdes sekondar', key:clean(step?._key) || `secondary-${index}`, heading:clean(step?.title) || `Hapi ${index + 1}`, text:clean(step.action)});
    });
    const referral = item?.referral || {};
    asList(referral.beforeTransfer).forEach((value, index) => {
      if (clean(value)) blocks.push({section:'Para transferimit', key:`referral-before-${index}`, heading:'Para transferimit', text:clean(value)});
    });
    if (clean(referral.when)) blocks.push({section:'Referimi', key:'referral-when', heading:'Kur referohet', text:clean(referral.when)});
    return blocks;
  }

  function rangeKey(min, max) {
    return `${Number(min)}-${Number(max)}`;
  }

  function oxygenTargetRanges(item) {
    const rows = [];
    textBlocks(item).forEach(block => {
      const text = normalize(block.text).replace(/spo₂/g, 'spo2');
      const hasOxygenContext = /\bspo2\b|\bsao2\b|oksigjen|saturim/.test(text);
      const hasTargetIntent = /titra|syno|target|objektiv|mbaj|ruaj/.test(text);
      if (!hasOxygenContext || !hasTargetIntent) return;
      const regex = /(\d{2})\s*[–—-]\s*(\d{2})\s*%/g;
      let match;
      const ranges = [];
      while ((match = regex.exec(block.text))) {
        const min = Number(match[1]);
        const max = Number(match[2]);
        if (min < 50 || max > 100 || min >= max) continue;
        const key = rangeKey(min, max);
        if (!ranges.some(row => row.key === key)) ranges.push({key,min,max,label:`${min}–${max}%`});
      }
      if (!ranges.length) return;
      rows.push({...block, ranges});
    });
    return rows;
  }

  function oxygenTargetConflict(item) {
    const blocks = oxygenTargetRanges(item);
    if (blocks.length < 2) return null;
    const values = new Set(blocks.flatMap(block => block.ranges.map(range => range.key)));
    if (values.size < 2) return null;
    return {
      id:'oxygen-target-range',
      kind:'cross-section-target',
      label:'Targete të ndryshme të oksigjenimit',
      severity:'review',
      occurrences:blocks.map(block => ({
        section:block.section,
        key:block.key,
        heading:block.heading,
        ranges:block.ranges.map(range => range.label),
        text:block.text,
      })),
    };
  }

  function sourceLinkIssues(item) {
    const sources = [
      ...asList(item?.sources),
      ...asList(item?.clinicalSources),
      ...asList(item?.references),
    ];
    const missing = sources
      .map((source, index) => ({index,title:clean(source?.title || source?.label || source?.organization) || `Burimi ${index + 1}`,url:clean(source?.url)}))
      .filter(source => !source.url);
    return missing.length ? {
      id:'source-without-url',
      kind:'source-integrity',
      label:'Burim pa link të verifikueshëm',
      severity:'review',
      occurrences:missing,
    } : null;
  }

  function auditItem(item) {
    const issues = [oxygenTargetConflict(item), sourceLinkIssues(item)].filter(Boolean);
    return {
      id:clean(item?._id),
      title:clean(item?.title) || 'Urgjencë',
      version:clean(item?.version),
      issueCount:issues.length,
      requiresReview:issues.length > 0,
      issues,
    };
  }

  function audit(items) {
    const rows = (Array.isArray(items) ? items : []).map(auditItem);
    return {
      total:rows.length,
      flagged:rows.filter(row => row.requiresReview).length,
      clean:rows.filter(row => !row.requiresReview).length,
      issues:rows.reduce((sum, row) => sum + row.issueCount, 0),
      rows,
    };
  }

  return {normalize, textBlocks, oxygenTargetRanges, oxygenTargetConflict, sourceLinkIssues, auditItem, audit};
});
