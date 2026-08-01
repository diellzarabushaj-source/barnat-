'use strict';

const GROUP_ORDER = Object.freeze(['exact', 'suggested', 'broader', 'narrower', 'english']);
const GROUP_LABELS = Object.freeze({
  exact:'Përputhje e saktë',
  suggested:'Diagnoza të sugjeruara',
  broader:'Kategori më të gjera',
  narrower:'Nënkode më specifike',
  english:'Rezultate në anglisht',
});

const MATCH_LABELS = Object.freeze({
  'code-exact':'Kodi i saktë',
  'code-prefix':'Prefiks kodi',
  'title-sq-exact':'Titull i saktë shqip',
  'title-sq-prefix':'Titull shqip',
  'title-en-exact':'Titull i saktë anglisht',
  'title-en-prefix':'Titull anglisht',
  'synonym-sq':'Sinonim shqip',
  'wildcard':'Përputhje me *',
  'fuzzy-sq':'Gabim shkrimi i korrigjuar',
  'fuzzy-en':'Përputhje e afërt anglisht',
  'tokens-sq':'Terma shqip',
  'tokens-en':'Terma anglisht',
  'hierarchy-parent':'Kategori më e gjerë',
  'hierarchy-child':'Nënkod më specifik',
});

const ALIAS_ROWS = Object.freeze([
  [['tension i larte', 'tension i rritur', 'shtypje e larte e gjakut'], ['hypertension', 'hipertension']],
  [['sheqer ne gjak', 'semundja e sheqerit'], ['diabetes mellitus', 'diabet']],
  [['dhimbje koke', 'dhembje koke'], ['headache', 'cephalalgia']],
  [['migrene', 'migrena'], ['migraine']],
  [['marramendje', 'trullosje'], ['dizziness', 'vertigo']],
  [['te fiket', 'humbje e vetedijes'], ['syncope', 'collapse']],
  [['dhimbje gjoksi', 'dhembje gjoksi'], ['chest pain', 'precordial pain']],
  [['rrahje zemre', 'zemra me rreh shpejt'], ['palpitations']],
  [['gulcim', 'veshtiresi ne frymemarrje', 'fryme e shkurter'], ['dyspnoea', 'dyspnea', 'shortness of breath']],
  [['koll', 'kolle'], ['cough']],
  [['ftohje', 'rrufe'], ['common cold', 'acute nasopharyngitis']],
  [['grip'], ['influenza']],
  [['astme', 'asma'], ['asthma']],
  [['bronkit'], ['bronchitis']],
  [['pneumoni', 'pezmatim i mushkerive'], ['pneumonia']],
  [['dhimbje barku', 'dhembje barku'], ['abdominal pain']],
  [['te perziera', 'nauze'], ['nausea']],
  [['vjellje', 'te vjella'], ['vomiting']],
  [['diarre', 'barkqitje'], ['diarrhoea', 'diarrhea']],
  [['kapsllek'], ['constipation']],
  [['urth', 'djegie ne lukth'], ['heartburn']],
  [['refluks'], ['gastro oesophageal reflux', 'gastroesophageal reflux']],
  [['djegie urine', 'djegie gjate urinimit'], ['dysuria']],
  [['urinim i shpeshte'], ['frequency of micturition', 'frequent urination']],
  [['gjak ne urine'], ['haematuria', 'hematuria']],
  [['gur ne veshke', 'gure ne veshka'], ['calculus of kidney', 'renal stone', 'urolithiasis']],
  [['dhimbje mesi', 'dhembje mesi'], ['low back pain', 'lumbago']],
  [['dhimbje shpinde', 'dhembje shpinde'], ['back pain', 'dorsalgia']],
  [['ishias'], ['sciatica']],
  [['dhimbje nyjesh', 'dhembje nyjesh'], ['joint pain', 'arthralgia']],
  [['artroze'], ['osteoarthritis', 'arthrosis']],
  [['artrit'], ['arthritis']],
  [['thyerje', 'frakture'], ['fracture']],
  [['ndrydhje'], ['sprain']],
  [['anemi'], ['anaemia', 'anemia']],
  [['alergji'], ['allergy', 'allergic']],
  [['ekzeme'], ['eczema', 'dermatitis']],
  [['pucrra'], ['acne']],
  [['myk i lekures', 'infeksion mykotik'], ['mycosis', 'fungal infection']],
  [['lyth', 'lytha'], ['viral wart']],
  [['pagjumesi'], ['insomnia']],
  [['ankth'], ['anxiety']],
  [['sulm paniku'], ['panic disorder', 'panic attack']],
  [['depresion'], ['depressive episode', 'depression']],
  [['konfuzion'], ['disorientation', 'confusion']],
  [['harrese'], ['memory loss', 'amnesia']],
  [['halucinacione'], ['hallucinations']],
  [['temperature', 'ethe'], ['fever', 'pyrexia']],
  [['lodhje'], ['fatigue', 'malaise']],
  [['humbje peshe'], ['abnormal weight loss']],
  [['gjakderdhje vaginale'], ['vaginal bleeding']],
  [['cikel i crregullt', 'menstruacione te crregullta'], ['irregular menstruation']],
  [['dhimbje menstruale'], ['dysmenorrhoea', 'dysmenorrhea']],
  [['shtatzani'], ['pregnancy']],
]);

const PROFILE_CACHE = new WeakMap();

const clean = value => String(value ?? '').trim();
const normalize = value => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9*]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function tokenize(value) {
  return normalize(value).split(' ').filter(Boolean);
}

function stemToken(value) {
  let token = normalize(value).replace(/\*/g, '');
  if (token.length <= 4) return token;
  const endings = [
    'imeve', 'ave', 'eve', 'uar', 'ueshme', 'ueshem', 'shëm', 'shme',
    'imit', 'imi', 'it', 'ise', 'isë', 'es', 'e', 'a', 'i', 'u', 've',
    'tion', 'sion', 'ment', 'ing', 'ed', 'es', 's',
  ];
  for (const ending of endings) {
    const normalizedEnding = normalize(ending);
    if (token.length - normalizedEnding.length >= 4 && token.endsWith(normalizedEnding)) {
      token = token.slice(0, -normalizedEnding.length);
      break;
    }
  }
  return token;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const ALIASES = (() => {
  const rows = [];
  for (const [aliases, targets] of ALIAS_ROWS) {
    const normalizedTargets = unique(targets.map(normalize));
    for (const alias of aliases) rows.push({
      alias:normalize(alias),
      aliasTokens:tokenize(alias),
      targets:normalizedTargets,
    });
  }
  return rows;
})();

function profile(node) {
  if (PROFILE_CACHE.has(node)) return PROFILE_CACHE.get(node);
  const code = normalize(node?.code).replace(/\s+/g, '');
  const sq = normalize(node?.albanianDraft || '');
  const en = normalize(node?.englishTitle || '');
  const display = normalize(node?.displayTitle || '');
  const sqTokens = tokenize(sq);
  const enTokens = tokenize(en);
  const value = {
    code,
    sq,
    en,
    display,
    sqTokens,
    enTokens,
    sqStems:unique(sqTokens.map(stemToken)),
    enStems:unique(enTokens.map(stemToken)),
  };
  PROFILE_CACHE.set(node, value);
  return value;
}

function boundedDistance(a, b, maxDistance = 2) {
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return 0;
  if (!left || !right || Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
  const previous = Array.from({ length:right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        current[j] = Math.min(current[j], previous[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

function aliasExpansions(query) {
  const q = normalize(query).replace(/\*/g, '');
  const tokens = tokenize(q);
  return ALIASES.filter(row => {
    if (row.alias === q || row.alias.startsWith(q) || q.startsWith(row.alias)) return true;
    return row.aliasTokens.length > 1
      && row.aliasTokens.every(token => tokens.includes(token));
  });
}

function tokenMatch(queryToken, candidateToken, wildcard = false) {
  const queryStem = stemToken(queryToken);
  const candidateStem = stemToken(candidateToken);
  if (!queryStem || !candidateStem) return null;
  if (queryStem === candidateStem) return { score:90, fuzzy:false };
  if (wildcard && candidateStem.startsWith(queryStem)) return { score:78, fuzzy:false };
  if (candidateStem.startsWith(queryStem) || queryStem.startsWith(candidateStem)) return { score:64, fuzzy:false };
  const maxDistance = queryStem.length >= 8 ? 2 : queryStem.length >= 5 ? 1 : 0;
  if (!maxDistance) return null;
  const distance = boundedDistance(queryStem, candidateStem, maxDistance);
  if (distance <= maxDistance) return { score:50 - (distance * 8), fuzzy:true };
  return null;
}

function scoreTokens(queryTokens, candidateTokens, wildcardTokens) {
  if (!queryTokens.length || !candidateTokens.length) return null;
  let score = 0;
  let fuzzy = false;
  const matched = [];
  for (const queryToken of queryTokens) {
    let best = null;
    for (const candidateToken of candidateTokens) {
      const result = tokenMatch(queryToken, candidateToken, wildcardTokens.has(queryToken));
      if (!result || (best && result.score <= best.score)) continue;
      best = { ...result, candidateToken };
    }
    if (!best) return null;
    score += best.score;
    fuzzy ||= best.fuzzy;
    matched.push(best.candidateToken);
  }
  return { score, fuzzy, matched };
}

function matchTextField(rawQuery, normalizedQuery, value, tokens, field) {
  if (!value) return null;
  const rawTokens = tokenize(rawQuery);
  const wildcardTokens = new Set(rawTokens.filter(token => token.endsWith('*')).map(token => token.replace(/\*+$/, '')));
  const queryTokens = rawTokens.map(token => token.replace(/\*+$/, '')).filter(Boolean);
  const hasWildcard = rawTokens.some(token => token.includes('*'));
  if (value === normalizedQuery) {
    return { score:field === 'sq' ? 920 : 860, type:`title-${field}-exact`, field, matchedTerm:value };
  }
  if (value.startsWith(normalizedQuery)) {
    return { score:field === 'sq' ? 760 : 700, type:`title-${field}-prefix`, field, matchedTerm:value };
  }
  if (hasWildcard) {
    const wildcardMatch = scoreTokens(queryTokens, tokens, wildcardTokens);
    if (wildcardMatch) return { score:(field === 'sq' ? 630 : 580) + wildcardMatch.score, type:'wildcard', field, matchedTerm:wildcardMatch.matched.join(' ') };
  }
  const tokenResult = scoreTokens(queryTokens, tokens, wildcardTokens);
  if (!tokenResult) return null;
  const base = field === 'sq' ? 430 : 370;
  return {
    score:base + tokenResult.score,
    type:tokenResult.fuzzy ? `fuzzy-${field}` : `tokens-${field}`,
    field,
    matchedTerm:tokenResult.matched.join(' '),
  };
}

function bestMatch(node, rawQuery) {
  const query = normalize(rawQuery);
  if (!query) return null;
  const normalizedCodeQuery = query.replace(/\s+/g, '').toUpperCase();
  const nodeProfile = profile(node);
  const nodeCode = clean(node?.code).toUpperCase();
  if (nodeCode === normalizedCodeQuery) {
    return { score:1200, type:'code-exact', field:'code', matchedTerm:nodeCode };
  }
  if (nodeCode.startsWith(normalizedCodeQuery) && /^[A-Z0-9.]+$/.test(normalizedCodeQuery)) {
    return { score:1020, type:'code-prefix', field:'code', matchedTerm:nodeCode };
  }

  const candidates = [
    matchTextField(rawQuery, query, nodeProfile.sq, nodeProfile.sqTokens, 'sq'),
    matchTextField(rawQuery, query, nodeProfile.en, nodeProfile.enTokens, 'en'),
  ].filter(Boolean);

  for (const alias of aliasExpansions(rawQuery)) {
    for (const target of alias.targets) {
      const targetTokens = tokenize(target);
      const wildcardTokens = new Set();
      const sq = scoreTokens(targetTokens, nodeProfile.sqTokens, wildcardTokens);
      const en = scoreTokens(targetTokens, nodeProfile.enTokens, wildcardTokens);
      const best = [sq && { ...sq, field:'sq' }, en && { ...en, field:'en' }]
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)[0];
      if (best) candidates.push({
        score:820 + best.score,
        type:'synonym-sq',
        field:best.field,
        matchedTerm:alias.alias,
        expandedTerm:target,
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const match = candidates[0];
  const levelBoost = node.level === 'subcategory' ? 18 : node.level === 'category' ? 12 : 0;
  return { ...match, score:match.score + levelBoost };
}

function rankNodes(nodes, rawQuery) {
  const query = clean(rawQuery);
  if (!query) return (nodes || []).map(node => ({ node, match:null }));
  return (nodes || [])
    .map(node => ({ node, match:bestMatch(node, query) }))
    .filter(item => item.match)
    .sort((a, b) => b.match.score - a.match.score
      || levelRank(b.node.level) - levelRank(a.node.level)
      || clean(a.node.code).localeCompare(clean(b.node.code), 'en', { numeric:true }));
}

function levelRank(level) {
  return ({ chapter:1, block:2, category:3, subcategory:4 })[level] || 0;
}

function groupFor(item) {
  const type = item.match?.type || '';
  if (['code-exact', 'title-sq-exact', 'title-en-exact'].includes(type)) return 'exact';
  if (item.node.level === 'chapter' || item.node.level === 'block') return 'broader';
  if (type.startsWith('title-en') || type === 'tokens-en' || type === 'fuzzy-en') return 'english';
  return 'suggested';
}

function decorate(node, match, group) {
  return {
    ...node,
    searchMatch:{
      type:match?.type || '',
      field:match?.field || '',
      score:Number(match?.score || 0),
      matchedTerm:match?.matchedTerm || '',
      expandedTerm:match?.expandedTerm || '',
      label:MATCH_LABELS[match?.type] || 'Përputhje',
      group,
      groupLabel:GROUP_LABELS[group] || GROUP_LABELS.suggested,
    },
  };
}

function suggestDataset(dataset, rawQuery, { limit = 18 } = {}) {
  const query = clean(rawQuery);
  if (!query) return { rows:[], groups:[], query, interpretedAs:'', total:0 };
  const nodes = dataset?.nodes || [];
  const ranked = rankNodes(nodes, query);
  const byCode = new Map(nodes.map(node => [node.code, node]));
  const children = new Map();
  for (const node of nodes) {
    if (!children.has(node.parentCode)) children.set(node.parentCode, []);
    children.get(node.parentCode).push(node);
  }

  const exact = ranked.find(item => ['code-exact', 'title-sq-exact', 'title-en-exact'].includes(item.match.type));
  const selected = [];
  const seen = new Set();
  const add = (node, match, group) => {
    if (!node || seen.has(node.code) || selected.length >= limit) return;
    seen.add(node.code);
    selected.push(decorate(node, match, group));
  };

  if (exact) {
    add(exact.node, exact.match, 'exact');
    const parent = byCode.get(exact.node.parentCode);
    if (parent) add(parent, { type:'hierarchy-parent', field:'hierarchy', score:exact.match.score - 60, matchedTerm:parent.displayTitle }, 'broader');
    for (const child of (children.get(exact.node.code) || []).slice(0, 4)) {
      add(child, { type:'hierarchy-child', field:'hierarchy', score:exact.match.score - 80, matchedTerm:child.displayTitle }, 'narrower');
    }
  }

  for (const item of ranked) add(item.node, item.match, groupFor(item));

  selected.sort((a, b) => {
    const groupDifference = GROUP_ORDER.indexOf(a.searchMatch.group) - GROUP_ORDER.indexOf(b.searchMatch.group);
    return groupDifference || b.searchMatch.score - a.searchMatch.score
      || clean(a.code).localeCompare(clean(b.code), 'en', { numeric:true });
  });

  const groups = GROUP_ORDER.map(group => ({
    id:group,
    label:GROUP_LABELS[group],
    count:selected.filter(node => node.searchMatch.group === group).length,
  })).filter(group => group.count);

  const alias = aliasExpansions(query)[0];
  return {
    query,
    interpretedAs:alias?.targets?.[0] || '',
    rows:selected.slice(0, limit),
    groups,
    total:ranked.length,
    safetyNote:'Sugjerimet ndihmojnë kërkimin dhe kodimin; nuk vendosin diagnozë.',
  };
}

module.exports = {
  GROUP_ORDER,
  GROUP_LABELS,
  MATCH_LABELS,
  normalize,
  tokenize,
  stemToken,
  boundedDistance,
  aliasExpansions,
  bestMatch,
  rankNodes,
  suggestDataset,
};
