'use strict';

const { supabaseRequest, exactCount } = require('./supabase-data-api.js');
const { publicBatchCard } = require('./dosage-card-handler.js');
const model = require('../registry-column-model.js');

// Advanced column queries use a short-lived, bounded server snapshot. The normal
// registry page remains a shallow paged read. No full payload reaches the browser.
const PAGE_SIZE = 1000, MAX_DRUGS = 20000, MAX_REGIMENS = 50000, TTL_MS = 30000;
const DOSE_LABELS = ['Doza e plotë — Të rritur','Doza — Të rritur','Doza të rritur','Doza e të rriturve','Doza pediatrike — përmbledhje','Doza e plotë — Fëmijë','Doza — Fëmijë','Doza pediatrike'];
let cached = null, pending = null;

async function readComplete(table, params, maxRows, request = supabaseRequest) {
  async function page(offset, count) {
    const query = new URLSearchParams(params);
    query.set('limit', String(PAGE_SIZE)); query.set('offset', String(offset));
    const result = await request(`${table}?${query}`, { timeoutMs:6500, label:'Supabase column filter projection', ...(count ? {prefer:'count=exact'} : {}) });
    if (!Array.isArray(result.data)) throw new Error('Vlerat e kolonës nuk u ngarkuan.');
    return result;
  }
  const first = await page(0, true), count = exactCount(first.response);
  if (!Number.isInteger(count) || count > maxRows || count < 0) throw new Error('Regjistri është tepër i madh për këtë filtër.');
  const rows = [...first.data];
  const offsets = [];
  for (let offset = PAGE_SIZE; offset < count; offset += PAGE_SIZE) offsets.push(offset);
  for (let index = 0; index < offsets.length; index += 4) {
    const results = await Promise.allSettled(offsets.slice(index, index + 4).map(offset => page(offset, false)));
    for (const result of results) {
      if (result.status !== 'fulfilled') throw result.reason;
      rows.push(...result.value.data);
    }
  }
  if (rows.length !== count) throw new Error('Regjistri ndryshoi gjatë leximit. Provo përsëri.');
  return rows;
}
async function loadSnapshot(listSelect, listRow, request = supabaseRequest) {
  const drugParams = new URLSearchParams({
    select:[listSelect,'registry_search_text','pediatric_dose_summary', ...DOSE_LABELS.map((name, i) => `dose_fallback_${i}:source_payload->>${JSON.stringify(name)}`)].join(','),
    is_published:'eq.true', editorial_status:'eq.published', order:'registry_number.asc,id.asc',
  });
  const regimenParams = new URLSearchParams({ select:'drug_id,population,dose_text,source_key', editorial_status:'eq.published', calculation_status:'in.(text_verified,calculable_verified)', source_key:'like.card:*', order:'drug_id.asc,population.asc,source_key.asc,id.asc' });
  const results = await Promise.allSettled([readComplete('drugs', drugParams, MAX_DRUGS, request), readComplete('dosage_regimens', regimenParams, MAX_REGIMENS, request)]);
  for (const result of results) if (result.status !== 'fulfilled') throw result.reason;
  const [drugs, regimens] = results.map(result => result.value);
  if (new Set(drugs.map(row => row.id)).size !== drugs.length) throw new Error('Regjistri ndryshoi gjatë leximit. Provo përsëri.');
  const byDrug = new Map();
  for (const regimen of regimens) {
    if (!byDrug.has(regimen.drug_id)) byDrug.set(regimen.drug_id, []);
    byDrug.get(regimen.drug_id).push(regimen);
  }
  return drugs.map(drug => {
    const source_payload = Object.fromEntries(DOSE_LABELS.map((label, i) => [label, drug[`dose_fallback_${i}`]]));
    const card = publicBatchCard({...drug, source_payload}, byDrug.get(drug.id) || []);
    return {...listRow(drug), adultDose:card.adultDose, pediatricDose:card.pediatricDose, _search:model.fold(drug.registry_search_text)};
  });
}
async function snapshot(listSelect, listRow, force = false) {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.rows;
  if (!pending) pending = loadSnapshot(listSelect, listRow).then(rows => { cached = {rows, at:Date.now()}; return rows; }).finally(() => { pending = null; });
  return pending;
}
function filterRows(rows, query, formCategories, excludeColumn = '') {
  const filters = model.parseFilters(query.columnFilters), q = model.fold(query.q), atc = model.clean(query.atc).toUpperCase();
  return rows.filter(row => (!q || row._search.includes(q))
    && (!atc || (atc.length === 7 ? row.atc.toUpperCase() === atc : row.atc.toUpperCase().startsWith(atc)))
    && (!query.formExact || row.form === query.formExact)
    && (!formCategories[query.formCategory] || formCategories[query.formCategory].includes(row.form))
    && (!query.form || model.fold(row.form).includes(model.fold(query.form)))
    && (!query.status || row.productStatus === query.status)
    && Object.entries(filters).every(([id, filter]) => id === excludeColumn || model.matches(row, id, filter)));
}
function sortRows(rows, sort, direction) {
  const id = sort === 'class' ? 'drugClass' : Object.hasOwn(model.fields, sort) ? sort : 'registry';
  const multiplier = direction === 'desc' ? -1 : 1;
  const collator = new Intl.Collator('sq', {numeric:true, sensitivity:'base'});
  return [...rows].sort((a, b) => {
    const left = model.value(a, id), right = model.value(b, id);
    if (left === '' || right === '') return left === right ? Number(a.registryNumber) - Number(b.registryNumber) : left === '' ? 1 : -1;
    const comparison = model.numeric(id) ? Number(left) - Number(right) : collator.compare(left, right);
    return multiplier * comparison || Number(a.registryNumber) - Number(b.registryNumber);
  });
}
function facets(rows, id, search = '', offset = 0) {
  if (!Object.hasOwn(model.fields, id)) throw new Error('Kolonë filtri e pavlefshme.');
  const counts = new Map(), needle = model.fold(search);
  for (const row of rows) {
    const val = model.value(row, id);
    if (needle && !model.fold(model.label(id, val)).includes(needle)) continue;
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  const collator = new Intl.Collator('sq', {numeric:true, sensitivity:'base'});
  const values = [...counts].sort(([a], [b]) => a === '' ? (b === '' ? 0 : -1) : b === '' ? 1 : model.numeric(id) ? Number(a) - Number(b) : collator.compare(a, b));
  return { values:values.slice(offset, offset + 150).map(([value, count]) => ({value, label:model.label(id, value), count})), total:values.length, hasMore:offset + 150 < values.length, offset };
}
module.exports = { snapshot, filterRows, sortRows, facets, loadSnapshot, readComplete, TTL_MS };
