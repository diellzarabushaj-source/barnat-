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
  'code-fuzzy':'Kodi i korrigjuar',
});

const clean = value => String(value ?? '').trim();
const levelRank = level => ({ chapter:1, block:2, category:3, subcategory:4 })[level] || 0;
const normalizeHyphens = value => clean(value).replace(/[‐‑‒–—―]/g, '-');

function codeKey(value) {
  return normalizeHyphens(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeSingleCodeTypos(value) {
  const raw = normalizeHyphens(value).toUpperCase().replace(/\s+/g, '');
  // Preserve compact ranges such as I10I15 before applying single-code OCR/typing corrections.
  if (/^[A-Z]\d{2}[A-Z]\d{2}$/.test(raw)) return raw;
  if (!/^[A-Z][0-9OIL.]{2,6}$/.test(raw)) return raw;
  return raw[0] + raw.slice(1)
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

function canonicalCodeQuery(value) {
  const originalRaw = normalizeHyphens(value).toUpperCase().replace(/\s+/g, '');
  const raw = normalizeSingleCodeTypos(originalRaw);
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
    normalized:codeLike && (canonical !== originalRaw || raw !== originalRaw),
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

function indexedCandidateNodes(dataset, rawQuery, { maxCandidates = 1400 } = {}) {
  const nodes = dataset?.nodes || [];
  const query = clean(rawQuery);
  if (!query || nodes.length <= maxCandidates) return nodes;

  const code = canonicalCodeQuery(query);
  if (code.codeLike && code.key) {
    const prefixLength = Math.min(3, Math.max(1, code.key.length));
    const prefix = code.key.slice(0, prefixLength);
    const codeRows = nodes.filter(node => codeKey(node?.code).startsWith(prefix));
    return codeRows.length ? codeRows.slice(0, maxCandidates) : nodes;
  }

  let indexes;
  try {
    indexes = FullIcd.attachIndexes(dataset);
  } catch {
    return nodes;
  }

  const tokens = Base.tokenize(query).map(token => token.replace(/\*/g, '')).filter(Boolean);
  if (!tokens.length) return nodes;

  const votes = new Map();
  let evidenceUnits = 0;
  const voteList = list => {
    for (const node of list || []) votes.set(node, (votes.get(node) || 0) + 1);
  };

  for (const token of tokens) {
    if (token.length >= 3) {
      const grams = new Set();
      for (let i = 0; i <= token.length - 3; i += 1) grams.add(token.slice(i, i + 3));
      for (const gram of grams) {
        const list = indexes.searchByTrigram.get(gram);
        if (!list) continue;
        evidenceUnits += 1;
        voteList(list);
      }
    } else if (token.length === 2) {
      const list = indexes.searchByPrefix.get(token);
      if (list?.length) {
        evidenceUnits += 1;
        voteList(list);
      }
    }
  }

  if (!votes.size || !evidenceUnits) return nodes;
  const threshold = evidenceUnits >= 8 ? Math.max(1, Math.floor(evidenceUnits * 0.12)) : 1;
  const ranked = [...votes.entries()]
    .filter(([, score]) => score >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCandidates)
    .map(([node]) => node);

  // If no n-gram survives a very noisy typo, fall back to the complete dataset.
  return ranked.length ? ranked : nodes;
}

function groupFor(item) {
  const type = item.match?.type || '';
  if (['code-exact', 'code-normalized', 'title-sq-exact', 'title-en-exact', 'title-la-exact', 'editorial-alias-exact'].includes(type)) return 'exact';
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

function hierarchyResultOrder(rows, rawQuery, limit = 18) {
  const query = canonicalCodeQuery(rawQuery);
  if (query.codeLike) {
    return [...rows].sort((a, b) => {
      const groupDifference = GROUP_ORDER.indexOf(a.searchMatch.group) - GROUP_ORDER.indexOf(b.searchMatch.group);
      return groupDifference || b.searchMatch.score - a.searchMatch.score
        || levelRank(b.level) - levelRank(a.level)
        || clean(a.code).localeCompare(clean(b.code), 'en', { numeric:true });
    }).slice(0, limit);
  }

  const categories = rows.filter(row => row.level === 'category')
    .sort((a, b) => b.searchMatch.score - a.searchMatch.score
      || clean(a.code).localeCompare(clean(b.code), 'en', { numeric:true }));

  // Broad clinical text searches should orient the clinician first:
  // a bounded set of three-character categories, then their specific children.
  const categoryQuota = Math.min(6, Math.max(2, Math.floor(limit / 3)));
  const primaryCategories = categories.slice(0, categoryQuota);
  const familyOrder = new Map(primaryCategories.map((row, index) => [row.code, index]));

  const familySubcategories = rows.filter(row => row.level === 'subcategory' && familyOrder.has(row.parentCode))
    .sort((a, b) => (familyOrder.get(a.parentCode) - familyOrder.get(b.parentCode))
      || b.searchMatch.score - a.searchMatch.score
      || clean(a.code).localeCompare(clean(b.code), 'en', { numeric:true }));

  const remainingCategories = categories.slice(categoryQuota);
  const remainingSubcategories = rows.filter(row => row.level === 'subcategory' && !familyOrder.has(row.parentCode))
    .sort((a, b) => b.searchMatch.score - a.searchMatch.score
      || clean(a.code).localeCompare(clean(b.code), 'en', { numeric:true }));

  const broader = rows.filter(row => row.level === 'block' || row.level === 'chapter')
    .sort((a, b) => b.searchMatch.score - a.searchMatch.score
      || levelRank(b.level) - levelRank(a.level)
      || clean(a.code).localeCompare(clean(b.code), 'en', { numeric:true }));

  const ordered = [
    ...primaryCategories,
    ...familySubcategories,
    ...remainingCategories,
    ...remainingSubcategories,
    ...broader,
  ];

  const seen = new Set();
  return ordered.filter(row => {
    if (!row?.code || seen.has(row.code)) return false;
    seen.add(row.code);
    return true;
  }).slice(0, limit);
}

function suggestDataset(dataset, rawQuery, { limit = 18 } = {}) {
  const query = clean(rawQuery);
  if (!query) return { rows:[], groups:[], query, interpretedAs:'', interpretationType:'', normalizedCode:'', total:0 };
  const nodes = indexedCandidateNodes(dataset, query);
  const ranked = rankNodes(nodes, query);
  const runtime = hierarchyRuntime(dataset);
  const exact = ranked.find(item => groupFor(item) === 'exact');
  const selectedByCode = new Map();
  const add = (node, match, group) => {
    if (!node?.code) return;
    const decorated = decorate(node, match, group);
    const current = selectedByCode.get(node.code);
    if (!current || Number(decorated.searchMatch.score || 0) > Number(current.searchMatch.score || 0)) {
      selectedByCode.set(node.code, decorated);
    }
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

  const codeIntent = canonicalCodeQuery(query).codeLike;
  if (!codeIntent) {
    // If a specific child is a strong hit, surface its three-character parent category
    // before the child even when the parent's own wording is less similar to the query.
    const promotedParents = new Set();
    for (const item of ranked.slice(0, 80)) {
      if (item.node.level !== 'subcategory') continue;
      const parent = runtime.byCode.get(item.node.parentCode);
      if (!parent || parent.level !== 'category' || promotedParents.has(parent.code)) continue;
      promotedParents.add(parent.code);
      add(parent, {
        type:'hierarchy-parent',
        field:'hierarchy',
        score:Math.max(1, item.match.score - 24),
        matchedTerm:parent.displayTitle,
      }, 'suggested');
      if (promotedParents.size >= 10) break;
    }
  }

  for (const item of ranked) add(item.node, item.match, groupFor(item));

  const selected = hierarchyResultOrder([...selectedByCode.values()], query, limit);

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
    rows:selected,
    groups,
    total:ranked.length,
    candidateCount:nodes.length,
    safetyNote:'Sugjerimet ndihmojnë kërkimin dhe kodimin; nuk vendosin diagnozë.',
  };
}

module.exports = {
  ...Base,
  MATCH_LABELS,
  codeKey,
  normalizeSingleCodeTypos,
  canonicalCodeQuery,
  codeMatch,
  editorialAliasMatch,
  bestMatch,
  rankNodes,
  indexedCandidateNodes,
  hierarchyResultOrder,
  suggestDataset,
};
