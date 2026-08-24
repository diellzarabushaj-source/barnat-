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

  const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const cleanList = values => values.map(normalize).filter(Boolean);

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
    const aliases = cleanList([
      ...asList(item?.aliases),
      ...asList(item?.searchAliases),
    ]);
    const abbreviations = cleanList(asList(item?.abbreviations));
    const icd = cleanList(asList(item?.icdCodes));
    const discovery = [
      ...asList(item?.keywords),
      ...asList(item?.searchTerms),
      ...asList(item?.chiefComplaints),
      ...asList(item?.signatureSymptoms),
    ];
    const signature = [
      ...asList(item?.chiefComplaints),
      ...asList(item?.signatureSymptoms),
    ];
    const title = normalize(item?.title);

    return {
      title,
      aliases,
      abbreviations,
      icd,
      identities:[title, ...aliases, ...abbreviations].filter(Boolean),
      high: words([
        item?.title,
        ...asList(item?.aliases),
        ...asList(item?.searchAliases),
        ...asList(item?.abbreviations),
        ...asList(item?.icdCodes),
        ...discovery,
        item?.category,
        item?.chapterTitle,
        item?.subchapterTitle,
      ]),
      clinical: words([
        ...signature,
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

  function prepare(items) {
    return (Array.isArray(items) ? items : []).map(item => ({item, index:indexItem(item)}));
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

  function globalPopularityBoost(item) {
    const value = Number(item?.searchPopularity ?? item?.popularity ?? 0);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(Math.round(value), 20);
  }

  function identitySignals(index, query) {
    const exactTitle = index.title === query;
    const exactAlias = index.aliases.some(alias => alias === query);
    const exactAbbreviation = index.abbreviations.some(value => value === query);
    const exactIcd = index.icd.some(code => code === query);
    const partialTitle = !exactTitle && Boolean(query) && (index.title.startsWith(query) || index.title.includes(query));
    const partialAlias = !exactAlias && index.aliases.some(alias => alias.startsWith(query) || alias.includes(query));
    const partialAbbreviation = !exactAbbreviation && index.abbreviations.some(value => value.startsWith(query) || value.includes(query));
    const prefixIcd = !exactIcd && index.icd.some(code => code.startsWith(query));
    const nearTitle = !exactTitle && query.length >= 4 && index.title.length >= 4 && levenshtein(index.title, query) <= (Math.max(index.title.length, query.length) >= 8 ? 2 : 1);
    return {exactTitle, exactAlias, exactAbbreviation, exactIcd, partialTitle, partialAlias, partialAbbreviation, prefixIcd, nearTitle};
  }

  function classifyStrength(signals, matched, tokenCount, coverage) {
    if (signals.exactTitle || signals.exactAlias || signals.exactAbbreviation || signals.exactIcd) return 'exact';
    if (signals.partialTitle || signals.partialAlias || signals.partialAbbreviation || signals.prefixIcd || signals.nearTitle) return 'strong';
    if (matched >= 2 && coverage >= .67) return 'strong';
    if (tokenCount === 1 && matched === 1) return 'supporting';
    return 'supporting';
  }

  function rankItem(item, rawQuery, usage = {}, options = {}) {
    const query = normalize(rawQuery);
    if (!query) return null;
    const index = options.index || indexItem(item);
    const tokens = options.tokens || displayTokens(rawQuery, options.stopWords || DEFAULT_STOP_WORDS);
    const now = Number(options.now || Date.now());
    const signals = identitySignals(index, query);
    let score = 0;
    let reason = '';

    if (signals.exactTitle) { score += 1300; reason = 'Diagnozë e saktë'; }
    else if (index.title.startsWith(query)) { score += 1050; reason = 'Diagnozë'; }
    else if (index.title.includes(query)) { score += 850; reason = 'Diagnozë'; }

    if (signals.exactAbbreviation) { score += 1180; reason ||= 'Shkurtim'; }
    else if (signals.partialAbbreviation) { score += 840; reason ||= 'Shkurtim'; }

    if (signals.exactAlias) { score += 1150; reason ||= 'Sinonim'; }
    else if (signals.partialAlias) { score += 820; reason ||= 'Sinonim'; }

    if (signals.exactIcd) { score += 1200; reason = 'ICD i saktë'; }
    else if (signals.prefixIcd) { score += 1040; reason = 'ICD'; }

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

    const coverage = tokens.length ? matched / tokens.length : 0;
    if (tokens.length) {
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
    score += globalPopularityBoost(item);
    score += usageBoost(String(item?._id || ''), usage, now);

    return {
      item,
      score,
      reason:reason || 'Përputhje',
      strength:classifyStrength(signals, matched, tokens.length, coverage),
      coverage,
      matchedCount:matched,
      tokenCount:tokens.length,
      matchedTerms:[...new Set(matchedTerms)].slice(0, 4),
      clinicalTerms:[...new Set(clinicalTerms)].slice(0, 3),
    };
  }

  function rankPrepared(prepared, rawQuery, usage = {}, options = {}) {
    const limit = Math.max(1, Number(options.limit || 7));
    const tokens = displayTokens(rawQuery, options.stopWords || DEFAULT_STOP_WORDS);
    const now = Number(options.now || Date.now());
    return (Array.isArray(prepared) ? prepared : [])
      .map(entry => rankItem(entry.item, rawQuery, usage, {...options, index:entry.index, tokens, now}))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || String(a.item?.title || '').localeCompare(String(b.item?.title || ''), 'sq'))
      .slice(0, limit);
  }

  function rank(items, rawQuery, usage = {}, options = {}) {
    return rankPrepared(prepare(items), rawQuery, usage, options);
  }

  function rescueIdentityScore(index, rawQuery, options = {}) {
    const query = normalize(rawQuery);
    if (!query || query.length < 4 || /\d/.test(query)) return null;
    const tokens = displayTokens(rawQuery, options.stopWords || DEFAULT_STOP_WORDS);
    if (!tokens.length || tokens.length > 3) return null;

    let best = null;
    for (const identity of index.identities || []) {
      if (!identity) continue;
      const threshold = Math.max(identity.length, query.length) >= 7 ? 2 : 1;
      const distance = levenshtein(query, identity);
      if (Math.abs(identity.length - query.length) <= threshold && distance <= threshold) {
        const score = 520 - distance * 80 + Math.min(identity.length, 80);
        if (!best || score > best.score) best = {score, distance, coverage:1};
      }

      const candidateTokens = identity.split(' ').filter(Boolean);
      let matched = 0;
      let tokenQuality = 0;
      for (const token of tokens) {
        let bestToken = 0;
        for (const candidate of candidateTokens) bestToken = Math.max(bestToken, tokenScore(token.norm, candidate, 100));
        if (bestToken >= 48) {
          matched += 1;
          tokenQuality += bestToken;
        }
      }
      const coverage = matched / tokens.length;
      if (coverage === 1 && matched >= Math.min(2, tokens.length)) {
        const score = 360 + Math.round(tokenQuality / matched) + matched * 20;
        if (!best || score > best.score) best = {score, distance:null, coverage};
      }
    }
    return best;
  }

  function suggestPrepared(prepared, rawQuery, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || 3), 5));
    return (Array.isArray(prepared) ? prepared : [])
      .map(entry => {
        const rescue = rescueIdentityScore(entry.index, rawQuery, options);
        return rescue ? {item:entry.item, score:rescue.score, reason:'Drejtshkrim i afërt', coverage:rescue.coverage} : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || String(a.item?.title || '').localeCompare(String(b.item?.title || ''), 'sq'))
      .slice(0, limit);
  }

  function suggest(items, rawQuery, options = {}) {
    return suggestPrepared(prepare(items), rawQuery, options);
  }

  return {
    normalize,
    displayTokens,
    levenshtein,
    indexItem,
    prepare,
    tokenScore,
    identitySignals,
    classifyStrength,
    rescueIdentityScore,
    rankItem,
    rankPrepared,
    rank,
    suggestPrepared,
    suggest,
  };
});