((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexEmergencyEvidenceV16 = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const text = value => String(value ?? '').trim();

  function sourceRows(item) {
    const rows = [...asList(item?.sources), ...asList(item?.clinicalSources), ...asList(item?.references)];
    const seen = new Set();
    return rows.filter(source => {
      const key = `${text(source?.url)}|${text(source?.title || source?.label || source?.organization)}`;
      if (key === '|' || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((source, index) => ({
      key:text(source?._key) || `source-${index}`,
      title:text(source?.title || source?.label || source?.organization) || `Burimi ${index + 1}`,
      organization:text(source?.organization),
      url:text(source?.url),
      publishedAt:text(source?.publishedAt || source?.year),
      note:text(source?.note),
    }));
  }

  function dateMs(value) {
    const raw = text(value);
    if (!raw) return NaN;
    const parsed = Date.parse(raw.length === 10 ? `${raw}T23:59:59Z` : raw);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function governance(item, now = Date.now()) {
    const reviewedBy = text(item?.reviewedBy);
    const lastReviewedAt = text(item?.lastReviewedAt);
    const reviewDueAt = text(item?.reviewDueAt);
    const due = dateMs(reviewDueAt);
    const overdue = Boolean(reviewDueAt) && Number.isFinite(due) && due < now;
    const reasons = [];
    if (!reviewedBy) reasons.push('missing-reviewer');
    if (!lastReviewedAt) reasons.push('missing-last-reviewed');
    if (!reviewDueAt) reasons.push('missing-review-due');
    if (overdue) reasons.push('review-overdue');
    return {reviewedBy,lastReviewedAt,reviewDueAt,overdue,ready:reasons.length === 0,reasons};
  }

  function evidenceBlocks(item) {
    const rows = [];
    asList(item?.primaryCareSteps).forEach((step,index) => {
      if (text(step?.action)) rows.push({section:'Kujdes parësor',heading:text(step?.title) || `Hapi ${index + 1}`,path:`primaryCareSteps[${index}].action`,text:text(step.action)});
    });
    asList(item?.secondaryCareSteps).forEach((step,index) => {
      if (text(step?.action)) rows.push({section:'Kujdes sekondar',heading:text(step?.title) || `Hapi ${index + 1}`,path:`secondaryCareSteps[${index}].action`,text:text(step.action)});
    });
    asList(item?.redFlags).forEach((value,index) => { if (text(value)) rows.push({section:'Red flags',heading:'Shenjë alarmuese',path:`redFlags[${index}]`,text:text(value)}); });
    asList(item?.doNotDo).forEach((value,index) => { if (text(value)) rows.push({section:'Mos bëj',heading:'Mos bëj',path:`doNotDo[${index}]`,text:text(value)}); });
    const referral = item?.referral || {};
    [['when','Kur referohet'],['destination','Destinacioni'],['urgency','Urgjenca'],['handover','Handover'],['secondaryCareOverview','Kujdesi sekondar']].forEach(([field,heading]) => {
      if (text(referral[field])) rows.push({section:'Referimi',heading,path:`referral.${field}`,text:text(referral[field])});
    });
    asList(referral.beforeTransfer).forEach((value,index) => { if (text(value)) rows.push({section:'Para transferimit',heading:'Para transferimit',path:`referral.beforeTransfer[${index}]`,text:text(value)}); });
    return rows;
  }

  function packet(item, now = Date.now()) {
    return {
      id:text(item?._id),title:text(item?.title) || 'Urgjencë',version:text(item?.version),reviewStatus:text(item?.reviewStatus),
      provenanceLevel:'protocol',
      sources:sourceRows(item),
      blocks:evidenceBlocks(item),
      governance:governance(item, now),
    };
  }

  function audit(items, now = Date.now()) {
    const rows = (Array.isArray(items) ? items : []).map(item => packet(item, now));
    return {
      total:rows.length,
      sources:rows.reduce((sum,row) => sum + row.sources.length, 0),
      governanceReady:rows.filter(row => row.governance.ready).length,
      governanceBlocked:rows.filter(row => !row.governance.ready).length,
      rows,
    };
  }

  return {sourceRows, governance, evidenceBlocks, packet, audit};
});
