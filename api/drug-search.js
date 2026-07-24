const registryHandler = require('./registry.js');
const PrescriptionNotation = require('../prescription-notation.js');

const MAX_QUERY = 90;
const MAX_RESULTS = 12;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sq')
    .replace(/[^a-z0-9%+./-]+/g, ' ')
    .trim();
}

function resultFromRow(row) {
  const tradeName = clean(row['Emri tregtar']);
  const substance = clean(row['Substanca aktive']);
  const strength = clean(row['Fortësia']);
  const form = clean(row['Forma farmaceutike']);
  const packaging = clean(row['Madhësia e paketimit']);
  const pdid = clean(row.PDID);
  const notation = PrescriptionNotation.build(row);
  return {
    key:`${pdid}|${tradeName}|${strength}`,
    tradeName,
    substance,
    strength,
    form,
    packaging,
    prescriptionLine:notation.line,
    prescriptionNotation:notation.full,
    packagingSummary:notation.packaging,
    dispense:notation.dispense,
    route:notation.route,
    sheetPrescriptionNotation:clean(row['Si të shënohet në recetë']),
    atc:clean(row['ATC Code']),
    pdid,
    qualityStatus:clean(row.__qualityStatus || 'verified'),
  };
}

function rank(row, query, tokens) {
  const trade = normalize(row['Emri tregtar']);
  const substance = normalize(row['Substanca aktive']);
  const strength = normalize(row['Fortësia']);
  const form = normalize(row['Forma farmaceutike']);
  const atc = normalize(row['ATC Code']);
  const prescription = normalize(row['Si të shënohet në recetë']);
  const haystack = `${substance} ${trade} ${strength} ${form} ${atc} ${prescription}`;
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
  if (String(row.__qualityStatus || '') === 'blocked') score -= 1000;
  return score;
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

  const query = normalize(clean(req.query?.q).slice(0, MAX_QUERY));
  if (query.length < 2) {
    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({ ok:true, query, results:[] });
  }

  try {
    const { rows, meta } = await registryHandler.getRegistryDataset();
    const tokens = query.split(/\s+/).filter(Boolean);
    const results = rows
      .map(row => ({ row, score:rank(row, query, tokens) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score || String(a.row['Substanca aktive']).localeCompare(String(b.row['Substanca aktive']), 'sq'))
      .slice(0, MAX_RESULTS)
      .map(item => resultFromRow(item.row));

    res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    res.setHeader('Server-Timing', `drugsearch;dur=${Date.now() - startedAt}`);
    return res.status(200).json({ ok:true, query, results, registryVersion:meta.version, prescriptionSheetRows:meta.prescriptionMatched });
  } catch (error) {
    console.error('Drug search error:', error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(500).json({ error:'Kërkimi i barnave nuk u ngarkua.' });
  }
};
