const registryHandler = require('./registry.js');
const PrescriptionNotation = require('../prescription-notation.js');
const Administration = require('../administration-routes.js');
const RegistryRevision = require('../lib/registry-revision.js');
const { neonRequest, exactCount } = require('../lib/neon-data-api.js');

const MAX_QUERY = 90;
const MAX_RESULTS = 12;
const SEARCH_CANDIDATE_LIMIT = 80;
const REGISTRY_DEFAULT_PAGE_SIZE = 25;
const REGISTRY_MAX_PAGE_SIZE = 50;
const REGISTRY_MAX_QUERY_LENGTH = 80;

const SEARCH_SELECT = [
  'id',
  'registry_number',
  'protocol_no',
  'pdid',
  'trade_name',
  'active_substance',
  'atc_code',
  'drug_class',
  'use_text',
  'strength',
  'pharmaceutical_form',
  'packaging',
].join(',');
const SEARCH_HYDRATION_SELECT = 'id,source_payload';
const REGISTRY_LIST_SELECT = [
  'id',
  'registry_number',
  'pdid',
  'trade_name',
  'active_substance',
  'atc_code',
  'drug_class',
  'use_text',
  'strength',
  'pharmaceutical_form',
  'packaging',
  'product_status',
  'retail_price',
].join(',');
const REGISTRY_DETAIL_SELECT = [
  'id',
  'registry_number',
  'pdid',
  'protocol_no',
  'trade_name',
  'active_substance',
  'atc_code',
  'drug_class',
  'use_text',
  'strength',
  'pharmaceutical_form',
  'packaging',
  'marketing_authorization_holder',
  'manufacturer',
  'ma_certificate',
  'product_status',
  'wholesale_price',
  'wholesale_with_margin',
  'vat_text',
  'retail_price',
  'validity_text',
  'updated_at',
].join(',');
const REGISTRY_SORTS = Object.freeze({
  registry:'registry_number',
  name:'trade_name',
  substance:'active_substance',
  atc:'atc_code',
  strength:'strength',
  form:'pharmaceutical_form',
  status:'product_status',
  price:'retail_price',
});

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq').replace(/[^a-z0-9%+./-]+/g, ' ').trim();
}

function integerInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function safeSearchToken(value) {
  const tokens = clean(value)
    .slice(0, MAX_QUERY)
    .replace(/[%*(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 2)
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'sq'));
  return String(tokens[0] || '').slice(0, 48);
}

function registrySearchTerm(value) {
  return clean(value)
    .slice(0, REGISTRY_MAX_QUERY_LENGTH)
    .replace(/[^0-9A-Za-zÀ-ž%+./\- ]+/g, ' ')
    .replace(/[%*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function exactFilter(value, maximum = 120) {
  return clean(value)
    .slice(0, maximum)
    .replace(/[,*()]/g, '')
    .trim();
}

function atcCategoryCode(value) {
  const code = clean(value).toUpperCase().replace(/\s+/g, '');
  const match = code.match(/^([A-Z]\d{2})/);
  return match ? match[1] : '';
}

function countAtcRows(rows = []) {
  const counts = Object.create(null);
  const groupCounts = Object.create(null);
  let classifiedTotal = 0;
  let unclassifiedTotal = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const category = atcCategoryCode(row?.['ATC Code'] ?? row?.atc_code ?? row?.atc);
    if (!category) {
      unclassifiedTotal += 1;
      continue;
    }
    counts[category] = (counts[category] || 0) + 1;
    const group = category.charAt(0);
    groupCounts[group] = (groupCounts[group] || 0) + 1;
    classifiedTotal += 1;
  }

  return {
    total:classifiedTotal + unclassifiedTotal,
    classifiedTotal,
    unclassifiedTotal,
    counts,
    groupCounts,
  };
}

function resultFromRow(row) {
  const tradeName = clean(row['Emri tregtar']);
  const substance = clean(row['Substanca aktive']);
  const strength = clean(row.Fortësia);
  const form = clean(row['Forma farmaceutike']);
  const packaging = clean(row['Madhësia e paketimit']);
  const pdid = clean(row.PDID);
  const protocolNo = clean(row.ProtocolNo);
  const notation = PrescriptionNotation.build(row);
  const administration = Administration.inferAdministration({
    administrationCategory:row.__administrationCategory || row['Kategoria e administrimit'],
    allowedRoutes:row.__allowedRoutes || row['Rrugët e lejuara'],
    form,
    route:[notation.route, row['Rrugët e lejuara']].filter(Boolean).join(' '),
  });
  return {
    key:`${pdid}|${protocolNo}|${tradeName}|${strength}`,
    tradeName, substance, strength, form, packaging,
    prescriptionLine:notation.line,
    prescriptionNotation:notation.full,
    packagingSummary:notation.packaging,
    dispense:notation.dispense,
    route:administration.route || notation.route,
    administrationCategory:administration.category,
    administrationCategoryLabel:administration.categoryLabel,
    allowedRoutes:administration.routes,
    sheetPrescriptionNotation:clean(row.__sheetPrescriptionNotation),
    atc:clean(row['ATC Code']), pdid, protocolNo,
    drugClass:clean(row['Klasa / Çka është']),
    use:clean(row['Përdorimi (fjalë kyçe)']),
    qualityStatus:clean(row.__qualityStatus || 'verified'),
  };
}

// Why a row matched, so the result can say so instead of appearing unexplained.
// A doctor searching "kollë" needs to see that it was the indication that
// matched, not guess.
const MATCH_FIELDS = Object.freeze([
  { key:'tradeName', column:'Emri tregtar', label:'Emri tregtar' },
  { key:'substance', column:'Substanca aktive', label:'Substanca aktive' },
  { key:'atc', column:'ATC Code', label:'Kodi ATC' },
  { key:'use', column:'Përdorimi (fjalë kyçe)', label:'Përdorimi' },
  { key:'drugClass', column:'Klasa / Çka është', label:'Klasa terapeutike' },
  { key:'form', column:'Forma farmaceutike', label:'Forma farmaceutike' },
  { key:'strength', column:'Fortësia', label:'Fortësia' },
]);

// The snippet is lifted verbatim from the stored text, only trimmed to the
// sentence around the hit. Clinical content is never rewritten.
function matchSnippet(value, query) {
  const text = clean(value);
  if (!text) return '';
  const at = normalize(text).indexOf(query);
  if (at < 0) return text.length <= 120 ? text : `${text.slice(0, 117)}…`;
  const sentences = text.split(/(?<=[.;])\s+/);
  const hit = sentences.find(part => normalize(part).includes(query)) || text;
  const trimmed = hit.trim();
  return trimmed.length <= 160 ? trimmed : `${trimmed.slice(0, 157)}…`;
}

function matchReason(row, query) {
  for (const field of MATCH_FIELDS) {
    const value = row[field.column];
    if (value && normalize(value).includes(query)) {
      return { field:field.key, label:field.label, snippet:matchSnippet(value, query) };
    }
  }
  return null;
}

function rank(row, query, tokens) {
  const trade = normalize(row['Emri tregtar']);
  const substance = normalize(row['Substanca aktive']);
  const strength = normalize(row.Fortësia);
  const form = normalize(row['Forma farmaceutike']);
  const atc = normalize(row['ATC Code']);
  const prescription = normalize(row['Si të shënohet në recetë']);
  const packaging = normalize(row['Madhësia e paketimit']);
  // The SQL candidate query already searches the indication text and the
  // therapeutic class. Leaving them out of this haystack meant every row found
  // by an indication was fetched and then silently discarded here, so searching
  // for a symptom returned nothing at all.
  const use = normalize(row['Përdorimi (fjalë kyçe)']);
  const drugClass = normalize(row['Klasa / Çka është']);
  const haystack = `${substance} ${trade} ${strength} ${form} ${atc} ${prescription} ${packaging} ${use} ${drugClass}`;
  if (!tokens.every(token => haystack.includes(token))) return -1;
  let score = 0;
  if (substance === query) score += 120;
  else if (substance.startsWith(query)) score += 90;
  else if (substance.includes(query)) score += 65;
  if (trade === query) score += 100;
  else if (trade.startsWith(query)) score += 75;
  else if (trade.includes(query)) score += 50;
  if (prescription.startsWith(query)) score += 40;
  if (atc.startsWith(query)) score += 35;
  // Ranked below every identity match: an indication or class hit is a real
  // reason to show a drug, but never a stronger one than its own name.
  if (use.includes(query)) score += 20;
  if (drugClass.includes(query)) score += 16;
  if (strength.includes(query)) score += 12;
  if (String(row.__qualityStatus || '') === 'blocked') score -= 1000;
  return score;
}

function legacyRowFromNeon(row) {
  const source = row?.source_payload && typeof row.source_payload === 'object' ? row.source_payload : {};
  return {
    ...source,
    'Nr rendor':row.registry_number ?? source['Nr rendor'] ?? '',
    ProtocolNo:clean(row.protocol_no || source.ProtocolNo),
    PDID:clean(row.pdid || source.PDID),
    'Emri tregtar':clean(row.trade_name || source['Emri tregtar']),
    'Substanca aktive':clean(row.active_substance || source['Substanca aktive']),
    'ATC Code':clean(row.atc_code || source['ATC Code']),
    'Klasa / Çka është':clean(row.drug_class || source['Klasa / Çka është']),
    'Përdorimi (fjalë kyçe)':clean(row.use_text || source['Përdorimi (fjalë kyçe)']),
    Fortësia:clean(row.strength || source.Fortësia),
    'Forma farmaceutike':clean(row.pharmaceutical_form || source['Forma farmaceutike']),
    'Madhësia e paketimit':clean(row.packaging || source['Madhësia e paketimit']),
    'Si të shënohet në recetë':clean(source['Si të shënohet në recetë']),
    'Kategoria e administrimit':clean(source['Kategoria e administrimit']),
    'Rrugët e lejuara':clean(source['Rrugët e lejuara']),
    __neonDrugId:clean(row.id),
    __qualityStatus:'verified',
    __sheetPrescriptionNotation:clean(source['Si të shënohet në recetë']),
  };
}

function hydrateLegacyRow(row, sourcePayload) {
  const source = sourcePayload && typeof sourcePayload === 'object' ? sourcePayload : {};
  return {
    ...row,
    'Si të shënohet në recetë':clean(source['Si të shënohet në recetë'] || row['Si të shënohet në recetë']),
    'Kategoria e administrimit':clean(source['Kategoria e administrimit'] || row['Kategoria e administrimit']),
    'Rrugët e lejuara':clean(source['Rrugët e lejuara'] || row['Rrugët e lejuara']),
    __sheetPrescriptionNotation:clean(source['Si të shënohet në recetë'] || row.__sheetPrescriptionNotation),
  };
}

async function neonSearchRows(rawQuery) {
  const token = safeSearchToken(rawQuery);
  if (token.length < 2) return [];

  const params = new URLSearchParams();
  params.set('select', SEARCH_SELECT);
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('or', `(${[
    `trade_name.ilike.*${token}*`,
    `active_substance.ilike.*${token}*`,
    `atc_code.ilike.*${token}*`,
    `drug_class.ilike.*${token}*`,
    `use_text.ilike.*${token}*`,
    `strength.ilike.*${token}*`,
    `pharmaceutical_form.ilike.*${token}*`,
    `packaging.ilike.*${token}*`,
  ].join(',')})`);
  params.set('order', 'registry_number.asc');
  params.set('limit', String(SEARCH_CANDIDATE_LIMIT));

  const { data } = await neonRequest(`drugs?${params.toString()}`, {
    timeoutMs:5000,
    label:'Drug search candidates',
  });
  if (!Array.isArray(data)) throw new Error('Neon search did not return a list.');
  return data.map(legacyRowFromNeon);
}

function rankedRows(rows, query) {
  const tokens = query.split(/\s+/).filter(Boolean);
  return rows.map(row => ({ row, score:rank(row, query, tokens) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || String(a.row['Substanca aktive']).localeCompare(String(b.row['Substanca aktive']), 'sq'))
    .slice(0, MAX_RESULTS)
    .map(item => item.row);
}

async function hydrateSearchRows(rows) {
  const ids = [...new Set(rows.map(row => clean(row.__neonDrugId)).filter(id => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length) return rows;

  const params = new URLSearchParams();
  params.set('select', SEARCH_HYDRATION_SELECT);
  params.set('id', `in.(${ids.join(',')})`);
  params.set('limit', String(Math.min(MAX_RESULTS, ids.length)));
  const { data } = await neonRequest(`drugs?${params.toString()}`, {
    timeoutMs:4000,
    label:'Drug search hydration',
  });
  if (!Array.isArray(data)) return rows;
  const payloadById = new Map(data.map(item => [clean(item.id), item.source_payload]));
  return rows.map(row => hydrateLegacyRow(row, payloadById.get(clean(row.__neonDrugId))));
}

function rankedResults(rows, query) {
  return rankedRows(rows, query).map(row => {
    const result = resultFromRow(row);
    const match = matchReason(row, query);
    return match ? { ...result, match } : result;
  });
}

function registryPrescriptionNotation(row) {
  const notation = PrescriptionNotation.build({
    'Emri tregtar':clean(row?.trade_name),
    'Substanca aktive':clean(row?.active_substance),
    'Fortësia':clean(row?.strength),
    'Forma farmaceutike':clean(row?.pharmaceutical_form),
    'Madhësia e paketimit':clean(row?.packaging),
  });
  return clean(notation?.line);
}

function rowForRegistryList(row) {
  return {
    id:clean(row.id),
    registryNumber:row.registry_number ?? null,
    pdid:clean(row.pdid),
    tradeName:clean(row.trade_name),
    activeSubstance:clean(row.active_substance),
    atc:clean(row.atc_code),
    drugClass:clean(row.drug_class),
    use:clean(row.use_text),
    strength:clean(row.strength),
    form:clean(row.pharmaceutical_form),
    prescriptionNotation:registryPrescriptionNotation(row),
    productStatus:clean(row.product_status),
    retailPrice:row.retail_price ?? null,
  };
}

function rowForRegistryDetail(row) {
  return {
    id:clean(row.id),
    registryNumber:row.registry_number ?? null,
    pdid:clean(row.pdid),
    protocolNo:clean(row.protocol_no),
    tradeName:clean(row.trade_name),
    activeSubstance:clean(row.active_substance),
    atc:clean(row.atc_code),
    drugClass:clean(row.drug_class),
    use:clean(row.use_text),
    strength:clean(row.strength),
    form:clean(row.pharmaceutical_form),
    packaging:clean(row.packaging),
    marketingAuthorizationHolder:clean(row.marketing_authorization_holder),
    manufacturer:clean(row.manufacturer),
    maCertificate:clean(row.ma_certificate),
    productStatus:clean(row.product_status),
    wholesalePrice:row.wholesale_price ?? null,
    wholesaleWithMargin:row.wholesale_with_margin ?? null,
    vat:clean(row.vat_text),
    retailPrice:row.retail_price ?? null,
    validity:clean(row.validity_text),
    updatedAt:row.updated_at || null,
  };
}

function buildRegistryDetailPath(query = {}) {
  const id = exactFilter(query.id, 160);
  if (!id) return null;
  const params = new URLSearchParams();
  params.set('select', REGISTRY_DETAIL_SELECT);
  params.set('id', `eq.${id}`);
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('limit', '1');
  return `drugs?${params.toString()}`;
}

function buildRegistryPagePath(query = {}) {
  const page = integerInRange(query.page, 1, 1, 100000);
  const pageSize = integerInRange(query.pageSize, REGISTRY_DEFAULT_PAGE_SIZE, 1, REGISTRY_MAX_PAGE_SIZE);
  const includeTotal = ['1', 'true', 'yes'].includes(clean(query.includeTotal).toLowerCase());
  const offset = (page - 1) * pageSize;
  const q = registrySearchTerm(query.q);
  const status = exactFilter(query.status);
  const form = exactFilter(query.form);
  const sortKey = clean(query.sort).toLowerCase();
  const sortColumn = REGISTRY_SORTS[sortKey] || REGISTRY_SORTS.registry;
  const direction = clean(query.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';
  const fetchLimit = includeTotal ? pageSize : Math.min(REGISTRY_MAX_PAGE_SIZE + 1, pageSize + 1);

  const params = new URLSearchParams();
  params.set('select', REGISTRY_LIST_SELECT);
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('order', `${sortColumn}.${direction},registry_number.asc`);
  params.set('limit', String(fetchLimit));
  params.set('offset', String(offset));
  if (status) params.set('product_status', `eq.${status}`);
  if (form) params.set('pharmaceutical_form', `ilike.*${form}*`);

  if (q.length >= 2) {
    const pattern = `*${q}*`;
    params.set('or', `(${[
      `trade_name.ilike.${pattern}`,
      `active_substance.ilike.${pattern}`,
      `atc_code.ilike.${pattern}`,
      `drug_class.ilike.${pattern}`,
      `use_text.ilike.${pattern}`,
      `strength.ilike.${pattern}`,
      `pharmaceutical_form.ilike.${pattern}`,
      `pdid.ilike.${pattern}`,
      `protocol_no.ilike.${pattern}`,
    ].join(',')})`);
  }

  return {
    path:`drugs?${params.toString()}`,
    page,
    pageSize,
    includeTotal,
    q,
    status,
    form,
    sort:sortKey || 'registry',
    direction,
  };
}

async function sendRegistryPage(req, res, startedAt) {
  const request = buildRegistryPagePath(req.query || {});
  const { data, response } = await neonRequest(request.path, {
    ...(request.includeTotal ? { prefer:'count=exact' } : {}),
    timeoutMs:6000,
    label:'Registry page',
  });
  const fetched = Array.isArray(data) ? data : [];
  const rows = fetched.slice(0, request.pageSize).map(rowForRegistryList);
  const total = request.includeTotal ? exactCount(response) : null;
  const hasNext = Number.isFinite(total)
    ? request.page * request.pageSize < total
    : fetched.length > request.pageSize;
  const totalPages = Number.isFinite(total) ? Math.max(1, Math.ceil(total / request.pageSize)) : null;

  res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
  res.setHeader('Server-Timing', `registrypage;dur=${Date.now() - startedAt}`);
  res.setHeader('X-MedIndex-Data-Source', 'neon');
  return res.status(200).json({
    ok:true,
    rows,
    pagination:{
      page:request.page,
      pageSize:request.pageSize,
      total,
      totalPages,
      hasPrevious:request.page > 1,
      hasNext,
    },
    query:{
      q:request.q,
      status:request.status,
      form:request.form,
      sort:request.sort,
      direction:request.direction,
      includeTotal:request.includeTotal,
    },
  });
}

async function sendRegistryDetail(req, res, startedAt) {
  const detailPath = buildRegistryDetailPath(req.query || {});
  if (!detailPath) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(400).json({ error:'Mungon identifikuesi i barit.' });
  }
  const { data } = await neonRequest(detailPath, {
    timeoutMs:5000,
    label:'Registry detail',
  });
  const row = Array.isArray(data) && data.length ? rowForRegistryDetail(data[0]) : null;
  res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
  res.setHeader('Server-Timing', `registrydetail;dur=${Date.now() - startedAt}`);
  res.setHeader('X-MedIndex-Data-Source', 'neon');
  return row
    ? res.status(200).json({ ok:true, row })
    : res.status(404).json({ error:'Bari nuk u gjet.' });
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }
  if (!(await registryHandler.authorized(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ error:'Kërkohet autentikim.' });
  }

  const view = clean(req.query?.view).toLowerCase();
  if (view === 'registry-page') {
    try { return await sendRegistryPage(req, res, startedAt); }
    catch (error) {
      console.error('Registry page error:', error);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(500).json({ error:'Lista e barnave nuk u ngarkua.' });
    }
  }
  if (view === 'registry-detail') {
    try { return await sendRegistryDetail(req, res, startedAt); }
    catch (error) {
      console.error('Registry detail error:', error);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(500).json({ error:'Detajet e barit nuk u ngarkuan.' });
    }
  }
  if (view === 'atc-counts') {
    try {
      const { rows, meta } = await registryHandler.getRegistryDataset();
      const summary = countAtcRows(rows);
      res.setHeader('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
      res.setHeader('Server-Timing', `atccounts;dur=${Date.now() - startedAt}`);
      return res.status(200).json({
        ok:true,
        ...summary,
        registryVersion:clean(meta?.version),
        generatedAt:new Date().toISOString(),
      });
    } catch (error) {
      console.error('ATC counts error:', error);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(500).json({ error:'Numërimet e kategorive nuk u ngarkuan.' });
    }
  }

  const rawQuery = clean(req.query?.q).slice(0, MAX_QUERY);
  const query = normalize(rawQuery);
  if (query.length < 2) {
    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({ ok:true, query, results:[] });
  }

  try {
    let rows;
    let searchSource = 'neon-bounded';
    try {
      rows = await neonSearchRows(rawQuery);
    } catch (neonError) {
      console.warn('Bounded Neon drug search failed; using cached registry fallback:', neonError?.message || neonError);
      const dataset = await registryHandler.getRegistryDataset();
      rows = dataset.rows;
      searchSource = 'registry-fallback-error';
    }

    let topRows = rankedRows(rows, query);
    if (topRows.length && searchSource === 'neon-bounded') {
      try { topRows = await hydrateSearchRows(topRows); }
      catch (hydrateError) {
        console.warn('Targeted search hydration failed; returning lightweight search rows:', hydrateError?.message || hydrateError);
        searchSource = 'neon-bounded-lightweight';
      }
    }
    const results = topRows.map(resultFromRow);

    let registryVersion = '';
    try { registryVersion = clean(await RegistryRevision.getRegistryRevision()); }
    catch { registryVersion = ''; }

    res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    res.setHeader('Server-Timing', `drugsearch;dur=${Date.now() - startedAt}`);
    res.setHeader('X-MedIndex-Search-Source', searchSource);
    return res.status(200).json({
      ok:true,
      query,
      results,
      registryVersion,
      prescriptionSheetRows:null,
      searchSource,
    });
  } catch (error) {
    console.error('Drug search error:', error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(500).json({ error:'Kërkimi i barnave nuk u ngarkua.' });
  }
};

module.exports.atcCategoryCode = atcCategoryCode;
module.exports.countAtcRows = countAtcRows;
module.exports.neonSearchRows = neonSearchRows;
module.exports.hydrateSearchRows = hydrateSearchRows;
module.exports.rankedRows = rankedRows;
module.exports.rankedResults = rankedResults;
module.exports.buildRegistryPagePath = buildRegistryPagePath;
module.exports.buildRegistryDetailPath = buildRegistryDetailPath;
module.exports.rowForRegistryList = rowForRegistryList;
module.exports.rowForRegistryDetail = rowForRegistryDetail;
module.exports.SEARCH_CANDIDATE_LIMIT = SEARCH_CANDIDATE_LIMIT;
module.exports.REGISTRY_DEFAULT_PAGE_SIZE = REGISTRY_DEFAULT_PAGE_SIZE;
module.exports.REGISTRY_MAX_PAGE_SIZE = REGISTRY_MAX_PAGE_SIZE;
