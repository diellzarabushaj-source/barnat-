((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MedIndexEmergencyActionSearchV12 = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const STOP_WORDS = new Set([
    'pacient','pacienti','pacientes','eshte','jane','dhe','apo','ose','por','me','ne','te','tek','nga','per','nje','qe','ka','kam','kemi','po','spo','nuk','pa','si','i','e','a',
    'cka','qka','cfare','bej','behet','duhet','jap','jep','jepet','trajtim','trajtimi','mjekim','mjekimi','doza','doze','dozimi','hapi','hap','pare','parë','first','line',
    'red','flag','flags','shenja','alarm','alarmuese','referim','refero','transfer','handover','mos','shmang','gabim','sekondar','advanced','avancuar',
    'patient','the','and','or','with','without','has','have','is','are','to','of','in','on','for','from','give','dose','treatment','what','do','first','line',
  ]);

  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('sq')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const asList = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const words = value => normalize(value).split(' ').filter(Boolean);

  function fingerprint(value) {
    const text = normalize(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `t${(hash >>> 0).toString(36)}`;
  }

  function stableKey(value, fallback) {
    const raw = String(value ?? '').trim();
    const safe = raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return safe || String(fallback ?? '0');
  }

  function uniqueSources(item) {
    const merged = [
      ...asList(item?.sources),
      ...asList(item?.clinicalSources),
      ...asList(item?.references),
    ];
    const seen = new Set();
    return merged.filter(source => {
      const key = `${String(source?.url || '').trim()}|${String(source?.title || source?.label || source?.organization || '').trim()}`;
      if (key === '|' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function eligible(item) {
    return String(item?.reviewStatus || '') === 'verified'
      && Boolean(String(item?.version || '').trim())
      && uniqueSources(item).length > 0;
  }

  function identityText(item) {
    return [
      item?.title,
      ...asList(item?.aliases),
      ...asList(item?.searchAliases),
      ...asList(item?.abbreviations),
      ...asList(item?.icdCodes),
      ...asList(item?.keywords),
      ...asList(item?.searchTerms),
    ].filter(Boolean).join(' ');
  }

  function entry(item, kind, label, mode, heading, text, index = 0, key = index) {
    const value = String(text || '').trim();
    if (!value) return null;
    const actionKey = stableKey(key, index);
    return {
      id:`${String(item?._id || 'item')}:${kind}:${actionKey}`,
      actionKey,
      item,
      itemId:String(item?._id || ''),
      kind,
      label,
      mode,
      heading:String(heading || label || '').trim(),
      text:value,
      index,
      sourceCount:uniqueSources(item).length,
      version:String(item?.version || '').trim(),
      identity:normalize(identityText(item)),
      action:normalize(`${heading || ''} ${value}`),
    };
  }

  function buildEntries(items) {
    const out = [];
    (Array.isArray(items) ? items : []).forEach(item => {
      if (!eligible(item)) return;
      asList(item?.primaryCareSteps).forEach((step, index) => {
        const row = entry(item, 'primary', 'Veprimi', 'summary', step?.title || `Hapi ${index + 1}`, step?.action, index, step?._key || index);
        if (row) out.push(row);
      });
      asList(item?.redFlags).forEach((text, index) => {
        const row = entry(item, 'redFlag', 'Red flag', 'learn', 'Shenjat alarmuese', text, index, fingerprint(text));
        if (row) out.push(row);
      });
      asList(item?.doNotDo).forEach((text, index) => {
        const row = entry(item, 'doNotDo', 'Mos bëj', 'summary', 'Çfarë të mos bëhet', text, index, fingerprint(text));
        if (row) out.push(row);
      });
      const referral = item?.referral || {};
      [
        ['Kur referohet', referral.when, 'when'],
        ['Ku referohet', referral.destination, 'destination'],
        ['Handover', referral.handover, 'handover'],
      ].forEach(([heading, text, key], index) => {
        const row = entry(item, 'referral', 'Referim', heading === 'Handover' ? 'learn' : 'summary', heading, text, index, key);
        if (row) out.push(row);
      });
      asList(referral.beforeTransfer).forEach((text, index) => {
        const row = entry(item, 'referral', 'Referim', 'learn', 'Para transferimit', text, index + 10, `before-${fingerprint(text)}`);
        if (row) out.push(row);
      });
      asList(item?.secondaryCareSteps).forEach((step, index) => {
        const row = entry(item, 'secondary', 'Kujdes sekondar', 'learn', step?.title || `Hapi ${index + 1}`, step?.action, index, step?._key || index);
        if (row) out.push(row);
      });
    });
    return out;
  }

  function intentKinds(rawQuery) {
    const query = normalize(rawQuery);
    const kinds = new Set();
    if (/(red flag|shenja alarm|alarmuese)/.test(query)) kinds.add('redFlag');
    if (/(mos bej|shmang|gabim|kundraindik)/.test(query)) kinds.add('doNotDo');
    if (/(refer|transfer|handover)/.test(query)) kinds.add('referral');
    if (/(sekondar|avancuar|advanced)/.test(query)) kinds.add('secondary');
    if (/(doz|jap|jep|trajtim|mjekim|first line|hapi pare|cka bej|qka bej|cfare bej)/.test(query)) kinds.add('primary');
    return kinds;
  }

  function queryTokens(rawQuery) {
    return words(rawQuery)
      .filter(token => token.length >= 2 && !STOP_WORDS.has(token))
      .slice(0, 10);
  }

  function tokenHit(token, haystack) {
    const candidates = haystack.split(' ').filter(Boolean);
    let best = 0;
    for (const candidate of candidates) {
      if (candidate.length < 2) continue;
      if (candidate === token) best = Math.max(best, 4);
      else if (candidate.startsWith(token) || token.startsWith(candidate)) best = Math.max(best, 3);
      else if (candidate.includes(token) || token.includes(candidate)) best = Math.max(best, 2);
    }
    return best;
  }

  function treatmentSignal(entry) {
    return /(trajtim|terapi|bar|medikament|administr|doz|\bmg\b|\bmcg\b|\bml\b|\biv\b|\bim\b|oral|inhala|bolus)/.test(entry.action);
  }

  function scoreEntry(entry, rawQuery) {
    const query = normalize(rawQuery);
    if (!query) return null;
    const tokens = queryTokens(rawQuery);
    const intents = intentKinds(rawQuery);
    if (!tokens.length && !intents.size) return null;

    let score = 0;
    let actionMatches = 0;
    let identityMatches = 0;
    const matched = [];
    tokens.forEach(token => {
      const actionHit = tokenHit(token, entry.action);
      const identityHit = tokenHit(token, entry.identity);
      if (!actionHit && !identityHit) return;
      matched.push(token);
      if (actionHit >= identityHit) {
        actionMatches += 1;
        score += actionHit * 44;
      } else {
        identityMatches += 1;
        score += identityHit * 30;
      }
    });

    if (!matched.length && !intents.size) return null;
    if (!intents.size && actionMatches === 0) return null;
    if (intents.size && !intents.has(entry.kind)) score -= 80;
    if (intents.has(entry.kind)) score += 210;

    const coverage = tokens.length ? matched.length / tokens.length : 1;
    if (tokens.length >= 2 && coverage < .5) return null;
    score += Math.round(coverage * 260);

    if (query.length >= 5 && entry.action.includes(query)) score += 420;
    if (query.length >= 5 && entry.identity.includes(query)) score += 180;
    if (entry.kind === 'primary') score += Math.max(0, 70 - entry.index * 8);
    if (/(first line|hapi pare)/.test(query) && entry.kind === 'primary') score += entry.index === 0 ? 190 : Math.max(0, 60 - entry.index * 30);
    if (intents.has('primary') && treatmentSignal(entry) && !/(first line|hapi pare)/.test(query)) score += 85;

    return {
      ...entry,
      score,
      coverage,
      matchedTerms:[...new Set(matched)].slice(0, 4),
    };
  }

  function searchPrepared(entries, rawQuery, options = {}) {
    const limit = Math.max(1, Number(options.limit || 3));
    return (Array.isArray(entries) ? entries : [])
      .map(row => scoreEntry(row, rawQuery))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.index - b.index || a.item?.title?.localeCompare?.(b.item?.title || '', 'sq') || 0)
      .slice(0, limit);
  }

  function search(items, rawQuery, options = {}) {
    return searchPrepared(buildEntries(items), rawQuery, options);
  }

  return {normalize, fingerprint, uniqueSources, eligible, buildEntries, intentKinds, queryTokens, scoreEntry, searchPrepared, search};
});