'use strict';

const populationSnapshot = require('../data/approved-population-snapshot.json');

const APPROVED_POPULATIONS = new Map([
  ['adult only', 'Adult only'],
  ['pediatric only', 'Pediatric only'],
  ['pediatric and adult both', 'Pediatric and adult both'],
]);

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizePopulation = value => clean(value)
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ');

function approvedPopulationFromNotes(value) {
  const source = clean(value);
  if (!source) return '';
  try {
    const parsed = JSON.parse(source);
    const raw = clean(parsed?.medindex_audit?.approved_population || parsed?.approved_population);
    return APPROVED_POPULATIONS.get(normalizePopulation(raw)) || '';
  } catch {
    return '';
  }
}

function snapshotItems(snapshot = populationSnapshot) {
  const sourceItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const byRegistryNumber = new Map();

  sourceItems.forEach(row => {
    const registryNumber = Number(row?.registryNumber);
    const approvedPopulation = APPROVED_POPULATIONS.get(normalizePopulation(row?.approvedPopulation)) || '';
    if (!Number.isInteger(registryNumber) || registryNumber <= 0 || !approvedPopulation) return;
    const previous = byRegistryNumber.get(registryNumber);
    if (previous && previous !== approvedPopulation) {
      throw new Error(`Konflikt i popullatës së aprovuar për kartën ${registryNumber}.`);
    }
    byRegistryNumber.set(registryNumber, approvedPopulation);
  });

  return [...byRegistryNumber.entries()]
    .map(([registryNumber, approvedPopulation]) => ({ registryNumber, approvedPopulation }))
    .sort((left, right) => left.registryNumber - right.registryNumber);
}

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function getApprovedPopulationItems() {
  return snapshotItems();
}

async function getPediatricOnlyRegistryNumbers() {
  const items = await getApprovedPopulationItems();
  return items
    .filter(item => item.approvedPopulation === 'Pediatric only')
    .map(item => item.registryNumber);
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-cache, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
  }
  if (!(await authorized(req))) {
    return res.status(401).json({ ok:false, error:'Sesioni nuk është aktiv.' });
  }

  try {
    const items = await getApprovedPopulationItems();
    const registryNumbers = items
      .filter(item => item.approvedPopulation === 'Pediatric only')
      .map(item => item.registryNumber);
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json({
      ok:true,
      population:'Pediatric only',
      registryNumbers,
      count:registryNumbers.length,
      items,
      classifiedCount:items.length,
      source:'sheet_snapshot',
      snapshotGeneratedAt:clean(populationSnapshot?.source?.generatedAt),
    });
  } catch (error) {
    console.error('Approved population marker error:', error);
    return res.status(500).json({ ok:false, error:'Nuk u lexua klasifikimi i popullatës.' });
  }
}

handler.getApprovedPopulationItems = getApprovedPopulationItems;
handler.getPediatricOnlyRegistryNumbers = getPediatricOnlyRegistryNumbers;
handler.approvedPopulationFromNotes = approvedPopulationFromNotes;
handler.normalizePopulation = normalizePopulation;
handler.snapshotItems = snapshotItems;
module.exports = handler;
