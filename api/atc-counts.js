const registryHandler = require('./registry.js');

const clean = value => String(value ?? '').trim();

function categoryCode(value) {
  const code = clean(value).toUpperCase().replace(/\s+/g, '');
  const match = code.match(/^([A-Z]\d{2})/);
  return match ? match[1] : '';
}

function countRows(rows = []) {
  const counts = Object.create(null);
  const groupCounts = Object.create(null);
  let classifiedTotal = 0;
  let unclassifiedTotal = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const category = categoryCode(row?.['ATC Code'] ?? row?.atc_code ?? row?.atc);
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

async function handler(req, res) {
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

  try {
    const { rows, meta } = await registryHandler.getRegistryDataset();
    const summary = countRows(rows);
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

module.exports = handler;
module.exports.categoryCode = categoryCode;
module.exports.countRows = countRows;
