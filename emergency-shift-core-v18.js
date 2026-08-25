((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexEmergencyShiftV18 = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const CRITICAL_LEVELS = new Set(['critical', 'very-urgent']);
  const TRIAGE_WEIGHT = {critical:0, 'very-urgent':1};
  const QUESTION_KINDS = ['firstAction', 'redFlag', 'doNotDo', 'referralWhen', 'referralDestination'];
  const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const text = value => String(value ?? '').trim();

  function sourceRows(item) {
    const values = [...asList(item?.sources), ...asList(item?.clinicalSources), ...asList(item?.references)];
    const seen = new Set();
    return values.filter(source => {
      const url = text(source?.url);
      const title = text(source?.title || source?.label || source?.organization);
      const key = `${url}|${title}`;
      if (key === '|' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function validDate(value) {
    if (!text(value)) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }

  function governance(item, now = Date.now()) {
    const reasons = [];
    const triageLevel = text(item?.triageLevel);
    const reviewStatus = text(item?.reviewStatus);
    const version = text(item?.version);
    const reviewedBy = text(item?.reviewedBy);
    const lastReviewedAt = validDate(item?.lastReviewedAt);
    const reviewDueAt = validDate(item?.reviewDueAt);
    const sourceCount = sourceRows(item).length;

    if (!CRITICAL_LEVELS.has(triageLevel)) reasons.push('not-critical');
    if (reviewStatus !== 'verified') reasons.push('not-verified');
    if (!version) reasons.push('missing-version');
    if (!sourceCount) reasons.push('missing-source');
    if (!reviewedBy) reasons.push('missing-reviewer');
    if (!lastReviewedAt) reasons.push('missing-review-date');
    if (text(item?.reviewDueAt) && !reviewDueAt) reasons.push('invalid-review-due');
    if (reviewDueAt && reviewDueAt <= now) reasons.push('review-overdue');

    const firstAction = asList(item?.primaryCareSteps).find(step => text(step?.action));
    if (!firstAction) reasons.push('missing-first-action');

    return {
      id:text(item?._id),
      title:text(item?.title) || 'Urgjencë',
      triageLevel,
      reviewStatus,
      version,
      sourceCount,
      reviewedBy,
      lastReviewedAt:lastReviewedAt || 0,
      reviewDueAt:reviewDueAt || 0,
      eligible:reasons.length === 0,
      reasons,
    };
  }

  function fingerprint(value) {
    const input = text(value).toLocaleLowerCase('sq').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function question(item, kind, prompt, answer, heading) {
    const value = text(answer);
    if (!value) return null;
    const version = text(item?.version);
    return {
      id:`${text(item?._id) || 'item'}:${version || 'noversion'}:${kind}:${fingerprint(value)}`,
      protocolId:text(item?._id),
      protocolTitle:text(item?.title) || 'Urgjencë',
      triageLevel:text(item?.triageLevel),
      version,
      sourceCount:sourceRows(item).length,
      reviewedBy:text(item?.reviewedBy),
      lastReviewedAt:text(item?.lastReviewedAt),
      kind,
      heading:text(heading),
      prompt:text(prompt),
      answer:value,
    };
  }

  function questionsForItem(item) {
    const first = asList(item?.primaryCareSteps).find(step => text(step?.action));
    const redFlag = asList(item?.redFlags).find(value => text(value));
    const doNotDo = asList(item?.doNotDo).find(value => text(value));
    const referral = item?.referral || {};
    return [
      question(item, 'firstAction', 'Cili është veprimi fillestar sipas protokollit?', first?.action, first?.title || 'Veprimi fillestar'),
      question(item, 'redFlag', 'Cila është një shenjë alarmuese që duhet ta njohësh menjëherë?', redFlag, 'Red flag'),
      question(item, 'doNotDo', 'Cila është një gjë që protokolli thotë të mos bëhet?', doNotDo, 'Mos bëj'),
      question(item, 'referralWhen', 'Kur kërkon protokolli referim ose transferim?', referral.when, 'Kur referohet'),
      question(item, 'referralDestination', 'Ku duhet të referohet ose transferohet pacienti sipas protokollit?', referral.destination, 'Ku referohet'),
    ].filter(Boolean);
  }

  function buildSession(items, options = {}) {
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const limit = Math.min(12, Math.max(4, Number(options.limit || 10)));
    const priorityById = options.priorityById && typeof options.priorityById === 'object' ? options.priorityById : {};
    const all = Array.isArray(items) ? items : [];
    const eligibleItems = all
      .map(item => ({item, governance:governance(item, now)}))
      .filter(row => row.governance.eligible)
      .sort((a, b) =>
        Number(priorityById[b.governance.id] || 0) - Number(priorityById[a.governance.id] || 0)
        || (TRIAGE_WEIGHT[a.governance.triageLevel] ?? 9) - (TRIAGE_WEIGHT[b.governance.triageLevel] ?? 9)
        || a.governance.title.localeCompare(b.governance.title, 'sq')
      );

    const byItem = new Map(eligibleItems.map(row => [row.governance.id, questionsForItem(row.item)]));
    const questions = [];
    for (const kind of QUESTION_KINDS) {
      for (const row of eligibleItems) {
        const candidate = (byItem.get(row.governance.id) || []).find(entry => entry.kind === kind);
        if (!candidate) continue;
        questions.push(candidate);
        if (questions.length >= limit) break;
      }
      if (questions.length >= limit) break;
    }

    return {
      eligibleCount:eligibleItems.length,
      excludedCount:Math.max(0, all.length - eligibleItems.length),
      limit,
      questions,
      protocols:eligibleItems.map(row => row.governance),
    };
  }

  return {CRITICAL_LEVELS, QUESTION_KINDS, sourceRows, validDate, governance, questionsForItem, buildSession};
});
