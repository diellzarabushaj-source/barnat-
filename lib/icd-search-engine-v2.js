'use strict';

const Base = require('./icd-search-engine.js');

const clean = value => String(value ?? '').trim();
const levelRank = level => ({ chapter:1, block:2, category:3, subcategory:4 })[level] || 0;

function exactEditorialAlias(node, rawQuery) {
  const query = Base.normalize(rawQuery).replace(/\*/g, '');
  if (!query) return '';
  const aliases = Array.isArray(node?.terminologyAliases) ? node.terminologyAliases : [];
  return aliases.find(alias => Base.normalize(alias) === query) || '';
}

function prioritizeExactAlias(node, rawQuery) {
  const exactAlias = exactEditorialAlias(node, rawQuery);
  if (!exactAlias) return node;
  return {
    ...node,
    albanianDraft:[exactAlias, node.albanianDraft].map(clean).filter(Boolean).join(' '),
    __exactEditorialAlias:exactAlias,
  };
}

function rankNodes(nodes, rawQuery) {
  const query = clean(rawQuery);
  const prepared = (nodes || []).map(node => prioritizeExactAlias(node, query));
  return Base.rankNodes(prepared, query).sort((a, b) => {
    const aExact = a.node.__exactEditorialAlias ? 1 : 0;
    const bExact = b.node.__exactEditorialAlias ? 1 : 0;
    return bExact - aExact
      || b.match.score - a.match.score
      || levelRank(b.node.level) - levelRank(a.node.level)
      || clean(a.node.code).localeCompare(clean(b.node.code), 'en', { numeric:true });
  });
}

function suggestDataset(dataset, rawQuery, options = {}) {
  const query = clean(rawQuery);
  const prepared = {
    ...dataset,
    nodes:(dataset?.nodes || []).map(node => prioritizeExactAlias(node, query)),
  };
  return Base.suggestDataset(prepared, query, options);
}

module.exports = {
  ...Base,
  rankNodes,
  suggestDataset,
  exactEditorialAlias,
  prioritizeExactAlias,
};
