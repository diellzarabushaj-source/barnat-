'use strict';

const Search = require('./icd-search-engine-v3.js');

const EXPECTED_COUNTS = Object.freeze({
  chapter:22,
  block:274,
  category:2050,
  subcategory:10196,
  total:12542,
});

const SEARCH_PROBES = Object.freeze([
  Object.freeze({
    id:'compact-code',
    label:'Kod pa pikë',
    query:'A001',
    expectedCode:'A00.1',
    expectedType:'code-normalized',
  }),
  Object.freeze({
    id:'compact-block',
    label:'Interval pa vizë',
    query:'I10I15',
    expectedCode:'I10-I15',
    expectedType:'code-normalized',
  }),
  Object.freeze({
    id:'clinical-synonym',
    label:'Sinonim klinik shqip',
    query:'tension i lartë',
    expectedCode:'I10',
  }),
  Object.freeze({
    id:'typo-tolerance',
    label:'Gabim i vogël shkrimi',
    query:'hipertensjon',
    expectedCode:'I10',
  }),
  Object.freeze({
    id:'symptom-code',
    label:'Simptomë pa inferencë',
    query:'dhimbje gjoksi',
    expectedPrefix:'R07',
    forbiddenCodes:Object.freeze(['I21']),
  }),
]);

const auditCache = new WeakMap();
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function countAudit(dataset) {
  const counts = dataset?.counts || {};
  const actual = {
    chapter:number(counts.chapter),
    block:number(counts.block),
    category:number(counts.category),
    subcategory:number(counts.subcategory),
    total:number(counts.total),
    nodeArray:Array.isArray(dataset?.nodes) ? dataset.nodes.length : 0,
  };
  const mismatches = Object.entries(EXPECTED_COUNTS)
    .filter(([key, expected]) => actual[key] !== expected)
    .map(([key, expected]) => ({ key, expected, actual:actual[key] }));
  if (actual.nodeArray !== EXPECTED_COUNTS.total) {
    mismatches.push({ key:'nodeArray', expected:EXPECTED_COUNTS.total, actual:actual.nodeArray });
  }
  return {
    expected:EXPECTED_COUNTS,
    actual,
    complete:mismatches.length === 0,
    mismatches,
  };
}

function runProbe(dataset, probe) {
  try {
    const result = Search.suggestDataset(dataset, probe.query, { limit:18 });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const first = rows[0] || null;
    const codes = rows.map(row => clean(row.code));
    const firstCode = clean(first?.code);
    const firstType = clean(first?.searchMatch?.type);
    const expectedCodePass = !probe.expectedCode || firstCode === probe.expectedCode;
    const expectedPrefixPass = !probe.expectedPrefix || firstCode.startsWith(probe.expectedPrefix);
    const expectedTypePass = !probe.expectedType || firstType === probe.expectedType;
    const forbiddenPass = !(probe.forbiddenCodes || []).some(code => codes.includes(code));
    const passed = Boolean(first) && expectedCodePass && expectedPrefixPass && expectedTypePass && forbiddenPass;
    return {
      id:probe.id,
      label:probe.label,
      query:probe.query,
      passed,
      firstCode:firstCode || null,
      matchType:firstType || null,
      resultCount:number(result?.total),
      expectedCode:probe.expectedCode || null,
      expectedPrefix:probe.expectedPrefix || null,
      forbiddenCodes:[...(probe.forbiddenCodes || [])],
      error:null,
    };
  } catch (error) {
    return {
      id:probe.id,
      label:probe.label,
      query:probe.query,
      passed:false,
      firstCode:null,
      matchType:null,
      resultCount:0,
      expectedCode:probe.expectedCode || null,
      expectedPrefix:probe.expectedPrefix || null,
      forbiddenCodes:[...(probe.forbiddenCodes || [])],
      error:clean(error?.message || error).slice(0, 240),
    };
  }
}

function searchAudit(dataset) {
  const probes = SEARCH_PROBES.map(probe => runProbe(dataset, probe));
  const passed = probes.filter(probe => probe.passed).length;
  return {
    engine:'clinical-ranking-v3',
    version:'sq-clinical-search-v2',
    diagnosticDecision:false,
    passed,
    total:probes.length,
    healthy:passed === probes.length,
    probes,
  };
}

function auditDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') {
    return {
      counts:countAudit(null),
      search:{ engine:'clinical-ranking-v3', version:'sq-clinical-search-v2', diagnosticDecision:false, passed:0, total:SEARCH_PROBES.length, healthy:false, probes:[] },
      healthy:false,
    };
  }
  const cached = auditCache.get(dataset);
  if (cached) return cached;
  const counts = countAudit(dataset);
  const search = searchAudit(dataset);
  const audit = Object.freeze({ counts, search, healthy:counts.complete && search.healthy });
  auditCache.set(dataset, audit);
  return audit;
}

function stateFor(loaded, audit) {
  if (!loaded?.data) return { code:'error', label:'ICD nuk u lexua', severity:'danger' };
  if (loaded.stale) return { code:'stale', label:'ICD nga cache', severity:'warning' };
  if (!audit?.counts?.complete || !audit?.search?.healthy) {
    return { code:'warning', label:'Kontrollo ICD', severity:'warning' };
  }
  return { code:'healthy', label:'ICD në rregull', severity:'success' };
}

function healthFromLoaded(loaded, source = {}, now = Date.now()) {
  const audit = auditDataset(loaded?.data);
  const loadedAtMs = Date.parse(source.loadedAt || loaded?.loadedAt || '');
  return {
    available:Boolean(loaded?.data),
    state:stateFor(loaded, audit),
    source:{
      type:source.type || 'google-sheet',
      status:loaded?.stale ? 'stale' : source.status || 'live',
      visibility:source.visibility || 'public-link',
      spreadsheetId:source.spreadsheetId || loaded?.data?.sourceSpreadsheetId || null,
      sheetName:source.sheetName || null,
      sheetGid:source.sheetGid ?? null,
      loadedAt:source.loadedAt || loaded?.loadedAt || null,
      ageMs:Number.isFinite(loadedAtMs) ? Math.max(0, now - loadedAtMs) : null,
      csvBytes:number(source.csvBytes || loaded?.csvBytes) || null,
      revision:source.revision || loaded?.sourceRevision || null,
      fetchMs:number(source.fetchMs || loaded?.fetchMs),
      buildMs:number(source.buildMs || loaded?.buildMs),
    },
    hierarchy:audit.counts,
    search:audit.search,
    checkedAt:new Date(now).toISOString(),
    error:null,
  };
}

function unavailableHealth(error, now = Date.now()) {
  return {
    available:false,
    state:{ code:'error', label:'ICD nuk u lexua', severity:'danger' },
    source:{
      type:'google-sheet', status:'error', visibility:'public-link', spreadsheetId:null,
      sheetName:null, sheetGid:null, loadedAt:null, ageMs:null, csvBytes:null,
      revision:null, fetchMs:0, buildMs:0,
    },
    hierarchy:{
      expected:EXPECTED_COUNTS,
      actual:{ chapter:0, block:0, category:0, subcategory:0, total:0, nodeArray:0 },
      complete:false,
      mismatches:[],
    },
    search:{
      engine:'clinical-ranking-v3', version:'sq-clinical-search-v2', diagnosticDecision:false,
      passed:0, total:SEARCH_PROBES.length, healthy:false, probes:[],
    },
    checkedAt:new Date(now).toISOString(),
    error:clean(error?.message || error || 'Burimi ICD nuk u lexua.').slice(0, 500),
  };
}

async function loadHealth(sourceModule, now = Date.now()) {
  try {
    const loaded = await sourceModule.load();
    const source = typeof sourceModule.sourceMeta === 'function'
      ? sourceModule.sourceMeta(loaded)
      : {};
    return healthFromLoaded(loaded, source, now);
  } catch (error) {
    return unavailableHealth(error, now);
  }
}

module.exports = {
  EXPECTED_COUNTS,
  SEARCH_PROBES,
  countAudit,
  runProbe,
  searchAudit,
  auditDataset,
  stateFor,
  healthFromLoaded,
  unavailableHealth,
  loadHealth,
};
