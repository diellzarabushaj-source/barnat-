'use strict';

const Base = require('./icd-search-engine-v2.js');
const FullIcd = require('./icd-full-hierarchy.js');

const GROUP_ORDER = Base.GROUP_ORDER;
const GROUP_LABELS = Base.GROUP_LABELS;
const MATCH_LABELS = Object.freeze({
  ...Base.MATCH_LABELS,
  'code-normalized':'Kodi i normalizuar',
  'editorial-alias-exact':'Term klinik i saktë',
  'editorial-alias-prefix':'Term klinik',
});

const clean = value => String(value ?? '').trim();
const levelRank = level => ({ chapter:1, block:2, category:3, subcategory:4 })[level] || 0;
const normalizeHyphens = value => clean(value).replace(/[‐‑‒–—―]/g, '-');

function codeKey(value) {
  return normalizeHyphens(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function canonicalCodeQuery(value) {
  const raw = normalizeHyphens(value).toUpperCase().replace(/\s+/g, '');
  if (!raw) return { raw:'', canonical:'', key:'', codeLike:false, normalized:false };
  let canonical = raw.replace(/[^A-Z0-9.-]/g, '');
  let codeLike = false;

  if (/^[IVXLCDM]+$/.test(canonical)) {
    codeLike = true;
  } else if (/^[A-Z]\d{2}$/.test(canonical)) {
    codeLike = true;
  } else if (/^[A-Z]\d{2}\.\d{1,2}$/.test(canonical)) {
    codeLike = true;
  } else if (/^[A-Z]\d{3,4}$/.test(canonical)) {
    canonical = `${canonical.slice(0, 3)}.${canonical.slice(3)}`;
    codeLike = true;
  } else if (/^[A-Z]\d{2}-[A-Z]?\d{2}$/.test(canonical)) {
    const [left, rightRaw] = canonical.split('-');
    canonical = `${left}-${/^[A-Z]/.test(rightRaw) ? rightRaw : `${left[0]}${rightRaw}`}`;
    codeLike = true;
  } else if (/^[A-Z]\d{2}[A-Z]\d{2}$/.test(canonical)) {
    canonical = `${canonical.slice(0, 3)}-${canonical.slice(3)}`;
    codeLike = true;
  }

  return {
    raw,
    canonical,
    key:codeKey(canonical),
    codeLike,
    normalized:codeLike && canonical !== raw,
  };
}

function codeMatch(node, rawQuery) {
  const query = canonicalCodeQuery(rawQuery);
  if (!query.codeLike || !query.key) return null;
  const nodeCode = normalizeHyphens(node?.code).toUpperCase();
  const nodeKey = codeKey(nodeCode);
  if (!nodeKey) return null;
  if (nodeKey === query.key) {
    const normalized = query.canonical !== nodeCode || query.normalized;
    return {
      score:normalized ? 1275 : 1300,
      type:normalized ? 'code-normalized' : 'code-exact',
      field:'code',
      matchedTerm:nodeCode,
      normalizedCode:nodeCode,
    };
  }
  if (query.key.length >= 2 && nodeKey.startsWith(query.key)) {
    return {
      score:1070 - Math.min(80, nodeKey.length - query.key.length),
      type:'code-prefix',
      field:'code',
      matchedTerm:nodeCode,
      normalizedCode:query.canonical,
    };
  }
  return null;
}

function editorialAliasMatch(node, rawQuery) {
  const query = Base.normalize(rawQuery).replace(/\*/g, '');
  if (!query) return null;
  const aliases = Array.isArray(node?.terminologyAliases) ? node.terminologyAliases : [];
  let best = null;
  for (const rawAlias of aliases) {
    const alias = Base.normalize(rawAlias);
    if (!alias) continue;
    if (alias === query) {
      const candidate = {
        score:1125,
        type:'editorial-alias-exact',
        field:'sq-alias',
        matchedTerm:clean(rawAlias),
      };
      if (!best || candidate.score > best.score) best = candidate;
      continue;
    }
    if (query.length >= 3 && alias.startsWith(query)) {
      const candidate = {
        score:805 - Math.min(100, alias.length - query.length),
        type:'editorial-alias-prefix',
        field:'sq-alias',
        matchedTerm:clean(rawAlias),
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
  }
  return best;
}

function bestMatch(node, rawQuery) {
  const candidates = [
    codeMatch(node, rawQuery),
    editorialAliasMatch(node, rawQuery),
    Base.bestMatch(node, rawQuery),
  ].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const match = candidates[0];
  const levelBoost = node?.level === 'subcategory' ? 18 : node?.level === 'category' ? 12 : 0;
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

function groupFor(item) {
  const type = item.match?.type || '';
  if (['code-exact', 'code-normalized', 'title-sq-exact', 'title-en-exact', 'editorial-alias-exact'].includes(type)) return 'exact';
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
      normalizedCode:match?.normalizedCode || '',
      label:MATCH_LABELS[match?.type] || 'Përputhje',
      group,
      groupLabel:GROUP_LABELS[group] || GROUP_LABELS.suggested,
    },
  };
}

function hierarchyRuntime(dataset) {
  try {
    const indexes = FullIcd.attachIndexes(dataset);
    return { byCode:indexes.byCode, children:indexes.childrenByParent };
  } catch {
    const nodes = dataset?.nodes || [];
    const byCode = new Map(nodes.map(node => [node.code, node]));
    const children = new Map();
    for (const node of nodes) {
      if (!children.has(node.parentCode)) children.set(node.parentCode, []);
      children.get(node.parentCode).push(node);
    }
    return { byCode, children };
  }
}

function suggestDataset(dataset, rawQuery, { limit = 18 } = {}) {
  const query = clean(rawQuery);
  if (!query) return { rows:[], groups:[], query, interpretedAs:'', interpretationType:'', normalizedCode:'', total:0 };
  const nodes = dataset?.nodes || [];
  const ranked = rankNodes(nodes, query);
  const runtime = hierarchyRuntime(dataset);
  const exact = ranked.find(item => groupFor(item) === 'exact');
  const selected = [];
  const seen = new Set();
  const add = (node, match, group) => {
    if (!node || seen.has(node.code) || selected.length >= limit) return;
    seen.add(node.code);
    selected.push(decorate(node, match, group));
  };

  if (exact) {
    add(exact.node, exact.match, 'exact');
    const parent = runtime.byCode.get(exact.node.parentCode);
    if (parent) add(parent, {
      type:'hierarchy-parent', field:'hierarchy', score:exact.match.score - 60, matchedTerm:parent.displayTitle,
    }, 'broader');
    for (const child of (runtime.children.get(exact.node.code) || []).slice(0, 4)) {
      add(child, {
        type:'hierarchy-child', field:'hierarchy', score:exact.match.score - 80, matchedTerm:child.displayTitle,
      }, 'narrower');
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

  const code = canonicalCodeQuery(query);
  const alias = Base.aliasExpansions(query)[0];
  const normalizedCode = code.codeLike ? code.canonical : '';
  const interpretedAs = code.normalized ? code.canonical : alias?.targets?.[0] || '';
  const interpretationType = code.normalized ? 'code-normalized' : alias ? 'clinical-synonym' : '';
  return {
    query,
    interpretedAs,
    interpretationType,
    normalizedCode,
    rows:selected.slice(0, limit),
    groups,
    total:ranked.length,
    safetyNote:'Sugjerimet ndihmojnë kërkimin dhe kodimin; nuk vendosin diagnozë.',
  };
}

module.exports = {
  ...Base,
  MATCH_LABELS,
  codeKey,
  canonicalCodeQuery,
  codeMatch,
  editorialAliasMatch,
  bestMatch,
  rankNodes,
  suggestDataset,
};
