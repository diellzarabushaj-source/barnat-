const registryHandler = require('./registry.js');
const PrescriptionNotation = require('../prescription-notation.js');
const Administration = require('../administration-routes.js');
const RegistryRevision = require('../lib/registry-revision.js');
const { neonRequest } = require('../lib/neon-data-api.js');

const MAX_QUERY = 90;
const MAX_RESULTS = 12;
const SEARCH_CANDIDATE_LIMIT = 80;
const SEARCH_SELECT = [
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
  'source_payload',
].join(',');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq').replace(/[^a-z0-9%+./-]+/g, ' ').trim();
}

function safeSearchToken(value) {
  return clean(value)
    .slice(0, MAX_QUERY)
    .replace(/[%*(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')[0]
    .slice(0, 48);
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
    qualityStatus:clean(row.__qualityStatus || 'verified'),
  };
}

function rank(row, query, tokens) {
  const trade = normalize(row['Emri tregtar']);
  const substance = normalize(row['Substanca aktive']);
  const strength = normalize(row.Fortësia);
  const form = normalize(row['Forma farmaceutike']);
  const atc = normalize(row['ATC Code']);
  const prescription = normalize(row['Si të shënohet në recetë']);
  const packaging = normalize(row['Madhësia e paketimit']);
  const haystack = `${substance} ${trade} ${strength} ${form} ${atc} ${prescription} ${packaging}`;
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
    __qualityStatus:'verified',
    __sheetPrescriptionNotation:clean(source['Si të shënohet në recetë']),
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
  ].join(',')})`);
  params.set('order', 'registry_number.asc');
  params.set('limit', String(SEARCH_CANDIDATE_LIMIT));

  const { data } = await neonRequest(`drugs?${params.toString()}`, {
    timeoutMs:5000,
    label:'Drug search',
  });
  if (!Array.isArray(data)) throw new Error('Neon search did not return a list.');
  return data.map(legacyRowFromNeon);
}

function rankedResults(rows, query) {
  const tokens = query.split(/\s+/).filter(Boolean);
  return rows.map(row => ({ row, score:rank(row, query, tokens) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || String(a.row['Substanca aktive']).localeCompare(String(b.row['Substanca aktive']), 'sq'))
    .slice(0, MAX_RESULTS)
    .map(item => resultFromRow(item.row));
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
      searchSource = 'registry-fallback';
    }

    let results = rankedResults(rows, query);
    if (!results.length && searchSource === 'neon-bounded') {
      const dataset = await registryHandler.getRegistryDataset();
      results = rankedResults(dataset.rows, query);
      searchSource = 'registry-fallback-empty';
    }

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
module.exports.rankedResults = rankedResults;
module.exports.SEARCH_CANDIDATE_LIMIT = SEARCH_CANDIDATE_LIMIT;
