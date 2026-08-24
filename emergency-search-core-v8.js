((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexEmergencySearchCore = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const DEFAULT_STOP_WORDS = new Set([
    'pacient','pacienti','pacientes','eshte','jane','dhe','apo','ose','por','me','ne','te','tek','nga','per','nje','qe','ka','kam','kemi','po','spo','nuk','pa','si','i','e','a',
    'patient','the','and','or','with','without','has','have','is','are','to','of','in','on','for','from',
  ]);

  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function displayTokens(value, stopWords = DEFAULT_STOP_WORDS) {
    return String(value ?? '')
      .trim()
      .split(/\s+/)
      .map(raw => ({raw:raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, ''), norm:normalize(raw)}))
      .filter(token => token.norm && token.norm.length >= 3 && !stopWords.has(token.norm) && !/^\d+(?:\.\d+)?$/.test(token.norm))
      .slice(0, 10);
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > 2) return 3;
    const prev = Array.from({length:b.length + 1}, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let left = i;
      let diagonal = i - 1;
      for (let j = 1; j <= b.length; j += 1) {
        const above = prev[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        const next = Math.min(left + 1, above + 1, diagonal + cost);
        diagonal = above;
        prev[j] = next;
        left = next;
      }
    }
    return prev[b.length];
  }

  const words = values => normalize(values.filter(Boolean).join(' ')).split(' ').filter(Boolean);

  function indexItem(item) {
    const primary = Array.isArray(item?.primaryCareSteps) ? item.primaryCareSteps : [];
    const secondary = Array.isArray(item?.secondaryCareSteps) ? item.secondaryCareSteps : [];
    return {
      title: normalize(item?.title),
      aliases: (item?.aliases || []).map(normalize).filter(Boolean),
      icd: (item?.icdCodes || []).map(normalize).filter(Boolean),
      high: words([
        item?.title,
        ...(item?.aliases || []),
        ...(item?.icdCodes || []),
        item?.category,
        item?.chapterTitle,
        item?.subchapterTitle,
      ]),
      clinical: words([
        item?.summary,
        ...(item?.redFlags || []),
        ...(item?.doNotDo || []),
        ...primary.flatMap(step => [step?.title, step?.action, step?.why, step?.note]),
        ...secondary.flatMap(step => [step?.title, step?.action, step?.why, step?.note]),
        item?.referral?.when,
        item?.referral?.destination,
      ]),
    };
  }

  function tokenScore(queryToken, candidate, weight) {
    if (!candidate) return 0;
    if (candidate === queryToken) return weight;
    if (candidate.startsWith(queryToken) || queryToken.startsWith(candidate)) return Math.round(weight * .84);
    if (candidate.includes(queryToken) || queryToken.includes(candidate)) return Math.round(weight * .68);
    if (queryToken.length >= 4 && candidate.length >= 4) {
      const threshold = Math.max(queryToken.length, candidate.length) >= 8 ? 2 : 1;
      if (levenshtein(queryToken, candidate) <= threshold) return Math.round(weight * .48);
    }
    return 0;
  }

  function usageBoost(itemId, usage, now) {
    const entry = usage?.[itemId] || {};
    const count = Math.min(Number(entry.count || 0), 20);
    const age = now - Number(entry.lastAt || 0);
    const recent = age >= 0 && age < 7 * 86400000 ? 22 : age >= 0 && age < 30 * 86400000 ? 10 : 0;
    return count * 3 + recent;
  }

  function rankItem(item, rawQuery, usage = {}, options = {}) {
    const query = normalize(rawQuery);
    if (!query) return null;
    const index = options.index || indexItem(item);
    const tokens = displayTokens(rawQuery, options.stopWords || DEFAULT_STOP_WORDS);
    const now = Number(options.now || Date.now());
    let score = 0;
    let reason = '';

    if (index.title === query) { score += 1300; reason = 'Diagnozë e saktë'; }
    else if (index.title.startsWith(query)) { score += 1050; reason = 'Diagnozë'; }
    else if (index.title.includes(query)) { score += 850; reason = 'Diagnozë'; }

    if (index.aliases.some(alias => alias === query)) { score += 1150; reason ||= 'Sinonim'; }
    else if (index.aliases.some(alias => alias.startsWith(query) || alias.includes(query))) { score += 820; reason ||= 'Sinonim'; }

    if (index.icd.some(code => code === query || code.startsWith(query))) { score += 1200; reason = 'ICD'; }

    let matched = 0;
    let highMatches = 0;
    let clinicalMatches = 0;
    const matchedTerms = [];
    const clinicalTerms = [];

    tokens.forEach(token => {
      let bestHigh = 0;
      for (const candidate of index.high) bestHigh = Math.max(bestHigh, tokenScore(token.norm, candidate, 120));
      let bestClinical = 0;
      for (const candidate of index.clinical) bestClinical = Math.max(bestClinical, tokenScore(token.norm, candidate, 72));
      const best = Math.max(bestHigh, bestClinical);
      if (best <= 0) return;
      matched += 1;
      score += best;
      matchedTerms.push(token.raw || token.norm);
      if (bestClinical > 0) clinicalTerms.push(token.raw || token.norm);
      if (bestHigh >= bestClinical) highMatches += 1;
      else clinicalMatches += 1;
    });

    if (tokens.length) {
      const coverage = matched / tokens.length;
      score += Math.round(coverage * 330);
      if (!reason && matched) reason = clinicalMatches > highMatches ? 'Shenja / përmbajtje' : 'Përputhje klinike';
      if (matched === 0 && score < 700) return null;
      if (coverage < .34 && score < 850) return null;
    } else if (score === 0) {
      return null;
    }

    if (item?.triageLevel === 'critical') score += 38;
    else if (item?.triageLevel === 'very-urgent') score += 24;
    if (item?.reviewStatus === 'verified') score += 12;
    score += usageBoost(String(item?._id || ''), usage, now);

    return {
      item,
      score,
      reason:reason || 'Përputhje',
      matchedTerms:[...new Set(matchedTerms)].slice(0, 4),
      clinicalTerms:[...new Set(clinicalTerms)].slice(0, 3),
    };
  }

  function rank(items, rawQuery, usage = {}, options = {}) {
    const limit = Math.max(1, Number(options.limit || 7));
    const indexed = Array.isArray(items) ? items : [];
    return indexed
      .map(item => rankItem(item, rawQuery, usage, options))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || String(a.item?.title || '').localeCompare(String(b.item?.title || ''), 'sq'))
      .slice(0, limit);
  }

  return {normalize, displayTokens, levenshtein, indexItem, tokenScore, rankItem, rank};
});