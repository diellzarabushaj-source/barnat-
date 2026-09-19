'use strict';

const SearchBase = require('./icd-search-engine.js');
const Dataset = require('../data/icd-symptom-intents-v1.json');

const clean = value => String(value ?? '').trim();

function normalize(value) {
  return SearchBase.normalize(clean(value)).replace(/\*/g, '');
}

function looksLikeIcdCode(value) {
  return /^[A-TV-Z][0-9OIL]{2}(?:[.\-]?[0-9OIL]{0,2})?$/i.test(clean(value).replace(/\s+/g, ''));
}

function allowedDistance(length) {
  if (length >= 18) return 4;
  if (length >= 11) return 3;
  if (length >= 6) return 2;
  if (length >= 4) return 1;
  return 0;
}

function tokenSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 3 && right.startsWith(left)) return 0.92;
  if (right.length >= 3 && left.startsWith(right)) return 0.88;
  const maxDistance = Math.min(2, allowedDistance(Math.max(left.length, right.length)));
  if (!maxDistance) return 0;
  const distance = SearchBase.boundedDistance(left, right, maxDistance);
  if (distance > maxDistance) return 0;
  return distance === 1 ? 0.82 : 0.66;
}

function phraseSimilarity(query, alias) {
  if (!query || !alias) return { score:0, type:'' };
  if (query === alias) return { score:1, type:'exact' };
  if (query.length >= 3 && alias.startsWith(query)) return { score:0.95, type:'prefix' };
  if (alias.length >= 3 && query.startsWith(alias)) return { score:0.90, type:'expanded' };
  if (query.length >= 4 && alias.includes(query)) return { score:0.89, type:'contains' };
  if (alias.length >= 4 && query.includes(alias)) return { score:0.86, type:'contains' };

  const maxDistance = allowedDistance(Math.max(query.length, alias.length));
  if (maxDistance && Math.abs(query.length - alias.length) <= maxDistance) {
    const distance = SearchBase.boundedDistance(query, alias, maxDistance);
    if (distance <= maxDistance) {
      return {
        score:Math.max(0.70, 0.93 - (distance * 0.065)),
        type:'fuzzy-phrase',
        distance,
      };
    }
  }

  const qTokens = SearchBase.tokenize(query).filter(Boolean);
  const aTokens = SearchBase.tokenize(alias).filter(Boolean);
  if (!qTokens.length || !aTokens.length) return { score:0, type:'' };

  let total = 0;
  let matched = 0;
  for (const qToken of qTokens) {
    let best = 0;
    for (const aToken of aTokens) best = Math.max(best, tokenSimilarity(qToken, aToken));
    if (best >= 0.64) matched += 1;
    total += best;
  }
  const coverage = matched / qTokens.length;
  const average = total / qTokens.length;
  if (coverage < 0.75 || average < 0.70) return { score:0, type:'' };
  return {
    score:Math.min(0.88, 0.58 + (average * 0.26) + (coverage * 0.04)),
    type:'fuzzy-tokens',
  };
}

const compiledConcepts = Object.freeze((Dataset.concepts || []).map(concept => ({
  ...concept,
  _aliases:[concept.label_sq, ...(concept.aliases || [])]
    .map(raw => ({ raw:clean(raw), normalized:normalize(raw) }))
    .filter(item => item.normalized),
})));

function matchConcept(rawQuery) {
  const query = normalize(rawQuery);
  if (!query || query.length < 3 || looksLikeIcdCode(rawQuery)) return null;

  const ranked = [];
  for (const concept of compiledConcepts) {
    let best = null;
    for (const alias of concept._aliases) {
      const match = phraseSimilarity(query, alias.normalized);
      if (!match.score) continue;
      const candidate = { ...match, alias:alias.raw };
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (best) ranked.push({ concept, match:best });
  }
  ranked.sort((a, b) => b.match.score - a.match.score
    || clean(a.concept.id).localeCompare(clean(b.concept.id), 'en'));

  const top = ranked[0];
  if (!top || top.match.score < 0.72) return null;
  const second = ranked[1];
  const ambiguous = Boolean(second && second.match.score >= 0.80 && (top.match.score - second.match.score) < 0.045);

  return {
    id:top.concept.id,
    label_sq:top.concept.label_sq,
    symptom_code:top.concept.symptom_code || '',
    confidence:Number(top.match.score.toFixed(3)),
    match_type:top.match.type,
    matched_alias:top.match.alias,
    ambiguous,
    alternatives:ranked.slice(1, 3).map(item => ({
      id:item.concept.id,
      label_sq:item.concept.label_sq,
      confidence:Number(item.match.score.toFixed(3)),
    })),
    candidates:(top.concept.candidates || []).map(item => ({ ...item })),
    red_flags:[...(top.concept.red_flags || [])],
  };
}

function intentPayload(rawQuery) {
  const intent = matchConcept(rawQuery);
  if (!intent) return null;
  return {
    ...intent,
    diagnosticDecision:false,
    probability:false,
    note_sq:'Këto janë kandidatë për kërkim/diferencial nga një simptomë e vetme; nuk janë diagnozë përfundimtare.',
    version:Dataset.version,
  };
}

module.exports = {
  DATASET:Dataset,
  normalize,
  looksLikeIcdCode,
  allowedDistance,
  tokenSimilarity,
  phraseSimilarity,
  matchConcept,
  intentPayload,
};
