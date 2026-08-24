((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexEmergencyVerificationV14 = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const CHECKS = Object.freeze([
    Object.freeze({id:'sources', label:'Burimet + versioni'}),
    Object.freeze({id:'actions', label:'Hapat klinikë + dozat/rrugët'}),
    Object.freeze({id:'safety', label:'Red flags + “Mos bëj”'}),
    Object.freeze({id:'referral', label:'Referimi + handover'}),
  ]);
  const TRIAGE_ORDER = Object.freeze({critical:0, 'very-urgent':1, urgent:2});

  const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const clean = value => String(value ?? '').trim();

  function uniqueSources(item) {
    const values = [
      ...asList(item?.sources),
      ...asList(item?.clinicalSources),
      ...asList(item?.references),
    ];
    const seen = new Set();
    return values.filter(source => {
      const url = clean(source?.url);
      const title = clean(source?.title || source?.label || source?.organization);
      const key = `${url}|${title}`;
      if (key === '|' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function counts(item) {
    const referral = item?.referral || {};
    return {
      sources:uniqueSources(item).length,
      primary:asList(item?.primaryCareSteps).filter(step => clean(step?.action)).length,
      secondary:asList(item?.secondaryCareSteps).filter(step => clean(step?.action)).length,
      redFlags:asList(item?.redFlags).filter(value => clean(value)).length,
      doNotDo:asList(item?.doNotDo).filter(value => clean(value)).length,
      referral:[referral.when, referral.destination, referral.handover, ...asList(referral.beforeTransfer)].filter(value => clean(value)).length,
    };
  }

  function blockers(item) {
    const total = counts(item);
    const reasons = [];
    if (clean(item?.reviewStatus) !== 'review') reasons.push('not-in-review');
    if (!clean(item?.version)) reasons.push('missing-version');
    if (!total.sources) reasons.push('missing-source');
    if (!total.primary) reasons.push('missing-primary-action');
    if (!total.redFlags) reasons.push('missing-red-flags');
    if (!total.doNotDo) reasons.push('missing-do-not-do');
    if (!total.referral) reasons.push('missing-referral');
    return reasons;
  }

  function storageKey(item) {
    const id = clean(item?._id).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'unknown';
    const version = clean(item?.version).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60) || 'no-version';
    return `medindex_emergency_verification_v14:${id}:${version}`;
  }

  function normalizeChecks(value) {
    const input = value && typeof value === 'object' ? value : {};
    return CHECKS.reduce((out, check) => {
      out[check.id] = Boolean(input[check.id]);
      return out;
    }, {});
  }

  function progress(value) {
    const checks = normalizeChecks(value);
    const done = CHECKS.filter(check => checks[check.id]).length;
    return {checks, done, total:CHECKS.length, complete:done === CHECKS.length};
  }

  function queue(items) {
    return (Array.isArray(items) ? items : [])
      .filter(item => clean(item?.reviewStatus) === 'review')
      .map(item => ({
        item,
        id:clean(item?._id),
        title:clean(item?.title) || 'Urgjencë',
        version:clean(item?.version),
        triageLevel:clean(item?.triageLevel),
        counts:counts(item),
        blockers:blockers(item),
        storageKey:storageKey(item),
      }))
      .sort((a, b) => (TRIAGE_ORDER[a.triageLevel] ?? 9) - (TRIAGE_ORDER[b.triageLevel] ?? 9)
        || a.title.localeCompare(b.title, 'sq'));
  }

  return {CHECKS, uniqueSources, counts, blockers, storageKey, normalizeChecks, progress, queue};
});
