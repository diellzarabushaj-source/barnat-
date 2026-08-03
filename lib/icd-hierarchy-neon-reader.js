'use strict';

const FullIcd = require('./icd-full-hierarchy.js');
const {
  hasNeonConfig,
  neonRequest,
  isRelationMissing,
} = require('./neon-data-api.js');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const REVISION_TABLE = 'icd_hierarchy_revisions';
const ACTIVE_VIEW = 'icd_hierarchy_active';

let cached = null;
let pending = null;

const clean = value => String(value ?? '').trim();

function expectedCountsMatch(value) {
  const counts = value && typeof value === 'object' ? value : {};
  return Object.entries(FullIcd.EXPECTED_COUNTS).every(([key, expected]) => Number(counts[key]) === expected);
}

function revisionQuery() {
  const select = [
    'revision',
    'spreadsheet_id',
    'sheet_name',
    'sheet_gid',
    'source_hash',
    'source_bytes',
    'header_row',
    'counts',
    'status',
    'imported_at',
    'activated_at',
  ].join(',');
  return `/${REVISION_TABLE}?status=eq.active&select=${encodeURIComponent(select)}&limit=1`;
}

function nodesQuery(revision, offset) {
  const select = [
    'revision',
    'code',
    'level_name',
    'chapter_code',
    'block_code',
    'parent_code',
    'title_en',
    'title_sq',
    'display_title',
    'translation_status',
    'path_text',
    'source_url',
    'source_row',
    'search_text',
  ].join(',');
  return `/${ACTIVE_VIEW}?revision=eq.${encodeURIComponent(revision)}&select=${encodeURIComponent(select)}&order=source_row.asc&limit=${PAGE_SIZE}&offset=${offset}`;
}

function rowToNode(row) {
  return {
    code:clean(row?.code),
    level:clean(row?.level_name),
    chapter:clean(row?.chapter_code),
    block:clean(row?.block_code),
    parentCode:clean(row?.parent_code),
    englishTitle:clean(row?.title_en),
    albanianDraft:clean(row?.title_sq),
    displayTitle:clean(row?.display_title) || clean(row?.title_sq) || clean(row?.title_en),
    translationStatus:clean(row?.translation_status) || 'missing',
    sourceUrl:clean(row?.source_url),
    sourceRow:Number(row?.source_row || 0),
    searchText:clean(row?.search_text),
    path:clean(row?.path_text),
  };
}

async function fetchActiveRevision() {
  if (!hasNeonConfig()) return null;
  try {
    const rows = await neonRequest(revisionQuery(), {
      timeoutMs:8000,
      label:'ICD hierarchy active revision',
    });
    const revision = Array.isArray(rows) ? rows[0] : null;
    if (!revision) return null;
    if (!expectedCountsMatch(revision.counts)) {
      throw new Error('Revision-i aktiv ICD në Neon nuk ka numrat e plotë të hierarkisë.');
    }
    return revision;
  } catch (error) {
    if (isRelationMissing(error)) return null;
    throw error;
  }
}

async function fetchAllNodes(revision) {
  const nodes = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let rows;
    try {
      rows = await neonRequest(nodesQuery(revision, offset), {
        timeoutMs:12000,
        label:`ICD hierarchy nodes ${offset}`,
      });
    } catch (error) {
      if (isRelationMissing(error)) return null;
      throw error;
    }
    const page = Array.isArray(rows) ? rows : [];
    nodes.push(...page.map(rowToNode));
    if (page.length < PAGE_SIZE) break;
    if (nodes.length > FullIcd.EXPECTED_COUNTS.total) {
      throw new Error('Mirror-i ICD në Neon përmban më shumë nyje se hierarkia e pritur.');
    }
  }
  return nodes;
}

async function build() {
  const revision = await fetchActiveRevision();
  if (!revision) return null;
  const startedAt = Date.now();
  const nodes = await fetchAllNodes(revision.revision);
  if (!nodes) return null;
  const validation = FullIcd.validate(nodes, { strictCounts:true });
  const data = FullIcd.attachIndexes(nodes);
  return {
    loadedAt:Date.now(),
    fetchMs:Date.now() - startedAt,
    buildMs:0,
    csvBytes:Number(revision.source_bytes || 0),
    sourceRevision:clean(revision.revision),
    sourceHash:clean(revision.source_hash),
    sourceType:'neon',
    sourceUrl:'',
    spreadsheetId:clean(revision.spreadsheet_id),
    sheetName:clean(revision.sheet_name),
    sheetGid:Number(revision.sheet_gid || 0),
    headerRow:Number(revision.header_row || 0) || null,
    activatedAt:clean(revision.activated_at),
    counts:validation.counts,
    data,
    stale:false,
  };
}

async function load(options = {}) {
  const force = Boolean(options.force);
  if (!hasNeonConfig()) return null;
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;
  if (!pending) {
    pending = build().then(result => {
      if (result) cached = result;
      return result;
    }).finally(() => {
      pending = null;
    });
  }
  return pending;
}

function resetForTests() {
  cached = null;
  pending = null;
}

module.exports = {
  CACHE_TTL_MS,
  PAGE_SIZE,
  REVISION_TABLE,
  ACTIVE_VIEW,
  expectedCountsMatch,
  revisionQuery,
  nodesQuery,
  rowToNode,
  fetchActiveRevision,
  fetchAllNodes,
  load,
  _test:{ resetForTests },
};
